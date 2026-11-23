import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mxcChildEnvironment} from '../security/mxc-execution-backend.ts';
const require=createRequire(import.meta.url);

/** Supported upstream executable boundary, pinned by node-notifier 10.0.1 and package-lock integrity. */
export function windowsNotificationExecutable(arch:string=process.arch):string{
  if(arch!=='x64'&&arch!=='ia32')throw new Error('NOTIFICATION_ARCH_UNSUPPORTED');
  return require.resolve(`node-notifier/vendor/snoreToast/snoretoast-${arch==='x64'?'x64':'x86'}.exe`);
}
/** True means no fallback is needed; a timeout is indeterminate, never proof of desktop delivery. */
export function runWindowsNotifier(args:readonly string[],signal:AbortSignal,io:{exec?:typeof execFile;executable?:string}={}):Promise<boolean>{
  if(signal.aborted)return Promise.resolve(false);
  return new Promise(resolve=>{
    try{
      const worker=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./windows-notification-worker.ts':'./windows-notification-worker.js',import.meta.url));
      const child=(io.exec??execFile)(process.execPath,[worker,io.executable??windowsNotificationExecutable(),...args],
        {windowsHide:true,shell:false,timeout:12_000,maxBuffer:16_384,signal,env:mxcChildEnvironment()},error=>{
          /* SnoreToast: 1 hidden, 2 dismissed, 3 expired; these are delivery outcomes, not failures. */
          resolve(!signal.aborted&&(!error||error.killed===true||[1,2,3,4,5,124].includes(Number(error.code))));
        });
      child.unref();
    }catch{resolve(false);}
  });
}
export function sendWindowsNotification(message:string,signal:AbortSignal,io:{exec?:typeof execFile;executable?:string}={}):Promise<boolean>{
  return runWindowsNotifier(['-t','TALOS','-m',message,'-silent'],signal,io);
}
