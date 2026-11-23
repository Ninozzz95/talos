/*
 * Stage 7.11 (mockup PANELS.settings; owner 03/10): the rows of the Settings sheet's Status, Usage and Context tabs, from what
 * TALOS measured — never a figure nobody reported (Claude HUD's rule: native numbers, not estimates; usage-view.ts says
 * «not reported yet» the same way). Pure: the app gathers the facts, these words and segments are the sheet's.
 */
import {t} from '../i18n/index.ts';
import {S,type Seg} from './panel/sheet.ts';
import {barSegs,barWidth,tokensText,type ContextPart,type SettingsContext,type SettingsLine} from './panel/settings-sheet.ts';
import type {CliContextStatus} from '../runtime/types.ts';
import type {UsageSnapshot} from '../runtime/usage-snapshot.ts';

const plain=(text:string):Seg[]=>[S(text)];
const k=(tokens:number)=>`${Math.round(tokens/1000)}k`;

/** «Windows 11», «Windows 10», «macOS», «Linux»: Windows 11 is build 22000 and later (Microsoft's own cut). */
export function osName(platform:string,release:string):string{
  if(platform==='win32'){const build=Number(String(release).split('.')[2]);return Number.isFinite(build)&&build>=22000?'Windows 11':'Windows 10';}
  if(platform==='darwin')return 'macOS';
  if(platform==='linux')return 'Linux';
  return platform;
}
/** The terminal TALOS runs in, as its own environment names it; null when it does not say. */
export function terminalName(env:Record<string,string|undefined>):string|null{
  if(env.WT_SESSION)return t('panel.settings.terminal.windows');
  const program=env.TERM_PROGRAM;
  const named:Record<string,string>={vscode:t('panel.settings.terminal.vscode'),'iTerm.app':'iTerm2',Apple_Terminal:'Terminal',WezTerm:'WezTerm',ghostty:'Ghostty',Hyper:'Hyper',tmux:'tmux'};
  if(program)return named[program]??program;
  if(env.KITTY_WINDOW_ID)return 'kitty';
  if(env.ALACRITTY_WINDOW_ID||env.ALACRITTY_LOG)return 'Alacritty';
  return null;
}
/** «~/projects/shop-api»: the home folder said as ~, as the mockup writes it. */
export function homePath(path:string,home:string):string{
  const p=String(path).replace(/\\/gu,'/');const h=String(home).replace(/\\/gu,'/').replace(/\/$/u,'');
  return h&&p.toLowerCase().startsWith(h.toLowerCase()+'/')?`~${p.slice(h.length)}`:p;
}

export type McpRow={name:string;state:'ok'|'signin'|'failed'|'unchecked'};
export type StatusFacts={
  version:string;node:string;os:string;terminal:string|null;
  conversation:{name:string|null;messages:number;id:string}|null;
  project:{path:string;branch:string|null;changed:number|null};
  model:{name:string;provider:string|null;effort:string|null}|null;
  mode:string;agents:number;
  mcp:readonly McpRow[]|null;
  memory:{files:readonly string[];entries:number|null};
  /* what /status said before the sheet (sandbox, permission rules, tasks and notes): kept after the mockup's rows */
  extra:readonly {label:string;value:string}[];
};
const MODES=['default','acceptEdits','plan','auto','dontAsk','bypassPermissions'];

