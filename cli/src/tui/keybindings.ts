import {t} from '../i18n/index.ts';
import type {PermissionMode} from '../security/types.ts';
export type KeybindingContext='global'|'composer'|'command-menu'|'transcript'|'approval'|'model-picker'|'provider-picker'|'session-picker'|'help'|'history';
export type Keybinding={id:string;keys:string[];context:KeybindingContext;description:string};
export type InkKeyLike={ctrl?:boolean;meta?:boolean;shift?:boolean;tab?:boolean;return?:boolean;escape?:boolean;backspace?:boolean;delete?:boolean;home?:boolean;end?:boolean;leftArrow?:boolean;rightArrow?:boolean;upArrow?:boolean;downArrow?:boolean;pageUp?:boolean;pageup?:boolean;pageDown?:boolean;pagedown?:boolean};

const PICKER_CONTEXTS=['model-picker','provider-picker','session-picker'] as const;
const PICKER_KEYS=[
 ['picker-up',['Up']],['picker-down',['Down']],['picker-page-up',['PageUp']],['picker-page-down',['PageDown']],['picker-home',['Home']],['picker-end',['End']],['picker-confirm',['Enter']],['picker-cancel',['Esc']],['picker-backspace',['Backspace']]
] as const;
/* R2 (gate E1, Q-R2-10): /help shows every description, so each one is a dictionary word. The picker wording is kept
   byte-identical: docs/talos-cli/command-reference.md is generated from it and pinned by a test. */
/* R5a (owner 2026-09-24, /effort's line of nodes): ← → move like ↑ ↓ in the pickers; not in the command menu, where they
   move the caret of the typed text. */
const PICKER_SIDE_KEYS:Record<string,readonly string[]>={'picker-up':['Left'],'picker-down':['Right']};
const pickerBindings:Keybinding[]=PICKER_CONTEXTS.flatMap(context=>PICKER_KEYS.map(([id,keys])=>({id,keys:[...keys,...(PICKER_SIDE_KEYS[id]??[])],context,description:t(`screen.key.${id}`)})));
const commandBindings:Keybinding[]=PICKER_KEYS.map(([id,keys])=>({id,keys:[...keys],context:'command-menu',description:t(`screen.key.${id}`)}));
commandBindings.push({id:'command-complete',keys:['Tab'],context:'command-menu',description:t('screen.key.command-complete')});

