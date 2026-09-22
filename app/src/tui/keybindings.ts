import type {PermissionMode} from '../security/types.ts';
export type KeybindingContext='global'|'composer'|'command-menu'|'transcript'|'approval'|'model-picker'|'provider-picker'|'session-picker'|'help'|'history';
export type Keybinding={id:string;keys:string[];context:KeybindingContext;description:string};
export type InkKeyLike={ctrl?:boolean;meta?:boolean;shift?:boolean;tab?:boolean;return?:boolean;escape?:boolean;backspace?:boolean;delete?:boolean;home?:boolean;end?:boolean;leftArrow?:boolean;rightArrow?:boolean;upArrow?:boolean;downArrow?:boolean;pageUp?:boolean;pageup?:boolean;pageDown?:boolean;pagedown?:boolean};

const PICKER_CONTEXTS=['model-picker','provider-picker','session-picker'] as const;
const PICKER_KEYS=[
 ['picker-up',['Up']],['picker-down',['Down']],['picker-page-up',['PageUp']],['picker-page-down',['PageDown']],['picker-home',['Home']],['picker-end',['End']],['picker-confirm',['Enter']],['picker-cancel',['Esc']],['picker-backspace',['Backspace']]
] as const;
const pickerBindings:Keybinding[]=PICKER_CONTEXTS.flatMap(context=>PICKER_KEYS.map(([id,keys])=>({id,keys:[...keys],context,description:id.replaceAll('-',' ')})));
const commandBindings:Keybinding[]=PICKER_KEYS.map(([id,keys])=>({id,keys:[...keys],context:'command-menu',description:id.replaceAll('-',' ')}));
commandBindings.push({id:'command-complete',keys:['Tab'],context:'command-menu',description:'Complete command'});

export const KEYBINDINGS:ReadonlyArray<Keybinding>=Object.freeze([
 {id:'submit',keys:['Enter'],context:'composer',description:'Send prompt'},
 {id:'newline',keys:['Shift+Enter','Ctrl+J'],context:'composer',description:'Insert newline'},
 {id:'interrupt',keys:['Ctrl+C','Esc'],context:'global',description:'Cancel active run'},
 {id:'exit',keys:['Ctrl+D','Ctrl+C Ctrl+C'],context:'global',description:'Exit when idle'},
 {id:'undo',keys:['Ctrl+Z','Alt+Z'],context:'composer',description:'Undo editor change'},
 {id:'redo',keys:['Ctrl+Shift+Z','Alt+Shift+Z','Alt+/'],context:'composer',description:'Redo editor change'},
 {id:'vim-toggle',keys:['Alt+V'],context:'composer',description:'Toggle Vim input (NORMAL h/j/k/l b/w 0/$ x u Ctrl+R i/a/I/A; INSERT Esc)'},
 {id:'steer',keys:['Alt+S'],context:'composer',description:'Steer active run at next safe boundary'},
 {id:'agent-tree',keys:['Alt+A'],context:'composer',description:'Inspect native agent tree'},
 {id:'left',keys:['Left','Ctrl+B'],context:'composer',description:'Move cursor left'},
 {id:'right',keys:['Right','Ctrl+F'],context:'composer',description:'Move cursor right'},
 {id:'home',keys:['Home','Ctrl+A'],context:'composer',description:'Move to line start'},
 {id:'end',keys:['End','Ctrl+E'],context:'composer',description:'Move to line end'},
 {id:'word-left',keys:['Alt+B'],context:'composer',description:'Move back one word'},
 {id:'word-right',keys:['Alt+F'],context:'composer',description:'Move forward one word'},
 {id:'select-left',keys:['Shift+Left'],context:'composer',description:'Extend selection left'},
 {id:'select-right',keys:['Shift+Right'],context:'composer',description:'Extend selection right'},
 {id:'select-home',keys:['Shift+Home'],context:'composer',description:'Extend selection to line start'},
 {id:'select-end',keys:['Shift+End'],context:'composer',description:'Extend selection to line end'},
 {id:'select-up',keys:['Shift+Up'],context:'composer',description:'Extend selection up'},
 {id:'select-down',keys:['Shift+Down'],context:'composer',description:'Extend selection down'},
 {id:'select-word-left',keys:['Alt+Shift+B'],context:'composer',description:'Extend selection back one word'},
 {id:'select-word-right',keys:['Alt+Shift+F'],context:'composer',description:'Extend selection forward one word'},
 {id:'copy-selection',keys:['Alt+W'],context:'composer',description:'Copy selection to yank buffer'},
 {id:'backspace',keys:['Backspace'],context:'composer',description:'Delete before cursor'},
 {id:'delete-forward',keys:['Delete','Ctrl+D'],context:'composer',description:'Delete at cursor'},
 {id:'kill-start',keys:['Ctrl+U'],context:'composer',description:'Cut to line start'},
 {id:'kill-end',keys:['Ctrl+K'],context:'composer',description:'Cut to line end'},
 {id:'kill-word',keys:['Ctrl+W'],context:'composer',description:'Cut previous word or selection'},
 {id:'yank',keys:['Ctrl+Y'],context:'composer',description:'Paste killed text'},
 {id:'history-prev',keys:['Up','Ctrl+P'],context:'history',description:'Previous prompt'},
 {id:'history-next',keys:['Down','Ctrl+N'],context:'history',description:'Next prompt'},
 {id:'history-search',keys:['Ctrl+R'],context:'history',description:'Search prompt history'},
 {id:'palette',keys:['Tab'],context:'composer',description:'Complete slash command'},
 {id:'transcript-search',keys:['Alt+T'],context:'transcript',description:'Search transcript'},
 {id:'transcript-raw',keys:['Alt+R'],context:'transcript',description:'Toggle sanitized raw transcript'},
 {id:'transcript-copy',keys:['Alt+C'],context:'transcript',description:'Copy selected transcript item'},
 {id:'page-up',keys:['PageUp'],context:'transcript',description:'Scroll transcript up'},
 {id:'page-down',keys:['PageDown'],context:'transcript',description:'Scroll transcript down'},
 {id:'redraw',keys:[],context:'global',description:'Redraw terminal with /redraw'},
 {id:'permission-cycle',keys:['Shift+Tab','Alt+M'],context:'global',description:'Cycle safe permission modes'},
 {id:'model-picker',keys:['Ctrl+L'],context:'composer',description:'Open model picker'},
 {id:'provider-picker',keys:['Alt+P'],context:'composer',description:'Open provider picker'},
 {id:'reasoning-toggle',keys:['Ctrl+T'],context:'global',description:'Toggle reasoning visibility'},
 {id:'external-editor',keys:['Ctrl+G'],context:'composer',description:'Open configured external editor'},
 {id:'tool-details',keys:['Ctrl+O'],context:'global',description:'Toggle tool details'},
 {id:'approval-once',keys:['1'],context:'approval',description:'Allow once'},
 {id:'approval-session',keys:['2'],context:'approval',description:'Allow for session'},
 {id:'approval-always',keys:['3'],context:'approval',description:'Always allow matching operation'},
 {id:'approval-deny-once',keys:['4'],context:'approval',description:'Deny once'},
 {id:'approval-deny-always',keys:['5'],context:'approval',description:'Always deny matching operation'},
 {id:'approval-cancel',keys:['Esc','Ctrl+C'],context:'approval',description:'Deny current approval'},
 {id:'approval-view',keys:['v'],context:'approval',description:'Review full approval payload'},
 {id:'overlay-close',keys:['Esc','Enter','?'],context:'help',description:'Close help'},
 {id:'help',keys:['?'],context:'composer',description:'Show keyboard help'},
 ...pickerBindings,
 ...commandBindings,
]);

