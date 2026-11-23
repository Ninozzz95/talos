/*
 * Stage 7.3 (owner 01/10 «ogni comando deve avere il suo pannello»; the approved mockup's PANELS, MOCKUP-FASE-UI-2026-10-01.html:
 * 569-605). The commands' sheets: each builds its panel from the product's real state with the mockup's words, and turns the
 * sheet's effects into ONE action TALOS carries out (the app does it; this file decides nothing else). A command given its
 * argument still acts at once (`/busy steer`, `/effort high`, `/rename Name`); the sheet is for the command alone. As in the
 * mockup a list opens on its first row; the ● says which one is in use.
 */
import {truncateMiddle} from '../text-width.ts';
import {slidingRow} from './page.ts';
import {bar,CHART_FULL,type ChartMode} from '../charts.ts';
import type {UsageHistory} from '../../sessions/usage-record.ts';
import {usageByDayRows,usageByModelRows,usageCalendarRows,usageDayStep,usageEmptyRows} from './usage-page.ts';
import {SESSION_FILTERS,sessionMark,sessionStateText,sessionStateWord,type SessionState} from '../session-state.ts';
import {CAPABILITY_TABS,capabilityDetail,capabilityItems,capabilityToolsTop,type CapabilityData,type CapabilityTab} from './capability-page.ts';
import {AUTOMATION_FILTERS,automationCalendarRows,automationDetail,automationItems,automationMatches,reviewOf,type AutomationFilter,type AutomationsData} from './automations-page.ts';
import {FORGE_FILTERS,forgeDetail,forgeItems,forgeMatch,previousRevision,type ForgeData} from './forge-page.ts';
import {requestSentDetail,requestSentItems,requestSentTop} from './request-sent.ts';
import {RESEARCH_FILTERS,evidenceDetail,evidenceItems,researchDetail,researchItems,researchMatch,type ResearchData,type ResearchFilter} from './research-page.ts';
import {projectDetail,projectItems,type ProjectRow} from './projects-page.ts';
import {doctorDetail,doctorHead,doctorItems,type DoctorReport} from './doctor-page.ts';
import {deviceDetail,deviceItems,type DevicesData} from './devices-page.ts';
import {PROCESS_FILTERS,processDetail,processItems,processMatch,processOf,processRunning,processesAlive,processesTop,type ProcessesData,type ProcessFilter} from './processes-page.ts';
import {boardCardAt,boardFilterRow,boardLaneRows,boardMatches,boardMove,boardTableRows,type BoardPick,type BoardRow} from './board.ts';
import {contextCompactionItems,contextFactItems,contextHeadRows,contextKeptRows,contextOverviewRows,contextOwnSettingsRows,contextVersionItems,type ContextPageData} from './context-page.ts';
import {t,tn,type MessageId} from '../../i18n/index.ts';
import type {UiBusyInput} from '../../config/types.ts';
import {askDelete,diffFileRows,fit,listItems,one,S,startEdit,trunc,wrap,type DiffFile,type PanelBody,type ListBody,type Panel,type PanelItem,type PanelKey,type PanelStep,type ProgressStep,type SegRow} from './sheet.ts';
import {loadingRow} from './loading.ts';
import {KEYBINDINGS,type Keybinding} from '../keybindings.ts';
import {homeSign,type HomeSession} from '../components/home.ts';
import {shelfPick,shelfRows,type ShelfColors,type ShelfMode,type ShelfPick,type ShelfView} from './shelf.ts';
import {compactTokens} from '../status-bar.ts';
import {activityClock} from '../activity-line.ts';
import {panelWhen} from './when.ts';
import type {EditorDraft} from '../editor.ts';
import type {SessionTurn} from '../../sessions/digest.ts';
import type {CheckpointDelta} from '../../workspace/checkpoint-delta.ts';
import {setupStep,type SetupState,type SetupUse} from './setup-sheet.ts';
import {settingsStep,type SettingsState} from './settings-sheet.ts';
import {patchOf} from '../diff-files.ts';
import {markdownRows} from './markdown-rows.ts';

export type SheetName='capability'|'automations'|'forge'|'research'|'projects'|'doctor'|'devices'|'processes'|'board'|'shelf'|'context'|'usage'|'home'|'leave'|'loading'|'library'|'memory'|'permissions'|'ruleScope'|'clear'|'queue'|'copy'|'diff'|'help'|'tasks'|'notes'|'busy'|'plan'|'retry'|'rename'|'effort'|'history'|'resume'|'fork'|'export'|'undo'|'compact'|'model'|'provider'|'setup'|'settings';
export type SheetState={name:SheetName;panel:Panel;/* what the sheet acts on, kept from when it opened */context?:{text?:string;drafts?:readonly EditorDraft[];renaming?:string;project?:string;turns?:readonly SessionTurn[];points?:readonly UndoPoint[];models?:readonly ModelRow[];providers?:readonly ProviderView[];model?:ModelView&{current:string|null;providerLabel:string;effort:string;scale:readonly string[];notice?:string};setup?:SetupState;settings?:SettingsState;/* stage 7.14: the queued message being edited, '' for a new one */queueEdit?:string;/* stage 7.15: what each /copy row copies */bodies?:readonly string[];/* stage 7.16: the files of /diff's Now tab */diffFiles?:readonly DiffFile[];/* stage 7.19: the item whose title is being edited, '' for a new one */editing?:string;
  /* stage 7.21: the rule waiting for where to save it, and the /permissions sheet Esc goes back to */pendingRule?:{rule:string;effect:'allow'|'ask'|'deny'};back?:SheetState;
  /* stage 7.21: the rules and decisions /permissions lists, by row */rules?:readonly RuleView[];recent?:readonly RecentView[];
  /* stage 7.22: the rows of /memory's Project and You tabs */memories?:readonly (readonly MemoryRow[])[];/* C8 */capability?:{data:CapabilityData};/* C9 */automations?:{data:AutomationsData;now:number};automationEdit?:{id:string|null;stage:'what'|'when';instructions?:string};forge?:{data:ForgeData};research?:{data:ResearchData};/* C11b */projects?:{rows:readonly ProjectRow[];current:string};doctor?:{report:DoctorReport|null};devices?:{data:DevicesData};devicesRevoke?:string;processes?:{data:ProcessesData};processesStopAll?:boolean;researchCancel?:string|undefined;/* C6 */resume?:{rows:readonly ResumeRow[];options:ResumeOptions};board?:{rows:readonly BoardRow[];filter:number;pick:BoardPick;table:number;glyph:string;unicode:boolean};/* C5 */usage?:{history:UsageHistory|null;day:number;mode:ChartMode;now:Date};/* C4 */contextPage?:{data:ContextPageData;mode:ChartMode;asking:boolean};/* FE-052 */shelf?:{paint:ShelfPaint;pick:ShelfPick;current?:string;here?:string;folders?:readonly string[];how?:NewSessionHow;picks?:NewSessionPicks|null};/* the page shown while a command reads */loading?:boolean;/* a row of the page still working: the screen redraws it each tick (not a loading page) */ticking?:boolean}};
export type SheetAction=
  |{kind:'busy';mode:UiBusyInput;notice:string}
  |{kind:'plan';on:boolean;notice:string}
  |{kind:'retry';edit:boolean;text:string}
  |{kind:'rename';name:string;notice:string}
  |{kind:'effort';level:string;notice:string}
  |{kind:'history';draft:EditorDraft}|{kind:'copy';text:string;notice:string}
  |{kind:'notice';text:string;/* the shelf's dashed disk: the mockup's yellow notice (index.html:2532) */tone?:'warn'}|{kind:'resume';id:string}|{kind:'fork';id:string;title:string}
  |{kind:'renameSession';id:string;name:string;notice:string}|{kind:'deleteSession';id:string;title:string}
  |{kind:'forkHere';beforeRun:string|null;text:string}
  |({kind:'export';to:'file'|'clipboard'}&ExportChoice)
  |{kind:'undoFiles';id:string;redo:boolean}|{kind:'undoCut';id:string;files:boolean}
  |{kind:'model';id:string;effort:string;notice:string}
  |{kind:'provider';id:string}|{kind:'providerKey';id:string;key:string}|{kind:'providerTest';id:string}
  /* stage 7.10d: the setup sheet's steps (setup-sheet.ts) */
  |{kind:'setupTab';tab:number}|{kind:'setupProvider';id:string}|{kind:'setupModel';id:string}|{kind:'setupModels'}|{kind:'setupTools'}
  |{kind:'setupKey';use:SetupUse;key?:string;/* the environment key was declined */declined?:boolean;/* 14/10/2026: the Z.AI address chosen on the Key tab (index in ZAI_ADDRESSES) */address?:number}
  /* stage 7.11: the Settings sheet's Config, by field label (settings-sheet.ts) */
  |{kind:'settingsSave';values:Record<string,string|boolean>}|{kind:'settingsReload'}
  /* stage 7.13: /clear */
  |{kind:'clearScreen'}|{kind:'newConversation'}
  |{kind:'usageSession'}|{kind:'capability';tab:number;verb:string;id:string}
  |{kind:'processes';verb:'stop'|'stopAll'|'reread';sessionId?:string;toolCallId?:string}
  |{kind:'devices';verb:'pair'|'revoke';id?:string}
  |{kind:'doctor';verb:'recheck'|'export';id?:string}
  |{kind:'research';verb:'open'|'pause'|'resume'|'cancel'|'export';id:string}
  |{kind:'forge';verb:'enable'|'disable'|'back';id:string;revision?:number}
  |{kind:'automation';verb:'add'|'edit'|'pause'|'resume'|'run'|'delete'|'seen';id:string;instructions?:string;when?:string;runIds?:readonly string[]}|{kind:'modelFavourite';id:string;on:boolean}|{kind:'deleteSessions';ids:readonly string[]}|{kind:'exportSessions';ids:readonly {id:string;title:string}[]}|{kind:'contextChange';method:string;path:string;body?:Record<string,unknown>;done:MessageId;tab:number}|{kind:'openFolder';path:string;confirmed?:boolean}|/* C11b: New session, on one of its tabs */{kind:'openNew';tab:number}|{kind:'newSetup';effort:string|null;mode:string;plan:boolean}
  /* stage 7.14: /queue */
  |{kind:'diffOpen';path:string}|{kind:'runCommand';name:string}
  /* stage 7.19: /tasks */
  |{kind:'libraryMention';id:string}|{kind:'libraryAdd';path:string}|{kind:'libraryDelete';id:string}
  |{kind:'memoryAdd';title:string;you:boolean}|{kind:'memoryEdit';id:string;title:string}|{kind:'memoryDelete';id:string}|{kind:'memoryOpenFile';path:string;line:number}
  |{kind:'permissionMode';mode:PermissionModeChoice;label:string}|{kind:'ruleAdd';rule:string;effect:'allow'|'ask'|'deny';scope:'project-user'|'project'|'user'}
  |{kind:'ruleEffect';index:number;effect:'allow'|'ask'|'deny'}|{kind:'ruleEdit';index:number;rule:string}|{kind:'ruleDelete';index:number}
  |{kind:'noteAttach';id:string}|{kind:'noteAdd';title:string}|{kind:'noteEdit';id:string;title:string}|{kind:'noteOpen';id:string}|{kind:'noteDelete';id:string}
  |{kind:'taskDone';id:string;done:boolean}|{kind:'taskAdd';title:string}|{kind:'taskEdit';id:string;title:string}|{kind:'taskDelete';id:string}
  |{kind:'queueSend';id:string}|{kind:'queueMove';id:string}|{kind:'queueAdd';text:string}|{kind:'queueEdit';id:string;text:string}|{kind:'queueDelete';id:string};

const BUSY_MODES:readonly UiBusyInput[]=['queue','steer','interrupt'];
export function busySheet(current:UiBusyInput):SheetState{
  return{name:'busy',panel:one(t('panel.busy.title'),t('panel.busy.sub'),{kind:'list',sel:0,radio:true,twoLine:true,enter:t('panel.enter.use'),
    items:BUSY_MODES.map(mode=>({label:t(`panel.busy.${mode}`),desc:t(`panel.busy.${mode}.desc`),current:mode===current}))})};
}
export function planSheet(planOn:boolean):SheetState{
  return{name:'plan',panel:one(t('panel.plan.title'),'',{kind:'list',sel:0,radio:true,twoLine:true,enter:t('panel.enter.use'),top:()=>[[S(t('panel.plan.top'),'dim')],[S('')]],
    items:[{label:t('panel.plan.first'),desc:t('panel.plan.first.desc'),current:planOn},{label:t('panel.plan.normal'),desc:t('panel.plan.normal.desc'),current:!planOn}]})};
}
/** Stage 7.13 (mockup clear; Claude Code /clear keeps the old conversation in /resume, Gemini CLI's Ctrl+L clears only the
 *  screen): clear the screen and keep the conversation, or start a new one; `name` is what /resume calls this one. */
export function clearSheet(name:string|null):SheetState{
  return{name:'clear',panel:one(t('panel.clear.title'),'',{kind:'list',sel:0,twoLine:true,enter:t('panel.enter.choose'),
    items:[{label:t('panel.clear.screen'),desc:t('panel.clear.screen.desc')},{label:t('panel.clear.new'),desc:name?t('panel.clear.new.desc',{name}):t('panel.clear.new.empty')},
      {label:t('panel.clear.cancel'),desc:t('panel.clear.cancel.desc')}]})};
}
/** Stage 7.14 (mockup queue; Codex #28864 and Claude Code #48802: each queued message edited, moved or removed on its own,
 *  #22895: an edit keeps its place): the messages waiting for the turn to end, in the order they go. */
/* F-Q1: `inTurn` — waiting in the kernel's queue, it goes in after the current step; it has no «move up» (owner 03/10) */
export type QueuedView={id:string;kind:'prompt'|'command'|'slash';text:string;inTurn?:boolean};
export function queueSheet(entries:readonly QueuedView[],{sel=0}:{sel?:number}={}):SheetState{
  return{name:'queue',panel:one(t('panel.queue.title'),t('panel.queue.sub'),{kind:'list',sel:Math.max(0,Math.min(sel,entries.length-1)),empty:t('panel.queue.empty'),enter:t('panel.queue.send'),
    keys:[...(entries.some(entry=>!entry.inTurn)?[{key:'u',label:t('panel.queue.up')}]:[]),{key:'n',label:t('panel.queue.new'),adds:true},{key:'e',label:t('panel.queue.edit')},{key:'d',label:t('panel.queue.delete')}],
    items:entries.map(entry=>({id:entry.id,label:entry.text.replace(/\s+/gu,' ').trim(),...(entry.inTurn?{badge:t('panel.queue.inTurn')}:{})}))})};
}
function queueStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;
  if(effect.kind==='enter')return{sheet:null,action:{kind:'queueSend',id:effect.item.id!}};
  if(effect.kind==='key'){
    if(effect.key==='n')return{sheet:{...next,panel:startEdit(step.panel,t('panel.queue.newLabel')),context:{...sheet.context,queueEdit:''}},action:null};
    if(!effect.item)return{sheet:next,action:null};
    if(effect.key==='u')return{sheet:next,action:effect.item.id?.startsWith('kernel:')?null:{kind:'queueMove',id:effect.item.id!}};
    if(effect.key==='e')return{sheet:{...next,panel:startEdit(step.panel,t('panel.queue.editLabel'),effect.item.label),context:{...sheet.context,queueEdit:effect.item.id!}},action:null};
    if(effect.key==='d')return{sheet:{...next,panel:askDelete(step.panel)},action:null};
  }
  if(effect.kind==='edited'){
    const text=effect.value.trim(),id=sheet.context?.queueEdit;const {queueEdit:_done,...context}=sheet.context??{};const left={...next,context};
    if(!text||id===undefined)return{sheet:left,action:null};
    return{sheet:left,action:id?{kind:'queueEdit',id,text}:{kind:'queueAdd',text}};
  }
  if(effect.kind==='delete')return{sheet:next,action:{kind:'queueDelete',id:effect.item.id!}};
  return{sheet:next,action:null};
}
/**
 * Stage 7.15 (mockup copy; Claude Code /copy picks the whole answer or one code block, Codex's picker also a quote — owner
 * 03/10): the whole last answer, each of its code blocks, each of its quotes, then up to three earlier answers, each with
 * its preview beside it. `answers` newest first.
 */
