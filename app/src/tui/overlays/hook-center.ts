import type {HookView} from '../../services/hook-facade.ts';

export type HookCenterModel={title:string;rows:HookView[];selected:number};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
const BACKSLASH=String.fromCharCode(92);
function inert(value:string){
  return String(value).replace(UNSAFE,character=>{
    if(character===BACKSLASH)return BACKSLASH+BACKSLASH;
    const code=character.codePointAt(0)!;
    return code>0xffff?BACKSLASH+'u{'+code.toString(16)+'}':BACKSLASH+'u'+code.toString(16).padStart(4,'0');
  });
}
function shown(value:unknown){
  if(typeof value==='string')return inert(value);
  try{return inert(JSON.stringify(value));}catch{return inert(String(value));}
}
function fingerprint(value:string|null){return value?shown(value):'—';}

export function createHookCenterModel(rows:readonly HookView[],selected=0):HookCenterModel{
  const copy=rows.map(row=>({...row,lastExecutions:[...row.lastExecutions]}));
  return{title:'TALOS · Hooks control center',rows:copy,selected:copy.length?Math.max(0,Math.min(copy.length-1,selected)):0};
}
export function moveHookCenterSelection(model:HookCenterModel,delta:number):HookCenterModel{
  if(!model.rows.length)return model;
  return{...model,selected:Math.max(0,Math.min(model.rows.length-1,model.selected+delta))};
}
export function selectedHook(model:HookCenterModel):HookView|null{return model.rows[model.selected]??null;}
export function replaceHookCenterRow(model:HookCenterModel,row:HookView):HookCenterModel{
  const index=model.rows.findIndex(value=>value.id===row.id);if(index<0)return model;
  const rows=[...model.rows];rows[index]=row;return{...model,rows};
}

export function renderHookCenterLines(model:HookCenterModel):string[]{
  const lines=[model.title,''];
  if(!model.rows.length)return[...lines,'No project hooks declared.','','Esc closes · r refresh'];
  for(const [index,row] of model.rows.entries()){
    const status=row.quarantine.active?'quarantined':row.trust.trusted?'trusted':row.trust.state;
    lines.push((index===model.selected?'›':' ')+' '+shown(row.id)+' · '+status+' · '+row.events.map(shown).join(', '));
  }
  const row=selectedHook(model);if(!row)return lines;
  lines.push(
    '',
    'Selected: '+shown(row.id),
    'Trust: project '+(row.trust.projectTrusted?'yes':'no')+' · resource '+row.trust.state+(row.trust.changed?' · fingerprint changed':''),
    'Fingerprint current: '+fingerprint(row.trust.currentFingerprint),
    'Fingerprint trusted: '+fingerprint(row.trust.trustedFingerprint),
    'Quarantine: '+(row.quarantine.active?'quarantined'+(row.quarantine.reason?' · '+shown(row.quarantine.reason):''):'not quarantined'),
    'Events: '+row.events.map(shown).join(', '),
    'Command: '+shown(row.launch.command),
    'Dry run: executes the REAL hook process with a synthetic TALOS event; side effects are possible.',
    row.lastDryRun
      ?'Last dry run: '+shown(row.lastDryRun.eventType)+' · '+shown(row.lastDryRun.result)
      :'Last dry run: not run in this center',
    'Last executions'
  );
  if(!row.lastExecutions.length)lines.push('  none recorded');
  else for(const execution of row.lastExecutions.slice(0,8)){
    lines.push(
      '  session '+shown(execution.sessionId)+' · started '+shown(execution.sessionStartedAt??'unknown')+
      ' · sequence '+execution.sequence+' · '+shown(execution.eventType)+
      (execution.action?' · '+shown(execution.action):'')+' · '+shown(execution.result)
    );
  }
  lines.push(
    '',
    '↑/↓ select · d dry-run '+shown(row.events[0]??'declared event')+' · t trust · u untrust · q quarantine/release · r refresh · Esc close'
  );
  return lines;
}