export const KEYBINDINGS:ReadonlyArray<Keybinding>=Object.freeze([
 {id:'submit',keys:['Enter'],context:'composer',description:t('screen.key.submit')},
 {id:'newline',keys:['Shift+Enter','Ctrl+J'],context:'composer',description:t('screen.key.newline')},
 {id:'interrupt',keys:['Ctrl+C','Esc'],context:'global',description:t('screen.key.interrupt')},
 {id:'exit',keys:['Ctrl+D','Ctrl+C Ctrl+C'],context:'global',description:t('screen.key.exit')},
 /* R4 Q-R4-7 (gate E16): the draft keys are listed where /help and the command reference read them. `Esc Esc` is two
    presses (interrupt.ts decides it); a person may bind `clear-draft` to one key of their own. */
 {id:'clear-draft',keys:['Esc Esc'],context:'composer',description:t('screen.key.clear-draft')},
 {id:'undo',keys:['Ctrl+Z','Alt+Z'],context:'composer',description:t('screen.key.undo')},
 {id:'redo',keys:['Ctrl+Shift+Z','Alt+Shift+Z','Alt+/'],context:'composer',description:t('screen.key.redo')},
 {id:'vim-toggle',keys:['Alt+V'],context:'composer',description:t('screen.key.vim-toggle')},
 {id:'steer',keys:['Ctrl+Enter','Alt+S'],context:'composer',description:t('screen.key.steer')},
 {id:'agent-tree',keys:['Alt+A'],context:'composer',description:t('screen.key.agent-tree')},
 {id:'left',keys:['Left','Ctrl+B'],context:'composer',description:t('screen.key.left')},
 {id:'right',keys:['Right','Ctrl+F'],context:'composer',description:t('screen.key.right')},
 {id:'home',keys:['Home','Ctrl+A'],context:'composer',description:t('screen.key.home')},
 {id:'end',keys:['End','Ctrl+E'],context:'composer',description:t('screen.key.end')},
 {id:'word-left',keys:['Alt+B'],context:'composer',description:t('screen.key.word-left')},
 {id:'word-right',keys:['Alt+F'],context:'composer',description:t('screen.key.word-right')},
 {id:'select-left',keys:['Shift+Left'],context:'composer',description:t('screen.key.select-left')},
 {id:'select-right',keys:['Shift+Right'],context:'composer',description:t('screen.key.select-right')},
 {id:'select-home',keys:['Shift+Home'],context:'composer',description:t('screen.key.select-home')},
 {id:'select-end',keys:['Shift+End'],context:'composer',description:t('screen.key.select-end')},
 {id:'select-up',keys:['Shift+Up'],context:'composer',description:t('screen.key.select-up')},
 {id:'select-down',keys:['Shift+Down'],context:'composer',description:t('screen.key.select-down')},
 {id:'select-word-left',keys:['Alt+Shift+B'],context:'composer',description:t('screen.key.select-word-left')},
 {id:'select-word-right',keys:['Alt+Shift+F'],context:'composer',description:t('screen.key.select-word-right')},
 {id:'copy-selection',keys:['Alt+W'],context:'composer',description:t('screen.key.copy-selection')},
 {id:'backspace',keys:['Backspace'],context:'composer',description:t('screen.key.backspace')},
 {id:'delete-forward',keys:['Delete','Ctrl+D'],context:'composer',description:t('screen.key.delete-forward')},
 {id:'kill-start',keys:['Ctrl+U'],context:'composer',description:t('screen.key.kill-start')},
 {id:'kill-end',keys:['Ctrl+K'],context:'composer',description:t('screen.key.kill-end')},
 {id:'kill-word',keys:['Ctrl+W'],context:'composer',description:t('screen.key.kill-word')},
 {id:'yank',keys:['Ctrl+Y'],context:'composer',description:t('screen.key.yank')},
 {id:'history-prev',keys:['Up','Ctrl+P'],context:'history',description:t('screen.key.history-prev')},
 {id:'history-next',keys:['Down','Ctrl+N'],context:'history',description:t('screen.key.history-next')},
 {id:'history-search',keys:['Ctrl+R'],context:'history',description:t('screen.key.history-search')},
 {id:'palette',keys:['Tab'],context:'composer',description:t('screen.key.palette')},
 {id:'transcript-search',keys:['Alt+T'],context:'transcript',description:t('screen.key.transcript-search')},
 {id:'transcript-raw',keys:['Alt+R'],context:'transcript',description:t('screen.key.transcript-raw')},
 {id:'transcript-copy',keys:['Alt+C'],context:'transcript',description:t('screen.key.transcript-copy')},
 {id:'page-up',keys:['PageUp'],context:'transcript',description:t('screen.key.page-up')},
 {id:'page-down',keys:['PageDown'],context:'transcript',description:t('screen.key.page-down')},
 {id:'transcript-top',keys:['Ctrl+Home'],context:'transcript',description:t('screen.key.transcript-top')},
 {id:'transcript-bottom',keys:['Ctrl+End'],context:'transcript',description:t('screen.key.transcript-bottom')},
 /* R4 Q-R4-6: Ctrl+L redraws, keeping the conversation and the draft (Claude Code 2.1.280, 2026-09-22, gate D.4; Codex,
    Gemini, Hermes); the model picker moves to Alt+P (Claude Code `Meta+P`, keybindings.md :105) and the provider picker
    keeps /provider only. */
 {id:'redraw',keys:['Ctrl+L'],context:'global',description:t('screen.key.redraw')},
 /* FE-048: read before an open sheet, after the cards (app.ts `frameKey`) */
 {id:'view-zen',keys:['Alt+L'],context:'global',description:t('screen.key.view-zen')},
 {id:'view-bar',keys:['Alt+N'],context:'global',description:t('screen.key.view-bar')},
 {id:'view-panel',keys:['Alt+D'],context:'global',description:t('screen.key.view-panel')},
 {id:'view-centre',keys:['Alt+J'],context:'global',description:t('screen.key.view-centre')},
 {id:'view-home',keys:['Alt+H'],context:'global',description:t('screen.key.view-home')},
 {id:'view-context',keys:['Alt+X'],context:'global',description:t('screen.key.view-context')},
 {id:'view-new',keys:['Alt+O'],context:'global',description:t('screen.key.view-new')},
 {id:'view-card-1',keys:['Alt+1'],context:'global',description:t('screen.key.view-card-1')},
 {id:'view-card-2',keys:['Alt+2'],context:'global',description:t('screen.key.view-card-2')},
 {id:'permission-cycle',keys:['Shift+Tab','Alt+M'],context:'global',description:t('screen.key.permission-cycle')},
 {id:'model-picker',keys:['Alt+P'],context:'composer',description:t('screen.key.model-picker')},
 {id:'provider-picker',keys:[],context:'composer',description:t('screen.key.provider-picker')},
 {id:'reasoning-toggle',keys:['Ctrl+T'],context:'global',description:t('screen.key.reasoning-toggle')},
 {id:'external-editor',keys:['Ctrl+G'],context:'composer',description:t('screen.key.external-editor')},
 /* stage 7.12 (mockup «ctrl+o · transcript and search»; Claude Code fullscreen): Ctrl+O opens the transcript mode; a tool
    group still opens with a click, and every call on its own row is «Tool rows: one per call» in /config */
 {id:'transcript-mode',keys:['Ctrl+O'],context:'global',description:t('screen.key.transcript-mode')},
 {id:'tool-details',keys:[],context:'global',description:t('screen.key.tool-details')},
 {id:'approval-once',keys:['1'],context:'approval',description:t('screen.key.approval-once')},
 {id:'approval-session',keys:['2'],context:'approval',description:t('screen.key.approval-session')},
 {id:'approval-always',keys:['3'],context:'approval',description:t('screen.key.approval-always')},
 {id:'approval-deny-once',keys:['4'],context:'approval',description:t('screen.key.approval-deny-once')},
 {id:'approval-deny-always',keys:['5'],context:'approval',description:t('screen.key.approval-deny-always')},
 /* A5j: only on a connector's, plugin's or Tool Forge's card (approval-dialog.ts `approvalChoicesFor`); elsewhere 6 does nothing */
 {id:'approval-deny-tool',keys:['6'],context:'approval',description:t('screen.key.approval-deny-tool')},
 {id:'approval-cancel',keys:['Esc','Ctrl+C'],context:'approval',description:t('screen.key.approval-cancel')},
 {id:'approval-view',keys:['v'],context:'approval',description:t('screen.key.approval-view')},
 /* R3 gate E11, Q-R3-6: the four choices are a list with Deny highlighted; ↑/↓ move the highlight, Enter confirms it. */
 {id:'approval-up',keys:['Up'],context:'approval',description:t('screen.key.approval-up')},
 {id:'approval-down',keys:['Down'],context:'approval',description:t('screen.key.approval-down')},
 {id:'approval-confirm',keys:['Enter'],context:'approval',description:t('screen.key.approval-confirm')},
 {id:'overlay-close',keys:['Esc','Enter','?'],context:'help',description:t('screen.key.overlay-close')},
 {id:'help',keys:['?'],context:'composer',description:t('screen.key.help')},
 ...pickerBindings,
 ...commandBindings,
]);