const lineCount=(text:string)=>{const n=text.split('\n').length;return t(n===1?'panel.copy.line':'panel.copy.lines',{count:n});};
export function copySheet(answers:readonly string[]):SheetState{
  const last=answers[0]??'';const rows:Array<{label:string;body:string}>=[];
  if(last)rows.push({label:t('panel.copy.whole'),body:last});
  [...last.matchAll(/```(\w*)\n([\s\S]*?)```/gu)].forEach((match,index)=>rows.push({label:t(match[1]?'panel.copy.codeLang':'panel.copy.code',{n:index+1,lang:match[1]??''}),body:match[2]!.trim()}));
  /* a quote is a run of lines that start with «>», outside the code blocks */
  const quotes:string[][]=[];let open:string[]|null=null;
  for(const line of last.replace(/```[\s\S]*?```/gu,'').split('\n')){const m=/^\s*>\s?(.*)$/u.exec(line);if(m){(open??=(quotes.push([]),quotes.at(-1)!)).push(m[1]!);}else open=null;}
  quotes.forEach((quote,index)=>rows.push({label:t('panel.copy.quote',{n:index+1}),body:quote.join('\n')}));
  answers.slice(1,4).forEach((answer,index)=>rows.push({label:t('panel.copy.back',{n:index+2}),body:answer}));
  return{name:'copy',context:{bodies:rows.map(row=>row.body)},panel:one(t('panel.copy.title'),t('panel.copy.sub'),{kind:'list',sel:0,enter:t('panel.copy.enter'),empty:t('panel.copy.empty'),
    items:rows.map((row,index)=>({id:String(index),label:row.label,meta:lineCount(row.body)})),
    detail:(item,width)=>{const body=rows[Number(item.id)]?.body??'';return[[S(t('panel.copy.preview'),'faint')],...body.split('\n').slice(0,14).map(line=>[S(trunc(line,width),'code')] as SegRow)];}})};
}
/**
 * Stage 7.16 (mockup diff; Claude Code /diff, «Current» and per-turn — owner 03/10, tabs Now and By turn): Now is the mockup's
 * sheet, `git diff HEAD` and the untracked files, o opens the file in the editor and c copies its patch; By turn lists your
 * messages, newest first, each with what it changed beside it.
 */
export type DiffTurn={label:string;files:readonly DiffFile[]};
export function diffSheet({sub,files,turns}:{sub:string;files:readonly DiffFile[];turns:readonly DiffTurn[]}):SheetState{
  const counts=(list:readonly DiffFile[])=>list.length?`+${list.reduce((sum,file)=>sum+file.add,0)} −${list.reduce((sum,file)=>sum+file.del,0)}`:t('panel.diff.noFiles');
  const now:PanelBody={kind:'diff',files,sel:0,empty:t('panel.diff.empty'),keys:[{key:'o',label:t('panel.diff.open')},{key:'c',label:t('panel.diff.copy')}]};
  const byTurn:PanelBody={kind:'list',sel:0,empty:t('panel.diff.turnsEmpty'),items:turns.map((turn,index)=>({id:String(index),label:turn.label,meta:counts(turn.files)})),
    detail:(item,width)=>(turns[Number(item.id)]?.files??[]).flatMap((file,index)=>[...(index?[[S('')] as SegRow]:[]),...diffFileRows(file,width)])};
  return{name:'diff',context:{diffFiles:files},panel:{title:t('panel.diff.title'),sub,tab:0,tabs:[{name:t('panel.diff.now'),body:now},{name:t('panel.diff.byTurn'),body:byTurn}]}};
}
function diffStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;if(effect.kind!=='key'||step.panel.tab!==0)return{sheet:next,action:null};
  const body=step.panel.tabs[0]!.body;const file=body.kind==='diff'?sheet.context?.diffFiles?.[body.sel]:undefined;if(!file)return{sheet:next,action:null};
  if(effect.key==='o')return{sheet:next,action:{kind:'diffOpen',path:file.path}};
  if(effect.key==='c')return{sheet:next,action:{kind:'copy',text:patchOf(file),notice:t('panel.diff.copied',{path:file.path})}};
  return{sheet:next,action:null};
}
/**
 * Stage 7.17 (mockup help; Claude Code /help tabs general · commands · custom commands, Gemini CLI /help commands and keys):
 * Commands lists every command in the palette's groups, / searches them, the one under the cursor says its arguments and
 * what it does beside the list, and Enter opens it; Keys is the mockup's ten keys.
 */
export type HelpCommand={name:string;group:string;usage:string;desc:string;fresh?:boolean};
const HELP_GROUPS=['global','composer','transcript','approval'] as const;
const HELP_KEY_MOST=24;
/** The keys as the registry has them, the person's own changes included: this list cannot fall behind. Two columns when they do not fit and there is room (the mockup's `TASTI`). */
export function helpKeyRows(keymap:readonly Keybinding[],width:number,height=Number.POSITIVE_INFINITY):SegRow[]{
  /* the column fits the keys of the page, up to a point: a longer key keeps two spaces, so it never touches its words */
  const shown=keymap.filter(binding=>(HELP_GROUPS as readonly string[]).includes(binding.context)&&binding.keys.length).map(binding=>binding.keys.join(' / ').length);
  const keyWidth=Math.min(HELP_KEY_MOST,Math.max(14,...shown.map(width=>width+2)));
  const rows:SegRow[]=[];const row=(key:string,words:string)=>rows.push([S('  '),S(key.padEnd(Math.max(keyWidth,key.length+2)),'acc'),S(words,'dim')]);
  for(const group of HELP_GROUPS){
    const bindings=keymap.filter(binding=>binding.context===group&&binding.keys.length);
    if(bindings.length)rows.push([S(` ${t(`panel.help.group.${group}` as MessageId)}`,'b faint')]);
    for(const binding of bindings)row(binding.keys.join(' / ').toLowerCase(),binding.description);
    /* what no binding holds: the mouse and the `/` list stay said, after the keys that work everywhere */
    if(group==='global'){rows.push([S(` ${t('panel.help.group.mouse')}`,'b faint')]);row('/',t('panel.help.mouse.commands'));row('drag',t('panel.help.mouse.drag'));row('click',t('panel.help.mouse.click'));}
  }
  if(width<124||rows.length<=height)return rows;
  const half=Math.ceil(rows.length/2),column=Math.floor(width/2);
  return rows.slice(0,half).map((row,index)=>[...fit(row,column),...(rows[half+index]??[])]);
}
export function helpSheet(commands:readonly HelpCommand[],{version,tab=0,keymap=KEYBINDINGS}:{version:string;tab?:number;keymap?:readonly Keybinding[]}):SheetState{
  const list:PanelBody={kind:'list',sel:0,filterable:true,enter:t('panel.help.open'),
    items:commands.map(command=>({id:command.name,label:`/${command.name}`,meta:command.group,...(command.fresh?{badge:t('panel.help.new'),badgeRoles:'pill'}:{}),search:`${command.name} ${command.desc}`})),
    detail:(item,width)=>{const command=commands.find(row=>row.name===item.id);if(!command)return[];
      return[[S(`/${command.name}${command.usage?' '+command.usage:''}`,'acc b')],...wrap(command.desc,width).map(line=>[S(line,'dim')] as SegRow),[S('')],[S(t('panel.help.enterOpens'),'faint')]];}};
  const keys:PanelBody={kind:'info',lines:(width,height)=>helpKeyRows(keymap,width,height)};
  return{name:'help',panel:{title:t('panel.help.title'),sub:t('panel.help.sub',{version,count:commands.length}),tab,tabs:[{name:t('panel.help.commands'),body:list},{name:t('panel.help.keys'),body:keys}]}};
}
/**
 * Stage 7.19 (mockup tasks; owner 03/10: the mockup's sheet in front, what the task board has more in the detail beside it):
 * the project's tasks with their checkbox and state, space marks one done or open again, n adds, e edits the title, d twice
 * deletes; on a wide screen the detail says its state and priority, its description, and what it is linked to.
 */
export type TaskView={id:string;title:string;done:boolean;/* FE-048: which filter of the page it stands under */state?:'open'|'doing'|'done';meta:string;
  detail:{description:string|null;status:string;priority:string;depends:readonly string[];evidence:readonly string[];agents:readonly string[];schedules:readonly string[]}};
export function tasksSheet(tasks:readonly TaskView[],{sel=0,filterAt=0}:{sel?:number;filterAt?:number}={}):SheetState{
  /* FE-048: on the page the states are filters, each with how many it holds */
  const stateOf=new Map(tasks.map(task=>[task.id,task.state??(task.done?'done':'open')]));
  const filter=(name:MessageId,state?:'open'|'doing'|'done')=>({name:`${t(name)} ${state?tasks.filter(task=>stateOf.get(task.id)===state).length:tasks.length}`,...(state?{match:(item:PanelItem)=>stateOf.get(item.id!)===state}:{})});
  const section=(title:MessageId,lines:readonly string[]):SegRow[]=>lines.length?[[S('')],[S(t(title),'faint')],...lines.map(line=>[S(`  ${line}`)] as SegRow)]:[];
  return{name:'tasks',panel:one(t('panel.tasks.title'),t('panel.tasks.sub'),{kind:'list',sel:Math.max(0,Math.min(sel,tasks.length-1)),check:true,wideDetailOnly:true,empty:t('panel.tasks.empty'),filterAt,
    filters:[filter('panel.tasks.filter.all'),filter('panel.tasks.filter.open','open'),filter('panel.tasks.filter.doing','doing'),filter('panel.tasks.filter.done','done')],
    keys:[{key:'space',label:t('panel.tasks.done')},{key:'n',label:t('panel.tasks.new'),adds:true},{key:'e',label:t('panel.tasks.edit')},{key:'d',label:t('panel.tasks.delete')}],
    items:tasks.map(task=>({id:task.id,label:task.title,done:task.done,meta:task.meta})),
    detail:(item,width)=>{const task=tasks.find(row=>row.id===item.id);if(!task)return[];const d=task.detail;
      return[[S(task.title,'acc b')],[S(t('panel.tasks.state',{status:d.status,priority:d.priority}),'faint')],...(d.description?[[S('')] as SegRow,...wrap(d.description,width).map(line=>[S(line)] as SegRow)]:[]),
        ...section('panel.tasks.depends',d.depends),...section('panel.tasks.evidence',d.evidence),...section('panel.tasks.agents',d.agents),...section('panel.tasks.schedules',d.schedules)];}})};
}
function tasksStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;
  if(effect.kind==='key'){
    if(effect.key==='n')return{sheet:{...next,panel:startEdit(step.panel,t('panel.tasks.newLabel')),context:{...sheet.context,editing:''}},action:null};
    if(!effect.item)return{sheet:next,action:null};
    if(effect.key==='space')return{sheet:next,action:{kind:'taskDone',id:effect.item.id!,done:!effect.item.done}};
    if(effect.key==='e')return{sheet:{...next,panel:startEdit(step.panel,t('panel.tasks.editLabel'),effect.item.label),context:{...sheet.context,editing:effect.item.id!}},action:null};
    if(effect.key==='d')return{sheet:{...next,panel:askDelete(step.panel)},action:null};
  }
  if(effect.kind==='edited'){
    const title=effect.value.trim(),id=sheet.context?.editing;const {editing:_done,...context}=sheet.context??{};const left={...next,context};
    if(!title||id===undefined)return{sheet:left,action:null};
    return{sheet:left,action:id?{kind:'taskEdit',id,title}:{kind:'taskAdd',title}};
  }
  if(effect.kind==='delete')return{sheet:next,action:{kind:'taskDelete',id:effect.item.id!}};
  return{sheet:next,action:null};
}
/**
 * Stage 7.20 (mockup notes; owner 03/10: the mockup's sheet in front, what the notes have more beside it): the project's notes,
 * each with its day and a line of what it holds, the one under the cursor drawn as Markdown; / searches, n adds, e edits the
 * title, v opens the note in the editor, d twice deletes. What a note is linked to (a session, a task, a research) follows its
 * Markdown.
 */
export type NoteRow={id:string;title:string;meta:string;desc:string;markdown:string;links:readonly string[]};
export function notesSheet(notes:readonly NoteRow[],{sel=0}:{sel?:number}={}):SheetState{
  return{name:'notes',panel:one(t('panel.notes.title'),t('panel.notes.sub'),{kind:'list',sel:Math.max(0,Math.min(sel,notes.length-1)),twoLine:true,filterable:true,split:0.42,empty:t('panel.notes.empty'),enter:t('panel.notes.attach'),
    keys:[{key:'n',label:t('panel.notes.new'),adds:true},{key:'e',label:t('panel.notes.edit')},{key:'d',label:t('panel.notes.delete')},{key:'v',label:t('panel.notes.open')}],
    items:notes.map(note=>({id:note.id,label:note.title,meta:note.meta,desc:note.desc})),
    detail:(item,width)=>{const note=notes.find(row=>row.id===item.id);if(!note)return[];
      return[...markdownRows(note.markdown,width),...(note.links.length?[[S('')] as SegRow,[S(t('panel.notes.links'),'faint')],...note.links.map(link=>[S(`  ${link}`)] as SegRow)]:[])];}})};
}
function notesStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;
  if(effect.kind==='key'){
    if(effect.key==='n')return{sheet:{...next,panel:startEdit(step.panel,t('panel.notes.newLabel')),context:{...sheet.context,editing:''}},action:null};
    if(!effect.item)return{sheet:next,action:null};
    if(effect.key==='e')return{sheet:{...next,panel:startEdit(step.panel,t('panel.notes.editLabel'),effect.item.label),context:{...sheet.context,editing:effect.item.id!}},action:null};
    if(effect.key==='v')return{sheet:next,action:{kind:'noteOpen',id:effect.item.id!}};
    if(effect.key==='d')return{sheet:{...next,panel:askDelete(step.panel)},action:null};
  }
  if(effect.kind==='edited'){
    const title=effect.value.trim(),id=sheet.context?.editing;const {editing:_done,...context}=sheet.context??{};const left={...next,context};
    if(!title||id===undefined)return{sheet:left,action:null};
    return{sheet:left,action:id?{kind:'noteEdit',id,title}:{kind:'noteAdd',title}};
  }
  if(effect.kind==='delete')return{sheet:next,action:{kind:'noteDelete',id:effect.item.id!}};
  /* owner 03/10: Enter puts the note in the message being written (the old notes panel's «c»), and the sheet closes */
  if(effect.kind==='enter'&&effect.item.id)return{sheet:null,action:{kind:'noteAttach',id:effect.item.id}};
  return{sheet:next,action:null};
}
/**
 * Stage 7.21 (mockup permissions; owner 03/10): what TALOS may do without asking, in three tabs. Mode: the four modes, Enter
 * uses one (Full access still asks its confirmation), and over them a row says whether this project is trusted (the trust
 * centre moved to /permissions trust). Rules: each rule with allow/ask/deny and where it is saved; space turns it to the
 * next, n adds one and then asks where to save it, e edits its words, d twice deletes; a change is obeyed at once. Recent:
 * the last decisions of this project, and a makes one an «allow» rule, asking where to save it.
 */
