import type {PluginView} from '../../services/plugin-facade.ts';

export type PluginCenterModel={title:string;rows:PluginView[];selected:number};

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
function list(values:readonly string[]){return values.length?values.map(shown).join(', '):'none';}

export function createPluginCenterModel(rows:readonly PluginView[],selected=0):PluginCenterModel{
  const copy=rows.map(row=>({...row}));
  return{title:'TALOS · Plugin Center',rows:copy,selected:copy.length?Math.max(0,Math.min(copy.length-1,selected)):0};
}
export function movePluginCenterSelection(model:PluginCenterModel,delta:number):PluginCenterModel{
  if(!model.rows.length)return model;
  return{...model,selected:Math.max(0,Math.min(model.rows.length-1,model.selected+delta))};
}
export function selectedPlugin(model:PluginCenterModel):PluginView|null{return model.rows[model.selected]??null;}
export function replacePluginCenterRow(model:PluginCenterModel,row:PluginView):PluginCenterModel{
  const index=model.rows.findIndex(value=>value.id===row.id);if(index<0)return model;
  const rows=[...model.rows];rows[index]=row;return{...model,rows};
}

export function renderPluginCenterLines(model:PluginCenterModel):string[]{
  const lines=[model.title,''];
  if(!model.rows.length)return[...lines,'No project plugins discovered.','','Esc closes · r refresh'];
  for(const [index,row] of model.rows.entries()){
    const status=row.registry.state!=='loaded'
      ?row.registry.state
      :row.quarantine.active?'quarantined'
      :row.guard?.verdict==='dangerous'?'dangerous'
      :row.trust.effectiveTrusted?'trusted':'untrusted';
    lines.push((index===model.selected?'›':' ')+' '+shown(row.id)+' · '+status+' · '+row.provenance.kind);
  }
  const row=selectedPlugin(model);if(!row)return lines;
  lines.push(
    '',
    'Selected: '+shown(row.id)+(row.name?' · '+shown(row.name):''),
    'Registry: '+row.registry.state+(row.registry.code?' · '+shown(row.registry.code):'')+(row.registry.message?' · '+shown(row.registry.message):''),
    'Provenance: '+row.provenance.kind+(row.provenance.extension?' · '+shown(row.provenance.extension.name)+' '+shown(row.provenance.extension.version):''),
    'Package copy: '+(row.provenance.packageCopyPresent?'present':'not verified')+' · '+shown(row.provenance.packageCopy),
    'Recorded source ('+row.provenance.recordedSourceAuthority+'): '+(row.provenance.recordedSource?shown(row.provenance.recordedSource):'none')+' · '+(row.provenance.recordedSourceAvailable?'available':'unavailable / unverified'),
    'Guard: '+(row.guard?row.guard.verdict:'unavailable')+(row.guardError?' · '+shown(row.guardError):''),
    'Capabilities: '+(row.guard?list(row.guard.capabilities):'unavailable'),
    'Trust: scope '+(row.trust.scopeTrusted?'trusted':'not trusted')+' · effective '+(row.trust.effectiveTrusted?'trusted':'NOT TRUSTED')+' · project '+(row.trust.projectTrusted?'trusted':'not fully trusted'),
    'Fingerprint current set: '+shown(row.fingerprints.currentSetDigest),
    'Fingerprint trusted set: '+shown(row.fingerprints.trustedSetDigest)
  );
  if(row.fingerprints.changedPaths.length)lines.push('Changed: '+list(row.fingerprints.changedPaths));
  if(row.fingerprints.addedPaths.length)lines.push('Added: '+list(row.fingerprints.addedPaths));
  if(row.fingerprints.removedPaths.length)lines.push('Removed: '+list(row.fingerprints.removedPaths));
  lines.push(
    'Quarantine: '+(row.quarantine.active?'active':'none')+(row.quarantine.reason?' · '+shown(row.quarantine.reason):'')
  );
  if(row.guard===null)lines.push('Guard findings: unavailable');
  else if(row.guard.findings.length){
    lines.push('Guard findings');
    for(const finding of row.guard.findings.slice(0,12)){
      lines.push('  '+finding.severity+' · '+shown(finding.code)+' · '+shown(finding.origin)+' · '+shown(finding.message));
    }
    if(row.guard.findings.length>12)lines.push('  … '+(row.guard.findings.length-12)+' more finding(s)');
  }else if(row.guard)lines.push('Guard findings: none');
  if(row.guard?.verdict==='dangerous')lines.push('TRUST BLOCKED: Plugin Guard marked the current package dangerous.');
  lines.push('','↑/↓ select · t trust · u revoke · q quarantine/release · r refresh · Esc close');
  return lines;
}
