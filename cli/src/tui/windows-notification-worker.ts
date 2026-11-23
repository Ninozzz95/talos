/* Private one-shot helper: CREATE_NO_WINDOW on this Node console process prevents SnoreToast's
 * AttachConsole(ATTACH_PARENT_PROCESS) from attaching to the interactive TALOS terminal. No shell. */
import {execFile} from 'node:child_process';
import {mxcChildEnvironment} from '../security/mxc-execution-backend.ts';
const [executable,...args]=process.argv.slice(2);
if(!executable)process.exitCode=127;
else{
  try{
    execFile(executable,args,{windowsHide:true,shell:false,timeout:10_000,maxBuffer:16_384,env:mxcChildEnvironment()},error=>{
      /* 124 = delivery indeterminate. Native may already have shown the toast before waiting for a click. */
      process.exitCode=!error?0:error.killed?124:typeof error.code==='number'?error.code:127;
    });
  }catch{process.exitCode=127;}
}