export type PermissionModeChoice='default'|'acceptEdits'|'plan'|'bypassPermissions';
export type RuleView={rule:string;effect:'allow'|'ask'|'deny';meta:string};
export type RecentView={id:string;label:string;outcome:string;bad:boolean;meta:string;desc:string;rule:string|null};
const EFFECT_ROLES={allow:'ok',ask:'warn',deny:'err'} as const;
const NEXT_EFFECT={allow:'ask',ask:'deny',deny:'allow'} as const;
const MODES:readonly PermissionModeChoice[]=['default','acceptEdits','plan','bypassPermissions'];
export function permissionsSheet({mode,trusted,rules,recent,tab=0,sel=0}:{mode:string;trusted:boolean|null;rules:readonly RuleView[];recent:readonly RecentView[];tab?:number;sel?:number}):SheetState{
  const at=(n:number,i:number)=>i===tab?Math.max(0,Math.min(sel,n-1)):0;
  const modes:PanelBody={kind:'list',sel:at(MODES.length,0),radio:true,twoLine:true,enter:t('panel.permissions.use'),
    top:()=>trusted===null?[]:[[S(`  ${t(trusted?'panel.permissions.trusted':'panel.permissions.notTrusted')}`,'faint')],[S('')]],
    items:MODES.map(id=>({id,label:t(`panel.permissions.mode.${id}`),desc:t(`panel.permissions.mode.${id}.desc`),current:mode===id,...(id==='bypassPermissions'?{descRoles:'err'}:{})}))};
  const ruleList:PanelBody={kind:'list',sel:at(rules.length,1),empty:t('panel.permissions.noRules'),
    top:()=>[[S(`  ${t('panel.permissions.order')}`,'faint')],[S('')]],
    keys:[{key:'space',label:t('panel.permissions.cycle')},{key:'n',label:t('panel.permissions.new'),adds:true},{key:'e',label:t('panel.permissions.edit')},{key:'d',label:t('panel.permissions.delete')}],
    items:rules.map((row,i)=>({id:String(i),label:row.rule,badge:row.effect,badgeRoles:EFFECT_ROLES[row.effect],meta:row.meta}))};
  const recentList:PanelBody={kind:'list',sel:at(recent.length,2),twoLine:true,empty:t('panel.permissions.noRecent'),
    keys:[{key:'a',label:t('panel.permissions.always')}],
    items:recent.map(row=>({id:row.id,label:row.label,badge:row.outcome,badgeRoles:row.bad?'err':'ok',meta:row.meta,desc:row.desc}))};
  return{name:'permissions',context:{rules,recent},panel:{title:t('panel.permissions.title'),sub:t('panel.permissions.sub'),tab,
    tabs:[{name:t('panel.permissions.tab.mode'),body:modes},{name:t('panel.permissions.tab.rules'),body:ruleList},{name:t('panel.permissions.tab.recent'),body:recentList}]},
  };
}
const SCOPES=['project-user','project','user'] as const;
/** Owner 03/10 (as Claude Code asks): where a new rule is saved, «only you, in this project» first; Esc goes back. */
export function ruleScopeSheet(rule:string,effect:'allow'|'ask'|'deny',back:SheetState):SheetState{
  return{name:'ruleScope',context:{pendingRule:{rule,effect},back},panel:one(t('panel.permissions.scope.title'),`${effect} ${rule}`,{kind:'list',sel:0,radio:true,twoLine:true,enter:t('panel.permissions.scope.save'),
    items:SCOPES.map((id,i)=>({id,label:t(`panel.permissions.scope.${id}.label`),desc:t(`panel.permissions.scope.${id}.desc`),current:i===0}))})};
}
function ruleScopeStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const pending=sheet.context?.pendingRule;const effect=step.effect;
  if(effect.kind==='enter'&&pending&&effect.item.id)return{sheet:null,action:{kind:'ruleAdd',rule:pending.rule,effect:pending.effect,scope:effect.item.id as typeof SCOPES[number]}};
  return{sheet:next,action:null};
}
function permissionsStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;const tab=step.panel.tab;const own=sheet.context??{};
  if(tab===0&&effect.kind==='enter'&&effect.item.id)return{sheet:null,action:{kind:'permissionMode',mode:effect.item.id as PermissionModeChoice,label:effect.item.label}};
  if(tab===1){
    if(effect.kind==='key'&&effect.key==='n')return{sheet:{...next,panel:startEdit(step.panel,t('panel.permissions.newLabel')),context:{...sheet.context,editing:''}},action:null};
    if(effect.kind==='key'&&effect.item){
      const index=Number(effect.item.id);const row=own.rules?.[index];if(!row)return{sheet:next,action:null};
      if(effect.key==='space')return{sheet:next,action:{kind:'ruleEffect',index,effect:NEXT_EFFECT[row.effect]}};
      if(effect.key==='e')return{sheet:{...next,panel:startEdit(step.panel,t('panel.permissions.editLabel'),row.rule),context:{...sheet.context,editing:String(index)}},action:null};
      if(effect.key==='d')return{sheet:{...next,panel:askDelete(step.panel)},action:null};
    }
    if(effect.kind==='edited'){
      const rule=effect.value.trim(),id=sheet.context?.editing;const {editing:_done,...context}=sheet.context??{};const left={...next,context};
      if(!rule||id===undefined)return{sheet:left,action:null};
      if(id==='')return{sheet:ruleScopeSheet(rule,'allow',left),action:null};
      return{sheet:left,action:{kind:'ruleEdit',index:Number(id),rule}};
    }
    if(effect.kind==='delete')return{sheet:next,action:{kind:'ruleDelete',index:Number(effect.item.id)}};
  }
  if(tab===2&&effect.kind==='key'&&effect.key==='a'&&effect.item){
    const row=own.recent?.find(item=>item.id===effect.item!.id);if(!row)return{sheet:next,action:null};
    if(!row.rule)return{sheet:next,action:{kind:'notice',text:t('panel.permissions.noRule')}};
    return{sheet:ruleScopeSheet(row.rule,'allow',next),action:null};
  }
  return{sheet:next,action:null};
}
/**
 * Stage 7.22 (mockup memory; owner 03/10: Project holds the project's instruction files line by line and the memories of
 * kind fact, procedure or rule; You holds the preferences): what TALOS remembers, applied from the next message. Each row
 * says where it comes from — «AGENTS.md · line 4», «learned Sep 27» when TALOS wrote it, «you · Sep 20» when the person did —
 * and the detail beside it says it whole. n adds a memory to the tab in view, e edits a memory's title or opens a file's
 * line in the editor, d twice deletes a memory; a file's line is changed in its file.
 */
export type MemoryRow={id:string;label:string;meta:string;desc:string;file?:{path:string;line:number}};
export function memorySheet({project,you,tab=0,sel=0,filter}:{project:readonly MemoryRow[];you:readonly MemoryRow[];tab?:number;sel?:number;/* /memory search */filter?:string}):SheetState{
  const mk=(rows:readonly MemoryRow[],i:number):PanelBody=>({kind:'list',sel:i===tab?Math.max(0,Math.min(sel,rows.length-1)):0,twoLine:true,filterable:true,...(filter?{filter}:{}),empty:t('panel.memory.empty'),
    keys:[{key:'n',label:t('panel.memory.new'),adds:true},{key:'e',label:t('panel.memory.edit')},{key:'d',label:t('panel.memory.delete')}],
    items:rows.map(row=>({id:row.id,label:row.label,meta:row.meta,desc:row.desc})),
    detail:(item,width)=>[[S(item.label,'acc b')],[S(item.meta??'','faint')],[S('')],...wrap(item.desc??'',width).map(line=>[S(line)] as SegRow)]});
  return{name:'memory',context:{memories:[project,you]},panel:{title:t('panel.memory.title'),sub:t('panel.memory.sub'),tab,
    tabs:[{name:t('panel.memory.tab.project'),body:mk(project,0)},{name:t('panel.memory.tab.you'),body:mk(you,1)}]}};
}
function memoryStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;const tab=step.panel.tab;const rows=sheet.context?.memories?.[tab]??[];
  if(effect.kind==='key'&&effect.key==='n')return{sheet:{...next,panel:startEdit(step.panel,t('panel.memory.newLabel')),context:{...sheet.context,editing:''}},action:null};
  if(effect.kind==='key'&&effect.item){
    const row=rows.find(item=>item.id===effect.item!.id);if(!row)return{sheet:next,action:null};
    if(effect.key==='e')return row.file?{sheet:next,action:{kind:'memoryOpenFile',path:row.file.path,line:row.file.line}}:{sheet:{...next,panel:startEdit(step.panel,t('panel.memory.editLabel'),row.label),context:{...sheet.context,editing:row.id}},action:null};
    if(effect.key==='d')return row.file?{sheet:next,action:{kind:'notice',text:t('panel.memory.inFile',{where:row.meta})}}:{sheet:{...next,panel:askDelete(step.panel)},action:null};
  }
  if(effect.kind==='edited'){
    const title=effect.value.trim(),id=sheet.context?.editing;const {editing:_done,...context}=sheet.context??{};const left={...next,context};
    if(!title||id===undefined)return{sheet:left,action:null};
    return{sheet:left,action:id?{kind:'memoryEdit',id,title}:{kind:'memoryAdd',title,you:tab===1}};
  }
  if(effect.kind==='delete')return{sheet:next,action:{kind:'memoryDelete',id:effect.item.id!}};
  return{sheet:next,action:null};
}
/**
 * Stage 7.23 (mockup library; owner 03/10: the mockup's sheet in front, what the library has more stays as /library
 * commands): the files the person keeps for TALOS, each with its size, its kind and what it holds; the detail shows the
 * start of the file. Enter puts a reference to the file in the message being written (the library's own reference, not a
 * bare «@name»), a adds a file from a path, d twice removes one.
 */
export type LibraryRow={id:string;name:string;meta:string;desc:string;preview:readonly string[]};
export function librarySheet(rows:readonly LibraryRow[],{sel=0}:{sel?:number}={}):SheetState{
  return{name:'library',panel:one(t('panel.library.title'),t('panel.library.sub'),{kind:'list',sel:Math.max(0,Math.min(sel,rows.length-1)),twoLine:true,filterable:true,empty:t('panel.library.empty'),enter:t('panel.library.mention'),
    keys:[{key:'a',label:t('panel.library.add'),adds:true},{key:'d',label:t('panel.library.remove')}],
    items:rows.map(row=>({id:row.id,label:row.name,meta:row.meta,desc:row.desc})),
    detail:(item,width)=>{const row=rows.find(entry=>entry.id===item.id);if(!row)return[];
      return[[S(row.name,'acc b')],[S(`${row.desc} · ${row.meta}`,'faint')],[S('')],...row.preview.map(line=>[S(trunc(line,width),'code')] as SegRow)];}})};
}
function libraryStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;
  if(effect.kind==='enter'&&effect.item.id)return{sheet:null,action:{kind:'libraryMention',id:effect.item.id}};
  if(effect.kind==='key'&&effect.key==='a')return{sheet:{...next,panel:startEdit(step.panel,t('panel.library.pathLabel')),context:{...sheet.context,editing:''}},action:null};
  if(effect.kind==='key'&&effect.key==='d'&&effect.item)return{sheet:{...next,panel:askDelete(step.panel)},action:null};
  if(effect.kind==='edited'){
    const path=effect.value.trim();const {editing:_done,...context}=sheet.context??{};
    return{sheet:{...next,context},action:path?{kind:'libraryAdd',path}:null};
  }
  if(effect.kind==='delete')return{sheet:next,action:{kind:'libraryDelete',id:effect.item.id!}};
  return{sheet:next,action:null};
}
export function retrySheet(text:string):SheetState{
  return{name:'retry',context:{text},panel:one(t('panel.retry.title'),'',{kind:'list',sel:0,enter:t('panel.enter.choose'),
    top:w=>[[S(t('panel.retry.last'),'faint')],...wrap(`› ${text}`,w-4).map(line=>[S(`  ${line}`,'b')]),[S('')]],
    items:[{label:t('panel.retry.again')},{label:t('panel.retry.edit')},{label:t('panel.retry.cancel')}]})};
}
export function renameSheet(name:string):SheetState{
  return{name:'rename',panel:one(t('panel.rename.title'),t('panel.rename.sub'),{kind:'form',sel:0,submit:t('panel.rename.submit'),
    fields:[{label:t('panel.rename.name'),type:'text',value:name,help:t('panel.rename.help')}]})};
}
const EFFORT_WORDS:Record<string,'panel.effort.low'|'panel.effort.medium'|'panel.effort.high'>={low:'panel.effort.low',medium:'panel.effort.medium',high:'panel.effort.high'};
export function effortSheet(model:string,levels:readonly string[],current:string|null):SheetState{
  const value=current&&levels.includes(current)?current:levels.includes('medium')?'medium':levels[0]??'';
  const words=levels.filter(level=>EFFORT_WORDS[level]);
  /* the sub names the levels the model offers; «default» (the model decides) is TALOS's own first stop, not one of them */
  return{name:'effort',panel:one(t('panel.effort.title'),t('panel.effort.sub',{model,levels:levels.filter(level=>level!=='default').join(', ')}),{kind:'form',sel:0,submit:t('panel.effort.submit'),
    fields:[{label:t('panel.effort.field'),type:'slider',options:levels,value,help:t('panel.effort.help')}],
    ...(words.length?{after:()=>[[S('')],...words.map(level=>[S(t(EFFORT_WORDS[level]!),'dim')])]}:{})})};
}

/* /history (mockup PANELS.history; Claude Code's history dialog: filter as you type, Enter puts the match in the prompt): the
   messages sent in this project, newest first, with when; Enter puts one back in the composer, c copies it. */
const oneLine=(text:string)=>text.replace(/\s+/gu,' ').trim();
export function historySheet(drafts:readonly EditorDraft[],when:{now?:number;offsetMinutes?:number}={}):SheetState{
  return{name:'history',context:{drafts},panel:one(t('panel.history.title'),t('panel.history.sub'),{kind:'list',sel:0,filterable:true,enter:t('panel.history.enter'),
    keys:[{key:'c',label:t('panel.history.copy')}],items:drafts.map((draft,index)=>({id:String(index),label:oneLine(draft.text),meta:panelWhen(draft.at,when)}))})};
}

/* /resume (mockup PANELS.resume; Claude Code's session picker: Enter resumes, rename in place, the branch on each row; OpenCode:
   delete and rename from the list): the conversations of this project, the one in use marked «this one», each with how many
   messages, its branch and model, and when; beside it (under it on a narrow screen) the last exchange. Enter resumes, f forks,
   r renames in place, d deletes after «d» again. */
/* the model as the footer says it, never the raw id */
const modelWords=(model:string|null)=>{const at=model?.indexOf(':')??-1;return model&&at>0?`${model.slice(at+1)} · ${model.slice(0,at)}`:model;};
export type ResumeRow={id:string;title:string;at:string|null;messages:number;branch:string|null;model:string|null;current:boolean;you:string|null;answer:string|null;/* C6: the PC's cascade */state?:SessionState};
/* C6a: `chosen` is null until `v` starts choosing; `oldest` the order of `o`; `at` keeps the place when the sheet is drawn again */
export type ResumeOptions={project:string;now?:number;offsetMinutes?:number;oldest?:boolean;chosen?:ReadonlySet<string>|null;at?:{sel:number;filterAt:number;filter:string}};
export function resumeSheet(rows:readonly ResumeRow[],options:ResumeOptions):SheetState{
  const {project,now,offsetMinutes,oldest=false,chosen=null,at}=options;
  const exchange=new Map(rows.map(row=>[row.id,row]));
  const stateOf=(id:string|undefined)=>exchange.get(id??'')?.state??'unknown';
  const shown=oldest?[...rows].reverse():rows;
  const items:PanelItem[]=shown.map(row=>({id:row.id,label:row.title,meta:panelWhen(row.at,{ago:true,...(now!==undefined?{now}:{}),...(offsetMinutes!==undefined?{offsetMinutes}:{})}),
    ...(row.current?{badge:t('panel.resume.thisOne')}:{}),...(chosen?{done:chosen.has(row.id)}:{}),desc:[row.state?sessionStateText(row.state):null,tn('panel.resume.messages',row.messages),row.branch,modelWords(row.model)].filter(Boolean).join(' · ')}));
  const count=(state:SessionState)=>rows.filter(row=>stateOf(row.id)===state).length;
  const filters=[{name:`${t('panel.board.all')} ${rows.length}`},...SESSION_FILTERS.map(state=>({name:`${t(sessionStateWord(state))} ${count(state)}`,match:(item:PanelItem)=>stateOf(item.id)===state}))];
  const keys:PanelKey[]=chosen?[{key:'v',label:t('panel.resume.endChoosing'),adds:true},{key:'space',label:t('panel.resume.mark')},{key:'a',label:t('panel.resume.markAll'),adds:true},{key:'e',label:t('panel.resume.export'),adds:true},{key:'c',label:t('panel.resume.copyIds'),adds:true},{key:'d',label:t('panel.resume.delete'),adds:true}]
    :[{key:'v',label:t('panel.resume.choose'),adds:true},{key:'f',label:t('panel.resume.fork')},{key:'r',label:t('panel.resume.rename')},{key:'d',label:t('panel.resume.delete')},{key:'o',label:t(oldest?'panel.resume.mostRecent':'panel.resume.leastRecent'),adds:true}];
  return{name:'resume',context:{project,resume:{rows,options}},panel:one(t('panel.resume.title'),tn('panel.resume.count',rows.length,{project}),{kind:'list',sel:at?.sel??0,filterable:true,twoLine:true,split:0.5,items,filters,filterAt:at?.filterAt??0,filter:at?.filter??'',check:Boolean(chosen),...(chosen?{top:()=>[[S(` ${chosen.size?tn('panel.resume.chosen',chosen.size):t('panel.resume.chooseSome')}`,['acc','b'])],[S('')]] as SegRow[]}:{}),empty:t('panel.resume.empty'),enter:t('panel.resume.enter'),
    keys,
    detail:(item,w)=>{
      const row=exchange.get(item.id??'');
      const last=row?.you?[[S(t('panel.resume.last'),'faint')],...wrap(`› ${row.you}`,w).map(line=>[S(line,'b')]),...(row.answer?wrap(row.answer,w).map(line=>[S(line,'dim')]):[]),[S('')]]:[];
      const state=stateOf(item.id),[mark,role]=sessionMark(state);
      return[[S(item.label,'acc b')],[S(`${mark} `,role),S(t(sessionStateWord(state)),role)],[S([item.desc,item.meta].filter(Boolean).join(' · '),'faint')],[S('')],...wrap(t(`panel.resume.help.${state}` as MessageId),w).map(line=>[S(line,'dim')] as SegRow),[S('')],...last,[S(t('panel.resume.opens'),'faint')]];
    }})};
}
/* /fork (mockup PANELS.fork; owner 03/10 «taglio prima + messaggio nel composer»; Codex backtrack, Claude Code «Restore
   conversation»): your messages in this conversation, newest first. «latest» forks the whole conversation; an earlier one starts
   the new conversation just before it and puts the message back in the composer — offered only when the kernel can cut there. */
