/*
 * Stage 6c (owner 02/10: «selezione della CLI», copy on release; research in registro 12). Where a copy goes, as Pi's
 * coding-agent/src/utils/clipboard.ts: the system's own command first — on Windows PowerShell reading a UTF-8 file, because
 * clip and piped stdin decode with the console code page and mangle non-ASCII text; pbcopy on macOS; wl-copy, xclip, xsel on
 * Linux — and OSC 52 only where nothing else can reach the person's clipboard (a remote session, or no display), because a
 * terminal never confirms it; past 100,000 encoded characters it is not sent. The result says where the text went (the
 * mockup's toast: «Copied 3 lines · Windows clipboard»).
 */
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export type CopyWhere='windows'|'mac'|'linux'|'terminal';
export type CopyResult={ok:true;where:CopyWhere}|{ok:false;where:null};
type Run=(command:string,args:string[],input?:string)=>Promise<boolean>;
const OSC52_MAX=100_000;

/** Runs a clipboard command, feeding `input` on stdin; true when it exits 0 within five seconds. */
export const runClipboardCommand:Run=(command,args,input)=>new Promise(resolve=>{
  let child;
  try{child=spawn(command,args,{stdio:[input===undefined?'ignore':'pipe','ignore','ignore'],windowsHide:true});}catch{resolve(false);return;}
  const timer=setTimeout(()=>{child.kill();resolve(false);},5_000);
  child.on('error',()=>{clearTimeout(timer);resolve(false);});
  child.on('close',code=>{clearTimeout(timer);resolve(code===0);});
  if(input!==undefined){child.stdin?.on('error',()=>{});child.stdin?.end(input,'utf8');}
});

/* Owner 08/10/2026 («tasto destro non pasta»): with the mouse captured the terminal hands the right button to TALOS instead of
   pasting, so TALOS reads the clipboard itself (Claude Code fullscreen: «Right-click and middle-click paste continue to work»).
   The same commands as the copy, the other way: PowerShell Get-Clipboard (its output forced to UTF-8), pbpaste, wl-paste,
   xclip -o, xsel --output. A remote session has no clipboard TALOS can read: null. */
type Read=(command:string,args:string[])=>Promise<string|null>;
export const runClipboardRead:Read=(command,args)=>new Promise(resolve=>{
  let child;
  try{child=spawn(command,args,{stdio:['ignore','pipe','ignore'],windowsHide:true});}catch{resolve(null);return;}
  const chunks:Buffer[]=[];
  const timer=setTimeout(()=>{child.kill();resolve(null);},5_000);
  child.stdout?.on('data',(chunk:Buffer)=>chunks.push(chunk));
  child.on('error',()=>{clearTimeout(timer);resolve(null);});
  child.on('close',code=>{clearTimeout(timer);resolve(code===0?Buffer.concat(chunks).toString('utf8'):null);});
});
export async function readClipboardText({platform=process.platform,env=process.env,read=runClipboardRead,readFile=(path:string)=>readFileSync(path,'utf8')}:{
  platform?:string;env?:Record<string,string|undefined>;read?:Read;readFile?:(path:string)=>string;
}={}):Promise<string|null>{
  /* the acceptance scenarios paste from a file of their own profile: a test never reads the person's real clipboard */
  if(env.TALOS_CLIPBOARD_FILE){try{return readFile(env.TALOS_CLIPBOARD_FILE);}catch{return null;}}
  if(env.SSH_CONNECTION||env.SSH_CLIENT||env.MOSH_CONNECTION)return null;
  if(platform==='win32'){
    const text=await read('powershell.exe',['-NoProfile','-NonInteractive','-Command','[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw']);
    /* PowerShell ends its output with one line break of its own */
    return text===null?null:text.replace(/\r?\n$/u,'');
  }
  if(platform==='darwin')return read('pbpaste',[]);
  const tries:Array<[string,string[]]>=[];
  if(env.WAYLAND_DISPLAY)tries.push(['wl-paste',['--no-newline']]);
  if(env.DISPLAY)tries.push(['xclip',['-selection','clipboard','-o']],['xsel',['--clipboard','--output']]);
  for(const [command,args] of tries){const text=await read(command,args);if(text!==null)return text;}
  return null;
}

export async function copyText(text:string,{platform=process.platform,env=process.env,run=runClipboardCommand,writeTerminal,writeFile=(path,body)=>writeFileSync(path,body,'utf8'),removeFile=path=>rmSync(path,{force:true}),tempDir=tmpdir()}:{
  platform?:string;env?:Record<string,string|undefined>;run?:Run;writeTerminal?:(sequence:string)=>void;
  writeFile?:(path:string,text:string)=>void;removeFile?:(path:string)=>void;tempDir?:string;
}={}):Promise<CopyResult>{
  /* The acceptance scenarios copy into a file of their own profile: a test never touches the person's real clipboard. */
  if(env.TALOS_CLIPBOARD_FILE){
    try{writeFile(env.TALOS_CLIPBOARD_FILE,text);return{ok:true,where:platform==='win32'?'windows':platform==='darwin'?'mac':'linux'};}catch{return{ok:false,where:null};}
  }
  const remote=Boolean(env.SSH_CONNECTION||env.SSH_CLIENT||env.MOSH_CONNECTION);
  if(!remote){
    if(platform==='win32'){
      const file=join(tempDir,`talos-clip-${randomUUID()}.txt`);
      try{
        writeFile(file,text);
        /* Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath '<file>'), a command, not words for the screen */
        const command=['Set-Clipboard','-Value','(Get-Content','-Raw','-Encoding','UTF8','-LiteralPath',`'${file.replaceAll("'","''")}')`].join(' ');
        if(await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',command]))return{ok:true,where:'windows'};
      }catch{/* the next way, below */}
      finally{try{removeFile(file);}catch{/* a temporary file left behind is harmless */}}
    }else if(platform==='darwin'){
      if(await run('pbcopy',[],text))return{ok:true,where:'mac'};
    }else{
      const tries:Array<[string,string[]]>=[];
      if(env.WAYLAND_DISPLAY)tries.push(['wl-copy',[]]);
      if(env.DISPLAY)tries.push(['xclip',['-selection','clipboard']],['xsel',['--clipboard','--input']]);
      for(const [command,args] of tries)if(await run(command,args,text))return{ok:true,where:'linux'};
    }
  }
  const headless=platform==='linux'&&!env.DISPLAY&&!env.WAYLAND_DISPLAY;
  if((remote||headless)&&writeTerminal){
    const encoded=Buffer.from(text,'utf8').toString('base64');
    if(encoded.length<=OSC52_MAX){writeTerminal(`\u001b]52;c;${encoded}\u0007`);return{ok:true,where:'terminal'};}
  }
  return{ok:false,where:null};
}
