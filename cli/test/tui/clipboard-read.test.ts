/*
 * The right click's paste (owner 08/10/2026 «tasto destro non pasta»): TALOS reads the clipboard with the system's own
 * command — the copy's commands the other way — and puts it into the input as a terminal paste, with no ESC inside.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readClipboardText} from '../../src/tui/clipboard.ts';
import {bracketedClipboardPaste} from '../../src/tui/run.ts';

test('Windows reads the clipboard with PowerShell in UTF-8 and drops the line break PowerShell adds',async()=>{
  const calls:Array<[string,string[]]>=[];
  const text=await readClipboardText({platform:'win32',env:{},read:async(command,args)=>{calls.push([command,args]);return 'città\r\nsecond\r\n';}});
  assert.equal(text,'città\r\nsecond');
  assert.equal(calls[0]![0],'powershell.exe');
  assert.match(calls[0]![1].join(' '),/OutputEncoding=\[Text\.Encoding\]::UTF8; Get-Clipboard -Raw/u);
});

test('macOS uses pbpaste; Linux tries wl-paste, then xclip, then xsel; a remote session reads nothing',async()=>{
  assert.equal(await readClipboardText({platform:'darwin',env:{},read:async command=>command==='pbpaste'?'mac':null}),'mac');
  const tried:string[]=[];
  const linux=await readClipboardText({platform:'linux',env:{WAYLAND_DISPLAY:'w',DISPLAY:':0'},read:async command=>{tried.push(command);return command==='xsel'?'from xsel':null;}});
  assert.equal(linux,'from xsel');assert.deepEqual(tried,['wl-paste','xclip','xsel']);
  assert.equal(await readClipboardText({platform:'win32',env:{SSH_CONNECTION:'x'},read:async()=>'never'}),null);
});

test('the test profile reads its own clipboard file, never the real clipboard',async()=>{
  let called=false;
  const text=await readClipboardText({platform:'win32',env:{TALOS_CLIPBOARD_FILE:'C:/x/clipboard.txt'},read:async()=>{called=true;return 'real';},readFile:()=>'from the file'});
  assert.equal(text,'from the file');assert.equal(called,false);
});

test('the paste is bracketed and an ESC inside the clipboard cannot end it early',()=>{
  assert.equal(bracketedClipboardPaste('a\nb'),'\u001b[200~a\nb\u001b[201~');
  const sneaky=bracketedClipboardPaste('x\u001b[201~rm -rf /\r');
  assert.equal(sneaky.split('\u001b[201~').length,2,'one end of paste only');
  assert.ok(!sneaky.slice(6,-6).includes('\u001b'),'no ESC inside the paste');
});