export function forkSheet(turns:readonly SessionTurn[],{canCut}:{canCut:boolean}):SheetState{
  const shown=canCut?turns:turns.slice(0,1);
  const items:PanelItem[]=shown.map((turn,index)=>({id:String(index),label:oneLine(turn.text),meta:index?t('panel.fork.back',{count:index}):t('panel.fork.latest')}));
  return{name:'fork',context:{turns:shown},panel:one(t('panel.fork.title'),t('panel.fork.sub'),{kind:'list',sel:0,items,empty:t('panel.fork.empty'),enter:t('panel.fork.enter'),
    detail:(item,w)=>{const latest=item.id==='0';
      return[[S(t(latest?'panel.fork.keeps':'panel.fork.keepsBefore'),'faint')],...wrap(`› ${item.label}`,w).map(line=>[S(line,'b')]),[S('')],...(latest?[]:[[S(t('panel.fork.composer'),'faint')]]),[S(t('panel.fork.files'),'faint')]];}})};
}
/* /export (mockup PANELS.export; Claude Code: copy to the clipboard or save to a file; OpenCode: include thinking, include tool
   details): the format, what goes in, the file; Enter saves, Ctrl+C copies. A new format changes the file's extension. */
/* /undo (mockup PANELS.undo; owner 03/10 «foglio intero, conversazione via fork»; Claude Code's rewind, OpenCode's /undo and
   /redo): the points of this conversation, newest first, each with the files it changed and, beside it, the files that go back
   to how they were then. f puts the files back now (an undone point: f puts them back as they were); Enter (code and
   conversation) and c (conversation only) come with the kernel's cut, the conversation starting again from there in a new one
   while this one stays in /resume. */
export type UndoPoint={id:string;/* the turn it was taken before (your message's), when known: the conversation can go back there */runId?:string;label:string;at:string|null;undone:boolean;start?:boolean;files:readonly CheckpointDelta[];back:readonly CheckpointDelta[]};
const deltaText=(file:CheckpointDelta)=>file.added!==undefined&&file.removed!==undefined?t('panel.undo.delta',{added:file.added,removed:file.removed}):t(`screen.checkpoint.change.${file.change}`);
export function undoSheet(points:readonly UndoPoint[],{canCut,now,offsetMinutes}:{canCut:boolean;now?:number;offsetMinutes?:number}):SheetState{
  const when=(at:string|null)=>panelWhen(at,{ago:true,...(now!==undefined?{now}:{}),...(offsetMinutes!==undefined?{offsetMinutes}:{})});
  const desc=(point:UndoPoint)=>{
    if(point.start)return point.back.length?tn('panel.undo.since',point.back.length):t('panel.undo.noFiles');
    if(point.files.length===1)return `${point.files[0]!.path} ${deltaText(point.files[0]!)}`;
    return point.files.length?tn('panel.undo.files',point.files.length):t('panel.undo.noFiles');
  };
  const byId=new Map(points.map(point=>[point.id,point]));
  const items:PanelItem[]=points.map(point=>({id:point.id,label:point.label,meta:when(point.at),desc:desc(point),...(point.undone?{badge:t('panel.undo.undone')}:{})}));
  return{name:'undo',context:{points},panel:one(t('panel.undo.title'),t('panel.undo.sub'),{kind:'list',sel:0,twoLine:true,split:0.5,items,empty:t('panel.undo.empty'),
    ...(canCut?{enter:t('panel.undo.enter')}:{}),
    keys:[...(canCut?[{key:'c',label:t('panel.undo.conversation')}]:[]),{key:'f',label:t('panel.undo.filesOnly')}],
    detail:(item,w)=>{
      const point=byId.get(item.id??'');const back=point?.back??[];
      const title=point?.undone?'panel.undo.comeBack':'panel.undo.goBack';
      return[[S(item.label,'acc b')],[S(item.meta??'','faint')],[S('')],[S(t(back.length?title:'panel.undo.none'),'faint')],
        ...back.map(file=>[S(`  ${file.path}  `),S(deltaText(file),'dim')]),[S('')],[S(t('panel.undo.saves'),'faint')]];/* one row, cut at the edge as the mockup does */
    }})};
}
function undoStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;
  const point=effect.kind==='enter'||effect.kind==='key'?sheet.context?.points?.find(p=>p.id===effect.item?.id):undefined;
  if(!point)return{sheet:next,action:null};
  if(effect.kind==='enter')return{sheet:null,action:{kind:'undoCut',id:point.id,files:true}};
  if(effect.kind==='key'&&effect.key==='c')return{sheet:null,action:{kind:'undoCut',id:point.id,files:false}};
  if(effect.kind==='key'&&effect.key==='f'){
    if(!point.undone&&!point.back.length)return{sheet:next,action:{kind:'notice',text:t('panel.undo.none')}};
    return{sheet:null,action:{kind:'undoFiles',id:point.id,redo:point.undone}};
  }
  return{sheet:next,action:null};
}
/* /provider (mockup PANELS.provider; owner 03/10 «foglio + subito /model del nuovo provider»; OpenCode /connect): where TALOS
   sends your requests — each provider with whether it can answer now (key set, no key, local, not running), beside it its
   address and its key (never shown). Enter uses it (the app opens its /model next); k asks for its key, masked, saved only
   after the provider accepts it; t tests it. */
export type ProviderView={id:string;label:string;/* the words the old picker found it by too (its id, its description) */search?:string;current:boolean;state:'key'|'ready'|'none'|'local'|'down'|'signedIn'|'signedOut'|/* signed in, the plan not allowed yet (finding 11, 13/10/2026) */'planOff';desc:string;address:string|null;key:'stored'|'environment'|'missing'|'none'|'signed-in'|'signed-out';needsKey:boolean;/** signed in to, never given a key (the ChatGPT plan) */signIn?:boolean};
const PROVIDER_BADGE={key:['panel.provider.keySet','ok'],ready:['panel.provider.ready','ok'],none:['panel.provider.noKey',undefined],local:['panel.provider.local','acc'],down:['panel.provider.down','warn'],signedIn:['panel.provider.signedIn','ok'],signedOut:['panel.provider.signedOut',undefined],planOff:['panel.provider.planOff','warn']} as const;
const KEY_TEXT={stored:'panel.provider.stored',environment:'panel.provider.environment',missing:'panel.provider.missing',none:'panel.provider.notNeeded','signed-in':'panel.provider.signedIn','signed-out':'panel.provider.signedOut'} as const;
/* the mockup lists six providers and no filter; TALOS knows about thirty, so a list longer than a sheet shows gets «/ search» */
export const PROVIDER_FILTER_FROM=9;
export type SystemView={memory:{totalBytes:number;freeBytes:number};storage:{totalBytes:number;availableBytes:number}}|null;
/* C7b: what is measured is said with its figures, and what is not is said so: no estimate of the graphics memory */
function systemRows(system:SystemView,width:number,mode:ChartMode):SegRow[]{
  const barWidth=Math.max(8,Math.min(width-40,34));
  const gb=(bytes:number)=>`${(bytes/1024**3).toFixed(1)} GB`;
  const row=(label:MessageId,used:number,total:number,left:number):SegRow=>[S(`  ${t(label).padEnd(18)}`,'faint'),...bar(used,total,barWidth,{},mode),S(`  ${t('panel.models.free',{left:gb(left),total:gb(total)})}`,'dim')];
  const none=(label:MessageId):SegRow=>[S(`  ${t(label).padEnd(18)}`,'faint'),S(t('panel.models.notMeasured'),'dim')];
  return[[S(` ${t('panel.models.device')}`,'b')],[S('')],...(system?[row('panel.models.memory',system.memory.totalBytes-system.memory.freeBytes,system.memory.totalBytes,system.memory.freeBytes),row('panel.models.disk',system.storage.totalBytes-system.storage.availableBytes,system.storage.totalBytes,system.storage.availableBytes)]:[none('panel.models.memory'),none('panel.models.disk')]),none('panel.models.graphics')];
}
/** The Models page's System tab: the device's figures, or that they are still being read. */
export function systemTabBody(system:SystemView|'loading',mode:ChartMode=CHART_FULL,{since=Date.now(),motion=true}:{since?:number;motion?:boolean}={}):PanelBody{
  return{kind:'info',lines:(width,_height,now=Date.now())=>system==='loading'
    ?[loadingRow(t(now-since>ENGINE_STARTING_MS?'panel.models.startingEngine':'panel.models.reading'),Math.max(0,now-since),{now,motion})]:systemRows(system,width,mode)};
}
/** Past this, reading the device is waiting for the kernel to start (its first start is the slow part, measured 01/11: over 10 s). */
export const ENGINE_STARTING_MS=10_000;
export function providerSheet(providers:readonly ProviderView[],{system,mode=CHART_FULL,motion=true}:{motion?:boolean;/* the Models page: absent, the sheet alone; 'loading' while the kernel reads the device */system?:SystemView|'loading';mode?:ChartMode}={}):SheetState{
  const byId=new Map(providers.map(row=>[row.id,row]));
  const items:PanelItem[]=providers.map(row=>{const [badge,roles]=PROVIDER_BADGE[row.state];return{id:row.id,label:row.label,desc:row.desc,search:`${row.id} ${row.search??''}`,current:row.current,/* tester R11: a provider that needs no key does not also say «no key» */...(row.state==='none'&&row.needsKey===false?{}:{badge:t(badge)}),...(roles?{badgeRoles:roles}:{})};});
  const single=(panel:Panel):Panel=>system===undefined?panel:{title:t('panel.models.title'),sub:t('panel.models.sub'),tab:0,tabs:[{name:t('panel.models.providers'),body:panel.tabs[0]!.body},{name:t('panel.models.system'),body:systemTabBody(system,mode,{motion})}]};
  return{name:'provider',context:{providers,...(system==='loading'?{ticking:true}:{})},panel:single(one(t('panel.provider.title'),t('panel.provider.sub'),{kind:'list',sel:0,radio:true,twoLine:true,split:0.5,items,enter:t('panel.provider.enter'),...(providers.length>=PROVIDER_FILTER_FROM?{filterable:true}:{}),
    keys:[{key:'k',label:t('panel.provider.setKey')},{key:'t',label:t('panel.provider.test')}],
    detail:(item)=>{const row=byId.get(item.id??'');if(!row)return[];
      return[[S(row.label,['acc','b'])],[S(row.desc,'dim')],[S('')],...(row.address?[[S(t('panel.provider.address'),'faint'),S(row.address)]]:[]),
        [S(t(row.signIn?'panel.provider.signIn':'panel.provider.key'),'faint'),S(t(KEY_TEXT[row.key]),row.key==='missing'||row.key==='signed-out'?'warn':'')],[S('')],[S(t('panel.provider.switching'),'faint')]];}}))};
}
function providerStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;const row=sheet.context?.providers?.find(p=>p.id===(effect.kind==='enter'||effect.kind==='key'?effect.item?.id:sheet.context?.renaming));
  if(effect.kind==='enter'&&row)return{sheet:null,action:{kind:'provider',id:row.id}};
  if(effect.kind==='key'&&effect.key==='t'&&row)return{sheet:next,action:{kind:'providerTest',id:row.id}};
  if(effect.kind==='key'&&effect.key==='k'&&row){
    if(row.signIn)return{sheet:next,action:{kind:'notice',text:t('panel.provider.signInNotKey',{provider:row.label})}};
    if(!row.needsKey)return{sheet:next,action:{kind:'notice',text:t('panel.provider.noKeyNeeded',{provider:row.label})}};
    return{sheet:{...next,panel:startEdit(step.panel,t('panel.provider.keyFor',{provider:row.label}),'',true),context:{...sheet.context,renaming:row.id}},action:null};
  }
  if(effect.kind==='edited'&&row){const key=effect.value.trim();return key?{sheet:null,action:{kind:'providerKey',id:row.id,key}}:{sheet:next,action:null};}
  return{sheet:next,action:null};
}
/* /model (mockup PANELS.model; owner 03/10 «scala vera del prodotto»; Claude Code: ←/→ set the effort inside /model; Codex:
   the model and its effort are one choice): the models of the chosen provider, the one in use marked, each with its context
   window, where it runs and its price; beside it what it can do and its efforts; under the list the effort scale, the levels
   the selected model does not offer greyed. ←/→ move the effort among the model's own levels; Enter uses the model with the
   effort its row shows (a model that does not offer the effort takes its first). */
