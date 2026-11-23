/*
 * 0.6.6 (found by s76 on 15/10/2026): with ONE host and other `talos automation` processes reading the same store (`list`, `run`
 * waiting for the end), the kernel's store saved an entry by renaming over a file another process had open, and Windows refused it
 * (EPERM): the run's end was not written and the run was closed as failed with that error. graceful-fs, npm's own fs, retries a
 * rename on Windows for up to 60 s on EACCES, EPERM and EBUSY (`polyfills.js`) because an antivirus or an indexer hold files the
 * same way. Here the store gets the same retry — on the rename, and on the reads and appends that meet a writer — for up to
 * STORE_BUSY_LIMIT_MS; any other error, and any error elsewhere than on Windows, passes at once.
 */
import {appendFile,mkdir,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';

export const STORE_BUSY_LIMIT_MS=10_000;
const BUSY=new Set(['EPERM','EACCES','EBUSY']);

export async function retryWhileBusy<T>(work:()=>Promise<T>,options:{platform?:NodeJS.Platform;limitMs?:number;sleep?:(ms:number)=>Promise<void>;now?:()=>number}={}):Promise<T>{
  const platform=options.platform??process.platform;const limitMs=options.limitMs??STORE_BUSY_LIMIT_MS;
  const sleep=options.sleep??((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));const now=options.now??Date.now;
  const started=now();let wait=10;
  for(;;){
    try{return await work();}
    catch(error){
      if(platform!=='win32'||!BUSY.has(String((error as NodeJS.ErrnoException)?.code))||now()-started>=limitMs)throw error;
      await sleep(wait);wait=Math.min(wait*2,200);
    }
  }
}

/** The `fsAdapter` the kernel's automation store takes (automation-store.mjs), with the retry above. */
export const automationStoreFs={
  mkdir,readdir,rm,writeFile,
  readFile:((...args:Parameters<typeof readFile>)=>retryWhileBusy(()=>readFile(...args))) as typeof readFile,
  rename:(from:string,to:string)=>retryWhileBusy(()=>rename(from,to)),
  appendFile:((...args:Parameters<typeof appendFile>)=>retryWhileBusy(()=>appendFile(...args))) as typeof appendFile,
};
