import type {WorkflowCatalogRow} from '../../services/workflow-catalog.ts';

export type WorkflowCenterModel={title:string;rows:WorkflowCatalogRow[];selected:number};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
const BACKSLASH=String.fromCharCode(92);
function inert(value:string){
  return String(value).replace(UNSAFE,character=>{
    if(character===BACKSLASH)return BACKSLASH+BACKSLASH;
    const code=character.codePointAt(0)!;
    return code>0xffff?BACKSLASH+'u{'+code.toString(16)+'}':BACKSLASH+'u'+code.toString(16).padStart(4,'0');
  });
}
function shown(value:unknown){return inert(String(value??'—'));}

export function createWorkflowCenterModel(rows:readonly WorkflowCatalogRow[],selected=0):WorkflowCenterModel{
  const copy=rows.map(row=>({...row,references:[...row.references]}));
  return{title:'TALOS · Workflow Center',rows:copy,selected:copy.length?Math.max(0,Math.min(copy.length-1,selected)):0};
}
export function moveWorkflowCenterSelection(model:WorkflowCenterModel,delta:number):WorkflowCenterModel{
  if(!model.rows.length)return model;
  return{...model,selected:Math.max(0,Math.min(model.rows.length-1,model.selected+delta))};
}
export function selectedWorkflow(model:WorkflowCenterModel):WorkflowCatalogRow|null{return model.rows[model.selected]??null;}

export function renderWorkflowCenterLines(model:WorkflowCenterModel):string[]{
  const lines=[model.title,''];
  if(!model.rows.length)return[...lines,'No custom commands, workflows or project skills discovered.'];
  for(const [index,row] of model.rows.entries()){
    const state=row.validation.valid?(row.trust.required?(row.trust.trusted?'trusted':row.trust.state):row.trust.state):'invalid';
    lines.push((index===model.selected?'›':' ')+' '+shown(row.id)+' · '+row.kind+' · '+row.provenance.scope+' · '+state);
  }
  const row=selectedWorkflow(model);if(!row)return lines;
  lines.push(
    '',
    'Selected: '+shown(row.name)+' · '+row.kind,
    'Provenance: '+row.provenance.scope+' · '+shown(row.provenance.path),
    'Validation: '+(row.validation.valid?'valid':'INVALID '+shown(row.validation.code))+(row.validation.message?' · '+shown(row.validation.message):''),
    'Trust: '+(row.trust.required?(row.trust.trusted?'trusted':row.trust.state):row.trust.state),
    'Current fingerprint: '+shown(row.trust.currentFingerprint),
    'Trusted fingerprint: '+shown(row.trust.trustedFingerprint),
    'Executable steps: '+row.executableSteps
  );
  if(row.references.length){
    lines.push('References');
    for(const reference of row.references)lines.push('  '+reference.type+' · '+shown(reference.name)+' · '+shown(reference.id));
  }
  return lines;
}