/* `verified`: the provider listed it now (false: TALOS knows it, the provider did not confirm it — model-picker.ts) */
export type ModelRow={id:string;name:string;provider:string;contextWindow:number|null;desc:string;caps:string;efforts:readonly string[];verified?:boolean;/* C7a: what the capability filters ask */reasons?:boolean;images?:boolean;tools?:boolean;free?:boolean};
/* C7a: the capability filters, in the PC's words; they add up. `f` stars a model, in the file shared with the device. */
const CAPABILITIES:ReadonlyArray<readonly [MessageId,(row:ModelRow)=>boolean]>=[['panel.model.cap.reasons',row=>Boolean(row.reasons)],['panel.model.cap.images',row=>Boolean(row.images)],['panel.model.cap.tools',row=>Boolean(row.tools)],['panel.model.cap.free',row=>Boolean(row.free)],['panel.model.cap.context',row=>(row.contextWindow??0)>=200_000]];
export type ModelView={active?:ReadonlySet<number>;favourites?:readonly string[];recent?:readonly string[];/* Where it runs */places?:readonly PanelItem[]};
const authorOf=(id:string)=>{const name=id.includes(':')?id.slice(id.indexOf(':')+1):id;const at=name.indexOf('/');return at>0?name.slice(0,at):null;};
/** «262k», «1M»: a context window as the mockup writes it. */
export function windowText(tokens:number):string{
  if(tokens>=1_000_000)return `${Number((tokens/1_000_000).toFixed(1))}M`;
  if(tokens>=1000)return `${Math.round(tokens/1000)}k`;
  return String(Math.round(tokens));
}
const effortOf=(row:ModelRow|undefined,effort:string)=>!row||!row.efforts.length?effort:row.efforts.includes(effort)?effort:row.efforts[0]!;
function modelPanel(all:readonly ModelRow[],{current,providerLabel,effort,scale,notice,sel=0,filter,filtering,active=new Set(),favourites=[],recent=[],places}:ModelView&{current:string|null;providerLabel:string;effort:string;scale:readonly string[];notice?:string;sel?:number;filter?:string;filtering?:boolean}):Panel{
  const groupOf=(row:ModelRow)=>row.id===current?t('panel.model.inUse'):favourites.includes(row.id)?t('panel.model.favourites'):recent.includes(row.id)?t('panel.model.recent'):authorOf(row.id)??row.provider;
  const rankOf=(row:ModelRow)=>row.id===current?0:favourites.includes(row.id)?1:recent.includes(row.id)?2:3;
  const models=all.filter(row=>[...active].every(index=>CAPABILITIES[index]![1](row))).map((row,index)=>({row,index})).sort((a,b)=>rankOf(a.row)-rankOf(b.row)||a.index-b.index).map(({row})=>row);
  const byId=new Map(all.map(row=>[row.id,row]));
  const items:PanelItem[]=models.map(row=>({id:row.id,group:groupOf(row),label:`${favourites.includes(row.id)?'* ':''}${row.name}`,meta:row.contextWindow?windowText(row.contextWindow):'',desc:row.desc,current:row.id===current,...(row.verified===false?{badge:t('panel.model.unverified'),badgeRoles:'faint'}:{})}));
  /* «qwen3-coder via OpenRouter» when the model in use is one of these; else what is in use, by its full id */
  const mine=current?byId.get(current):undefined;
  const sub=mine?t('panel.model.sub',{model:mine.name,provider:providerLabel}):current?t('panel.model.subOther',{provider:providerLabel,model:current}):providerLabel;
  const hiddenKey=(key:string):PanelKey=>({key,label:'',hidden:true,adds:true});
  const capabilityRow=(w:number):SegRow=>slidingRow(CAPABILITIES.map(([word],index)=>{const on=active.has(index);return[S(`${index+1} `,'faint'),S(` ${on?'✓ ':''}${t(word)} `,on?['acc','b','band']:'dim',`pkey:${index+1}`),S(' ')];}),0,w);
  const body:ListBody={kind:'list',sel,radio:true,twoLine:true,filterable:true,split:0.5,lr:true,lrLabel:t('panel.model.lr'),items,empty:all.length?`${t('panel.model.noMatch')} ${t('panel.model.tryFewer')}`:t('panel.model.empty'),enter:t('panel.model.enter'),
    keys:[{key:'f',label:t('panel.model.star')},{key:'1-5',label:t('panel.model.capabilities')},{key:'z',label:t('panel.model.clear'),adds:true},...['1','2','3','4','5'].map(hiddenKey),hiddenKey('z')],
    ...(filter!==undefined?{filter}:{}),...(filtering!==undefined?{filtering}:{}),
    /* a list the provider could not confirm says so above it (model-picker.ts `verified`) */
    top:(w:number)=>[capabilityRow(w),[S('')],...(notice?[...wrap(notice,Math.max(20,w-4)).map(line=>[S(`  ${line}`,'dim')]),[S('')]]:[])],
    detail:(item)=>{const row=byId.get(item.id??'');if(!row)return[];
      return[[S(row.name,['acc','b'])],[S(row.desc,'dim')],...(row.contextWindow?[[S(t('panel.model.context'),'faint'),S(t('panel.model.contextTokens',{tokens:windowText(row.contextWindow)}))]]:[]),
        ...(row.caps?[[S(t('panel.model.can'),'faint'),S(row.caps)]]:[]),[S(t('panel.model.effort'),'faint'),S(row.efforts.join(' · '))],...(row.id===current?[]:[[S('')],[S(t('panel.model.next'),'faint')]])];}};
  body.extra=w=>{
    const row=byId.get(listItems(body)[body.sel]?.id??'')??models[0];const on=effortOf(row,effort);
    const asked=row&&row.efforts.length>1&&effort!=='default'&&!row.efforts.includes(effort)?[[S(`  ${t('panel.model.receives',{chosen:effort,model:on})}`,'dim')] as SegRow]:[];
    return[[S('─'.repeat(w),'faint')],[S(t('panel.model.effortRow'),'dim'),...scale.flatMap((level,j)=>[S(j?' ── ':'','faint'),S(`${level===on?'◆ ':'● '}${level}`,level===on?['acc','b']:row?.efforts.includes(level)?'dim':'faint')]),S(w>=100?t('panel.model.greyed'):'','faint')],...asked];
  };
  if(!places)return one(t('panel.model.title'),sub,body);
  return{title:t('panel.model.title'),sub,tab:0,tabs:[{name:t('panel.model.tab.models'),body},{name:t('panel.model.tab.where'),body:{kind:'list',sel:0,twoLine:true,enter:t('panel.model.open'),items:places,empty:t('panel.model.empty')}}]};
}
export function modelSheet(models:readonly ModelRow[],options:ModelView&{current:string|null;providerLabel:string;effort:string;scale:readonly string[];notice?:string}):SheetState{
  return{name:'model',context:{models,model:options},panel:modelPanel(models,options)};
}
function modelStep(sheet:SheetState,step:PanelStep):{sheet:SheetState|null;action:SheetAction|null}{
  const models=sheet.context?.models??[];const options=sheet.context?.model;if(!options)return{sheet:null,action:null};
  if(step.panel.tab===1)return step.effect.kind==='enter'?{sheet:null,action:{kind:'runCommand',name:'provider'}}:{sheet:{...sheet,panel:step.panel},action:null};
  const body=step.panel.tabs[0]!.body;if(body.kind!=='list')return{sheet:null,action:null};
  const row=models.find(m=>m.id===listItems(body)[body.sel]?.id);let effort=options.effort;
  if(step.effect.kind==='lr'&&row&&row.efforts.length){const at=Math.max(0,row.efforts.indexOf(effortOf(row,effort)));effort=row.efforts[Math.max(0,Math.min(row.efforts.length-1,at+step.effect.delta))]!;}
  if(step.effect.kind==='enter'&&row){const chosen=effortOf(row,effort);return{sheet:null,action:{kind:'model',id:row.id,effort:chosen,notice:t('panel.model.done',{model:row.name,effort:chosen})}};}
  const view:ModelView={};let action:SheetAction|null=null;
  if(step.effect.kind==='key'){
    const key=step.effect.key,picked=row?.id;
    if(/^[1-5]$/u.test(key)){const active=new Set(options.active);const index=Number(key)-1;if(!active.delete(index))active.add(index);view.active=active;}
    if(key==='z')view.active=new Set();
    if(key==='f'&&picked){const was=(options.favourites??[]).includes(picked);view.favourites=was?(options.favourites??[]).filter(id=>id!==picked):[...(options.favourites??[]),picked];action={kind:'modelFavourite',id:picked,on:!was};}
  }
  const clearing=step.effect.kind==='key'&&step.effect.key==='z';
  const next={...options,...view,effort};
  return{sheet:{...sheet,context:{...sheet.context,model:next},panel:{...step.panel,tabs:[{...step.panel.tabs[0]!,body:modelPanel(models,{...next,sel:view.active?0:body.sel,...(!clearing&&body.filter!==undefined?{filter:body.filter}:{}),...(body.filtering!==undefined?{filtering:body.filtering}:{})}).tabs[0]!.body},...step.panel.tabs.slice(1)]}},action};
}
/* /compact (mockup PANELS.compact; owner 03/10 «foglio subito + patch per il conteggio»; Claude Code's compaction spinner,
   Codex's «Compacting»): the real steps — the conversation read (its messages and tokens), the summary being written (its time;
   its tokens once written, live when the kernel sends them), the history replaced — then the result with before → after and
   the percentage. The time stops at the end: never a counter after it. */
export type CompactState={phase:'summary'|'done'|'already'|'failed';messages:number;tokensBefore:number|null;tokensAfter:number|null;elapsedMs:number;error?:{headline:string;todo?:string}};
export function compactSheet(state:CompactState):SheetState{
  const read=state.tokensBefore!==null?t('panel.compact.read',{messages:tn('panel.resume.messages',state.messages),tokens:compactTokens(state.tokensBefore)}):tn('panel.resume.messages',state.messages);
  const writing:ProgressStep=state.phase==='summary'?{label:t('panel.compact.writing'),state:'run',detail:activityClock(state.elapsedMs)}
    :state.phase==='failed'?{label:t('panel.compact.writing'),state:'fail',detail:state.error?.headline??''}
    :{label:t('panel.compact.writing'),state:'ok',...(state.tokensAfter!==null?{detail:t('panel.compact.tokens',{tokens:compactTokens(state.tokensAfter)})}:{})};
  const replaced=state.phase==='done'||state.phase==='already';
  const result=():SegRow[]=>{
    if(state.phase==='already')return[[S(t('panel.compact.already'),'dim')],[S('')],[S('  '),S(` ${t('panel.compact.close')} `,'pill','pkey:Escape')]];
    if(state.phase==='failed')return[...(state.error?.todo?[[S(`  ${state.error.todo}`,'dim')]]:[]),[S('')],[S('  '),S(` ${t('panel.compact.close')} `,'pill','pkey:Escape')]];
    const before=state.tokensBefore,after=state.tokensAfter;
    const change=before!==null&&after!==null?[S(t('panel.compact.context'),'dim'),S(t('panel.compact.change',{before:compactTokens(before),after:compactTokens(after)}),['ok','b']),S(t('panel.compact.keeps',{percent:before>0?Math.max(0,Math.round((1-after/before)*100)):0}),'dim')]:[S(t('panel.compact.context'),'dim')];
    return[change,[S('')],[S('  '),S(` ${t('panel.compact.close')} `,'pill','pkey:Escape')]];
  };
  return{name:'compact',panel:one(t('panel.compact.title'),t('panel.compact.sub'),{kind:'progress',
    steps:[{label:t('panel.compact.reading'),state:'ok',detail:read},writing,{label:t('panel.compact.replacing'),state:replaced?'ok':'pending',...(replaced?{detail:t('panel.compact.done')}:{})}],
    ...(state.phase==='summary'?{}:{result})})};
}
/** A size as the mockup's notices say it: «18 KB». */
export function sizeText(bytes:number):string{
  if(bytes<1024)return t('panel.export.bytes',{count:bytes});
  if(bytes<1024*1024)return t('panel.export.kb',{count:Math.max(1,Math.round(bytes/1024))});
  return t('panel.export.mb',{count:(bytes/1024/1024).toFixed(1)});
}
export type ExportChoice={format:'md'|'json'|'jsonl';toolOutput:boolean;thinking:boolean;file:string};
const EXPORT_FORMATS=['md','json','jsonl'] as const;
const formatLabel=(format:typeof EXPORT_FORMATS[number])=>t(format==='md'?'panel.export.markdown':format==='json'?'panel.export.json':'panel.export.jsonl');
export function exportSheet({messages,file}:{messages:number;file:string}):SheetState{
  return{name:'export',panel:one(t('panel.export.title'),tn('panel.export.sub',messages),{kind:'form',sel:0,submit:t('panel.export.save'),alt:t('panel.export.copy'),
    fields:[{label:t('panel.export.format'),type:'choice',options:EXPORT_FORMATS.map(formatLabel),value:formatLabel('md')},
      {label:t('panel.export.tools'),type:'bool',value:false,help:t('panel.export.tools.help')},
      {label:t('panel.export.thinking'),type:'bool',value:false},
      {label:t('panel.export.file'),type:'text',value:file}],
    after:()=>[[S('')],[S(t('panel.export.where'),'faint')]]})};
}
function exportChoice(panel:Panel):ExportChoice|null{
  const body=panel.tabs[0]!.body;if(body.kind!=='form')return null;
  const format=EXPORT_FORMATS.find(f=>formatLabel(f)===body.fields[0]!.value)??'md';const file=String(body.fields[3]!.value).trim();
  return file?{format,toolOutput:body.fields[1]!.value===true,thinking:body.fields[2]!.value===true,file}:null;
}
function exportStep(step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;const body=step.panel.tabs[0]!.body;
  if(effect.kind==='change'&&effect.field===0&&body.kind==='form'){
    const format=EXPORT_FORMATS.find(f=>formatLabel(f)===effect.value)??'md';
    const file=String(body.fields[3]!.value).replace(/\.(md|json|jsonl)$/iu,`.${format}`);
    return{sheet:{...next,panel:{...step.panel,tabs:[{...step.panel.tabs[0]!,body:{...body,fields:body.fields.map((field,i)=>i===3?{...field,value:file}:field)}}]}},action:null};
  }
  if(effect.kind==='submit'||effect.kind==='alt'){const choice=exportChoice(step.panel);return choice?{sheet:null,action:{kind:'export',to:effect.kind==='submit'?'file':'clipboard',...choice}}:{sheet:next,action:null};}
  return{sheet:next,action:null};
}
function resumeStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;const body=step.panel.tabs[0]!.body;
  const items=body.kind==='list'?body.items:[];const isCurrent=(item:PanelItem|null)=>Boolean(item?.badge);
  const kept=sheet.context?.resume,chosen=kept?.options.chosen??null;
  /* drawn again with the same place, filter and search */
  const redraw=(options:Partial<ResumeOptions>):SheetState=>{const list=body.kind==='list'?body:null;const again=resumeSheet(kept!.rows,{...kept!.options,...options,at:{sel:list?.sel??0,filterAt:list?.filterAt??0,filter:list?.filter??''}});return{...again,panel:{...again.panel,page:next.panel.page??false}};};
  if(kept&&effect.kind==='key'&&effect.key==='o')return{sheet:redraw({oldest:!kept.options.oldest}),action:{kind:'notice',text:t(kept.options.oldest?'panel.resume.nowMostRecent':'panel.resume.nowLeastRecent')}};
  if(kept&&effect.kind==='key'&&effect.key==='v')return{sheet:redraw({chosen:chosen?null:new Set()}),action:null};
  if(kept&&chosen){
    const ids=[...chosen],rows=kept.rows.filter(row=>chosen.has(row.id));
    if((effect.kind==='enter'||(effect.kind==='key'&&effect.key==='space'))&&effect.item){const id=effect.item.id!,more=new Set(chosen);if(!more.delete(id))more.add(id);return{sheet:redraw({chosen:more}),action:null};}
    if(effect.kind==='key'&&effect.key==='a'){const seen=body.kind==='list'?listItems(body).map(item=>item.id!):[];return{sheet:redraw({chosen:new Set(seen.every(id=>chosen.has(id))?[]:seen)}),action:null};}
    if(effect.kind==='key'&&effect.key==='c')return{sheet:next,action:ids.length?{kind:'copy',text:ids.join('\n'),notice:tn('panel.resume.idsCopied',ids.length)}:null};
    if(effect.kind==='key'&&effect.key==='e')return{sheet:next,action:rows.length?{kind:'exportSessions',ids:rows.map(row=>({id:row.id,title:row.title}))}:null};
    if(effect.kind==='key'&&effect.key==='d'){
      if(!ids.length)return{sheet:next,action:null};
      if(rows.some(row=>row.current))return{sheet:next,action:{kind:'notice',text:t('panel.resume.deleteCurrent')}};
      return{sheet:{...next,panel:{...askDelete(step.panel),confirmDel:0,confirmWords:tn('panel.resume.deleteAsk',ids.length)}},action:null};
    }
    if(effect.kind==='delete')return{sheet:null,action:{kind:'deleteSessions',ids}};
    return{sheet:next,action:null};
  }
  if(effect.kind==='enter')return isCurrent(effect.item)?{sheet:null,action:{kind:'notice',text:t('panel.resume.already')}}:{sheet:null,action:{kind:'resume',id:effect.item.id!}};
  if(effect.kind==='key'&&effect.item){
    if(effect.key==='f')return{sheet:null,action:{kind:'fork',id:effect.item.id!,title:effect.item.label}};
    if(effect.key==='r')return{sheet:{...next,panel:startEdit(step.panel,t('panel.resume.renameLabel'),effect.item.label),context:{...sheet.context,renaming:effect.item.id!}},action:null};
    if(effect.key==='d')return isCurrent(effect.item)?{sheet:next,action:{kind:'notice',text:t('panel.resume.deleteCurrent')}}:{sheet:{...next,panel:askDelete(step.panel)},action:null};
  }
  if(effect.kind==='edited'&&body.kind==='list'){
    const id=sheet.context?.renaming;const name=effect.value.trim();
    if(!id||!name)return{sheet:next,action:null};
    const renamed={...next,panel:{...step.panel,tabs:[{...step.panel.tabs[0]!,body:{...body,items:items.map(item=>item.id===id?{...item,label:name}:item)}}]}};
    return{sheet:renamed,action:{kind:'renameSession',id,name,notice:t('panel.rename.done',{name})}};
  }
  if(effect.kind==='delete'&&body.kind==='list'){
    const left=items.filter(item=>item.id!==effect.item.id);
    /* the sub counts what is left */
    const kept={...next,panel:{...step.panel,sub:tn('panel.resume.count',left.length,{project:sheet.context?.project??''}),tabs:[{...step.panel.tabs[0]!,body:{...body,items:left,sel:Math.min(body.sel,Math.max(0,left.length-1))}}]}};
    return{sheet:kept,action:{kind:'deleteSession',id:effect.item.id!,title:effect.item.label}};
  }
  return{sheet:next,action:null};
}

