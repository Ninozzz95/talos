import type {MemorySnapshot,MemoryView} from '../../services/memory-facade.ts';

export type MemoryCenterModel={snapshot:MemorySnapshot;selected:number};

const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown){
  return String(value??'').replace(UNSAFE,(ch)=>{
    if(ch==='\\')return'\\\\';
    const cp=ch.codePointAt(0)??0;
    return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';
  });
}
function clamp(selected:number,count:number){return count?Math.max(0,Math.min(count-1,selected)):0;}

export function createMemoryCenterModel(snapshot:MemorySnapshot,selected=0):MemoryCenterModel{
  return{snapshot,selected:clamp(selected,snapshot.rows.length)};
}
export function moveMemoryCenterSelection(model:MemoryCenterModel,delta:number):MemoryCenterModel{
  return{...model,selected:clamp(model.selected+delta,model.snapshot.rows.length)};
}
export function selectedMemory(model:MemoryCenterModel):MemoryView|null{
  return model.snapshot.rows[model.selected]??null;
}

export function renderMemoryCenterLines(model:MemoryCenterModel):string[]{
  const lines=[
    'Memory Center',
    'Scope: global (derived-store-contract) · Project: unavailable · Session: unavailable · Source: unavailable'
  ];
  if(model.snapshot.state==='invalid'){
    lines.push('Store: invalid · '+inert(model.snapshot.error?.code??'MEMORY_STORE_INVALID')+' · '+inert(model.snapshot.error?.message??'unavailable'));
    lines.push('Esc/q close · r refresh');
    return lines;
  }
  if(!model.snapshot.rows.length){
    lines.push('(no memories)');
    lines.push('Esc/q close · r refresh');
    return lines;
  }
  lines.push(...model.snapshot.rows.map((row,index)=>{
    const marker=index===model.selected?'›':' ';
    return marker+' '+inert(row.id)+' · '+inert(row.title)+' · '+inert(row.kind??'kind unavailable');
  }));
  const row=selectedMemory(model);
  if(row){
    lines.push('ID: '+inert(row.id));
    lines.push('Title: '+inert(row.title));
    lines.push('Kind: '+inert(row.kind??'unavailable'));
    lines.push('Writer: '+inert(row.provenance.writer)+' ('+inert(row.provenance.writerEvidence)+')');
    lines.push('Provenance: scope '+inert(row.provenance.scope)+' ('+inert(row.provenance.scopeEvidence)+') · project unavailable · session unavailable · source unavailable');
    lines.push('Duplicate control: '+inert(row.duplicateControl.mode)+' · '+inert(row.duplicateControl.normalization)+' · create '+inert(row.duplicateControl.onCreateDuplicate)+' · update '+inert(row.duplicateControl.onUpdate)+' · semantic '+(row.duplicateControl.semanticDetection?'yes':'no')+' · merge '+(row.duplicateControl.merge?'yes':'no'));
    lines.push('Usage: '+inert(row.usage.status)+' · '+inert(row.usage.reason));
    lines.push('Cost: '+inert(row.cost.status)+' · '+inert(row.cost.reason));
    lines.push('Created: '+inert(row.createdAt??'unavailable')+' · Updated: '+inert(row.updatedAt??'unavailable'));
    lines.push('Content: '+inert(row.content));
  }
  lines.push('↑/↓ select · r refresh · Esc/q close');
  return lines;
}