export function keybindingHelp(bindings:ReadonlyArray<Keybinding>=KEYBINDINGS){return bindings.filter(x=>x.keys.length>0).map(x=>x.keys.join(' / ')+' — '+x.description).join('\n');}
/* Owner 27/09: Full access is reachable with Shift+Tab, after plan (it was left out, as in Claude Code without its flag);
   the footer names it and the status row leads with it while it is on. */
export function cyclePermissionMode(mode:PermissionMode):PermissionMode{return mode==='default'?'acceptEdits':mode==='acceptEdits'?'plan':mode==='plan'?'bypassPermissions':'default';}

export function inkKeyChord(ch:string,key:InkKeyLike):string|null{
 if(key.shift&&key.tab)return'Shift+Tab';
 if(key.shift&&key.return)return'Shift+Enter';
 if(key.ctrl&&key.return)return'Ctrl+Enter'; /* F-Q1: only where the terminal tells it from Enter and Ctrl+J (kitty keyboard protocol) */
 if(key.shift&&(key.pageUp||key.pageup))return'Shift+PageUp';if(key.shift&&(key.pageDown||key.pagedown))return'Shift+PageDown';
 if(key.shift&&key.home)return'Shift+Home';if(key.shift&&key.end)return'Shift+End';if(key.shift&&key.leftArrow)return'Shift+Left';if(key.shift&&key.rightArrow)return'Shift+Right';if(key.shift&&key.upArrow)return'Shift+Up';if(key.shift&&key.downArrow)return'Shift+Down';
 if(key.ctrl&&key.home)return'Ctrl+Home';if(key.ctrl&&key.end)return'Ctrl+End'; /* R1 E15: listed in /help; app.ts scrolls on them */
 if(key.ctrl&&key.shift&&ch)return'Ctrl+Shift+'+ch.toUpperCase();
 if(key.meta&&key.shift&&ch)return'Alt+Shift+'+ch.toUpperCase();
 if(key.ctrl&&ch)return'Ctrl+'+ch.toUpperCase();
 if(key.meta&&ch)return'Alt+'+ch.toUpperCase();
 if(key.pageUp||key.pageup)return'PageUp';if(key.pageDown||key.pagedown)return'PageDown';
 if(key.home)return'Home';if(key.end)return'End';if(key.leftArrow)return'Left';if(key.rightArrow)return'Right';if(key.upArrow)return'Up';if(key.downArrow)return'Down';
 if(key.return)return'Enter';if(key.tab)return'Tab';if(key.escape)return'Esc';if(key.backspace)return'Backspace';if(key.delete)return'Delete';
 return ch.length===1?ch:null;
}
/*
 * R3-KEYS (coordinator, measured in the R3 acceptance run): Ctrl+O typed in the same stdin chunk as text
 * ("\u000fKEYS glued…") reached Ink as ONE input string, so U+000F was inserted into the composer and sent to the model.
 * No C0 or DEL character may reach the editor or the model except a line break: in a mixed chunk the LEADING control
 * character acts as its key (Ctrl+<letter>, Enter, Backspace; LF is Ctrl+J, the newline key), and the rest is text in
 * which CR and CRLF become LF and every other C0/DEL character is dropped. The same text rule applies to a bracketed paste
 * (app.ts). A chunk with no control character, and a key Ink already parsed, pass unchanged.
 * Owner decision (R3 follow-up): TAB is kept. A tab reaches the model unchanged (Gemini CLI's stripUnsafeCharacters keeps
 * 0x09 so a pasted Makefile stays valid); a chunk that STARTS with a tab is text, only a lone tab is the Tab key (Ink parses
 * that one). The composer draws a tab as spaces for display only (components/composer.ts).
 */