/** The sheet after a step, or null when it closed, and the action the step asks for. */
/* FE-052: the shelf is a page whose rows are read at every frame, so the disks stay live; only the choice lives in the sheet */
export type ShelfPaint={data:()=>Omit<ShelfView,'selected'|'disk'|'list'>;mode:ShelfMode;colors:()=>ShelfColors|null};
/* FE-048: «New session» holds the shelf as its third tab, as the mockup holds the sky. /shelf opens it there. */
export type NewSessionHow={model:string;efforts:readonly string[];effort:string;mode:string;plan:boolean};
/* C11c (A2): what the other three filters of «Where we work» show, read by workspace/places.ts when the page opens */
export type NewSessionPlace={name:string;path:string};
export type NewSessionPicks={recent:readonly NewSessionPlace[];quick:readonly NewSessionPlace[];disks:readonly NewSessionPlace[]};
const ACCESS_MODES=['default','acceptEdits','bypassPermissions'] as const;
/* one name for each mode, the one /permissions uses (Frontend) */
const accessWord=(mode:string)=>t(`panel.permissions.mode.${mode}` as MessageId);
export function shelfSheet(paint:ShelfPaint,pick:ShelfPick={selected:0,disk:0,list:false},{tab=2,current='',here='',folders=[],how:setup=null,picks=null}:{tab?:number;current?:string;/* this folder's path */here?:string;/* the trusted ones */folders?:readonly string[];how?:NewSessionHow|null;picks?:NewSessionPicks|null}={}):SheetState{
  const legend:SegRow=[S(` ${t('panel.shelf.legend')}`,'faint')];
  /* plain mode: the words alone, no legend, as the mockup's `testoScena` (index.html:2520) */
  const lines=(width:number,height=24)=>paint.mode.plain?shelfRows({...paint.data(),...pick},width,height,{mode:paint.mode,colors:null}):[fit(legend,width),...shelfRows({...paint.data(),...pick},width,Math.max(1,height-1),{mode:paint.mode,colors:paint.colors()})];
  const key=(name:string):PanelKey=>({key:name,label:'',hidden:true});
  const keys:PanelKey[]=[{key:'←/→',label:t('panel.shelf.project')},{key:'↑/↓',label:t('panel.shelf.disk')},{key:'enter',label:t('panel.shelf.open')},/* in plain the words are the list already */...(paint.mode.plain?[]:[{key:'e',label:t(pick.list?'panel.shelf.scene':'panel.shelf.list')}]),key('ArrowLeft'),key('ArrowRight'),key('ArrowUp'),key('ArrowDown'),key('Enter')];
  const same=(a:string,b:string)=>a.replace(/[\\/]+$/u,'').replace(/\\/gu,'/').toLowerCase()===b.replace(/[\\/]+$/u,'').replace(/\\/gu,'/').toLowerCase();
  /* the session list names a project; the trusted folder says where it is */
  const lastOf=(folder:string)=>folder.split(/[\\/]/u).filter(Boolean).at(-1)??folder;
  const projects=paint.data().projects.map(project=>project.path?project:project.name===current&&here?{...project,path:here}:{...project,path:folders.find(folder=>lastOf(folder)===project.name)??null});
  const places=[...projects,...folders.filter(folder=>!projects.some(project=>project.path&&same(project.path,folder))).map(folder=>({name:lastOf(folder),path:folder,sessions:[]}))];
  /* the name comes first: a long path gives way, and the whole of it stands in the detail */
  const pathOf=new Map<PanelItem,string>();
  const row=(name:string,path:string|null,isHere:boolean):PanelItem=>{const item:PanelItem={id:path??name,label:name,meta:truncateMiddle(path??'',24),...(isHere?{badge:t('panel.new.here')}:{})};pathOf.set(item,path??'');return item;};
  const projectRows=places.map(place=>row(place.name,place.path??null,place.name===current));
  /* C11c: the mockup's four filters (bozzetto-cli-retro/index.html:1288, 1300-1302; frame 31), Project first and as before; the others
     show only what places.ts read, so before it is read they are empty and never made up */
  const pickRows=(list:readonly NewSessionPlace[]|undefined)=>(list??[]).map(place=>row(place.name,place.path,!!here&&same(place.path,here)));
  const kinds=[projectRows,pickRows(picks?.recent),pickRows(picks?.quick),pickRows(picks?.disks)];
  const where:PanelBody={kind:'list',sel:0,enter:t('panel.new.choose'),filterable:true,split:0.44,empty:t('panel.new.noProjects'),keys:[{key:'p',label:t('panel.new.typePath'),adds:true}],
    /* judge v2244: each filter says its own empty line, in the form of «No projects yet.» */
    filters:([['panel.new.filter.project','panel.new.noProjects'],['panel.new.filter.recent','panel.new.noRecent'],['panel.new.filter.quick','panel.new.noQuick'],['panel.new.filter.disk','panel.new.noDisks']] as const).map(([name,empty],index)=>({name:t(name),empty:t(empty),match:(item:PanelItem)=>kinds[index]!.includes(item)})),
    items:kinds.flat(),
    detail:item=>pathOf.has(item)?[[S(item.label,'b')],[S(pathOf.get(item)!,'faint')],[S('')],...wrap(t('panel.new.inPlace'),40).map(line=>[S(line,'faint')] as SegRow)]:[]};
  /* the mockup's form. The model's name is known without reading the catalog (Frontend); its key opens /model */
  const how:PanelBody={kind:'form',sel:0,submit:t('panel.new.continue',{name:current||t('panel.new.here')}),keys:[{key:'m',label:t('panel.new.changeModel')}],
    fields:[{label:t('panel.new.how.model'),type:'choice',value:setup?.model??'',options:[setup?.model??'']},
      ...(setup?.efforts.length?[{label:t('panel.new.how.effort'),type:'choice' as const,value:setup.effort,options:setup.efforts}]:[]),
      {label:t('panel.new.how.access'),type:'choice',value:accessWord(setup&&(ACCESS_MODES as readonly string[]).includes(setup.mode)?setup.mode:'default'),options:ACCESS_MODES.map(accessWord),help:t('panel.new.how.accessHelp')},
      {label:t('panel.new.how.plan'),type:'bool',value:setup?.plan??false,help:t('panel.new.how.planHelp')}],
    after:()=>[[S('')],[S(`   ${t('panel.new.startsAtFirst')}`,'faint')]]};
  return{name:'shelf',context:{shelf:{paint,pick,current,here,folders,...(setup?{how:setup}:{}),...(picks?{picks}:{})}},panel:{title:t('panel.new.title'),sub:t('panel.new.sub'),tab,page:true,
    tabs:[{name:t('panel.new.tab.where'),body:where},{name:t('panel.new.tab.how'),body:how,sub:t('panel.new.sub.how')},{name:`${t('panel.shelf.name')} · Beta`,body:{kind:'info',lines,keys,fixed:true},sub:t('panel.new.sub.shelf')}]}};
}
function shelfStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const shelf=sheet.context?.shelf,effect=step.effect;if(!shelf)return{sheet:next,action:null};
  if(effect.kind==='enter'&&step.panel.tab===0){
    /* this folder, under whatever filter, carries «here» (C11c): it goes on to How, it does not start TALOS again */
    if(effect.item.badge===t('panel.new.here'))return{sheet:{...next,panel:{...next.panel,tab:1}},action:null};
    /* another folder is a clean start there (relaunch.ts); a project whose path nobody knows can only be named */
    return effect.item.id&&effect.item.id!==effect.item.label?{sheet:next,action:{kind:'openFolder',path:effect.item.id}}:{sheet:next,action:{kind:'notice',text:t('panel.new.otherFolder',{path:effect.item.label})}};
  }
  if(step.panel.tab===0&&effect.kind==='key'&&effect.key==='p')return{sheet:{...next,panel:startEdit(step.panel,t('panel.new.pathLabel'))},action:null};
  if(step.panel.tab===0&&effect.kind==='edited')return{sheet:next,action:effect.value.trim()?{kind:'openFolder',path:effect.value.trim()}:null};
  if(step.panel.tab===1&&effect.kind==='key'&&effect.key==='m')return{sheet:null,action:{kind:'runCommand',name:'model'}};
  if(step.panel.tab===1&&effect.kind==='submit'){
    const body=step.panel.tabs[1]!.body;if(body.kind!=='form')return{sheet:next,action:null};
    const value=(label:MessageId)=>body.fields.find(field=>field.label===t(label))?.value;
    const word=String(value('panel.new.how.access'));
    return{sheet:null,action:{kind:'newSetup',effort:shelf.how?.efforts.length?String(value('panel.new.how.effort')):null,mode:ACCESS_MODES.find(mode=>accessWord(mode)===word)??'default',plan:value('panel.new.how.plan')===true}};
  }
  if(effect.kind!=='key'||step.panel.tab!==2)return{sheet:next,action:null};
  const data=shelf.paint.data(),result=shelfPick(shelf.pick,data.projects,effect.key,data.automation??null);
  /* the dashed disk: the mockup's notice (index.html:2532), and the page stays as it was */
  if(result.notice)return{sheet:next,action:{kind:'notice',text:result.notice,tone:'warn'}};
  return result.open?{sheet:null,action:{kind:'resume',id:result.open}}:{sheet:shelfSheet(shelf.paint,result.pick,{tab:2,current:shelf.current??'',here:shelf.here??'',folders:shelf.folders??[],how:shelf.how??null,picks:shelf.picks??null}),action:null};
}
/* C4: /context. `c` over every tab asks, a second `c` compacts; what changes goes to the app, which sends it with the revision it read */
export function contextSheet(data:ContextPageData,{mode=CHART_FULL,tab=0,asking=false}:{mode?:ChartMode;tab?:number;asking?:boolean}={}):SheetState{
  const compact:PanelKey={key:'c',label:'',hidden:true,adds:true},versions=data.versions,now=data.now;
  const find=(item:PanelItem)=>versions.find(version=>version.id===item.id);
  const missing:PanelBody={kind:'info',keys:[compact],lines:()=>[[S(`  ${t('panel.context.noEngine')}`,'dim')]]};
  const engine=data.snapshot;
  const tabs=[
    {name:t('panel.context.tab.overview'),body:{kind:'info',keys:[compact],lines:(width:number,height=24)=>contextOverviewRows(data,width,height,mode)} as PanelBody},
    {name:t('panel.context.tab.compactions'),body:(engine?{kind:'list',sel:0,split:0.44,twoLine:true,enter:t('panel.context.whatKept'),empty:t('panel.context.noCompactions'),keys:[compact],items:contextCompactionItems(versions,now),detail:(item,width)=>{const version=find(item);return version?contextKeptRows(version,width):[];}}:missing) as PanelBody},
    {name:t('panel.context.tab.facts'),body:(engine?{kind:'list',sel:0,empty:t('panel.context.noFacts'),keys:[compact,{key:'n',label:t('panel.context.addFact'),adds:true},{key:'a',label:t('panel.context.acceptFact')},{key:'d',label:t('panel.context.removeFact')}],top:()=>[[S(`   ${t('panel.context.factsNote')}`,'dim')],[S('')]],items:contextFactItems(engine.facts??[])}:missing) as PanelBody},
    {name:t('panel.context.tab.versions'),body:(engine?{kind:'list',sel:0,radio:true,split:0.44,twoLine:true,enter:t('panel.context.restore'),empty:t('panel.context.noVersions'),keys:[compact],items:contextVersionItems(versions,engine.activeVersion?.id??null,now),detail:(item,width)=>{const version=find(item);return version?contextKeptRows(version,width):[];}}:missing) as PanelBody},
    /* a list and not a form: a text field would take the `c` of Compact now */
    {name:t('panel.context.tab.settings'),body:(engine?{kind:'list',sel:0,enter:t('panel.context.change'),keys:[compact],extra:()=>contextOwnSettingsRows(engine.settings,data.status),
      items:[{id:'retainRecentTurns',label:t('panel.context.recentExchanges'),meta:String(engine.settings?.retainRecentTurns??2)},{id:'focus',label:t('panel.context.instructions'),meta:engine.settings?.focus?trunc(engine.settings.focus,30):t('panel.context.noInstructions')}]}:missing) as PanelBody},
  ];
  /* owner 01/11: «Request sent», the last request as it went, last so the keys of the other tabs keep their places */
  tabs.push({name:t('panel.context.tab.sent'),body:{kind:'list',sel:0,twoLine:true,split:0.34,keys:[compact],empty:t('panel.context.sent.none'),items:requestSentItems(data.sent??null),
    top:width=>requestSentTop(data.sent??null,width),detail:(item,width)=>requestSentDetail(data.sent??null,item.id,width)}});
  return{name:'context',context:{contextPage:{data,mode,asking}},panel:{title:t('panel.context.title'),sub:t('panel.context.sub'),tab,page:true,head:()=>contextHeadRows(data.status,asking),tabs}};
}
function contextStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const page=sheet.context?.contextPage,effect=step.effect,tab=step.panel.tab;
  if(!page)return{sheet:next,action:null};
  const again=(asking:boolean):SheetState=>({...next,context:{...next.context,contextPage:{...page,asking}},panel:{...next.panel,head:()=>contextHeadRows(page.data.status,asking)}});
  if(effect.kind==='key'&&effect.key==='c')return page.asking?{sheet:null,action:{kind:'runCommand',name:'compact'}}:{sheet:again(true),action:null};
  if(page.asking&&effect.kind!=='none')return{sheet:again(false),action:null};
  if(tab===2&&effect.kind==='key'&&effect.key==='n')return{sheet:{...next,panel:startEdit(step.panel,t('panel.context.factLabel'))},action:null};
  if(tab===2&&effect.kind==='edited'){const text=effect.value.trim();return{sheet:next,action:text?{kind:'contextChange',method:'POST',path:'/facts',body:{fact:{text,sources:[]}},done:'panel.context.factAdded',tab}:null};}
  if(tab===2&&effect.kind==='key'&&effect.key==='a'&&effect.item?.badge)return{sheet:next,action:{kind:'contextChange',method:'POST',path:`/facts/${effect.item.id}/resolve`,body:{accept:true},done:'panel.context.factAdded',tab}};
  if(tab===2&&effect.kind==='key'&&effect.key==='d'&&effect.item)return{sheet:{...next,panel:askDelete(step.panel)},action:null};
  if(tab===2&&effect.kind==='delete')return{sheet:next,action:{kind:'contextChange',method:'DELETE',path:`/facts/${effect.item.id}`,done:'panel.context.factRemoved',tab}};
  if(tab===3&&effect.kind==='enter'&&!effect.item.current)return{sheet:next,action:{kind:'contextChange',method:'POST',path:`/versions/${effect.item.id}/restore`,done:'panel.context.restored',tab}};
  if(tab===4&&effect.kind==='enter'){
    const settings=page.data.snapshot?.settings,field=effect.item.id==='focus'?'focus':'retainRecentTurns';
    return{sheet:{...next,panel:startEdit(step.panel,`${effect.item.label}:`,String(settings?.[field]??(field==='focus'?'':2))),context:{...next.context,editing:field}},action:null};
  }
  if(tab===4&&effect.kind==='edited'){
    const field=sheet.context?.editing,value=effect.value.trim(),{editing:_done,...context}=next.context??{};const left={...next,context};
    if(field==='focus')return{sheet:left,action:{kind:'contextChange',method:'PATCH',path:'/settings',body:{patch:{focus:value}},done:'panel.context.settingsSaved',tab}};
    const turns=Number(value);
    if(!value||!Number.isInteger(turns)||turns<0||turns>100)return{sheet:left,action:{kind:'notice',text:t('panel.context.badTurns')}};
    return{sheet:left,action:{kind:'contextChange',method:'PATCH',path:'/settings',body:{patch:{retainRecentTurns:turns}},done:'panel.context.settingsSaved',tab}};
  }
  return{sheet:next,action:null};
}
/* C8: Capability. Each tab keeps the keys of the center it replaces; the action goes to the app, which reads the page again on the same tab */
const CAPABILITY_KEYS:Record<CapabilityTab,ReadonlyArray<readonly [string,MessageId,string]>>={tools:[],skills:[],connectors:[['t','panel.capability.key.trust','trust'],['u','panel.capability.key.untrust','untrust']],plugins:[['t','panel.capability.key.trust','trust'],['u','panel.capability.key.untrust','untrust'],['q','panel.capability.key.quarantine','quarantine']],hooks:[['d','panel.capability.key.dryRun','dry-run'],['t','panel.capability.key.trust','trust'],['u','panel.capability.key.untrust','untrust'],['q','panel.capability.key.quarantine','quarantine']]};
const CAPABILITY_EMPTY:Record<CapabilityTab,MessageId>={tools:'panel.capability.empty.tools',skills:'panel.capability.empty.skills',connectors:'panel.capability.empty.connectors',plugins:'panel.capability.empty.plugins',hooks:'panel.capability.empty.hooks'};
export function capabilitySheet(data:CapabilityData,{tab=0,selectedId=null}:{tab?:number;selectedId?:string|null}={}):SheetState{
  const tabs=CAPABILITY_TABS.map(name=>{
    const items=capabilityItems(data,name),sel=Math.max(0,items.findIndex(item=>item.id===selectedId));
    const body:PanelBody={kind:'list',sel,twoLine:true,filterable:true,split:0.5,items,empty:t(name==='tools'&&!data.tools?'panel.capability.empty.noRequest':CAPABILITY_EMPTY[name]),
      ...(name==='connectors'?{enter:t('panel.capability.key.test')}:{}),keys:CAPABILITY_KEYS[name].map(([key,label])=>({key,label:t(label)})),
      ...(name==='tools'?{top:(width:number)=>capabilityToolsTop(data,width)}:{}),detail:(item,width)=>capabilityDetail(data,name,item.id,width)};
    return{name:t(`panel.capability.tab.${name}` as MessageId),body};
  });
  return{name:'capability',context:{capability:{data}},panel:{title:t('panel.capability.title'),sub:t('panel.capability.sub'),tab,page:true,tabs}};
}
function capabilityStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect,tab=step.panel.tab,name=CAPABILITY_TABS[tab]!;
  if(effect.kind==='enter'&&name==='connectors')return{sheet:next,action:{kind:'capability',tab,verb:'probe',id:effect.item.id!}};
  if(effect.kind!=='key'||!effect.item)return{sheet:next,action:null};
  const verb=CAPABILITY_KEYS[name].find(([key])=>key===effect.key)?.[2];
  return{sheet:next,action:verb?{kind:'capability',tab,verb,id:effect.item.id!}:null};
}
/* review 01/11 (ALTO 1): a list with a filter shows only the rows of that filter, and its `sel` counts in them; the row to keep is found
   there, never by its place among all the rows (else the next key acts on another row) */
const selectedIn=(items:readonly PanelItem[],match:((item:PanelItem)=>boolean)|undefined,selectedId:string|null)=>Math.max(0,(match?items.filter(match):items).findIndex(item=>item.id===selectedId));
/* C9: Automations. The List with the mockup's keys (space on/off, r run now, n new, e edit, d delete) and Enter for the runs to review; the
   Calendar reads the week the facade computed. New and edit ask two lines, what and when, the phrase `talos automation` reads. */
