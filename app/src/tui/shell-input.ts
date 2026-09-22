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
  const bootActive=boot.phase!=='ready'&&boot.phase!=='error';
  const skipBoot=bootActive&&!boot.skipped;
  if(bootActive&&!boot.runtimeReady)return{...base,skipBoot};
  return{...base,skipBoot,routed:routeInput({ch,key,focus,composerText,commandMenuOpen,keymap})};
}
