/* Test-only preloader. Never show an OS toast; preserve all unrelated process calls. */
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {appendFileSync} from 'node:fs';
const original=childProcess.execFile;
/* ConPTY owns its outer focus mode. Observe the app's write and raw state as well as the outer PTY. */
const write=process.stdout.write;
process.stdout.write=function(chunk,...args){
  if(String(chunk).includes('\u001b[?1004l')&&process.env.TALOS_NOTIFY_TEST_LOG){
    appendFileSync(process.env.TALOS_NOTIFY_TEST_LOG,JSON.stringify({protocol:'focus-off',raw:process.stdin.isRaw})+'\n');
  }
  return write.call(this,chunk,...args);
};
childProcess.execFile=function(file,args,options,callback){
  if(file===process.execPath&&/windows-notification-worker\.(?:ts|js)$/u.test(String(args?.[0]))){
    return original.call(this,file,args,{...options,env:{...options.env,NODE_OPTIONS:process.env.NODE_OPTIONS,TALOS_NOTIFY_TEST_LOG:process.env.TALOS_NOTIFY_TEST_LOG}},callback);
  }
  if(!/snoretoast-(?:x64|x86)\.exe$/iu.test(String(file))||args?.includes('-v'))return original.apply(this,arguments);
  if(process.env.TALOS_NOTIFY_TEST_LOG)appendFileSync(process.env.TALOS_NOTIFY_TEST_LOG,JSON.stringify({args,windowsHide:options.windowsHide,shell:options.shell,timeout:options.timeout})+'\n');
  queueMicrotask(()=>callback(null,'',''));
  return{unref(){},kill(){return true;}};
};
syncBuiltinESMExports();
