import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const read=(name:string)=>readFile(new URL(`../../packaging/one-click/${name}`,import.meta.url),'utf8');

test('one-click launcher delegates to PowerShell bootstrap without requiring installed Node',async()=>{
 const cmd=await read('START-TALOS-CLI.cmd');
 assert.match(cmd,/powershell(?:\.exe)?\s+-NoProfile\s+-ExecutionPolicy\s+Bypass/iu);
 assert.match(cmd,/bootstrap\.ps1/iu);
 assert.doesNotMatch(cmd,/\bnode(?:\.exe)?\b/iu);
});

test('bootstrap pins and verifies Node desktop runtime and TUI dependencies before launch',async()=>{
 const ps=await read('bootstrap.ps1');
 assert.match(ps,/node-v24\.18\.0-win-x64\.zip/iu);
 assert.match(ps,/0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821/iu);
 assert.match(ps,/TALOS-0\.1\.7-win\.zip/iu);
 assert.match(ps,/bd36634309205f6c7e1e1f6effe283c337651aa24e3609c2c9b189ad1de89a35/iu);
 assert.match(ps,/Get-FileHash.+SHA256/isu);
 assert.match(ps,/TALOS_CLI_RUNTIME_ROOT/iu);
 assert.match(ps,/\$InkVersion\s*=\s*'7\.1\.1'/iu);
 assert.match(ps,/\$ReactVersion\s*=\s*'19\.3\.0'/iu);
 assert.match(ps,/"ink@\$InkVersion"/iu);
 assert.match(ps,/"react@\$ReactVersion"/iu);
 assert.match(ps,/--ignore-scripts/iu);
 assert.match(ps,/--no-audit/iu);
 assert.match(ps,/Join-Path\s+\$AppRoot\s+'dist\\main\.js'/iu);
 assert.match(ps,/\$Project/iu);
});

test('terminal talos launcher preserves the caller working directory as the project',async()=>{
 const cmd=await read('talos.cmd');
 assert.match(cmd,/set\s+"TALOS_PROJECT=%CD%"/iu);
 assert.match(cmd,/bootstrap\.ps1"\s+-Project\s+"%TALOS_PROJECT%"/iu);
 assert.doesNotMatch(cmd,/(?:cd|pushd)\s+\/d\s+"%~dp0"/iu);
});
