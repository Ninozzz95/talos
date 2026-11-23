export type CliIo={writeOut(s:string):void;writeErr(s:string):void;stdinIsTTY:boolean;stdoutIsTTY:boolean;readStdin():Promise<string>;readSecret?(prompt:string):Promise<string>;/** one visible line typed on the terminal (14/10/2026: the Z.AI address in `set-key zai`); the prompt goes to stderr */readLine?(prompt:string):Promise<string>};
/* The prompt on stderr, as readSecret's, so a `--json` answer on stdout stays clean. Ctrl+C ends it as INTERRUPTED. */
async function readLineTty(prompt:string):Promise<string>{
  if(!process.stdin.isTTY)throw new Error('LINE_INPUT_REQUIRES_TTY');
  const {createInterface}=await import('node:readline/promises');
  const reader=createInterface({input:process.stdin,output:process.stderr,terminal:true});
  try{return await new Promise<string>((resolve,reject)=>{reader.once('SIGINT',()=>reject(Object.assign(new Error('INTERRUPTED'),{code:'INTERRUPTED'})));reader.question(prompt).then(resolve,reject);});}
  finally{reader.close();process.stdin.pause();}
}
export const MAX_STDIN_BYTES=16*1024*1024;
export async function readStreamLimited(stream:AsyncIterable<Uint8Array|string>,maxBytes=MAX_STDIN_BYTES):Promise<string>{
  const chunks:Buffer[]=[];let total=0;
  for await(const c of stream){const chunk=Buffer.isBuffer(c)?c:Buffer.from(c);total+=chunk.byteLength;if(total>maxBytes)throw Object.assign(new Error(`STDIN_TOO_LARGE:${maxBytes}`),{code:'STDIN_TOO_LARGE'});chunks.push(chunk);}
  return Buffer.concat(chunks,total).toString('utf8');
}
async function readAllStdin():Promise<string>{return readStreamLimited(process.stdin);}
async function readSecretTty(prompt:string):Promise<string>{if(!process.stdin.isTTY||typeof process.stdin.setRawMode!=='function')throw new Error('SECRET_INPUT_REQUIRES_TTY');process.stderr.write(prompt);return new Promise((resolve,reject)=>{let value='';const done=(error?:unknown)=>{process.stdin.off('data',onData);try{process.stdin.setRawMode(false);}catch{}process.stdin.pause();process.stderr.write('\n');if(error)reject(error);else resolve(value);};const onData=(buf:Buffer)=>{for(const b of buf){if(b===3){done(Object.assign(new Error('INTERRUPTED'),{code:'INTERRUPTED'}));return;}if(b===13||b===10){done();return;}if(b===8||b===127){value=value.slice(0,-1);continue;}if(b>=32)value+=Buffer.from([b]).toString('utf8');}};try{process.stdin.setRawMode(true);process.stdin.resume();process.stdin.on('data',onData);}catch(e){done(e);}});}
export const stdio:CliIo={writeOut:s=>process.stdout.write(s),writeErr:s=>process.stderr.write(s),stdinIsTTY:Boolean(process.stdin.isTTY),stdoutIsTTY:Boolean(process.stdout.isTTY),readStdin:readAllStdin,readSecret:readSecretTty,readLine:readLineTty};
