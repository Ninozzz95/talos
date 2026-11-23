/*
 * F-ENG-2 (stress-test smoke of rc.1, 08/10/2026; owner: «Fermarli e dirlo nel risultato»). A command the model sent to the
 * background kept `talos -p` from ever exiting: its live child held Node's event loop. Claude Code has the same defect (issue
 * 61416, `claude -p` with run_in_background); Codex terminates its background terminals at Shutdown (core/src/session/
 * handlers.rs) and Hermes kills a session's processes at agent close (tools/process_registry.py `kill_all`). Here the end of a
 * headless run stops them (runtime `stopBackgroundCommands`) and says which, with each output file, in a warning BEFORE the
 * terminal event and in the result (`backgroundStopped`). A stop reaches the Windows process tree; inside WSL the Linux process
 * may survive (taskkill /T stops wsl.exe), and the warning says so.
 */
import {tn,t} from '../i18n/index.ts';
import {BACKGROUND_STOP_WAIT_MS,type BackgroundStop,type CliRuntime} from '../runtime/types.ts';

export const BACKGROUND_COMMANDS_STOPPED='BACKGROUND_COMMANDS_STOPPED';

/** Stops what the sessions left in the background; never throws and never waits past its bound (a run must always end). */
export async function stopBackgroundCommands(runtime:CliRuntime,sessionIds:readonly string[],waitMs=BACKGROUND_STOP_WAIT_MS):Promise<BackgroundStop[]>{
  if(typeof runtime.stopBackgroundCommands!=='function')return[];
  let timer:NodeJS.Timeout|undefined;
  const bound=new Promise<BackgroundStop[]>(done=>{timer=setTimeout(()=>done([]),waitMs+1_000);timer.unref();});
  try{return await Promise.race([runtime.stopBackgroundCommands(sessionIds,{waitMs}).then(stops=>Array.isArray(stops)?stops:[],()=>[]),bound]);}
  finally{clearTimeout(timer);}
}

export function backgroundStopNotice(stops:readonly BackgroundStop[],waitMs=BACKGROUND_STOP_WAIT_MS):string{
  const seconds=Math.round(waitMs/100)/10;
  const list=stops.map(stop=>t(stop.exited?'common.background.exited':'common.background.notExited',{command:stop.command??t('common.background.noCommand'),file:stop.outputFile??t('common.background.noFile'),seconds})).join('; ');
  return`${tn('common.background.stopped',stops.length,{list})} ${t('common.background.wsl')}`;
}

/** What the warning carries for the result: the stops themselves, kept apart from the words. */
export function backgroundStopsOf(data:Record<string,unknown>|undefined):BackgroundStop[]{
  return data?.code===BACKGROUND_COMMANDS_STOPPED&&Array.isArray(data.stops)?data.stops as BackgroundStop[]:[];
}