export function automationsSheet(data:AutomationsData,{tab=0,selectedId=null,filterAt=0,now=Date.now()}:{tab?:number;selectedId?:string|null;filterAt?:number;now?:number}={}):SheetState{
  const items=automationItems(data,now);const shownFilter=AUTOMATION_FILTERS[filterAt]??'all';const sel=selectedIn(items,shownFilter==='all'?undefined:automationMatches(data,shownFilter),selectedId);
  const count=(filter:AutomationFilter)=>items.filter(automationMatches(data,filter)).length;
  const list:PanelBody={kind:'list',sel,twoLine:true,toggle:true,filterable:true,split:0.5,items,filterAt,
    empty:data.state==='invalid'?t('panel.automations.invalid',{message:data.error?.message??''}):t('panel.automations.empty'),
    filters:AUTOMATION_FILTERS.map(filter=>({name:t(`panel.automations.filter.${filter}` as MessageId,{count:count(filter)}),...(filter==='all'?{}:{match:automationMatches(data,filter)})})),
    /* Enter is offered only while some run is to review: otherwise it would do nothing */
    ...(data.review.length?{enter:t('panel.automations.key.seen')}:{}),
    keys:[{key:'space',label:t('panel.automations.key.toggle')},{key:'r',label:t('panel.automations.key.run')},{key:'n',label:t('panel.automations.key.new'),adds:true},{key:'e',label:t('panel.automations.key.edit')},{key:'d',label:t('panel.automations.key.delete')}],
    detail:(item,width)=>automationDetail(data,item.id,width,now)};
  const calendar:PanelBody={kind:'info',lines:width=>automationCalendarRows(data,width,now)};
  return{name:'automations',context:{automations:{data,now}},panel:{title:t('panel.automations.title'),sub:t('panel.automations.sub'),tab,page:true,
    tabs:[{name:t('panel.automations.tab.list'),body:list},{name:t('panel.automations.tab.calendar'),body:calendar}]}};
}
function automationsStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect,data=sheet.context?.automations?.data as AutomationsData|undefined;
  if(step.panel.tab!==0||!data)return{sheet:next,action:null};
  const row=(id:string|undefined)=>data.rows.find(value=>value.id===id);
  if(effect.kind==='key'&&effect.key==='n')return{sheet:{...next,panel:startEdit(step.panel,t('panel.automations.ask.instructions')),context:{...next.context,automationEdit:{id:null,stage:'what'}}},action:null};
  if(effect.kind==='edited'){
    const editing=sheet.context?.automationEdit;const value=effect.value.trim();
    const {automationEdit:_done,...context}=next.context??{};const left={...next,context};
    if(!editing||!value)return{sheet:left,action:null};
    if(editing.stage==='what'){const old=editing.id?row(editing.id):null;
      return{sheet:{...next,panel:startEdit(step.panel,t('panel.automations.ask.when'),old?.schedule??''),context:{...next.context,automationEdit:{id:editing.id,stage:'when',instructions:value}}},action:null};}
    return{sheet:left,action:{kind:'automation',verb:editing.id?'edit':'add',id:editing.id??'',instructions:editing.instructions??'',when:value}};
  }
  if(effect.kind==='enter'){const runs=reviewOf(data,effect.item.id!);return{sheet:next,action:runs.length?{kind:'automation',verb:'seen',id:effect.item.id!,runIds:runs}:null};}
  if(effect.kind==='delete')return{sheet:next,action:{kind:'automation',verb:'delete',id:effect.item.id!}};
  if(effect.kind!=='key'||!effect.item)return{sheet:next,action:null};
  const chosen=row(effect.item.id);if(!chosen)return{sheet:next,action:null};
  if(effect.key==='space')return{sheet:next,action:{kind:'automation',verb:chosen.active?'pause':'resume',id:chosen.id}};
  if(effect.key==='r')return{sheet:next,action:chosen.legacy?{kind:'notice',text:t('panel.automations.legacyCannotRun')}:{kind:'automation',verb:'run',id:chosen.id}};
  if(effect.key==='e'){if(chosen.legacy)return{sheet:next,action:{kind:'notice',text:t('panel.automations.legacyNote')}};
    return{sheet:{...next,panel:startEdit(step.panel,t('panel.automations.ask.instructions'),chosen.instructions??''),context:{...next.context,automationEdit:{id:chosen.id,stage:'what'}}},action:null};}
  if(effect.key==='d')return{sheet:{...next,panel:askDelete(step.panel)},action:null};
  return{sheet:next,action:null};
}
/* C12d: Processes. s stops the one under the cursor (a finished one says so), a twice stops every running one, r reads the ledger again */
export function processesSheet(data:ProcessesData,{selectedId=null,filterAt=0,now=Date.now(),filter,filtering,askStopAll=false}:{selectedId?:string|null;filterAt?:number;now?:number;/* kept across the live redraws */filter?:string;filtering?:boolean;/* a «stop all» waits for its second a */askStopAll?:boolean}={}):SheetState{
  const items=processItems(data);const shown=PROCESS_FILTERS[filterAt]??'running';const match=shown==='all'?undefined:(item:PanelItem)=>processMatch(shown)(processOf(data,item.id));
  const sel=selectedIn(items,match,selectedId);const count=(filter:ProcessFilter)=>data.rows.filter(row=>processMatch(filter)(row)).length;
  /* each filter says its own emptiness (tester N1, N1 bis): the list's `empty` was chosen once and stayed after a Tab */
  const emptyOf=(filter:ProcessFilter):string|undefined=>!data.rows.length||filter==='all'?undefined:filter==='finished'?t('panel.processes.emptyFinished'):count('finished')?t('panel.processes.emptyRunningFinished',{count:count('finished')}):t('panel.processes.emptyRunning');
  return{name:'processes',context:{processes:{data},...(processesAlive(data)?{ticking:true}:{})},panel:{...one(t('panel.processes.title'),t('panel.processes.sub'),{kind:'list',sel,twoLine:true,filterable:true,split:0.6,items,filterAt,...(filter?{filter}:{}),...(filtering?{filtering}:{}),
    empty:t('panel.processes.empty'),emptyAdd:false,top:width=>processesTop(data,width,now,askStopAll),
    filters:PROCESS_FILTERS.map(filter=>({name:t(`panel.processes.filter.${filter}` as MessageId,{count:count(filter)}),...(filter==='all'?{}:{match:(item:PanelItem)=>processMatch(filter)(processOf(data,item.id))}),...(emptyOf(filter)?{empty:emptyOf(filter)!}:{})})),
    keys:[{key:'s',label:t('panel.processes.key.stop'),forItem:(item:PanelItem)=>{const row=processOf(data,item.id);return Boolean(row&&processRunning(row));}},...(count('running')?[{key:'a',label:t('panel.processes.key.stopAll'),adds:true}]:[]),{key:'r',label:t('panel.processes.key.reread'),adds:true}],detail:(item,width)=>processDetail(data,item.id,width)}),page:true}};
}
/** The live redraw of the Processes page (every half second while something runs): the same page from fresher data, keeping the
    row under the cursor, the filter, a search under way and a «stop all» that waits for its second a (Desktop review 02/11, P1). */
export function processesRedraw(open:SheetState|null,data:ProcessesData,selectedId?:string|null):SheetState{
  const body=open?.name==='processes'?open.panel.tabs[0]?.body:undefined;const list=body?.kind==='list'?body:null;
  const kept=selectedId!==undefined?selectedId:list?(listItems(list)[list.sel]?.id??null):null;
  /* the question goes when nothing is left to stop */
  const asking=open?.name==='processes'&&open.context?.processesStopAll===true&&processesAlive(data);
  const next=processesSheet(data,{selectedId:kept,filterAt:list?.filterAt??0,now:data.now??data.readAt,...(list?.filter?{filter:list.filter}:{}),...(list?.filtering?{filtering:true}:{}),askStopAll:asking});
  return asking?{...next,context:{...next.context,processesStopAll:true}}:next;
}
function processesStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect,data=sheet.context?.processes?.data,armed=sheet.context?.processesStopAll===true;const {processesStopAll:_left,...rest}=next.context??{};
  /* any other key takes the question back, and with it the row over the list */
  const clear=armed&&data?processesRedraw({...next,context:rest},data):{...next,context:rest};
  if(!data||effect.kind!=='key')return{sheet:clear,action:null};
  if(effect.key==='r')return{sheet:clear,action:{kind:'processes',verb:'reread'}};
  if(effect.key==='a'){const running=data.rows.filter(processRunning).length;if(!running)return{sheet:clear,action:null};
    if(armed)return{sheet:clear,action:{kind:'processes',verb:'stopAll'}};return{sheet:processesRedraw({...next,context:{...next.context,processesStopAll:true}},data),action:null};}
  if(effect.key==='s'&&effect.item){const row=processOf(data,effect.item.id);if(!row)return{sheet:clear,action:null};
    if(!processRunning(row))return{sheet:clear,action:{kind:'notice',text:t('panel.processes.alreadyFinished',{command:row.command??''})}};
    return{sheet:clear,action:{kind:'processes',verb:'stop',sessionId:row.sessionId,toolCallId:row.toolCallId}};}
  return{sheet:clear,action:null};
}
/* C10: Devices. n opens the pairing card of /remote as it is; d twice revokes, its question naming the device */
export function devicesSheet(data:DevicesData,{selectedId=null}:{selectedId?:string|null}={}):SheetState{
  const items=deviceItems(data);const sel=Math.max(0,items.findIndex(item=>item.id===selectedId));
  return{name:'devices',context:{devices:{data}},panel:{...one(t('panel.devices.title'),data.pc?`${t('panel.devices.sub')} · ${data.pc}`:t('panel.devices.sub'),{kind:'list',sel,twoLine:false,filterable:true,split:0.5,items,
    empty:data.available?t('panel.devices.empty'):t('panel.devices.unavailable',{reason:data.error??''}),emptyAdd:false,
    ...(data.off?{top:(width:number)=>[...wrap(` ${t('panel.devices.off')}`,width).map(line=>[S(line,'warn')] as SegRow),[S('')]]}:{}),
    keys:[{key:'n',label:t('panel.devices.key.pair'),adds:true},{key:'d',label:t('panel.devices.key.revoke')}],detail:(item,width)=>deviceDetail(data,item.id,width)}),page:true}};
}
function devicesStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;
  if(effect.kind==='key'&&effect.key==='n')return{sheet:null,action:{kind:'devices',verb:'pair'}};
  /* Mobile 01/11: the second d revokes the device the first one named, by its id, never the row under it; a list read again in between
     (a new page, a new context) has no armed id, and a different id takes the question back */
  const armed=sheet.context?.devicesRevoke;const {devicesRevoke:_left,...rest}=next.context??{};
  if(effect.kind==='delete'){if(armed&&effect.item.id===armed)return{sheet:{...next,context:rest},action:{kind:'devices',verb:'revoke',id:armed}};
    return{sheet:{...next,panel:{...next.panel,confirmDel:null},context:rest},action:null};}
  if(effect.kind==='key'&&effect.key==='d'&&effect.item){const name=sheet.context?.devices?.data.devices.find(row=>row.id===effect.item!.id)?.name??'';
    return{sheet:{...next,panel:{...askDelete(step.panel),confirmWords:t('panel.devices.revokeAsk',{name})},context:{...next.context,devicesRevoke:effect.item.id!}},action:null};}
  return{sheet:next,action:null};
}
/* C9: Doctor. The verdict over the list, the checks and what was found under it; r checks again, x writes the report */
export function doctorSheet(report:DoctorReport|null,{selectedId=null}:{selectedId?:string|null}={}):SheetState{
  const items=doctorItems(report);const red=items.findIndex(item=>item.badgeRoles?.[0]==='err');const firstBad=red>=0?red:items.findIndex(item=>item.badgeRoles?.[0]==='warn');
  const sel=Math.max(0,selectedId?items.findIndex(item=>item.id===selectedId):firstBad);
  return{name:'doctor',context:{doctor:{report}},panel:{...one(t('panel.doctor.title'),t('panel.doctor.sub'),{kind:'list',sel,filterable:true,split:0.5,items,empty:t('panel.doctor.noChecks'),emptyAdd:false,
    top:width=>doctorHead(report,width),keys:[{key:'r',label:t('panel.doctor.key.recheck'),adds:true},{key:'x',label:t('panel.doctor.key.export'),adds:true}],detail:(item,width)=>doctorDetail(report,item.id,width)}),page:true}};
}
function doctorStep(step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;if(effect.kind!=='key')return{sheet:next,action:null};
  if(effect.key==='r')return{sheet:next,action:{kind:'doctor',verb:'recheck',...(effect.item?.id?{id:effect.item.id}:{})}};
  if(effect.key==='x')return{sheet:next,action:{kind:'doctor',verb:'export'}};
  return{sheet:next,action:null};
}
/* C9: Research. The runs with the center's keys (p pause, r resume, c twice cancel, e export); Enter reads the run and opens its Evidence */
export function researchSheet(data:ResearchData,{tab=0,selectedId=null,filterAt=0}:{tab?:number;selectedId?:string|null;filterAt?:number}={}):SheetState{
  const items=researchItems(data);const shownFilter=RESEARCH_FILTERS[filterAt]??'all';const match=shownFilter==='all'?undefined:(item:PanelItem)=>researchMatch(shownFilter)(data.rows.find(row=>row.id===item.id));
  const sel=selectedIn(items,match,selectedId);const chosen=(match?items.filter(match):items)[sel]?.id;const detail=chosen?data.details.get(chosen):undefined;
  const count=(filter:ResearchFilter)=>data.rows.filter(researchMatch(filter)).length;
  const runs:PanelBody={kind:'list',sel,twoLine:true,filterable:true,split:0.5,items,filterAt,enter:t('panel.research.tab.evidence'),
    empty:data.state==='invalid'?t('panel.research.invalid',{message:data.error?.message??''}):t('panel.research.empty'),
    filters:RESEARCH_FILTERS.map(filter=>({name:t(`panel.research.filter.${filter}` as MessageId,{count:count(filter)}),...(filter==='all'?{}:{match:(item:PanelItem)=>researchMatch(filter)(data.rows.find(row=>row.id===item.id))})})),
    keys:[{key:'p',label:t('panel.research.key.pause')},{key:'r',label:t('panel.research.key.resume')},{key:'c',label:t('panel.research.key.cancel')},{key:'e',label:t('panel.research.key.export')}],
    detail:(item,width)=>researchDetail(data,item.id,width)};
  const evidence:PanelBody={kind:'list',sel:0,twoLine:true,filterable:true,split:0.5,items:evidenceItems(detail),empty:t(detail?'panel.research.evidenceEmpty':'panel.research.notRead'),
    detail:(item,width)=>evidenceDetail(detail,item.id,width)};
  const chosenRow=data.rows.find(row=>row.id===chosen);const question=chosen?chosenRow?.question??chosenRow?.name??chosen:'';
  return{name:'research',context:{research:{data}},panel:{title:t('panel.research.title'),sub:t('panel.research.sub'),tab,page:true,
    tabs:[{name:t('panel.research.tab.runs'),body:runs},{name:t('panel.research.tab.evidence'),body:evidence,...(question?{sub:question}:{})}]}};
}
function researchStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect,armed=sheet.context?.researchCancel;const clear={...next,context:{...next.context,researchCancel:undefined}};
  if(step.panel.tab===1&&sheet.panel.tab===0){const data=sheet.context?.research?.data;const body=step.panel.tabs[0]!.body;
    if(data&&body.kind==='list'){const id=listItems(body)[body.sel]?.id??null;const again=researchSheet(data,{tab:1,selectedId:id,filterAt:body.filterAt??0});return{sheet:{...again,panel:{...again.panel,page:next.panel.page??true}},action:null};}}
  if(step.panel.tab!==0)return{sheet:next,action:null};
  if(effect.kind==='enter')return{sheet:clear,action:{kind:'research',verb:'open',id:effect.item.id!}};
  if(effect.kind!=='key'||!effect.item)return{sheet:clear,action:null};
  const id=effect.item.id!;
  if(effect.key==='c'){if(armed===id)return{sheet:clear,action:{kind:'research',verb:'cancel',id}};return{sheet:{...next,context:{...next.context,researchCancel:id}},action:{kind:'notice',text:t('panel.research.cancelAsk')}};}
  const verb=({p:'pause',r:'resume',e:'export'} as const)[effect.key as 'p'|'r'|'e'];
  return{sheet:clear,action:verb?{kind:'research',verb,id}:null};
}
/* C11b: Projects (bozzetto-cli-retro/index.html:1152-1159). Enter is «new session here», n opens New session; `current` is this folder's name */
export function projectsSheet(rows:readonly ProjectRow[],{current='',selectedId=null,now=Date.now(),unicode=true}:{current?:string;selectedId?:string|null;now?:number;unicode?:boolean}={}):SheetState{
  const items=projectItems(rows,now);const at=selectedId?items.findIndex(item=>item.id===selectedId):-1;
  const list:PanelBody={kind:'list',sel:Math.max(0,at),twoLine:true,filterable:true,split:0.5,items,enter:t('panel.projects.enter'),empty:t('panel.projects.empty'),emptyAdd:false,
    filters:[{name:t('panel.projects.filter.all',{count:rows.length})}],oneFilter:true,keys:[{key:'n',label:t('panel.projects.key.open'),adds:true}],
    detail:(item,width)=>projectDetail(rows.find(row=>(row.path??row.name)===item.id),width,{now,unicode})};
  return{name:'projects',context:{projects:{rows,current}},panel:one(t('panel.projects.title'),t('panel.projects.sub',{count:rows.length,withSessions:rows.filter(row=>row.sessions.length).length}),list)};
}
function projectsStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect,data=sheet.context?.projects;
  if(effect.kind==='key'&&effect.key==='n')return{sheet:null,action:{kind:'openNew',tab:0}};
  if(effect.kind!=='enter'||!data)return{sheet:next,action:null};
  const row=data.rows.find(value=>(value.path??value.name)===effect.item.id);if(!row)return{sheet:next,action:null};
  /* this folder: New session on «How we work», as the mockup's scheda 1; another one is a clean start there, as New session's own list does */
  if(row.name===data.current)return{sheet:null,action:{kind:'openNew',tab:1}};
  return row.path?{sheet:next,action:{kind:'openFolder',path:row.path}}:{sheet:next,action:{kind:'notice',text:t('panel.new.otherFolder',{path:row.name})}};
}
/* C9: Forge. Space turns a tool on or off, b goes back to its previous version; the app acts through the owner's session */
export function forgeSheet(data:ForgeData,{selectedId=null,filterAt=0}:{selectedId?:string|null;filterAt?:number}={}):SheetState{
  const items=forgeItems(data);const shownFilter=FORGE_FILTERS[filterAt]??'all';const sel=selectedIn(items,shownFilter==='all'?undefined:forgeMatch(data,shownFilter),selectedId);
  const count=(filter:(typeof FORGE_FILTERS)[number])=>filter==='all'?items.length:items.filter(forgeMatch(data,filter)).length;
  return{name:'forge',context:{forge:{data}},panel:{...one(t('panel.forge.title'),t('panel.forge.sub'),{kind:'list',sel,twoLine:true,toggle:true,filterable:true,split:0.5,items,filterAt,
    empty:data.state==='invalid'?t('panel.forge.invalid',{message:data.error?.message??''}):t('panel.forge.empty'),
    filters:FORGE_FILTERS.map(filter=>({name:t(`panel.forge.filter.${filter}` as MessageId,{count:count(filter)}),...(filter==='all'?{}:{match:forgeMatch(data,filter)})})),
    keys:[{key:'space',label:t('panel.forge.key.toggle')},{key:'b',label:t('panel.forge.key.back')}],detail:(item,width)=>forgeDetail(data,item.id,width)}),page:true}};
}
function forgeStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect,data=sheet.context?.forge?.data;if(effect.kind!=='key'||!effect.item||!data)return{sheet:next,action:null};
  const row=data.rows.find(value=>value.id===effect.item!.id);if(!row)return{sheet:next,action:null};
  if(effect.key==='space')return{sheet:next,action:{kind:'forge',verb:row.enabled?'disable':'enable',id:row.id}};
  if(effect.key==='b'){const revision=previousRevision(data.details.get(row.id));
    return{sheet:next,action:revision===null?{kind:'notice',text:t('panel.forge.noEarlier',{name:row.title})}:{kind:'forge',verb:'back',id:row.id,revision}};}
  return{sheet:next,action:null};
}
/* C6b: the Board. The table first; the lanes as its second view; the arrows of the lanes are their own, so Tab changes view */
export function boardSheet(rows:readonly BoardRow[],{filter=0,pick={lane:0,card:0},tab=0,table=0,glyph='⠿',unicode=true}:{filter?:number;pick?:BoardPick;tab?:number;table?:number;glyph?:string;unicode?:boolean}={}):SheetState{
  const hidden=(key:string):PanelKey=>({key,label:'',hidden:true});
  const matches=boardMatches(rows,filter),arrows=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].map(hidden);
  const filterKeys=[{key:'[ ]',label:t('panel.board.filter')},hidden('['),hidden(']')];
  const body=(lines:(width:number,height?:number)=>SegRow[],keys:readonly PanelKey[]):PanelBody=>({kind:'info',fixed:true,keys:[...keys,...filterKeys,{key:'enter',label:t('panel.board.open')},hidden('Enter'),...arrows],lines});
  return{name:'board',context:{board:{rows,filter,pick,table,glyph,unicode}},panel:{title:t('panel.board.title'),sub:t('panel.board.sub'),tab,page:true,head:width=>[boardFilterRow(rows,filter,width),[S('')]],tabs:[
    {name:t('panel.board.table'),body:body(width=>boardTableRows(matches,{width,selected:table,glyph,unicode}),[{key:'↑/↓',label:t('panel.key.move')}])},
    {name:t('panel.board.lanes'),body:body((width,height=24)=>boardLaneRows(matches,{width,height,pick,glyph,unicode}),[{key:'←/→ ↑/↓',label:t('panel.key.move')}])},
  ]}};
}
function boardStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const board=sheet.context?.board,effect=step.effect;
  if(!board||effect.kind!=='key')return{sheet:next,action:null};
  const tab=step.panel.tab,matches=boardMatches(board.rows,board.filter),key=effect.key;
  const again=(change:Partial<typeof board>)=>({...boardSheet(board.rows,{...board,...change,tab}),action:null});
  const draw=(change:Partial<typeof board>)=>({sheet:{...again(change)} as SheetState,action:null});
  if(key==='['||key===']')return draw({filter:(board.filter+(key===']'?1:SESSION_FILTERS.length))%(SESSION_FILTERS.length+1),table:0,pick:{lane:0,card:0}});
  const filterClick=/^bfilter:(\d+)$/u.exec(key);if(filterClick)return draw({filter:Number(filterClick[1]),table:0,pick:{lane:0,card:0}});
  const open=(row:BoardRow|null|undefined)=>row?{sheet:null,action:{kind:'resume',id:row.id} as SheetAction}:{sheet:next,action:null};
  const cardClick=/^bcard:(\d+)$/u.exec(key);if(cardClick)return Number(cardClick[1])===board.table?open(matches[board.table]):draw({table:Number(cardClick[1])});
  const laneClick=/^blane:(\d+):(\d+)$/u.exec(key);if(laneClick){const pick={lane:Number(laneClick[1]),card:Number(laneClick[2])};return pick.lane===board.pick.lane&&pick.card===board.pick.card?open(boardCardAt(matches,pick)):draw({pick});}
  if(tab===0){
    if(key==='ArrowDown')return draw({table:Math.min(Math.max(0,matches.length-1),board.table+1)});
    if(key==='ArrowUp')return draw({table:Math.max(0,board.table-1)});
    return key==='Enter'?open(matches[board.table]):{sheet:next,action:null};
  }
  return key==='Enter'?open(boardCardAt(matches,board.pick)):draw({pick:boardMove(matches,board.pick,key)});
}
/* C5: /usage. By day holds ←/→ for its days; the figures of this session stay in Settings, one key away */
export function usageSheet(history:UsageHistory|null,{day=(history?.days.length??1)-1,mode=CHART_FULL,now=new Date(),tab=0}:{day?:number;mode?:ChartMode;now?:Date;tab?:number}={}):SheetState{
  const session:PanelKey={key:'s',label:t('panel.usage.thisSession'),adds:true};
  const body=(lines:(width:number,height?:number)=>SegRow[],keys:readonly PanelKey[]=[session],fixed=false):PanelBody=>({kind:'info',keys,fixed,lines:history?lines:usageEmptyRows});
  const hidden=(key:string):PanelKey=>({key,label:'',hidden:true});
  return{name:'usage',context:{usage:{history,day,mode,now}},panel:{title:t('panel.usage.title'),sub:t('panel.usage.sub'),tab,page:true,tabs:[
    {name:t('panel.usage.tab.byDay'),body:body((width,height=24)=>usageByDayRows(history!,day,width,height,mode),[{key:'←/→',label:t('panel.usage.day')},session,hidden('ArrowLeft'),hidden('ArrowRight')],true)},
    {name:t('panel.usage.tab.byModel'),body:body(width=>usageByModelRows(history!,width,mode))},
    {name:t('panel.usage.tab.calendar'),body:body(width=>usageCalendarRows(history!,width,now,mode))},
  ]}};
}
function usageStep(sheet:SheetState,step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const usage=sheet.context?.usage,effect=step.effect;
  if(!usage||effect.kind!=='key')return{sheet:next,action:null};
  if(effect.key==='s')return{sheet:null,action:{kind:'usageSession'}};
  if(step.panel.tab!==0||!usage.history)return{sheet:next,action:null};
  return{sheet:usageSheet(usage.history,{day:usageDayStep(usage.day,effect.key,usage.history.days.length),mode:usage.mode,now:usage.now}),action:null};
}
/* leaving a folder stops what runs here: it says what, in Stop's words, and staying is the first answer */
export function leaveSheet(path:string,reasons:readonly string[]):SheetState{
  return{name:'leave',context:{text:path},panel:one(t('panel.new.leaveTitle'),'',{kind:'list',sel:0,enter:t('panel.enter.use'),top:()=>reasons.map(reason=>[S(reason,'dim')] as SegRow).concat([[S('')]]),
    items:[{id:'stay',label:t('panel.new.stay')},{id:'stop',label:t('panel.new.stopAndOpen')}]})};
}
/* the Home as a page (Alt+H): the list has the focus, with the groups the first screen leaves out. Judge v2244 (19/11): as the mockup, the
   groups are headings over the list, not filters (bozzetto-cli-retro/index.html:959-961, `gruppo`, drawn by `corpoLista` at :406) */
