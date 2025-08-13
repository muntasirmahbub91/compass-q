import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Plus, CheckCircle2, Trash2, Inbox, CornerUpLeft, Pencil } from "lucide-react";

const STORAGE_KEY = "compassq-data-v1";
const URGENT_THRESHOLD_HOURS = 24;
const Q1 = "Q1";
const Q2 = "Q2";
const Q3 = "Q3";
const Q4 = "Q4";
const QUADRANTS = [Q1, Q2, Q3, Q4];
const QUADRANT_META = {
  [Q1]: { title: "Urgent + Important" },
  [Q2]: { title: "Not Urgent + Important" },
  [Q3]: { title: "Urgent + Not Important" },
  [Q4]: { title: "Not Urgent + Not Important" },
};

function uid(){ return Math.random().toString(36).slice(2,10); }
function now(){ return Date.now(); }
function hoursToMs(h){ return Math.max(0, Number(h)||0)*3600*1000; }
function msToHrs(ms){ return Math.max(0, Math.ceil(ms/3600000)); }
function isUrgentQuadrant(q){ return q===Q1||q===Q3; }
function isImportantQuadrant(q){ return q===Q1||q===Q2; }
const URGENT_THRESHOLD_MS = URGENT_THRESHOLD_HOURS*3600000;

function computeUrgent(dueAt){ const r=dueAt-now(); return r<=URGENT_THRESHOLD_MS; }
function computeQuadrant(important, dueAt){
  const u=computeUrgent(dueAt);
  if(important&&u) return Q1;
  if(important&&!u) return Q2;
  if(!important&&u) return Q3;
  return Q4;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"});

// debounced effect without spread deps warning
function useDebouncedEffect(effect,deps,delay){
  const cbRef = useRef(effect);
  useEffect(()=>{ cbRef.current = effect; },[effect]);
  const key = JSON.stringify(deps||[]);
  useEffect(()=>{
    const id = setTimeout(()=>{ cbRef.current && cbRef.current(); }, delay);
    return ()=>clearTimeout(id);
  },[key, delay]);
}

let AUDIO_CTX=null;
function getAudioCtx(){ try{ if(!AUDIO_CTX) AUDIO_CTX=new (window.AudioContext||window.webkitAudioContext)(); }catch{} return AUDIO_CTX; }
function beep(type="ok"){
  const ctx=getAudioCtx(); if(!ctx) return; if(ctx.resume) try{ctx.resume();}catch{}
  const o=ctx.createOscillator(); const g=ctx.createGain();
  o.connect(g); g.connect(ctx.destination); o.type="sine";
  o.frequency.value = type==="ok"?660: type==="drop"?520:380;
  g.gain.setValueAtTime(0.0001,ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.08,ctx.currentTime+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.12);
  o.onended=()=>{ try{o.disconnect();g.disconnect();}catch{} };
  o.start(); o.stop(ctx.currentTime+0.15);
}

const TopBar=React.memo(({onAdd,onArchiveOpen,archivedCount})=>(
  <div className="flex items-center justify-between w-full px-3 py-2 md:px-4 md:py-3 border-b border-black/5 sticky top-0 z-20 bg-white/90 backdrop-blur">
    <div className="flex items-center gap-2">
      <h1 className="text-lg md:text-xl font-semibold">Compass-Q</h1>
    </div>
    <div className="flex items-center gap-2 md:gap-3">
      <button onClick={onAdd} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-black text-white hover:opacity-90 shadow-md active:translate-y-px transition">
        <Plus className="w-4 h-4"/><span className="hidden sm:inline">Add</span>
      </button>
      <button onClick={onArchiveOpen} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-neutral-200 hover:bg-neutral-300 shadow-md transition">
        <Inbox className="w-4 h-4"/><span className="hidden sm:inline">Completed</span>
        <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-white border">{archivedCount}</span>
      </button>
    </div>
  </div>
));

const AddTaskModal=({open,onClose,onCreate})=>{
  const [title,setTitle]=useState(""); const [important,setImportant]=useState(true);
  const [urgent,setUrgent]=useState(false); const [hours,setHours]=useState(24);
  useEffect(()=>{ if(open){ setTitle(""); setImportant(true); setUrgent(false); setHours(24);} },[open]);
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-3" data-modal>
      <div className="w-full max-w-md rounded-[24px] bg-gradient-to-br from-white to-white/90 border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_20px_rgba(0,0,0,0.15)]">
        <div className="p-4 md:p-5 border-b border-black/5"><div className="text-lg font-semibold">New Task</div></div>
        <div className="p-4 md:p-5 space-y-3">
          <label className="block text-sm">Title
            <input className="mt-1 w-full px-3 py-2 rounded-2xl border border-black/10 bg-white/70 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g., Submit report"/>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={important} onChange={e=>setImportant(e.target.checked)}/> Important</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={urgent} onChange={e=>setUrgent(e.target.checked)}/> Urgent</label>
          <label className="block text-sm">Due in (hours)
            <input type="number" min={0} className="mt-1 w-full px-3 py-2 rounded-2xl border border-black/10 bg-white/70 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]" value={hours} onChange={e=>setHours(e.target.value)}/>
          </label>
        </div>
        <div className="p-4 md:p-5 flex justify-end gap-2 border-t border-black/5">
          <button onClick={onClose} className="px-3 py-2 rounded-2xl hover:bg-black/5">Cancel</button>
          <button onClick={()=>{ if(!title.trim()) return; onCreate({ title:title.trim(), important, urgent, hours:Number(hours) }); }} className="px-3 py-2 rounded-2xl bg-black text-white shadow-md">Create</button>
        </div>
      </div>
    </div>
  );
};

