import {appendFileSync,mkdirSync,renameSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createRedactor,secretValuesFromEnvironment} from '../diagnostics/redact.ts';
import type {ConsoleLevel} from './console-capture.ts';

/*
 * Owner decision 02/10 («Nel registro + avviso discreto», registro 12): what the console capture takes off the screen
 * (console-capture.ts) must be readable with `talos logs`, which the status segment names. `talos logs` reads the `*.log`
 * files at the top of the logs folder (commands/system-cli.ts readLogs); the development log is off by default and lives
 * elsewhere (logs/development/*.jsonl). So the capture keeps `console.log` there: one line per message (a stack folds onto
 * it with ⏎, so a tail counts messages, not stack frames), secrets from the environment redacted as in every TALOS log,
 * and bounded: past `maxBytes` the file moves to `console.1.log` and starts again. A folder that cannot be written is
 * silence, never an exception into whoever logged.
 */
const LABEL:Readonly<Record<ConsoleLevel,string>>={log:'LOG  ',info:'INFO ',warn:'WARN ',error:'ERROR',debug:'DEBUG'};

export function createConsoleLogFile({dir,maxBytes=1024*1024,clock=()=>new Date(),env=process.env}:{dir:string;maxBytes?:number;clock?:()=>Date;env?:Record<string,string|undefined>}):(level:ConsoleLevel,text:string)=>void{
  const redactor=createRedactor(secretValuesFromEnvironment(env));
  const file=join(dir,'console.log');
  let ready=false;
  return(level,text)=>{
    try{
      if(!ready){mkdirSync(dir,{recursive:true,mode:0o700});ready=true;}
      try{if(statSync(file).size>=maxBytes)renameSync(file,join(dir,'console.1.log'));}catch{/* no file yet */}
      const line=redactor.text(String(text)).replace(/\r?\n/gu,' ⏎ ');
      appendFileSync(file,`${clock().toISOString()} ${LABEL[level]} ${line}\n`,{encoding:'utf8',mode:0o600});
    }catch{/* a log that cannot be written is silence, never an error in the caller */}
  };
}
