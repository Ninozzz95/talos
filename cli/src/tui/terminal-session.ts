import type {TerminalCapabilities} from './terminal-capabilities.ts';

export type TerminalSessionMode='full'|'mono'|'plain';
export type TerminalFallbackReason='non-interactive'|'term-dumb'|'alternate-screen-unavailable'|null;
export type TerminalSessionPlan={
  mode:TerminalSessionMode;
  alternateScreen:boolean;
  paintBackground:boolean;
  fallbackReason:TerminalFallbackReason;
};

export function createTerminalSessionPlan({
  capabilities,env,supportsAlternateScreen=true,
}:{
  capabilities:TerminalCapabilities;
  env:Record<string,string|undefined>;
  supportsAlternateScreen?:boolean;
}):TerminalSessionPlan{
  if(!capabilities.interactive)return{mode:'plain',alternateScreen:false,paintBackground:false,fallbackReason:'non-interactive'};
  if(env.TERM==='dumb')return{mode:'plain',alternateScreen:false,paintBackground:false,fallbackReason:'term-dumb'};
  if(!supportsAlternateScreen)return{mode:'plain',alternateScreen:false,paintBackground:false,fallbackReason:'alternate-screen-unavailable'};
  if(!capabilities.color)return{mode:'mono',alternateScreen:true,paintBackground:false,fallbackReason:null};
  return{mode:'full',alternateScreen:true,paintBackground:true,fallbackReason:null};
}
