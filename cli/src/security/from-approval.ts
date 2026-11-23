import type {PermissionAction,PermissionNetworkPath,PermissionSensitivity} from './types.ts';
import {inertTerminalText} from '../errors.ts';
import {externalToolParts,isKnownTool,permissionToolFor} from '../tui/tool-display.ts';
/*
 * R2 lane T (gate E3/E4): the approval payload `{tipo:<kernel tool name>, percorso|comando, toolCallId}`
 * (talosHarness.mjs:8166-9714, reaching the CLI as `ApprovalRequested.azione`, agui-events.mjs:279) is mapped by the
 * kernel NAME through the one tool table, never by matching Italian substrings. The old `raw.includes('scritt')` missed
 * the kernel's own `scrivi`, which carried `percorso` and was therefore judged as a Read, and a read inside the project is
 * allowed without asking (evaluate.ts:130): the default mode wrote files without asking (review E-07).
 *
 * Fields decide only where the name cannot, and always toward the stricter reading:
 * - a payload carrying a command is judged as that shell command, whatever tool it names (the command is what runs);
 * - a name that is not a kernel tool and names a path is a Write, never a Read (a Read would pass without asking);
 * - `serverId` makes it an MCP call; TALOS's own services carry the tool name as operation, so "always" writes a rule
 *   for that one operation (`TalosService(:notes_create)`) instead of `TalosService(:*)`, which matched every service.
 */
function text(value:unknown):string|undefined{return typeof value==='string'?value:undefined;}
/* C-005: the kernel's path class (`azione.segreto.classe`, talosHarness.mjs `verificaPermessoScrittura`). A class this table does not
   know is read as a secret, the strictest: a new kind of protected path must never become bypassable by being new. */
/* F-L-003 (stress test 0.5.5): the v1 event carries the English class, and `-p` decides from that event, so the English names map to
   themselves (a translated class read twice is the same class, never "unknown, so secret"). */
const SENSITIVITY:Readonly<Record<string,PermissionSensitivity>>=Object.freeze({segreto:'secret',portachiavi:'keychain','fuori-workspace-nascosto':'outside-hidden','fuori-workspace':'outside',
  secret:'secret',keychain:'keychain','outside-hidden':'outside-hidden',outside:'outside'});
export function sensitivityOfClass(classe:string|undefined):PermissionSensitivity{return classe!==undefined&&Object.hasOwn(SENSITIVITY,classe)?SENSITIVITY[classe]!:'secret';}
/* 0.6.8 (stress test of 0.6.7, F-P-001, S0): the v2 translation names it `sensitive.class`; both spellings are read, so an event in
   either form can never make a secret bypassable */
function sensitivityOf(a:Record<string,unknown>):PermissionSensitivity|undefined{const segreto=a.segreto??a.sensitive;if(!segreto||typeof segreto!=='object')return undefined;const s=segreto as Record<string,unknown>;return sensitivityOfClass(text(s.classe)??text(s.class));}
function networkOf(a:Record<string,unknown>):PermissionNetworkPath|undefined{
  /* review block 3 (Desktop, 26/10/2026): the TUI reads the v2 action, where it is `networkPath{host,via,scope}` since 0.6.15; the
     kernel's names stay readable (`-p` decides from the kernel's event). One name only would turn the network question into a
     plain one, silently — the shape of the `classe` defect of 1629d4827. */
  const rete=a.percorsoDiRete??a.networkPath;if(!rete||typeof rete!=='object')return undefined;const r=rete as Record<string,unknown>;
  return{host:text(r.ospite)??text(r.host)??'',via:text(r.via)??'stringa',...(r.ambito==='sessione'||r.scope==='session'?{scope:'session' as const}:{})};
}
/* Decision 41 (owner 02/11): the kernel's root card in WSL, in its names and in the v2 ones (events.ts `wslRoot`) */
function wslRootOf(a:Record<string,unknown>):PermissionAction['wslRoot']{const r=a.wslRoot;if(!r||typeof r!=='object')return undefined;const o=r as Record<string,unknown>;return{distro:text(o.distro)??null,user:text(o.utente)??text(o.user)??null};}
/* Decision 155 (owner 04/11/2026): the kernel's card of a deletion of a critical folder (kernel cancellazioni-critiche.mjs), in its
   names and in English ones; the sentence is the kernel's, drawn inert (it carries a path) */
function criticalDeleteOf(a:Record<string,unknown>):PermissionAction['criticalDelete']{const c=a.cancellazioneCritica??a.criticalDelete;if(!c||typeof c!=='object')return undefined;const o=c as Record<string,unknown>;const sentence=inertTerminalText(text(o.frase)??text(o.sentence)??'');return{path:inertTerminalText(text(o.percorso)??text(o.path)??''),why:text(o.perche)??text(o.why)??'',...(sentence?{sentence}:{})};}
/* A5h: the six tools of the chain's mark (config.mjs ATTREZZI_CON_PERMESSO_PER_ATTREZZO), and the kernel's keys that give a card its two
   choices for another reason: a control file, the network, a network path, a critical deletion, a secret or credential, root in WSL, the
   trifecta, suspicious content, a write outside the project, an agent start, a call written as text */
