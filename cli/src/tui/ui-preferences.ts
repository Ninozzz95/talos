/*
 * R5a lane S — the two screen choices a person makes with a key or a command and TALOS remembers (owner decisions Q-R5-7
 * `ui.busyInput` and Q-R5-9 `ui.reasoning`; config keys frozen by the R5a skeleton `6a8149bc4`, defaults and validation
 * are lane R's in config/load.ts). They are written through the existing writer, in the user scope, so the choice follows
 * the person into every project (the brief: `writeConfigScope`, scope `user`). Reading takes the effective value, so a
 * project-user file may still override it.
 */
import type {CliPaths} from '../paths.ts';
import {loadEffectiveConfig,writeConfigScope} from '../config/load.ts';
import type {UiBusyInput,UiReasoning,UiTheme} from '../config/types.ts';
import {DEFAULT_BUSY_INPUT,parseBusyInput} from './busy-input.ts';

export type UiPreferences={busyInput:UiBusyInput;reasoning:UiReasoning};
export const DEFAULT_UI_PREFERENCES:UiPreferences=Object.freeze({busyInput:DEFAULT_BUSY_INPUT,reasoning:'collapsed'});
export function parseReasoning(value:unknown):UiReasoning|null{return value==='collapsed'||value==='visible'||value==='hidden'?value:null;}

/** The effective choices; a configuration that cannot be read gives the defaults (a screen choice never blocks the TUI). */
export async function loadUiPreferences({paths,projectRoot}:{paths:CliPaths;projectRoot:string}):Promise<UiPreferences>{
  try{
    const ui=(await loadEffectiveConfig({paths,projectRoot})).value.ui;
    return{busyInput:parseBusyInput(ui?.busyInput)??DEFAULT_UI_PREFERENCES.busyInput,reasoning:parseReasoning(ui?.reasoning)??DEFAULT_UI_PREFERENCES.reasoning};
  }catch{return{...DEFAULT_UI_PREFERENCES};}
}
/* R5a (owner 2026-09-24, as Hermes's `onboarding.seen.busy_input_prompt`): the busy tip is shown once per install. */
export async function loadBusyTipSeen({paths,projectRoot}:{paths:CliPaths;projectRoot:string}):Promise<boolean>{
  try{return (await loadEffectiveConfig({paths,projectRoot})).value.ui?.busyTipSeen===true;}catch{return false;}
}
/** Remember one choice in the user configuration. Throws what the writer throws; the caller says it was not saved. */
export async function saveUiPreference({paths,projectRoot,patch}:{paths:CliPaths;projectRoot:string;patch:Partial<UiPreferences>&{busyTipSeen?:boolean;theme?:UiTheme}}):Promise<void>{
  const ui:{busyInput?:UiBusyInput;reasoning?:UiReasoning;busyTipSeen?:boolean;theme?:UiTheme}={};
  if(patch.theme)ui.theme=patch.theme;
  if(patch.busyInput)ui.busyInput=patch.busyInput;
  if(patch.reasoning)ui.reasoning=patch.reasoning;
  if(patch.busyTipSeen===true)ui.busyTipSeen=true;
  await writeConfigScope({paths,projectRoot,scope:'user',patch:{ui}});
}

/*
 * The app's side (E-05: app.ts only wires): the busy-input mode as React state with a ref for the key handlers, the one
 * read of the remembered choices when main.ts did not pass them (a choice the person makes meanwhile wins), the writes,
 * and the one-time busy tip. `applyReasoning` shows or hides the reasoning (app state); `onSaveError` reports a write that
 * failed (the choice still holds for this session).
 */
export function useUiPreferences(React:any,{paths,projectRoot,given,applyReasoning,onSaveError}:{paths:CliPaths;projectRoot:string;given:Partial<UiPreferences>;applyReasoning:(mode:UiReasoning)=>void;onSaveError:(error:unknown)=>void}){
  const [busyInput,setBusyInputState]=React.useState(given.busyInput??DEFAULT_UI_PREFERENCES.busyInput) as [UiBusyInput,(mode:UiBusyInput)=>void];
  const ref:{current:{busyInput:UiBusyInput;touchedBusy:boolean;touchedReasoning:boolean;tipShown:boolean;onSaveError:(error:unknown)=>void}}=React.useRef({busyInput,touchedBusy:false,touchedReasoning:false,tipShown:false,onSaveError});
  ref.current.busyInput=busyInput;ref.current.onSaveError=onSaveError;
  React.useEffect(()=>{
    if(given.busyInput&&given.reasoning)return;let alive=true;
    void loadUiPreferences({paths,projectRoot}).then(prefs=>{
      if(!alive)return;
      if(!given.busyInput&&!ref.current.touchedBusy){ref.current.busyInput=prefs.busyInput;setBusyInputState(prefs.busyInput);}
      if(!given.reasoning&&!ref.current.touchedReasoning)applyReasoning(prefs.reasoning);
    });
    return()=>{alive=false;};
  },[]);
  /* R5a: a tip seen in an earlier launch is not shown again. */
  React.useEffect(()=>{let alive=true;void loadBusyTipSeen({paths,projectRoot}).then(seen=>{if(alive&&seen)ref.current.tipShown=true;});return()=>{alive=false;};},[]);
  const remember=(patch:Partial<UiPreferences>&{busyTipSeen?:boolean})=>{void saveUiPreference({paths,projectRoot,patch}).catch(error=>ref.current.onSaveError(error));};
  return{
    busyInput,
    /** The mode now, for handlers that run outside a render (a key, a queued command). */
    currentBusyInput:()=>ref.current.busyInput,
    setBusyInput(mode:UiBusyInput){ref.current.touchedBusy=true;ref.current.busyInput=mode;setBusyInputState(mode);remember({busyInput:mode});},
    /** Ctrl+T was pressed: `visible` is the state it leads to. */
    rememberReasoning(visible:boolean){ref.current.touchedReasoning=true;remember({reasoning:visible?'visible':'collapsed'});},
    /** True the first time only, per install (the one-time busy tip, Q-R5-7; owner 2026-09-24). */
    firstBusyEnter(){if(ref.current.tipShown)return false;ref.current.tipShown=true;remember({busyTipSeen:true});return true;},
  };
}
