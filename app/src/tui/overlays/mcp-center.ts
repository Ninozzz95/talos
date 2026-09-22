import type {McpServerView} from '../../services/mcp-facade.ts';

export type McpCenterModel={title:string;rows:McpServerView[];selected:number};

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
function shortFingerprint(value:string|null){return value?shown(value):'—';}
function yesNo(value:boolean){return value?'yes':'no';}

export function createMcpCenterModel(rows:readonly McpServerView[],selected=0):McpCenterModel{
  const copy=rows.map(row=>({...row}));
  return{title:'TALOS · MCP control center',rows:copy,selected:copy.length?Math.max(0,Math.min(copy.length-1,selected)):0};
}
export function moveMcpCenterSelection(model:McpCenterModel,delta:number):McpCenterModel{
  if(!model.rows.length)return model;
  return{...model,selected:Math.max(0,Math.min(model.rows.length-1,model.selected+delta))};
}
export function selectedMcpServer(model:McpCenterModel):McpServerView|null{return model.rows[model.selected]??null;}
export function replaceMcpCenterRow(model:McpCenterModel,row:McpServerView):McpCenterModel{
  const index=model.rows.findIndex(value=>value.id===row.id);if(index<0)return model;
  const rows=[...model.rows];rows[index]=row;return{...model,rows};
}

export function renderMcpCenterLines(model:McpCenterModel):string[]{
  const lines=[model.title,''];
  if(!model.rows.length)return[...lines,'No MCP servers declared.','','Esc / q closes · r refresh'];
  for(const [index,row] of model.rows.entries()){
    lines.push((index===model.selected?'›':' ')+' '+shown(row.id)+' · '+row.health.state+' · '+(row.trust.trusted?'trusted':row.trust.state));
  }
  const row=selectedMcpServer(model);if(!row)return lines;
  const capability=row.capabilities
    ?Object.entries(row.capabilities)
      .filter(([key,value])=>key!=='experimental'&&value===true)
      .map(([key])=>key)
      .concat(row.capabilities.experimental.map(value=>'experimental:'+value))
      .join(', ')||'none reported'
    :'not probed';
  const logs=row.logs.length
    ?row.logs.slice(-8).map(entry=>'  '+entry.source+(entry.level?' · '+shown(entry.level):'')+' · '+shown(entry.text))
    :['  none observed'];
  lines.push(
    '',
    'Selected: '+shown(row.id),
    'Health: '+row.health.state+(row.health.latencyMs!==null?' · '+row.health.latencyMs+' ms':'')+(row.health.phase?' · '+shown(row.health.phase):'')+(row.health.message?' · '+shown(row.health.message):''),
    'Trust: project '+yesNo(row.trust.projectTrusted)+' · resource '+row.trust.state+(row.trust.changed?' · fingerprint changed':''),
    'Fingerprint current: '+shortFingerprint(row.trust.currentFingerprint),
    'Fingerprint trusted: '+shortFingerprint(row.trust.trustedFingerprint),
    'Server: '+(row.server?shown(row.server.name)+(row.server.version?' · '+shown(row.server.version):''):'not probed'),
    'Protocol: '+(row.protocol?shown(row.protocol.version)+(row.protocol.era?' · '+shown(row.protocol.era):''):'not probed'),
    'Capabilities: '+capability,
    'Permissions',
    '  configured allowlist: '+(row.permission.configuredAllowlist.length?row.permission.configuredAllowlist.map(shown).join(', '):'none'),
    '  effective tools: '+(row.permission.effectiveTools.length?row.permission.effectiveTools.map(shown).join(', '):'none measured'),
    '  per-call approval: '+row.permission.perCallApproval,
    ...(row.permission.missingAllowlistedTools.length?['  missing allowlisted: '+row.permission.missingAllowlistedTools.map(shown).join(', ')]:[]),
    'Logs',
    ...logs,
    '',
    '↑/↓ select · p/Enter probe · t trust · u untrust · r refresh · Esc/q close'
  );
  return lines;
}
