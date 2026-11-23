/*
 * 0.6.15: the TUI window's remote bridge, as main.ts builds it. Only the interactive screen gets one (never `-p`). It starts at once
 * — remote off costs one settings read — and when remote control is on it hosts with the window's own composed runtime (the same
 * session registry the screen shows), which arrives when the deferred context is ready.
 * T3b (owner 26/10/2026, «la proposta completa»): with remote control on, every window opens its local channel and answers the
 * host with its own in-process HTTP handler, its own registry and the kernel's replayed stream; the host federates them
 * (federation.ts): a conversation another window has on screen, or holds the lease of, runs THERE, under that window's rules.
 */
import {basename,join} from 'node:path';
import {createFederation} from './federation.ts';
import {createInProcessCall,createWindowDeviceFolders,remotePcName} from './host.ts';
import {createTuiRemote,type TuiRemote} from './tui-remote.ts';
import {openWindowChannel} from './window-channel.ts';

export function windowRemote(input:{dataRoot:string;projectRoot:string;repoRoot:string;composed:Promise<any>;sessionsRoot?:string}):TuiRemote{
  const label=basename(input.projectRoot)||input.projectRoot;
  const sessionsRoot=input.sessionsRoot??join(input.dataRoot,'sessions');
  let ownChannelId='';
  /* the window's own handler, built once (the kernel's http-app: ~350 ms, paid only when remote control is on) */
  let own:Promise<Awaited<ReturnType<typeof createInProcessCall>>>|null=null;
  const httpDepsFor=async(context:any)=>{const {cliHttpDeps}=await import('./http-deps.ts');return cliHttpDeps({repoRoot:input.repoRoot,context,sessionsRoot,dataRoot:input.dataRoot});};
  const ownCall=async()=>{
    own??=(async()=>{
      const context=await input.composed;
      /* blocked folders step B: when this window does not host, its own consent gate reads the profile's files (host.ts) */
      const cartelleDispositiviFn=createWindowDeviceFolders({repoRoot:input.repoRoot,dataRoot:input.dataRoot,registry:context.registry});
      await cartelleDispositiviFn.ready;
      return createInProcessCall({repoRoot:input.repoRoot,registry:context.registry,chatImageStore:context.chatImageStore,httpDeps:await httpDepsFor(context),cartelleDispositiviFn});
    })();
    return own;
  };
  const remote:TuiRemote=createTuiRemote({
    dataRoot:input.dataRoot,
    label,
    openChannel:async({elevated})=>{
      const context=await input.composed;
      const handler=await ownCall();
      const channel=await openWindowChannel({dataRoot:input.dataRoot,label,elevated,handlers:{
        attached:()=>remote.attached(),
        call:(request)=>handler.call(request),
        /* review R1: the folder the host checks the device's consent against, from this window's own registry */
        folderOf:async(sessionId)=>{try{return await context.registry?.cartellaPerChatFile?.(sessionId)??null;}catch{return null;}},
        /* T4: `talos remote` in a terminal uses this window's coordinator when this window hosts (coordinator-service.ts) */
        coordinator:(request,connection)=>remote.serveCoordinator(request,connection),
        subscribe:(sessionId,from,onEvent)=>{
          try{return handler.subscribeWithReplay({sessionRegistry:context.registry,sessionId,daSequenza:from,manda:onEvent})??(()=>{});}
          catch{return()=>{};}
        },
      }});
      ownChannelId=channel.identity.id;
      return{close:async()=>{ownChannelId='';await channel.close();}};
    },
    createHost:async()=>{
      const context=await input.composed;
      if(!context?.remoteKeyring)throw Object.assign(new Error('REMOTE_KEYRING_MISSING'),{code:'REMOTE_KEYRING_MISSING'});
      const {createRemoteHost}=await import('./host.ts');
      const httpDeps=await httpDepsFor(context);
      return createRemoteHost({repoRoot:input.repoRoot,dataRoot:input.dataRoot,registry:context.registry,keyring:context.remoteKeyring,chatImageStore:context.chatImageStore,httpDeps,pcName:remotePcName(),ephemeral:context.credentialStore?.kind==='memory',
        federate:(local)=>createFederation({dataRoot:input.dataRoot,selfId:()=>ownChannelId,local:{
          ...local,sessionsRoot,
          async ensureLoaded(sessionId){
            try{await context.runtime?.restore?.({sessionIds:[sessionId]});}catch{/* the archive has none: the route says so */}
            return Boolean(context.registry?.esiste?.(sessionId));
          },
          listAll:async()=>(await context.runtime?.listSessions?.())??[],
        }}),
      });
    },
  });
  void remote.start().catch(()=>{/* the snapshot says what failed */});
  /* T6: the model's remote_* tools in this window use its tool coordinator (talos-composition.ts `setRemoteTools`) */
  void input.composed.then(context=>context?.setRemoteTools?.(()=>remote.toolCoordinator())).catch(()=>{/* no kernel: no tools */});
  return remote;
}
