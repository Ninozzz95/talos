import type {UiNotifications} from '../config/types.ts';
import {t} from '../i18n/index.ts';
import {sendWindowsNotification} from './windows-notifications.ts';

export const FOCUS_ON='\u001b[?1004h',FOCUS_OFF='\u001b[?1004l';
export type TerminalNotificationChannel='off'|'bell'|'windows'|'iterm'|'kitty'|'ghostty';
type Event={type:string;history?:boolean;runId?:string;[key:string]:unknown};
/* `agents(working)`: how many delegated agents work now (ASYNC step 5). */
export type TerminalNotifications={start():void;focus(focused:boolean):void;event(event:Event,hasQueued?:boolean):void;approval(id:string|null):void;agentQuestion(id:string|null):void;agents(working:number):void;dispose():void};
type WokenResult={task?:unknown;status?:unknown};
/*
 * ASYNC step 5 (owner 01/10): the turn the kernel starts with finished agents' results is notified by WHAT finished, as
 * Codex names what a notification is about (`AgentTurnComplete { response }`, approvals with their command).
 */
export function wokenTurnMessage(results:readonly WokenResult[]):string{
  if(results.length>1)return t('screen.notify.agentsFinished',{count:results.length});
  const [only]=results;const task=typeof only?.task==='string'&&only.task.trim()?only.task.trim().slice(0,80):null;
  const failed=only?.status==='failed';
  return task?t(failed?'screen.notify.agentNotFinishedNamed':'screen.notify.agentFinishedNamed',{task}):t(failed?'screen.notify.agentNotFinished':'screen.notify.agentFinished');
}
export function notificationChannel(setting:UiNotifications,env:Record<string,string|undefined>,platform:string,arch:string):TerminalNotificationChannel{
  if(setting==='off'||setting==='bell')return setting;
  if(env.SSH_CONNECTION||env.SSH_TTY||env.TMUX||env.STY)return'bell';
  if(platform==='win32'&&env.WT_SESSION&&(arch==='x64'||arch==='ia32'))return'windows';
  if(env.TERM_PROGRAM==='iTerm.app')return'iterm';
  if(env.KITTY_WINDOW_ID||env.TERM==='xterm-kitty')return'kitty';
  if(env.TERM_PROGRAM==='ghostty'||env.TERM==='xterm-ghostty')return'ghostty';
  return'bell';
}
export function notificationSequence(channel:TerminalNotificationChannel,message:string):string{
  /* Even translations cannot terminate OSC or inject another terminal command. */
  const safe=message.replace(/[\u0000-\u001f\u007f-\u009f]/gu,'').slice(0,240);
  if(channel==='iterm')return`\u001b]9;TALOS: ${safe}\u0007`;
  if(channel==='kitty')return`\u001b]99;i=talos:o=unfocused;TALOS: ${safe}\u001b\\`;
  if(channel==='ghostty')return`\u001b]777;notify;TALOS;${safe.replace(/;/gu,',')}\u0007`;
  return channel==='bell'?'\u0007':'';
}
/** Event driven, bounded state: no progress timer, transcript parsing or per-token writes. */
export function createTerminalNotifications({write,env=process.env,platform=process.platform,arch=process.arch,setting='auto',nativeNotify=sendWindowsNotification,schedule=fn=>{const timer=setTimeout(fn,100);timer.unref();return()=>clearTimeout(timer);}}:{
  write:(text:string)=>unknown;env?:Record<string,string|undefined>;platform?:string;arch?:string;setting?:UiNotifications;
  nativeNotify?:(message:string,signal:AbortSignal)=>Promise<boolean>;schedule?:(fn:()=>void)=>()=>void;
}):TerminalNotifications{
  const channel=notificationChannel(setting,env,platform,arch);
  let focused:boolean|null=null,started=false,disposed=false,running=false,runId:string|undefined,lastApproval:string|null=null,lastAgentQuestion:string|null=null,progress=-1;
  let woken:WokenResult[]|null=null;
  let cancelPending:(()=>void)|null=null,delivery:AbortController|null=null;
  const output=(text:string)=>{try{write(text);}catch{/* A closed terminal must not fail a run. */}};
  const cancel=()=>{cancelPending?.();cancelPending=null;delivery?.abort();delivery=null;};
  const setProgress=(state:number)=>{if(started&&!disposed&&state!==progress){progress=state;output(`\u001b]9;4;${state};${state===2?100:0}\u0007`);}};
  const notify=(message:string)=>{
    if(disposed||!started||focused!==false||channel==='off')return;
    delivery?.abort();const current=new AbortController();delivery=current;
    if(channel==='windows'){
      let result:Promise<boolean>;
      try{result=nativeNotify(message,current.signal);}catch{result=Promise.resolve(false);}
      void result.catch(()=>false).then(ok=>{
        if(!ok&&!disposed&&focused===false&&!current.signal.aborted)output('\u0007');
        if(delivery===current)delivery=null;
      });
    }else{output(notificationSequence(channel,message));delivery=null;}
  };
  return{
    start(){if(started||disposed)return;started=true;output(FOCUS_ON);},
    focus(value){focused=value;if(value)cancel();},
    event(event,hasQueued=false){
      if(disposed||event.history)return;
      if(event.type==='run.started'){cancel();running=true;runId=event.runId;lastApproval=null;woken=Array.isArray(event.delegation)&&event.delegation.length?event.delegation as WokenResult[]:null;setProgress(3);return;}
      if(!['run.completed','run.failed','run.cancelled'].includes(event.type)||!running)return;
      if(runId&&event.runId&&event.runId!==runId)return;
      running=false;setProgress(event.type==='run.failed'?2:0);
      const results=woken;
      if(event.type==='run.cancelled'){cancel();return;}
      if(hasQueued||focused!==false)return;
      const message=event.type==='run.failed'?t('screen.notify.failed'):results?wokenTurnMessage(results):t('screen.notify.done');
      cancelPending=schedule(()=>{cancelPending=null;notify(message);});
    },
    approval(id){if(disposed||!id||id===lastApproval)return;lastApproval=id;cancel();notify(t('screen.notify.approval'));},
    /* Stage 6b (owner 02/10): a sub-agent's question to the person, like an approval: once per question, only when not in front. */
    agentQuestion(id){if(disposed||!id||id===lastAgentQuestion)return;lastAgentQuestion=id;cancel();notify(t('screen.notify.agentQuestion'));},
    /* ASYNC step 5: delegated agents working with no turn open keep the progress indicator on; a turn owns it while open. */
    agents(working){
      if(disposed||running)return;
      /* s31 on the built CLI: with nothing working only the busy state the agents lit is cleared — a failed turn's error
         state (2) stays until the next turn. */
      if(working>0)setProgress(3);else if(progress===3)setProgress(0);
    },
    dispose(){if(disposed)return;disposed=true;cancel();if(started)output(FOCUS_OFF+'\u001b]9;4;0;0\u0007');},
  };
}
