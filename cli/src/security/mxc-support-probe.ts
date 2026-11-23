import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {isolationCheckAborted} from './process-tree-probe.ts';
import type {MxcPlatformEvidence} from './mxc-execution-backend.ts';

/*
 * Startup stall, 08/10/2026 (owner goal: start and resume like Codex/Claude Code, on low-end PCs too). The sdk measures the host with three SYNCHRONOUS child
 * processes (`whoami` when its module loads, `dism /online /get-featureinfo` and its `--probe` binary inside `getPlatformSupport()`): about 115 ms of the
 * main thread before the composer on a `--resume`, measured A/B. The measurement is kept (the "no sandbox" banner and approval card are only ever measured)
 * and moves to a worker thread, once per probe; the sdk caches the result per module, so it was already one measurement per process.
 * Codex: blocking Windows-sandbox work in spawn_blocking, coalesced by a OnceCell, "must not hold up unrelated RPCs" (app-server windows_sandbox_processor.rs);
 * Pi: blocking image work in a worker thread (image-resize-worker.ts); Hermes asks for Docker only where it is used (tools/environments/docker.py).
 * Node's child_process docs: the Sync calls "block the event loop until the spawned process exits".
 */
export class MxcSupportProbeError extends Error{
  readonly stage:'load'|'support';
  constructor(stage:'load'|'support',message:string){super(message);this.name='MxcSupportProbeError';this.stage=stage;}
}

export type SupportProbeOptions={
  /** The worker script. Default: `mxc-support-worker` next to this module (`.ts` in a checkout, `.js` in the build). */
  workerFile?:string;
  /** Test seam: how the thread is started. */
  spawnWorker?:(file:string)=>Worker;
  /** The old way: the same measurement on the calling thread. Used only when the worker cannot answer. */
  inProcess:()=>Promise<MxcPlatformEvidence>;
  /** Ends the wait and the thread (TALOS is quitting). */
  signal?:AbortSignal;
};

const defaultWorkerFile=()=>fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./mxc-support-worker.ts':'./mxc-support-worker.js',import.meta.url));
const isEvidence=(value:unknown):value is MxcPlatformEvidence=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&typeof (value as {isSupported?:unknown}).isSupported==='boolean'&&Array.isArray((value as {availableMethods?:unknown}).availableMethods);

/**
 * The host's platform evidence, measured in a worker thread, once: every call answers the same promise. A failure the worker REPORTS (`stage` `load` or
 * `support`) is an answer and is not repeated; a worker that crashes, cannot start or ends silently is not an answer, so the in-process way runs instead.
 */
export function createWorkerSupportProbe(options:SupportProbeOptions):()=>Promise<MxcPlatformEvidence>{
  const {signal,inProcess}=options;
  const run=():Promise<MxcPlatformEvidence>=>{
    if(signal?.aborted)return Promise.reject(isolationCheckAborted());
    let worker:Worker;
    try{worker=(options.spawnWorker??(file=>new Worker(file)))(options.workerFile??defaultWorkerFile());}
    catch{return inProcess();}
    return new Promise<MxcPlatformEvidence>((resolve,reject)=>{
      let done=false;
      const end=(settle:()=>void)=>{
        if(done)return;done=true;
        signal?.removeEventListener('abort',onAbort);
        worker.removeAllListeners();worker.on('error',()=>{});
        void worker.terminate();
        settle();
      };
      const onAbort=()=>end(()=>reject(isolationCheckAborted()));
      signal?.addEventListener('abort',onAbort,{once:true});
      worker.once('message',(message:unknown)=>end(()=>{
        const answer=message as {ok?:unknown;evidence?:unknown;stage?:unknown;message?:unknown}|null;
        if(answer?.ok===true){
          if(isEvidence(answer.evidence))resolve(answer.evidence);
          else reject(new MxcSupportProbeError('support','the worker answered something that is not platform evidence'));
        }else reject(new MxcSupportProbeError(answer?.stage==='load'?'load':'support',typeof answer?.message==='string'?answer.message:'the support worker failed'));
      }));
      const fallBack=()=>end(()=>{inProcess().then(resolve,reject);});
      worker.once('error',fallBack);
      worker.once('exit',fallBack);
      /* the thread never keeps TALOS alive, and an unanswered measurement is no reason to hold the exit. After the listeners: a 'message' listener
         added later takes the port back (measured: the process did not exit with unref() called first) */
      worker.unref();
    });
  };
  let pending:Promise<MxcPlatformEvidence>|undefined;
  return()=>pending??=run();
}
