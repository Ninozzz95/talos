/*
 * Stage 7.10d (mockup PANELS.setup «✓ Tools work · read a file, ran a command»; owner 03/10 «chiave + 1 token sempre, strumenti
 * a richiesta»): /setup's tools check, run only on r because it costs a real turn (~12k tokens: the instructions and the tools,
 * model-profile.ts). One throwaway session in the project, normal permissions, asked to read one file and run `pwd`; the only
 * command it may run is that one — any other approval it asks for is refused, and it changes nothing. The check passes when a
 * read and the command both completed. Whatever happens, the session is stopped if still running and deleted, so it never
 * shows in /resume. A small read-only request before relying on a model is what OpenCode's and OpenClaw's guides ask too.
 */
import type {CliRuntime} from '../runtime/types.ts';
import {createTuiEventAdapter} from './event-adapter.ts';
import {t} from '../i18n/index.ts';

export const TOOLS_CHECK_PROMPT=()=>t('panel.setup.toolsPrompt');
const READS=new Set(['leggi','elenca','cerca']);
const COMMANDS=new Set(['shell']);
export type ToolsCheck={ok:boolean;read:boolean;command:boolean;reason?:'timeout'|'failed'|'stopped';message?:string};

export async function runToolsCheck({runtime,projectRoot,model,signal,timeoutMs=120_000}:{runtime:CliRuntime;projectRoot:string;model:string;signal?:AbortSignal;timeoutMs?:number}):Promise<ToolsCheck>{
  const id=await runtime.start({projectRoot,prompt:TOOLS_CHECK_PROMPT(),model,permissionMode:'default'});
  const adapter=createTuiEventAdapter();adapter.bindSession(id);
  const names=new Map<string,string>();let read=false,command=false,ended=false;
  let finish:(result:ToolsCheck)=>void=()=>{};
  const done=new Promise<ToolsCheck>(resolve=>{finish=result=>{if(ended)return;ended=true;resolve(result);};});
  const result=(extra:Partial<ToolsCheck>={}):ToolsCheck=>({ok:read&&command&&!extra.reason,read,command,...extra});
  const unsubscribe=runtime.subscribe(id,raw=>{
    for(const event of adapter.translateAll(raw)){
      if(event.type==='tool.started')names.set(event.toolCallId,event.toolName);
      else if(event.type==='tool.completed'){
        const name=names.get(event.toolCallId)??'';const completed=(event.result as any)?.status==='completed'||event.outcome?.status==='completed';
        if(completed&&READS.has(name))read=true;
        if(completed&&COMMANDS.has(name))command=true;
      }else if(event.type==='approval.required'){
        const payload=event.payload as Record<string,unknown>;const asked=String(payload.comando??payload.command??'').trim();
        /* the one command this check runs; anything else is refused, so the check can never change the project */
        void runtime.answerApproval(id,event.requestId,asked==='pwd',asked==='pwd'?undefined:t('panel.setup.toolsRefusal')).catch(()=>{});
      }else if(event.type==='run.completed')finish(result());
      else if(event.type==='run.failed')finish(result({reason:'failed',message:event.message}));
    }
  });
  const timer=setTimeout(()=>finish(result({reason:'timeout'})),timeoutMs);
  const stop=()=>finish(result({reason:'stopped'}));signal?.addEventListener('abort',stop,{once:true});
  try{return await done;}
  finally{
    clearTimeout(timer);signal?.removeEventListener('abort',stop);unsubscribe();
    await runtime.cancel(id,{by:'system'}).catch(()=>{});
    await runtime.deleteSession?.(id).catch(()=>{});
  }
}
