import {parentPort} from 'node:worker_threads';
import {loadMxcSdk} from './mxc-execution-backend.ts';

/*
 * The worker side of `createWorkerSupportProbe` (mxc-support-probe.ts): loads the sandbox sdk and measures the host on THIS thread, where the sdk's
 * synchronous child processes (`whoami` at import, `dism`, its `--probe` binary) block nobody. It loads the sdk exactly as the main thread does
 * (`loadMxcSdk`: the platform package, PATH System32-first and the current-directory search off for the length of the import; `process.env` of a
 * worker is its own copy, so that guard never shows on the main thread). One message, then the thread ends.
 */
const port=parentPort;
if(port){
  void (async()=>{
    let sdk;
    try{sdk=await loadMxcSdk();}
    catch(error){port.postMessage({ok:false,stage:'load',message:error instanceof Error?error.message:String(error)});return;}
    try{port.postMessage({ok:true,evidence:sdk.getPlatformSupport()});}
    catch(error){port.postMessage({ok:false,stage:'support',message:error instanceof Error?error.message:String(error)});}
  })();
}
