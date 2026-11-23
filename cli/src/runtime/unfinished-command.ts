import {t} from '../i18n/index.ts';

/*
 * Stress test 0.5.4, suspicion 2: a command whose work never settled left `process.exitCode` unset, and Node ended the process with exit 0
 * and an empty output, the same as a success. When the event loop empties ('beforeExit', Node docs: "no additional work to schedule") and
 * the command has not finished, nothing can finish it any more: TALOS says so and exits 70, the code of its other internal failures.
 */
/* `afterFinished` (second review of 0.6.2, 13/10/2026): called once the command's work has finished with its code — where the exit
   backstop is armed (runtime/exit-backstop.ts), so it can never cut work the command still awaits. Not called for a command that
   failed or never finished: those exits are said above and stay as they are. */
export function exitWhenFinished(work:Promise<number>,options:{writeErr:(text:string)=>void;onFatal?:(error:unknown)=>void;afterFinished?:(code:number)=>void}):void{
  let finished=false,reported=false;
  process.once('beforeExit',()=>{
    if(finished||reported)return;reported=true;
    options.writeErr(`${t('error.code.COMMAND_NEVER_FINISHED.what')} (COMMAND_NEVER_FINISHED)\n${t('error.code.COMMAND_NEVER_FINISHED.todo')}\n`);
    process.exitCode=70;
  });
  work.then(code=>{finished=true;process.exitCode=code;try{options.afterFinished?.(code);}catch{/* the exit stands */}},error=>{
    finished=true;options.onFatal?.(error);
    options.writeErr(`${error instanceof Error&&error.stack?error.stack:String(error)}\n`);
    process.exitCode=70;
  });
}