const SIX_TOOLS:ReadonlySet<string>=new Set(['scrivi','file_edit','prova','shell','document_create','generate_image']);
const OTHER_REASONS:ReadonlyArray<string>=['fileDiControllo','controlFile','rete','percorsoDiRete','networkPath','cancellazioneCritica','criticalDelete','segreto','sensitive',
  'wslRoot','trifecta','contenutoSospetto','suspiciousContent','fuoriDalProgetto','outsideProject','coordinazione','coordination','semprePersona','alwaysPerson'];
/* The kernel's tools that take a per-tool «always» (harness-ui config.mjs ATTREZZI_CON_PERMESSO_PER_ATTREZZO) and its agent start
   (coordinazione.mjs CHIAVE_COORDINAZIONE). The kernel also marks every card of a tool outside this set (a connector, plugin, Tool
   Forge or TALOS service: session-registry.mjs, P018 round 2), where the PC keeps its own «for this tool»: not read here (A5f report). */
const ONCE_WHEN_MARKED:ReadonlySet<string>=new Set(['scrivi','file_edit','prova','shell','document_create','generate_image','delega_sottotask']);
const OUTSIDE_KINDS:ReadonlySet<string>=new Set(['mcp_tool','plugin_tool','forge_tool']);
export function permissionActionFromApproval(data:Record<string,unknown>):PermissionAction{
  const a=(data.azione??data.action??data) as Record<string,unknown>;
  const command=text(a.comando)??text(a.command);
  const name=text(a.tipo)??text(a.tool)??'';
  const external=isKnownTool(name)?null:externalToolParts(name);
  let serverId=text(a.serverId),operation=text(a.operation);
  if(external?.kind==='mcp'){serverId??=external.owner;operation??=external.tool;}
  /* «One line», step 3 (11/11/2026): the PC's P018 card of an MCP tool, `{tipo:'mcp_tool',server,attrezzo}` (kernel ef78b744c
     `chiaveDellaCartaDiFuori`; the v2 action keeps both keys as they are): its server and its tool, so «always» is one (server,
     tool) pair as the kernel keeps it (Hermes `mcp:{server}/{tool}`, Codex `McpToolApprovalKey`), never the kind `mcp_tool`,
     which as `TalosService(:mcp_tool)` matched every MCP call of every server */
  const mcpCard=name==='mcp_tool';
  if(mcpCard){serverId??=text(a.server);operation??=text(a.attrezzo);}
  let tool:PermissionAction['tool'];
  if(command)tool='Bash';
  else if(mcpCard)tool='Mcp';
  else if(isKnownTool(name)||external)tool=permissionToolFor(name);
  else if(serverId)tool='Mcp';
  else tool=text(a.percorso)??text(a.path)??text(a.resource)?'Write':'TalosService';
  const resource=text(a.percorso)??text(a.path)??text(a.resource)??(tool==='WebFetch'?text(a.url):undefined);
  if(!operation&&name&&(tool==='TalosService'||tool==='Plugin'))operation=name;
  /* Owner 02/11/2026: question and cost of a research live in the kernel's words (`azioneCartaRicerca`); the answer's `domandaModificata` field is optional */
  const detail=name==='research_start'?inertTerminalText([text(a.question),text(a.frase)].filter(Boolean).join(' · '))||undefined:undefined;/* the question is the model's words: the card's reason is drawn as it is */
  /* the kernel's network-path question (`azione.percorsoDiRete`): a network action whatever else it carries; `ambito:'sessione'` is the
     session folder on a share, asked once per session by the kernel */
  const network=networkOf(a);
  const sensitive=network?'network':sensitivityOf(a);
  const secret=(a.segreto??a.sensitive) as Record<string,unknown>|undefined;const sensitivePath=secret&&typeof secret==='object'?text(secret.percorso)??text(secret.path):undefined;
  const wslRoot=wslRootOf(a);
  const criticalDelete=criticalDeleteOf(a);
  /* R-34 part 2 and decision 121 (03/11/2026): `semprePersona` (v2 `alwaysPerson`) marks a call a local model wrote as text; the card
     names the tool (`nome`, v2 `name`), the model's own word, drawn inert */
  const personOnly=a.semprePersona===true||a.alwaysPerson===true;
  const textCallDetail=personOnly?inertTerminalText(text(a.nome)??text(a.name)??'')||undefined:undefined;
  const shownDetail=detail??textCallDetail;
  /* Decision 373 (owner 07/11/2026): the kernel's `fileDiControllo` (v2 `controlFile`) marks the card of a command that names a computer
     use settings file and of a write to a TALOS control file (session-registry.mjs `cancelloShellDelComputerUse`, the per-path gate).
     Only a real `true`: the kernel turns a yes from a rule or the mode into a no on that card (`MOTIVI_DEL_SI_SENZA_PERSONA`). */
  const controlFile=a.fileDiControllo===true||a.controlFile===true;
  /* A5f (owner 19/11/2026 09:33): the kernel's `sempreNonBasta` (v2 `alwaysNotEnough`) on the card of one of its per-tool tools or of an
     agent start: the ordinary write of a control file (`cartaPerFileDiControllo`), a child's or delegate's card whose chain would not
     keep an «always» (C2-a), an agent start Coordination would not keep (C2b). Only a real `true`. */
  const alwaysNotEnough=(a.sempreNonBasta===true||a.alwaysNotEnough===true)&&ONCE_WHEN_MARKED.has(name);
  /* A5h (owner 19/11/2026, giudice v2266): the mark may be only the chain's (C2-a) when the card is one of the six tools and carries
     none of the kernel's other reasons for two choices, in either spelling; the engine lifts it only for a child in acceptEdits or
     Full access, and reads the paths and credentials itself (permission-engine.ts). Any such key present keeps the mark. */
  const chainOnly=alwaysNotEnough&&SIX_TOOLS.has(name)&&!OTHER_REASONS.some(key=>a[key]!==undefined&&a[key]!==null&&a[key]!==false);
  /* A5j (owner 13/11/2026 04:35, road B): the card of an outside tool that names its tool — the kernel's own test for «No to this tool
     until your next message» (talosHarness.mjs `chiaveDellaCartaDiFuori`; the registry reads the question, session-registry.mjs:17115) —
     never a call the model wrote as text (the PC leaves it out too, app.js:18851) */
  const noToThisTool=OUTSIDE_KINDS.has(name)&&typeof a.attrezzo==='string'&&a.attrezzo!==''&&!personOnly;
  /* Riga 91 (0.6.18), cure 2: the card the kernel makes in Read only is «only once» (`soloUnaVolta`, talosHarness.mjs:15917; the v2
     action keeps the name). Cure 4: a plugin or Tool Forge card names its plugin and tool, the kernel's key (kind, plugin, tool) of
     `chiaveDellaCartaDiFuori` (talosHarness.mjs:11797-11799), so a session yes covers that one tool, never every plugin */
  const onlyOnce=a.soloUnaVolta===true;
  /* Row 126, road A (owner 13/11/2026 04:35, judge v1759): the kernel's group on the first card of the same outside tool's calls in one
     answer (talosHarness.mjs `gruppoPerLaCarta`); the registry takes «for all» only where `gruppo.totale` is 2+ (session-registry.mjs:17129) */
  const total=(a.gruppo as {totale?:unknown}|null|undefined)?.totale;const sameCalls=noToThisTool&&!onlyOnce&&!OTHER_REASONS.some(key=>a[key]!==undefined&&a[key]!==null&&a[key]!==false)/* round 2: never beside a forced sign */&&Number.isSafeInteger(total)&&(total as number)>1?total as number:0;
  const outside=name==='plugin_tool'||name==='forge_tool'?{plugin:name==='plugin_tool'?text(a.plugin):undefined,outsideTool:text(a.attrezzo)}:{};
  return{tool,...(noToThisTool?{noToThisTool:true as const}:{}),...(sameCalls?{sameCalls}:{}),...(alwaysNotEnough?{alwaysNotEnough:true as const}:{}),...(chainOnly?{chainOnly:true as const}:{}),...(personOnly?{personOnly:true as const}:{}),...(onlyOnce?{onlyOnce:true as const}:{}),...(outside.plugin?{plugin:outside.plugin}:{}),...(outside.outsideTool?{outsideTool:outside.outsideTool}:{}),...(wslRoot?{wslRoot}:{}),...(criticalDelete?{criticalDelete}:{}),...(controlFile?{controlFile:true as const}:{}),...(name==='research_start'&&text(a.question)?{question:inertTerminalText(text(a.question))}:{}),...(shownDetail?{detail:shownDetail}:{}),...(command?{command}:{}),...(resource?{resource}:{}),...(serverId?{serverId}:{}),...(operation?{operation}:{}),...(sensitive?{sensitive}:{}),...(sensitivePath?{sensitivePath}:{}),...(secret&&typeof secret==='object'&&(secret.credenzialeDellaCasa===true||secret.homeCredential===true)?{homeCredential:true}:{}),...(a.rete===true?{networkRequested:true}:{}),...(network?{network}:{})};
}