export function homeSheet(sessions:readonly HomeSession[],{glyph='·',unicode=true}:{glyph?:string;unicode?:boolean}={}):SheetState{
  const under=(name:MessageId,items:readonly PanelItem[])=>items.map(item=>({...item,group:t(name)}));
  const run=(id:string,label:MessageId,desc?:MessageId):PanelItem=>({id:`run:${id}`,label:t(label),...(desc?{desc:t(desc)}:{})});
  return{name:'home',panel:one(t('panel.home.title'),t('panel.home.sub'),{kind:'list',sel:0,enter:t('panel.new.open'),filterable:true,
    items:[...under('panel.home.start',[{id:'close',label:t('panel.home.conversation'),desc:t('panel.home.conversationDesc')},run('library','panel.home.documents','panel.home.documentsDesc'),run('research','panel.home.research','panel.home.researchDesc')]),
      ...under('panel.home.pickUp',[...sessions.map(session=>({id:`resume:${session.id}`,label:`${homeSign(session.state,{glyph,unicode})} ${session.title}`,meta:[sessionStateText(session.state),...(session.when?[session.when]:[])].join(' · ')})),run('resume','panel.home.allSessions')]),
      ...under('panel.home.organize',[run('tasks','panel.tasks.title'),run('notes','panel.notes.title'),run('automations','panel.home.automations')])]})};
}
function homeStep(step:PanelStep,next:SheetState):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;if(effect.kind!=='enter')return{sheet:next,action:null};
  const id=effect.item.id??'';
  if(id.startsWith('resume:'))return{sheet:null,action:{kind:'resume',id:id.slice(7)}};
  return{sheet:null,action:id.startsWith('run:')?{kind:'runCommand',name:id.slice(4)}:null};
}

export function sheetStep(sheet:SheetState,step:PanelStep):{sheet:SheetState|null;action:SheetAction|null}{
  const effect=step.effect;const next={...sheet,panel:step.panel};
  if(effect.kind==='close'&&sheet.name==='ruleScope')return{sheet:sheet.context?.back??null,action:null};
  if(effect.kind==='close'&&sheet.name==='context'&&sheet.context?.contextPage?.asking)return contextStep(sheet,step,next);
  if(effect.kind==='close')return{sheet:null,action:null};
  if(sheet.name==='shelf')return shelfStep(sheet,step,next);
  if(sheet.name==='usage')return usageStep(sheet,step,next);
  if(sheet.name==='board')return boardStep(sheet,step,next);
  if(sheet.name==='capability')return capabilityStep(sheet,step,next);
  if(sheet.name==='automations')return automationsStep(sheet,step,next);
  if(sheet.name==='forge')return forgeStep(sheet,step,next);
  if(sheet.name==='research')return researchStep(sheet,step,next);
  if(sheet.name==='projects')return projectsStep(sheet,step,next);
  if(sheet.name==='doctor')return doctorStep(step,next);
  if(sheet.name==='devices')return devicesStep(sheet,step,next);
  if(sheet.name==='processes')return processesStep(sheet,step,next);
  if(sheet.name==='context')return contextStep(sheet,step,next);
  if(sheet.name==='home')return homeStep(step,next);
  if(sheet.name==='leave'&&effect.kind==='enter')return{sheet:null,action:effect.item.id==='stop'?{kind:'openFolder',path:sheet.context?.text??'',confirmed:true}:null};
  if(sheet.name==='permissions')return permissionsStep(sheet,step,next);
  if(sheet.name==='memory')return memoryStep(sheet,step,next);
  if(sheet.name==='library')return libraryStep(sheet,step,next);
  if(sheet.name==='ruleScope')return ruleScopeStep(sheet,step,next);
  if(sheet.name==='resume')return resumeStep(sheet,step,next);
  if(sheet.name==='export')return exportStep(step,next);
  if(sheet.name==='undo')return undoStep(sheet,step,next);
  if(sheet.name==='model')return modelStep(sheet,step);
  if(sheet.name==='provider')return providerStep(sheet,step,next);
  if(sheet.name==='setup')return setupStep(sheet,step);
  if(sheet.name==='settings')return settingsStep(sheet,step);
  if(sheet.name==='fork'&&effect.kind==='enter'){const index=Number(effect.item.id);const turn=sheet.context?.turns?.[index];return turn?{sheet:null,action:{kind:'forkHere',beforeRun:index?turn.runId:null,text:turn.text}}:{sheet:next,action:null};}
  if(sheet.name==='busy'&&effect.kind==='enter'){const mode=BUSY_MODES[effect.index]!;return{sheet:null,action:{kind:'busy',mode,notice:t('panel.busy.done',{choice:effect.item.label.toLowerCase()})}};}
  if(sheet.name==='queue')return queueStep(sheet,step,next);
  if(sheet.name==='diff')return diffStep(sheet,step,next);
  if(sheet.name==='tasks')return tasksStep(sheet,step,next);
  if(sheet.name==='notes')return notesStep(sheet,step,next);
  if(sheet.name==='help'&&effect.kind==='enter'&&effect.item.id)return{sheet:null,action:{kind:'runCommand',name:effect.item.id}};
  if(sheet.name==='copy'&&effect.kind==='enter'){const body=sheet.context?.bodies?.[Number(effect.item.id)];return body===undefined?{sheet:next,action:null}:{sheet:null,action:{kind:'copy',text:body,notice:t('panel.copy.done',{what:effect.item.label.toLowerCase(),lines:effect.item.meta??''})}};}
  if(sheet.name==='clear'&&effect.kind==='enter')return{sheet:null,action:effect.index===0?{kind:'clearScreen'}:effect.index===1?{kind:'newConversation'}:null};
  if(sheet.name==='plan'&&effect.kind==='enter'){const on=effect.index===0;return{sheet:null,action:{kind:'plan',on,notice:t(on?'panel.plan.on':'panel.plan.off')}};}
  if(sheet.name==='retry'&&effect.kind==='enter'){const text=sheet.context?.text??'';return{sheet:null,action:effect.index===2?null:{kind:'retry',edit:effect.index===1,text}};}
  if(sheet.name==='rename'&&effect.kind==='submit'){
    const body=step.panel.tabs[0]!.body;const name=body.kind==='form'?String(body.fields[0]!.value).trim():'';
    return name?{sheet:null,action:{kind:'rename',name,notice:t('panel.rename.done',{name})}}:{sheet:next,action:null};
  }
  if(sheet.name==='effort'&&effect.kind==='submit'){
    const body=step.panel.tabs[0]!.body;const level=body.kind==='form'?String(body.fields[0]!.value):'';
    return{sheet:null,action:{kind:'effort',level,notice:t('panel.effort.done',{level})}};
  }
  if(sheet.name==='history'&&(effect.kind==='enter'||(effect.kind==='key'&&effect.key==='c'))&&effect.item){
    const draft=sheet.context?.drafts?.[Number(effect.item.id)];if(!draft)return{sheet:next,action:null};
    return effect.kind==='enter'?{sheet:null,action:{kind:'history',draft}}:{sheet:next,action:{kind:'copy',text:draft.text,notice:t('panel.history.copied')}};
  }
  return{sheet:next,action:null};
}
