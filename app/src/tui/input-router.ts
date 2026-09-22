import type {FocusContext} from './focus-manager.ts';
import {resolveKeybinding,type InkKeyLike,type Keybinding,type KeybindingContext} from './keybindings.ts';

export type RoutedInput={kind:'action';action:string}|{kind:'text';text:string}|{kind:'ignore'};

const TEXT_INPUT_FOCUS=new Set<FocusContext>(['composer','command-menu','model-picker','provider-picker','session-picker']);
export function acceptsTextInput(focus:FocusContext):boolean{return TEXT_INPUT_FOCUS.has(focus);}

export function routeInput(input:{ch:string;key:InkKeyLike;focus:FocusContext;composerText:string;commandMenuOpen:boolean;keymap?:ReadonlyArray<Keybinding>|undefined}):RoutedInput{
  const {ch,key,composerText}=input;
  const focus=input.commandMenuOpen&&input.focus==='composer'?'command-menu':input.focus;
  if(focus==='composer'&&ch==='?'&&composerText.length>0)return{kind:'text',text:'?'};
  if(focus==='composer'&&ch==='/'&&composerText.trimStart().length===0)return{kind:'action',action:'command-menu'};
  const contexts=(focus==='composer'?[focus,'history','transcript','global']:[focus,'global']) as KeybindingContext[];
  const action=resolveKeybinding(ch,key,contexts,input.keymap);
  if(action)return{kind:'action',action};
  if(acceptsTextInput(focus)&&ch&&!key.ctrl&&!key.meta)return{kind:'text',text:ch};
  return{kind:'ignore'};
}
