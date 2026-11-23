import type {FocusContext} from './focus-manager.ts';
import {routeInput,type RoutedInput} from './input-router.ts';
import type {InkKeyLike,Keybinding} from './keybindings.ts';

export type ShellBootGate={phase:string;runtimeReady:boolean;skipped:boolean};
export type ShellInputDecision={
  skipBoot:boolean;
  closeTrustCenter:boolean;
  approvalScrollDelta:number|null;
  routed:RoutedInput|null;
};

/*
 * R4 Q-R4-4 (owner, 2026-09-24): a key pressed while the boot is on screen.
 * - Space, Enter and Esc only skip: the person asked for the composer, not for a space, a send or an interrupt. Measured before
 *   R4: the key that skipped the boot was also typed into the composer (`│> x`, gate §0.5).
 * - A printable key skips AND stays as type-ahead, also before the runtime is ready (Codex keeps startup drafts, openai/codex
 *   #46750, 2026-09-20). Once the boot is skipped and TALOS still waits for the runtime, a space is part of what is typed.
 * - Ctrl+C and Ctrl+D always reach the exit rule (interrupt.ts): the way out is never blocked by the boot.
 * - Any other key skips; it is routed only once the runtime is ready, as before R4 (an action before the runtime exists had
 *   nothing to act on). Enter while waiting sends nothing.
 */
const CONTROL=/^[\x00-\x1f\x7f]/u;
function printable(ch:string,key:InkKeyLike):boolean{
  if(typeof ch!=='string'||ch.length===0||CONTROL.test(ch))return false;
  return!key.ctrl&&!key.meta&&!key.return&&!key.escape&&!key.tab&&!key.backspace&&!key.delete
    &&!key.upArrow&&!key.downArrow&&!key.leftArrow&&!key.rightArrow&&!key.pageUp&&!key.pageup&&!key.pageDown&&!key.pagedown&&!key.home&&!key.end;
}

export function decideShellInput(input:{
  ch:string;
  key:InkKeyLike;
  focus:FocusContext;
  composerText:string;
  commandMenuOpen:boolean;
  trustCenterOpen:boolean;
  approvalExpanded:boolean;
  boot:ShellBootGate;
  keymap?:ReadonlyArray<Keybinding>|undefined;
}):ShellInputDecision{
  const {ch,key,focus,composerText,commandMenuOpen,trustCenterOpen,approvalExpanded,boot,keymap}=input;
  const base={skipBoot:false,closeTrustCenter:false,approvalScrollDelta:null,routed:null} satisfies ShellInputDecision;
  if(trustCenterOpen)return{...base,closeTrustCenter:Boolean(key.escape||key.return||ch.toLowerCase()==='q')};
  if(focus==='approval'&&approvalExpanded&&(key.pageUp||key.pageup||key.pageDown||key.pagedown||key.upArrow||key.downArrow)){
    const delta=(key.pageDown||key.pagedown)?4:(key.pageUp||key.pageup)?-4:key.downArrow?1:-1;
    return{...base,approvalScrollDelta:delta};
  }
  const lower=typeof ch==='string'?ch.toLowerCase():'';
  const exitKey=Boolean(key.ctrl&&(lower==='c'||lower==='d'));
  const onlySkips=!boot.skipped&&Boolean(key.return||key.escape||ch===' ');
  const bootActive=boot.phase!=='ready'&&boot.phase!=='error';
  const skipBoot=bootActive&&!boot.skipped;
  const forwarded=!bootActive||exitKey||(!onlySkips&&(printable(ch,key)||boot.runtimeReady));
  return{...base,skipBoot,routed:forwarded?routeInput({ch,key,focus,composerText,commandMenuOpen,keymap}):null};
}