const ArchiveModal=({open,onClose,items,onRestore,onDelete})=>{
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-3" data-modal>
      <div className="w-full max-w-2xl rounded-[28px] bg-gradient-to-br from-white to-white/90 border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_16px_32px_rgba(0,0,0,0.2)]">
        <div className="p-4 md:p-5 border-b border-black/5 flex items-center justify-between">
          <div className="text-lg font-semibold">Completed Tasks</div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-2xl hover:bg-black/5">Close</button>
        </div>
        <div className="p-3 md:p-4 overflow-auto">
          {items.length===0? (<div className="text-sm text-neutral-600">No completed tasks yet.</div>) : (
            <ul className="space-y-2">{items.map(t=>(
              <li key={t.id} className="flex items-center justify-between gap-2 border border-black/10 rounded-2xl px-3 py-2 bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_10px_rgba(0,0,0,0.08)]">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.title}</div>
                  <div className="text-xs text-neutral-600">Completed {DATE_FMT.format(new Date(t.completedAt))}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>onRestore(t.id)} className="px-2 py-1 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-xs">Restore</button>
                  <button onClick={()=>onDelete(t.id)} className="px-2 py-1 rounded-xl hover:bg-red-50 text-red-600 text-xs">Delete</button>
                </div>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    </div>
  );
};

const EditTaskModal=({open,onClose,task,onSave})=>{
  const [title,setTitle]=useState(""); const [urgent,setUrgent]=useState(false);
  const [important,setImportant]=useState(false); const [hours,setHours]=useState(24);
  useEffect(()=>{ if(open&&task){ setTitle(task.title||""); setUrgent(isUrgentQuadrant(task.quadrant)); setImportant(!!task.important); setHours(msToHrs(Math.max(0,task.dueAt-now()))||24);} },[open,task]);
  if(!open||!task) return null;
  const onToggleUrgent=e=>{
    const u=e.target.checked; setUrgent(u);
    setHours(h=>{ if(u&&h>URGENT_THRESHOLD_HOURS) return 6; if(!u&&h<=URGENT_THRESHOLD_HOURS) return 48; return h; });
  };
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-3" data-modal>
      <div className="w-full max-w-md rounded-[24px] bg-gradient-to-br from-white to-white/90 border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_20px_rgba(0,0,0,0.15)]">
        <div className="p-4 md:p-5 border-b border-black/5"><div className="text-lg font-semibold">Edit Task</div></div>
        <div className="p-4 md:p-5 space-y-3">
          <label className="block text-sm">Title
            <input className="mt-1 w-full px-3 py-2 rounded-2xl border border-black/10 bg-white/70 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]" value={title} onChange={e=>setTitle(e.target.value)}/>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={important} onChange={e=>setImportant(e.target.checked)}/> Important</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={urgent} onChange={onToggleUrgent}/> Urgent</label>
          <label className="block text-sm">Due in (hours)
            <input type="number" min={0} className="mt-1 w-full px-3 py-2 rounded-2xl border border-black/10 bg-white/70 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]" value={hours} onChange={e=>setHours(e.target.value)}/>
          </label>
        </div>
        <div className="p-4 md:p-5 flex justify-end gap-2 border-t border-black/5">
          <button onClick={onClose} className="px-3 py-2 rounded-2xl hover:bg-black/5">Cancel</button>
          <button onClick={()=>{
            const h=Number(hours);
            if(!title.trim()){ alert("Title is required"); return;}
            if(!isFinite(h)||h<0){ alert("Enter a valid non-negative number of hours."); return;}
            onSave({ title:title.trim(), hours:h, urgent, important });
          }} className="px-3 py-2 rounded-2xl bg-black text-white shadow-md">Save</button>
        </div>
      </div>
    </div>
  );
};

const TaskCard=React.memo(({task,selected,provided,snapshot,setSelectedId,onEdit,nowTs})=>(
  <div
    ref={provided.innerRef}
    {...provided.draggableProps}
    {...provided.dragHandleProps}
    onClick={()=>setSelectedId(task.id)}
    onDoubleClick={()=>onEdit(task)}
    data-task-card
    className={`plate transition transform ${snapshot.isDragging?"scale-[1.02] shadow-2xl":""} ${selected?"ring-2 ring-black":""}`}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="font-medium truncate">{task.title}</div>
        <div className="text-[10px] text-neutral-600">{task.important?"Important":"Not important"} • {taskRemainingLabel(task,nowTs)}</div>
      </div>
    </div>
  </div>
));

const Quadrant=React.memo(function Quadrant({id,title,items,selectedId,setSelectedId,onEdit}){
  const qClass=id===Q1?"q-i":id===Q2?"q-ii":id===Q3?"q-iii":"q-iv";
  const nowTs=now();
  return (
    <div className="h-full w-full">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="text-xs md:text-sm font-semibold select-none">{title}</div>
        <div className="text-[10px] md:text-xs text-neutral-600">{items.length}/10</div>
      </div>
      <div className={`rounded-[28px] qpanel ${qClass} h-[calc(100%-1.75rem)]`}>
        <Droppable droppableId={id} type="TASKS">
          {(provided,snapshot)=>(
            <div ref={provided.innerRef} {...provided.droppableProps} className={`h-full max-h-full overflow-auto grid gap-2 content-start p-2 md:p-3 ${snapshot.isDraggingOver?"ring-2 ring-black/30":""}`}>
              {items.map((task,index)=>(
                <Draggable draggableId={task.id} index={index} key={task.id}>
                  {(prov,snap)=>(
                    <TaskCard task={task} selected={selectedId===task.id} provided={prov} snapshot={snap} setSelectedId={setSelectedId} onEdit={onEdit} nowTs={nowTs}/>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </div>
  );
});

function taskRemainingLabel(task,nowTs){ const ms=Math.max(0,task.dueAt-nowTs); const hrs=Math.floor(ms/3600000); const mins=Math.floor((ms%3600000)/60000); return `${hrs}h ${mins}m left`; }
function groupByQuadrant(tasks){ const b={[Q1]:[],[Q2]:[],[Q3]:[],[Q4]:[]}; for(const t of tasks){ b[t.quadrant].push(t);} return b; }

const STYLE_CSS=`
:root{color-scheme:light}
html,body,#root{height:100%}
.bg-background{background:#fff}
.text-foreground{color:#0b0b0e}
.text-muted-foreground{color:rgba(0,0,0,.6)}
:root{--q1-bg:#FDECEA;--q1-accent:#D32F2F;--q2-bg:#E8F5E9;--q2-accent:#388E3C;--q3-bg:#FFF3E0;--q3-accent:#F57C00;--q4-bg:#ECEFF1;--q4-accent:#546E7A}
.qpanel{border:1px solid rgba(0,0,0,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 10px 24px rgba(0,0,0,.1),0 2px 6px rgba(0,0,0,.06);transition:box-shadow .2s}
.qpanel:hover{box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 14px 32px rgba(0,0,0,.12),0 4px 10px rgba(0,0,0,.08)}
.q-i.qpanel{background-color:var(--q1-bg);border-left:4px solid var(--q1-accent)}
.q-ii.qpanel{background-color:var(--q2-bg);border-left:4px solid var(--q2-accent)}
.q-iii.qpanel{background-color:var(--q3-bg);border-left:4px solid var(--q3-accent)}
.q-iv.qpanel{background-color:var(--q4-bg);border-left:4px solid var(--q4-accent)}
.plate{border-radius:20px;padding:10px 12px;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,255,255,.78));border:1px solid rgba(0,0,0,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 6px 12px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06)}
.q-i .plate{border-left:4px solid var(--q1-accent)}
.q-ii .plate{border-left:4px solid var(--q2-accent)}
.q-iii .plate{border-left:4px solid var(--q3-accent)}
.q-iv .plate{border-left:4px solid var(--q4-accent)}
`;

export default function App(){
  const [data,setData]=useState(()=>{ try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw);}catch{} return {tasks:[],archived:[]}; });
  const [addOpen,setAddOpen]=useState(false);
  const [archiveOpen,setArchiveOpen]=useState(false);
  const [selectedId,setSelectedId]=useState(null);
  const [editOpen,setEditOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const [isDragging,setIsDragging]=useState(false);

  useEffect(()=>{ if(!document.getElementById("compassq-styles")){ const s=document.createElement("style"); s.id="compassq-styles"; s.textContent=STYLE_CSS; document.head.appendChild(s);} },[]);

  const openAdd=useCallback(()=>setAddOpen(true),[]);
  const openArchive=useCallback(()=>setArchiveOpen(true),[]);
  const onDragStart=useCallback(()=>setIsDragging(true),[]);

  useEffect(()=>{ if(!selectedId) return; const handler=e=>{ const t=e.target; if(!(t instanceof Element)) return; if(t.closest('[data-task-card]')) return; if(t.closest('[data-task-actions]')) return; if(t.closest('[data-modal]')) return; setSelectedId(null); }; document.addEventListener('mousedown',handler); return ()=>document.removeEventListener('mousedown',handler); },[selectedId]);
  useEffect(()=>{ const onKey=e=>{ if(e.key==='Escape') setSelectedId(null); }; window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey); },[]);

  useDebouncedEffect(()=>{ try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); }catch{} },[data],200);

  useEffect(()=>{ if(isDragging) return; const nowTs=now(); let delay=60000; for(const t of data.tasks){ const d=(t.dueAt-nowTs)-URGENT_THRESHOLD_MS; if(d>0) delay=Math.min(delay,d);} delay=Math.max(500,Math.min(delay,600000)); const timer=setTimeout(()=>{ setData(prev=>{ let changed=false; const tasks=prev.tasks.map(t=>{ const q=computeQuadrant(t.important,t.dueAt); if(q!==t.quadrant){ changed=true; return {...t,quadrant:q}; } return t; }); return changed?{...prev,tasks}:prev; }); },delay); return ()=>clearTimeout(timer); },[data.tasks,isDragging]);

  const tasksByQuadrant=useMemo(()=>groupByQuadrant(data.tasks),[data.tasks]);

  function addTask({title,important,urgent,hours}){
    let h=Number(hours); if(!isFinite(h)||h<0) h=0;
    if(urgent && h>URGENT_THRESHOLD_HOURS) h=URGENT_THRESHOLD_HOURS;
    if(!urgent && h<=URGENT_THRESHOLD_HOURS) h=URGENT_THRESHOLD_HOURS+1;
    const dueAt=now()+hoursToMs(h);
    const quadrant=computeQuadrant(important,dueAt);
    setData(prev=>{
      const count=prev.tasks.filter(t=>t.quadrant===quadrant).length;
      if(count>=10){ alert("Quadrant limit reached (10). Try another quadrant or complete/delete tasks."); return prev;}
      beep("ok");
      return {...prev,tasks:[{id:uid(),title,important,dueAt,createdAt:now(),quadrant},...prev.tasks]};
    });
    setAddOpen(false);
  }

  const completeSelected=useCallback(()=>{
    const id=selectedId; if(!id) return;
    setData(prev=>{
      const t=prev.tasks.find(x=>x.id===id); if(!t) return prev;
      const tasks=prev.tasks.filter(x=>x.id!==id);
      const archived=[{...t,completedAt:now()},...prev.archived];
      beep("ok"); return {...prev,tasks,archived};
    });
    setSelectedId(null);
  },[selectedId]);

  const deleteSelected=useCallback(()=>{
    const id=selectedId; if(!id) return;
    setData(prev=>({...prev,tasks:prev.tasks.filter(x=>x.id!==id)}));
    beep("err"); setSelectedId(null);
  },[selectedId]);

  const openEditSelected=useCallback(()=>{
    if(!selectedId) return;
    const t=data.tasks.find(x=>x.id===selectedId); if(!t) return;
    setEditing(t); setEditOpen(true);
  },[selectedId, data.tasks]);

  function saveEdit({title,hours,urgent,important}){
    setData(prev=>{
      const tasks=[...prev.tasks];
      const idx=tasks.findIndex(t=>t.id===selectedId);
      if(idx===-1) return prev;
      const t={...tasks[idx]};
      t.title=title; t.important=!!important;
      { let h=hours;
        if(urgent&&h>URGENT_THRESHOLD_HOURS) h=URGENT_THRESHOLD_HOURS;
        if(!urgent&&h<=URGENT_THRESHOLD_HOURS) h=URGENT_THRESHOLD_HOURS+1;
        t.dueAt=now()+hoursToMs(h);
      }
      const newQ=computeQuadrant(t.important,t.dueAt);
      if(newQ!==t.quadrant){
        const cnt=tasks.filter(x=>x.quadrant===newQ&&x.id!==t.id).length;
        if(cnt>=10){ alert("Quadrant limit reached (10). Clear room first."); return prev;}
      }
      t.quadrant=newQ; tasks[idx]=t; beep("ok");
      return {...prev,tasks};
    });
    setEditOpen(false); setEditing(null);
  }

  const handleOpenEditor=useCallback(task=>{ setSelectedId(task.id); setEditing(task); setEditOpen(true); },[]);

  function onDragEnd(result){
    setIsDragging(false);
    const {destination,source,draggableId}=result;
    if(!destination) return;
    const destQ=destination.droppableId;
    const srcQ=source.droppableId;
    const destIndex=destination.index;
    const srcIndex=source.index;

    const destUrgent=isUrgentQuadrant(destQ);
    const srcUrgent=isUrgentQuadrant(srcQ);
    const destImportant=isImportantQuadrant(destQ);

    let promptedHours=null;
    if(destUrgent!==srcUrgent){
      const t=data.tasks.find(x=>x.id===draggableId);
      const def=String(Math.max(1,msToHrs((t?t.dueAt:now()+URGENT_THRESHOLD_MS)-now())));
      const input=window.prompt("Set new 'Due in' hours:",def);
      if(input===null) return;
      let h=Number(input);
      if(!isFinite(h)||h<0){ alert("Please enter a valid non-negative number of hours."); return;}
      promptedHours= destUrgent?Math.min(h,URGENT_THRESHOLD_HOURS):Math.max(h,URGENT_THRESHOLD_HOURS+1);
    }

    setData(prev=>{
      const tasks=[...prev.tasks];
      const idx=tasks.findIndex(t=>t.id===draggableId); if(idx===-1) return prev;
      const task={...tasks[idx]}; tasks[idx]=task;

      if(promptedHours!=null) task.dueAt=now()+hoursToMs(promptedHours);
      task.important=destImportant;

      if(computeUrgent(task.dueAt)!==destUrgent){
        const fb=destUrgent?URGENT_THRESHOLD_HOURS:URGENT_THRESHOLD_HOURS+1;
        task.dueAt=now()+hoursToMs(fb);
      }

      const buckets=groupByQuadrant(tasks);
      if(destQ!==srcQ&&buckets[destQ].length>=10){ beep("err"); return prev; }

      const srcList=buckets[srcQ];
      const currentIdx= srcIndex<srcList.length&&srcList[srcIndex]?.id===draggableId?srcIndex:srcList.findIndex(t=>t.id===draggableId);
      if(currentIdx===-1) return prev;

      const [moved]=srcList.splice(currentIdx,1);
      moved.quadrant=destQ;
      const destList=buckets[destQ];
      const insertAt=Math.min(destIndex,destList.length);
      destList.splice(insertAt,0,moved);

      const rebuilt=[...buckets[Q1],...buckets[Q2],...buckets[Q3],...buckets[Q4]];
      beep("drop"); return {...prev,tasks:rebuilt};
    });
  }

  function restoreFromArchive(id){
    setData(prev=>{
      const a=prev.archived.find(x=>x.id===id); if(!a) return prev;
      const quadrant=computeQuadrant(a.important,a.dueAt);
      const count=prev.tasks.filter(t=>t.quadrant===quadrant).length;
      if(count>=10){ alert("Quadrant limit reached (10). Clear room first."); return prev;}
      const archived=prev.archived.filter(x=>x.id!==id);
      const tasks=[{...a,completedAt:undefined,quadrant},...prev.tasks];
      return {...prev,archived,tasks};
    });
  }
  function deleteFromArchive(id){ setData(prev=>({...prev,archived:prev.archived.filter(x=>x.id!==id)})); }

  const grid=(
    // FORCE 2x2 ALWAYS (mobile too) + lock height to 100dvh under the top bar
    <div className="grid grid-cols-2 grid-rows-2 gap-3 md:gap-4 p-3 md:p-4 h-[calc(100dvh-56px)] md:h-[calc(100dvh-64px)]">
      <Quadrant id={Q1} title={QUADRANT_META[Q1].title} items={tasksByQuadrant[Q1]} selectedId={selectedId} setSelectedId={setSelectedId} onEdit={handleOpenEditor}/>
      <Quadrant id={Q2} title={QUADRANT_META[Q2].title} items={tasksByQuadrant[Q2]} selectedId={selectedId} setSelectedId={setSelectedId} onEdit={handleOpenEditor}/>
      <Quadrant id={Q3} title={QUADRANT_META[Q3].title} items={tasksByQuadrant[Q3]} selectedId={selectedId} setSelectedId={setSelectedId} onEdit={handleOpenEditor}/>
      <Quadrant id={Q4} title={QUADRANT_META[Q4].title} items={tasksByQuadrant[Q4]} selectedId={selectedId} setSelectedId={setSelectedId} onEdit={handleOpenEditor}/>
    </div>
  );

  useEffect(()=>{ // quick dev assertions
    const DEV=(typeof process!=="undefined"&&process.env&&process.env.NODE_ENV==="development")||(typeof window!=="undefined"&&window.location&&/^(localhost|127\.0\.0\.1)/.test(window.location.hostname));
    if(!DEV) return;
    try{
      console.assert(QUADRANTS.every(q=>typeof q==="string"),"Quadrant IDs must be strings");
      const soon=now()+hoursToMs(0.5); const later=now()+hoursToMs(48);
      console.assert(computeQuadrant(true,soon)===Q1,"Important+Urgent -> Q1");
      console.assert(computeQuadrant(true,later)===Q2,"Important+NotUrgent -> Q2");
      console.assert(computeQuadrant(false,soon)===Q3,"NotImportant+Urgent -> Q3");
      console.assert(computeQuadrant(false,later)===Q4,"NotImportant+NotUrgent -> Q4");
    }catch(e){ console.warn("Compass-Q dev tests: warn",e); }
  },[]);

  return (
    <>
      <div className="min-h-screen w-full bg-white text-foreground">
        <TopBar onAdd={()=>setAddOpen(true)} onArchiveOpen={()=>setArchiveOpen(true)} archivedCount={data.archived.length}/>
        <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {grid}
        </DragDropContext>

        <div className={`fixed left-1/2 -translate-x-1/2 bottom-4 flex items-center gap-3 transition ${selectedId?"opacity-100 pointer-events-auto":"opacity-0 pointer-events-none"} ${isDragging?"pointer-events-none":""}`}>
          <div data-task-actions className="flex items-center gap-3 rounded-2xl bg-white/80 backdrop-blur border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_20px_rgba(0,0,0,0.15)] px-3 py-2">
            <button onClick={openEditSelected} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-blue-600 text-white shadow-md active:translate-y-px"><Pencil className="w-4 h-4"/>Edit</button>
            <button onClick={completeSelected} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-green-600 text-white shadow-md active:translate-y-px"><CheckCircle2 className="w-4 h-4"/>Complete</button>
            <button onClick={deleteSelected} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-red-600 text-white shadow-md active:translate-y-px"><Trash2 className="w-4 h-4"/>Delete</button>
          </div>
        </div>

        <AddTaskModal open={addOpen} onClose={()=>setAddOpen(false)} onCreate={addTask}/>
        <ArchiveModal open={archiveOpen} onClose={()=>setArchiveOpen(false)} items={data.archived} onRestore={restoreFromArchive} onDelete={deleteFromArchive}/>
        <EditTaskModal open={editOpen} onClose={()=>{ setEditOpen(false); setEditing(null); }} task={editing} onSave={saveEdit}/>
      </div>
    </>
  );
}
