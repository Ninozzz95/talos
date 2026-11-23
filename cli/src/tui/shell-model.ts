import {t,tn} from '../i18n/index.ts';
import type {PermissionMode,RuleSetInput} from '../security/types.ts';
import {formatModeAwareSimulation,simulatePermissionInMode,type SecretClassifier} from '../security/permission-dry-run.ts';
import type {AutoClassifier} from '../security/permission-engine.ts';
import type {TuiModel,TuiProvider} from './catalog-service.ts';
import {createEditorState,replaceRange,type EditorState} from './editor.ts';
import {permissionModeLabel} from './components/terminal-shell.ts';
import {closeFocus,createFocusState,focusForOverlay,openFocus,type FocusState} from './focus-manager.ts';
import type {OverlayState} from './overlays/overlay-host.ts';
import {filterItems} from './selection-list.ts';
import {parseSlashCommand} from './slash-commands.ts';
import {statusFactLines,type StatusFacts} from './status-view.ts';

const QUEUE_TERMINAL_UNSAFE=/[\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
export const MODEL_ID=/^[A-Za-z0-9._-]+:[A-Za-z0-9][A-Za-z0-9._/:@-]*$/u;
/* R2: sentinel values compared by identity AND shown on the status row, so they come from the dictionary once. */
export const NO_PROVIDER_MODEL=t('screen.model.noneProvider');
export const NO_MODEL=t('screen.model.noneModel');

export type TuiAppState={editor:EditorState;overlay:OverlayState;focus:FocusState;reasoningVisible:boolean;expandedTools:boolean;redrawNonce:number};
export type AppAction={type:'key-action';action:string}|{type:'close-overlay'};
export type SlashCommandIntent=
 | {kind:'open-overlay';overlay:Exclude<OverlayState,null>}
 | {kind:'key-action';action:'redraw'}
 | {kind:'select-model';id:string}
 | {kind:'session-id';action:'resume'|'fork';id:string}
 | null;
export type PickerMovement='up'|'down'|'page-up'|'page-down'|'home'|'end';

export function queuedActionPreview(value:string){
  return String(value).replace(QUEUE_TERMINAL_UNSAFE,character=>{
    if(character==='\n'||character==='\r'||character==='\t')return' ';
    const code=character.codePointAt(0)!;
    return code>0xffff?`\\u{${code.toString(16)}}`:`\\u${code.toString(16).padStart(4,'0')}`;
  }).replace(/\s{2,}/gu,' ').trim();
}

export function openOverlay(state:TuiAppState,overlay:Exclude<OverlayState,null>):TuiAppState{
  return{...state,overlay,focus:openFocus(state.focus,focusForOverlay(overlay.kind))};
}
export function createTuiAppState(editor:EditorState=createEditorState('')):TuiAppState{return{editor,overlay:null,focus:createFocusState('composer'),reasoningVisible:false,expandedTools:false,redrawNonce:0};}
export function closeOverlay(state:TuiAppState):TuiAppState{return{...state,overlay:null,focus:closeFocus(state.focus)};}
export function reduceAppAction(state:TuiAppState,action:AppAction):TuiAppState{
  if(action.type==='close-overlay')return closeOverlay(state);
  if(action.action==='model-picker')return openOverlay(state,{kind:'model'});
  if(action.action==='provider-picker')return openOverlay(state,{kind:'provider'});
  if(action.action==='help')return openOverlay(state,{kind:'help'});
  if(action.action==='reasoning-toggle')return{...state,reasoningVisible:!state.reasoningVisible};
  if(action.action==='tool-details')return{...state,expandedTools:!state.expandedTools};
  if(action.action==='redraw')return{...state,redrawNonce:state.redrawNonce+1};
  if(action.action==='overlay-close'||action.action==='picker-cancel')return closeOverlay(state);
  return state;
}

export function slashCommandIntent(text:string):SlashCommandIntent{
  const parsed=parseSlashCommand(text);
  if(parsed.name==='model')return parsed.args[0]?{kind:'select-model',id:parsed.args[0]}:{kind:'open-overlay',overlay:{kind:'model'}};
  if(parsed.name==='help')return{kind:'open-overlay',overlay:{kind:'help'}};
  if(parsed.name==='provider')return{kind:'open-overlay',overlay:{kind:'provider'}};
  if(parsed.name==='resume'||parsed.name==='fork')return parsed.args[0]?{kind:'session-id',action:parsed.name,id:parsed.args[0]}:{kind:'open-overlay',overlay:{kind:'session',action:parsed.name}};
  if(parsed.name==='redraw')return{kind:'key-action',action:'redraw'};
  return null;
}

export function togglePlanMode(current:PermissionMode,base:PermissionMode):PermissionMode{return current==='plan'?(base==='plan'?'default':base):'plan';}
/* F-P-001: what this session would do with the command, in its current mode (permission-dry-run.ts). */
export function permissionDryRunSlash(args:string[],rules:RuleSetInput,projectRoot:string,{mode='default',classifySecret,classifier}:{mode?:PermissionMode;classifySecret?:SecretClassifier;classifier?:AutoClassifier}={}):Promise<string>|null{
  if(args[0]!=='dry-run')return null;
  const command=args.slice(1).join(' ').trim();if(!command)return Promise.resolve(t('screen.usage.permissionsDryRun'));
  return simulatePermissionInMode({rules,action:{tool:'Bash',command},projectRoot,mode,...(classifySecret?{classifySecret}:{}),...(classifier?{classifier}:{})}).then(result=>formatModeAwareSimulation(result).trimEnd());
}
const SLASH_CLI_FAMILY:Record<string,string>={mcp:'mcp',hooks:'hook',plugins:'plugin',doctor:'doctor',memory:'memory',notes:'notes',tasks:'tasks',library:'library',research:'research',automations:'automation',forge:'forge'};
export function slashCommandToCliArgs(name:string,args:string[]):string[]|null{const family=SLASH_CLI_FAMILY[name];if(!family)return null;const out=[family,...args];if(args.length===0&&name!=='doctor')out.push('list');return out;}

export function pickerMove(action:string):PickerMovement|null{
  if(action==='picker-up')return'up';if(action==='picker-down')return'down';if(action==='picker-page-up')return'page-up';if(action==='picker-page-down')return'page-down';if(action==='picker-home')return'home';if(action==='picker-end')return'end';return null;
}
export function modelItems(rows:readonly TuiModel[],query:string){return filterItems(rows.map(row=>({id:row.id,label:row.name,searchText:`${row.id} ${row.name} ${row.provider}`,group:row.provider,value:row})),query).map(item=>item.value);}
export function providerItems(rows:readonly TuiProvider[],query:string){return filterItems(rows.map(row=>({id:row.id,label:row.label,searchText:`${row.id} ${row.label} ${row.description}`,group:row.local?'local':'cloud',value:row})),query).map(item=>item.value);}
export function lastProjectToken(text:string){const match=/(?:^|\s)(@[^\s]*)$/u.exec(text);return match?.[1]??null;}
/* R4: the token is replaced in place, so a collapsed paste earlier in the draft stays collapsed and Ctrl+Z undoes it. */
export function replaceLastProjectToken(state:EditorState,token:string,value:string){const start=state.text.lastIndexOf(token);return start<0?state:replaceRange(state,start,start+token.length,value);}
/* R4 Q-R4-13: /status as a small titled block, the permission mode in words (Q-R4-12), an honest line with no session. */
/* R5b D7 (Q-R5-17): with `facts`, the R4 block is followed by the sandbox, rules, work and usage lines (status-view.ts). */
export function sessionStatusText({session,running,model,mode,tools,facts}:{session:string|null;running:boolean;model:string;mode:string;tools:number;facts?:StatusFacts}):string{
  const block=t('screen.status.block',{session:session??t('screen.status.noSession'),running:t(running?'screen.word.yes':'screen.word.no'),model,mode:t('screen.status.mode',{mode:permissionModeLabel(mode)}),tools:tn('screen.status.toolCalls',tools)});
  return facts?[block,...statusFactLines(facts)].join('\n'):block;
}