export function statusLines(f:StatusFacts):SettingsLine[]{
  const lines:SettingsLine[]=[];
  lines.push({label:'TALOS',value:plain([f.version,`Node ${f.node}`,f.os,...(f.terminal?[f.terminal]:[])].join(' · '))});
  lines.push({label:t('panel.settings.row.conversation'),value:plain(f.conversation
    ?[...(f.conversation.name?[f.conversation.name]:[]),t(f.conversation.messages===1?'panel.settings.messages.one':'panel.settings.messages.other',{count:f.conversation.messages}),f.conversation.id.slice(0,6)].join(' · ')
    :t('panel.settings.noConversation'))});
  lines.push({label:t('panel.settings.row.project'),value:plain([f.project.path,...(f.project.branch?[f.project.branch]:[]),
    ...(f.project.changed?[t(f.project.changed===1?'panel.settings.changed.one':'panel.settings.changed.other',{count:f.project.changed})]:[])].join(' · '))});
  lines.push({label:t('panel.settings.row.model'),value:plain(f.model
    ?[f.model.provider?t('panel.settings.modelVia',{model:f.model.name,provider:f.model.provider}):f.model.name,...(f.model.effort?[t('panel.settings.effort',{effort:f.model.effort})]:[])].join(' · ')
    :t('panel.settings.noModel'))});
  lines.push({label:t('panel.settings.row.mode'),value:plain(MODES.includes(f.mode)?t(`panel.settings.mode.${f.mode}` as 'panel.settings.mode.default'):f.mode)});
  lines.push({label:t('panel.settings.row.agents'),value:plain(t('panel.settings.agents',{count:f.agents}))});
  const mcp=f.mcp;
  lines.push({label:'MCP',value:mcp===null?plain(t('panel.settings.notRead')):mcp.length===0?plain(t('panel.settings.noMcp'))
    :mcp.flatMap((row,i)=>[...(i?[S(' · ')]:[]),S(row.state==='ok'?`${row.name} ✓`:row.state==='signin'?t('panel.settings.mcpSignIn',{name:row.name}):row.state==='failed'?t('panel.settings.mcpFailed',{name:row.name}):t('panel.settings.mcpUnchecked',{name:row.name}),
      row.state==='ok'?'ok':row.state==='unchecked'?'dim':row.state==='failed'?'err':'warn')])});
  const files=f.memory.files.map(file=>t('panel.settings.memoryFile',{file}));
  lines.push({label:t('panel.settings.row.memory'),value:plain([...(files.length?files:[t('panel.settings.noMemoryFile')]),
    ...(f.memory.entries!==null?[t(f.memory.entries===1?'panel.settings.entries.one':'panel.settings.entries.other',{count:f.memory.entries})]:[])].join(' · '))});
  for(const row of f.extra)lines.push({label:row.label,value:plain(row.value)});
  return lines;
}

/* the conversation as /usage measured it (usage-snapshot.ts); the project's record (usage-record.ts) adds Today and By model */
export type UsageRecordFacts={perTurn:readonly number[];today:{tokens:number;usd:number|null}|null;byModel:readonly {model:string;share:number}[]};
export function usageLines(snapshot:UsageSnapshot|null,{priceSource,compactAt,record,reasoning=null}:{priceSource:string|null;compactAt:number|null;record:UsageRecordFacts|null;reasoning?:{effort:string;usage:string}|null}):SettingsLine[]{
  const lines:SettingsLine[]=[];const s=snapshot;
  const notYet=t('panel.settings.notReported');
  lines.push({label:t('panel.settings.row.conversation'),value:plain(s&&(s.inputTokens!==null||s.outputTokens!==null)
    ?[t('panel.settings.in',{tokens:tokensText(s.inputTokens??0)}),t('panel.settings.out',{tokens:tokensText(s.outputTokens??0)}),...(s.cachedTokens?[t('panel.settings.cached',{tokens:tokensText(s.cachedTokens)})]:[])].join(' · ')+(s.estimated?t('panel.settings.estimatedWord'):'')
    :notYet)});
  lines.push({label:t('panel.settings.row.cost'),value:s?.local?plain(t('panel.settings.local'))
    :s?.costUsd!=null?[S(`$${s.costUsd.toFixed(3)}`,'b'),S(`  ${s.costSource==='provider-reported'?t('panel.settings.reported'):priceSource?t('panel.settings.prices',{source:priceSource}):t('panel.settings.listPrice')}`,'faint')]
    :plain(t('panel.settings.noPrice'))});
  const percent=s?.percent;const window=s?.windowTokens;
  lines.push({label:t('panel.settings.row.context'),value:percent!=null&&window?(w:number)=>[...barSegs(percent,barWidth(w)),S(`  ${t('panel.settings.ofWindow',{percent:Math.round(percent),window:k(window)})}`,'dim')]
    :plain(window?t('panel.settings.windowOnly',{window:k(window)}):t('panel.settings.windowUnknown'))});
  lines.push({label:t('panel.settings.row.compactions'),value:plain([s&&s.compactions>0?t(s.compactions===1?'panel.settings.compactions.one':'panel.settings.compactions.other',{count:s.compactions}):t('panel.settings.noCompactions'),
    ...(compactAt!==null?[t('panel.settings.autoAt',{percent:compactAt})]:[])].join(' · '))});
  if(reasoning)lines.push({label:t('panel.settings.row.reasoning'),value:plain(t('panel.settings.reasoning',reasoning))});
  if(record&&record.perTurn.length>1)lines.push({label:t('panel.settings.row.perTurn'),value:[S(sparkline(record.perTurn),'acc'),S(`  ${t('panel.settings.lastTurns',{count:record.perTurn.length})}`,'faint')]});
  if(record){
    lines.push(null);
    lines.push({label:t('panel.settings.row.today'),value:plain(record.today?[t('panel.settings.tokens',{tokens:k(record.today.tokens)}),...(record.today.usd!==null?[`$${record.today.usd.toFixed(2)}`]:[])].join(' · ')+t('panel.settings.inProject'):t('panel.settings.noneToday'))});
    if(record.byModel.length)lines.push({label:t('panel.settings.row.byModel'),value:record.byModel.flatMap((row,i)=>[...(i?[S(' · ','faint')]:[]),S(`${row.model} ${Math.round(row.share*100)}%`,'dim')])});
  }
  return lines;
}

