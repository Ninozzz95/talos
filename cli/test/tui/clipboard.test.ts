/*
 * Stage 6c (owner 02/10: copy on release; registro 12). Where a copy goes, as Pi's clipboard.ts: the system's own command
 * first — on Windows PowerShell reading a UTF-8 file (clip and piped stdin decode with the console code page and mangle
 * non-ASCII text), pbcopy on macOS, wl-copy/xclip/xsel on Linux — and OSC 52 only where nothing else reaches the person's
 * clipboard (a remote session, or no display), since a terminal never confirms it. The command runner is injected: these
 * tests never touch the real clipboard.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {copyText} from '../../src/tui/clipboard.ts';

function runner(ok:(command:string)=>boolean){
  const calls:Array<{command:string;args:string[];input?:string;file?:string}>=[];
  return{calls,run:async(command:string,args:string[],input?:string)=>{calls.push({command,args,...(input!==undefined?{input}:{})});return ok(command);}};
}

test('Windows: PowerShell reads the text from a UTF-8 file, so non-ASCII text arrives intact',async()=>{
  const r=runner(()=>true);const files:Record<string,string>={};let removed='';
  const result=await copyText('caffè · 漢字',{platform:'win32',env:{},run:r.run,writeFile:(path,text)=>{files[path]=text;},removeFile:path=>{removed=path;},tempDir:'C:/tmp'});
  assert.deepEqual(result,{ok:true,where:'windows'});
  assert.equal(r.calls.length,1);
  assert.equal(r.calls[0]!.command,'powershell.exe');
  const path=Object.keys(files)[0]!;
  assert.equal(files[path],'caffè · 漢字');
  assert.ok(r.calls[0]!.args.join(' ').includes('Set-Clipboard')&&r.calls[0]!.args.join(' ').includes('UTF8')&&r.calls[0]!.args.join(' ').includes(path));
  assert.equal(removed,path,'the file is removed');
});

test('macOS pipes to pbcopy; Linux tries wl-copy, then xclip, then xsel',async()=>{
  const mac=runner(()=>true);
  assert.deepEqual(await copyText('x',{platform:'darwin',env:{},run:mac.run}),{ok:true,where:'mac'});
  assert.deepEqual(mac.calls.map(c=>[c.command,c.input]),[['pbcopy','x']]);
  const linux=runner(command=>command==='xsel');
  assert.deepEqual(await copyText('x',{platform:'linux',env:{WAYLAND_DISPLAY:'w',DISPLAY:':0'},run:linux.run}),{ok:true,where:'linux'});
  assert.deepEqual(linux.calls.map(c=>c.command),['wl-copy','xclip','xsel']);
});

test('OSC 52 only for a remote session or no display, and never past its size; a failure says so',async()=>{
  const sent:string[]=[];const writeTerminal=(text:string)=>{sent.push(text);};
  const remote=await copyText('hi',{platform:'linux',env:{SSH_CONNECTION:'1 2 3 4'},run:runner(()=>false).run,writeTerminal});
  assert.deepEqual(remote,{ok:true,where:'terminal'});
  assert.equal(sent[0],'\u001b]52;c;aGk=\u0007');
  const local=await copyText('hi',{platform:'linux',env:{DISPLAY:':0'},run:runner(()=>false).run,writeTerminal});
  assert.deepEqual(local,{ok:false,where:null},'a desktop whose clipboard commands all failed reports it, no unverifiable OSC 52');
  const huge=await copyText('x'.repeat(80_000),{platform:'linux',env:{SSH_CONNECTION:'x'},run:runner(()=>false).run,writeTerminal});
  assert.deepEqual(huge,{ok:false,where:null},'past the OSC 52 limit: not sent');
});

test('a test profile copies into its own file (TALOS_CLIPBOARD_FILE), never the real clipboard',async()=>{
  const r=runner(()=>true);const files:Record<string,string>={};
  const result=await copyText('picked',{platform:'win32',env:{TALOS_CLIPBOARD_FILE:'C:/p/clip.txt'},run:r.run,writeFile:(path,text)=>{files[path]=text;}});
  assert.deepEqual(result,{ok:true,where:'windows'});
  assert.deepEqual(files,{'C:/p/clip.txt':'picked'});
  assert.equal(r.calls.length,0,'no clipboard command ran');
});
