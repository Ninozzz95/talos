import assert from 'node:assert/strict';
import test from 'node:test';
import {chmod,mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildInstaller} from '../../scripts/build-installer.mjs';
import {spawnSync} from 'node:child_process';

test('NSIS installer is per-user, manages exact user PATH entry and keeps data by default',async()=>{
  const s=await readFile(new URL('../../packaging/windows/talos-cli.nsi',import.meta.url),'utf8');
  assert.match(s,/RequestExecutionLevel user/);
  assert.match(s,/InstallDir\s+"\$LOCALAPPDATA\\Programs\\TALOS CLI"/);
  assert.doesNotMatch(s,/RequestExecutionLevel\s+admin/);
  assert.match(s,/path\.ps1"\s+add/u);
  assert.match(s,/path\.ps1"\s+remove/u);
  assert.match(s,/WM_SETTINGCHANGE/u);
  assert.match(s,/CreateShortCut\s+"\$SMPROGRAMS\\TALOS CLI\.lnk"/u);
  assert.match(s,/Delete\s+"\$SMPROGRAMS\\TALOS CLI\.lnk"/u);
  assert.match(s,/PURGE_USER_DATA/u);
  assert.doesNotMatch(s,/RMDir\s+\/r\s+"\$APPDATA\\TALOS-CLI"\s*(?:\r?\n)\s*RMDir\s+\/r\s+"\$LOCALAPPDATA\\TALOS-CLI"\s*(?:\r?\n)\s*SectionEnd/u);
});

test('PATH helper adds once and removes only TALOS CLI bin',async()=>{
  const s=await readFile(new URL('../../packaging/windows/path.ps1',import.meta.url),'utf8');
  assert.match(s,/SetEnvironmentVariable\('Path'.*'User'/su);
  assert.match(s,/OrdinalIgnoreCase/u);
  assert.match(s,/add/u);
  assert.match(s,/remove/u);
  assert.doesNotMatch(s,/\?\?/u,'installer PATH helper must stay parseable by Windows PowerShell 5.1');
  assert.match(s,/if \(\$null -eq \$current\) \{ \$current = '' \}/u);
  assert.match(s,/if \(\$newValue -ne \$current\)/u);
});


test('installer builder moves the fresh NSIS artifact into the requested output directory',{skip:process.platform==='win32'},async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-installer-builder-'));
  const stage=join(root,'stage');
  const out=join(root,'out');
  const helper=join(root,'fake-makensis.mjs');
  const launcher=join(root,'fake-makensis');
  const version=`contract-${process.pid}-${Date.now()}`;
  const fileName=`TALOS-CLI-Setup-${version}.exe`;
  const nsi=fileURLToPath(new URL('../../packaging/windows/talos-cli.nsi',import.meta.url));
  const emitted=join(dirname(nsi),fileName);
  const expected=join(out,fileName);
  await mkdir(stage,{recursive:true});
  await mkdir(out,{recursive:true});
  await writeFile(emitted,'stale');
  await writeFile(expected,'old');
  try{
    await writeFile(helper,`import {writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
const args=process.argv.slice(2);
const version=args.find(arg=>arg.startsWith('/DVERSION='))?.slice('/DVERSION='.length);
const script=args.at(-1);
if(!version||!script)process.exit(2);
await writeFile(join(dirname(script),'TALOS-CLI-Setup-'+version+'.exe'),'fresh',{flag:'wx'});
`);
    await writeFile(launcher,`#!/bin/sh
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(helper)} "$@"
`);
    await chmod(launcher,0o755);
    const result=await buildInstaller({stageDir:stage,outDir:out,version,makensis:launcher});
    assert.equal(result,expected);
    assert.equal(await readFile(expected,'utf8'),'fresh');
    await assert.rejects(()=>readFile(emitted,'utf8'),(error)=>error?.code==='ENOENT');
  }finally{
    await rm(emitted,{force:true});
    await rm(root,{recursive:true,force:true});
  }
});


test('PATH helper parses under the exact Windows PowerShell executable used by NSIS',{skip:process.platform!=='win32'},()=>{
  const helper=fileURLToPath(new URL('../../packaging/windows/path.ps1',import.meta.url));
  const command=`[ScriptBlock]::Create([IO.File]::ReadAllText(${JSON.stringify(helper)})) | Out-Null`;
  const parsed=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true});
  assert.equal(parsed.status,0,`powershell.exe parse failed: ${parsed.stderr||parsed.stdout}`);
});