const SPARK='▁▂▃▄▅▆▇█';
/** One glyph a turn, the tallest turn the full block. */
export function sparkline(values:readonly number[]):string{
  const max=Math.max(0,...values);return values.map(value=>SPARK[max>0?Math.min(7,Math.round(Math.max(0,value)/max*7)):0]).join('');
}

/* the kernel's parts of the window, when it gives them (desktop, `contestoPerParti`, asked 03/10), in the mockup's colours */
const PART_ROLES:ReadonlyArray<[key:'system'|'tools'|'mcp'|'memory'|'messages',label:string,role:string]>=[['system','panel.settings.part.system','dim'],['tools','panel.settings.part.tools','acc'],['mcp','panel.settings.part.mcp','warn'],['memory','panel.settings.part.memory','ok'],['messages','panel.settings.part.messages','err']];
/*
 * Acceptance s67 (b), 14/10/2026: the automatic summary's threshold as a share of the WINDOW the row names, as «used (N%)» is.
 * `autoCompaction.triggerPercent` is a share of the engine's input limit (the window less the reply's reserve and the margin):
 * beside «1000k window» its «24%» read as 240,000 tokens for a conversation summarised at 200,000 (798d78e42), and «85%» of a 262k
 * window as 222,700 for 204,700. Rounded down: the row never says later than the engine does. No window known: the ratio as before.
 */
export function compactAtShare(status:CliContextStatus|null|undefined):number|null{
  if(!status)return null;
  const budget=status.budget;
  if(budget&&Number.isFinite(budget.triggerTokens)&&budget.windowTokens>0)return Math.floor(budget.triggerTokens/budget.windowTokens*1000)/10;
  return status.autoCompaction.triggerPercent;
}
export function contextOf(status:CliContextStatus|null):SettingsContext|null{
  const m=status?.measurement;const window=status?.budget?.windowTokens??m?.windowTokens??null;
  if(!status?.available||!m||!window)return null;
  const raw=status.parts;
  const parts:ContextPart[]|null=raw?PART_ROLES.map(([key,label,role])=>({label:t(label as 'panel.settings.part.system'),tokens:Math.max(0,raw[key]??0),role})):null;
  const biggest=parts?[...parts].sort((a,b)=>b.tokens-a.tokens)[0]:null;
  return{window,used:m.inputTokens,compactAt:compactAtShare(status)!,parts,...(raw&&raw.exact===false?{estimated:true}:{}),
    hint:biggest&&biggest.label===t('panel.settings.part.messages')?t('panel.settings.messagesHint'):null};
}