export function keybindingHelp(bindings:ReadonlyArray<Keybinding>=KEYBINDINGS){return bindings.filter(x=>x.keys.length>0).map(x=>x.keys.join(' / ')+' — '+x.description).join('\n');}
export function cyclePermissionMode(mode:PermissionMode):PermissionMode{return mode==='default'?'acceptEdits':mode==='acceptEdits'?'plan':'default';}

export function inkKeyChord(ch:string,key:InkKeyLike):string|null{
 if(key.shift&&key.tab)return'Shift+Tab';
 if(key.shift&&key.return)return'Shift+Enter';
 if(key.shift&&(key.pageUp||key.pageup))return'Shift+PageUp';if(key.shift&&(key.pageDown||key.pagedown))return'Shift+PageDown';
 if(key.shift&&key.home)return'Shift+Home';if(key.shift&&key.end)return'Shift+End';if(key.shift&&key.leftArrow)return'Shift+Left';if(key.shift&&key.rightArrow)return'Shift+Right';if(key.shift&&key.upArrow)return'Shift+Up';if(key.shift&&key.downArrow)return'Shift+Down';
 if(key.ctrl&&key.shift&&ch)return'Ctrl+Shift+'+ch.toUpperCase();
 if(key.meta&&key.shift&&ch)return'Alt+Shift+'+ch.toUpperCase();
 if(key.ctrl&&ch)return'Ctrl+'+ch.toUpperCase();
 if(key.meta&&ch)return'Alt+'+ch.toUpperCase();
 if(key.pageUp||key.pageup)return'PageUp';if(key.pageDown||key.pagedown)return'PageDown';
 if(key.home)return'Home';if(key.end)return'End';if(key.leftArrow)return'Left';if(key.rightArrow)return'Right';if(key.upArrow)return'Up';if(key.downArrow)return'Down';
 if(key.return)return'Enter';if(key.tab)return'Tab';if(key.escape)return'Esc';if(key.backspace)return'Backspace';if(key.delete)return'Delete';
 return ch.length===1?ch:null;
}
export function resolveKeybinding(ch:string,key:InkKeyLike,contexts:readonly KeybindingContext[],bindings:ReadonlyArray<Keybinding>=KEYBINDINGS):string|null{const chord=inkKeyChord(ch,key);if(!chord)return null;for(const context of contexts){const binding=bindings.find(row=>row.context===context&&row.keys.includes(chord));if(binding)return binding.id;}return null;}