const CONTROL=/[\x00-\x08\x0b-\x1f\x7f]/u;
export function sanitizeInputText(text:string):string{
  return text.replace(/\r\n?/gu,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/gu,'');
}
function leadingKey(code:number):{ch:string;key:InkKeyLike}|null{
  if(code===0x0d)return{ch:'\r',key:{return:true}};
  if(code===0x09)return null;/* a tab is text (owner decision, R3 follow-up), never Ctrl+I */
  if(code===0x7f||code===0x08)return{ch:'',key:{backspace:true}};
  if(code===0x0a)return{ch:'j',key:{ctrl:true}};
  if(code>=0x01&&code<=0x1a)return{ch:String.fromCharCode(code+0x60),key:{ctrl:true}};
  return null;
}
export function splitInputChunk(ch:string,key:InkKeyLike):Array<{ch:string;key:InkKeyLike}>{
  if(typeof ch!=='string'||ch.length<=1||key.ctrl||key.meta||!CONTROL.test(ch.replace(/\n/gu,'')))return[{ch,key}];
  const parts:Array<{ch:string;key:InkKeyLike}>=[];
  const lead=leadingKey(ch.charCodeAt(0));
  const rest=lead?ch.slice(1):ch;
  if(lead)parts.push(lead);
  /* Owner decision 02/10 («Regola Gemini + test», registro 12): bracketed paste is on (Ink usePaste), so this chunk was
     TYPED. One line of plain text and a single final Enter — the last letters and Enter handed over together while the
     loop was busy (the kernel loading behind the composer) — is that text and the Enter key, as in Gemini CLI. More than
     one line stays line breaks (Codex paste_burst.rs): a paste from a terminal without bracketed paste never sends itself. */
  const line=/^([^\x00-\x1f\x7f]+)\r\n?$/u.exec(rest);
  if(line){parts.push({ch:line[1]!,key:{}},{ch:'\r',key:{return:true}});return parts;}
  const text=sanitizeInputText(rest);
  if(text)parts.push({ch:text,key:{}});
  return parts;
}
export function resolveKeybinding(ch:string,key:InkKeyLike,contexts:readonly KeybindingContext[],bindings:ReadonlyArray<Keybinding>=KEYBINDINGS):string|null{const chord=inkKeyChord(ch,key);if(!chord)return null;for(const context of contexts){const binding=bindings.find(row=>row.context===context&&row.keys.includes(chord));if(binding)return binding.id;}return null;}
