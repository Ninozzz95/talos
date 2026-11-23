/*
 * 0.6.8 (stress test of 0.6.7, F-E-001, S0, reproduced on the published 0.6.7): a `git.exe` planted in a project ran on the host at
 * a plain `talos -p` (the kernel's `git log -3` by bare name, cwd = the project). The CLI's equivalent of the desktop's
 * DIFESA-RICERCA-03 (which reads the desktop's server.mjs and is excluded here): the defence is main.ts's FIRST import, and with it
 * a bare `git` launched with cwd = a folder holding a fake `git.exe` runs the real git; without it, the fake (measured both ways,
 * in a child process born WITHOUT the variable, since it is the launcher's environment that counts).
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {MXC_CHILD_ENVIRONMENT_NAMES} from '../../src/security/mxc-execution-backend.ts';

const MAIN=fileURLToPath(new URL('../../src/main.ts',import.meta.url));
const DIST=fileURLToPath(new URL('../../dist/',import.meta.url));
const DEFENCE=pathToFileURL(fileURLToPath(new URL('../../src/security/exe-search-defence.ts',import.meta.url))).href;

test('the defence is the first import of main.ts',()=>{
  const imports=readFileSync(MAIN,'utf8').split('\n').filter(line=>/^import\b/u.test(line));
  assert.equal(imports[0],"import './security/exe-search-defence.ts';");
});

/* second review of 0.6.8 (finding 6): in the BUILT bundle main.ts's body runs after the chunks it imports; the defence is in the
   banner of every chunk, so the first chunk evaluated sets it */
test('every chunk of the built CLI sets the defence before its own code',{skip:!existsSync(DIST)?'no build':false},()=>{
  const chunks=readdirSync(DIST).filter(name=>name.endsWith('.js'));
  assert.ok(chunks.length>1);
  for(const name of chunks){
    const head=readFileSync(join(DIST,name),'utf8').slice(0,600);
    assert.match(head,/if\(!globalThis\.process\.env\.NoDefaultCurrentDirectoryInExePath\)globalThis\.process\.env\.NoDefaultCurrentDirectoryInExePath='1';/u,`${name} starts without the defence`);
  }
});

/* 0.6.9 (stress test of 0.6.8, F-C-001-bis): the banner read the bare `process`, and the MCP client's chunk declares its own top-level
   `function process(…)` (zod v4): that chunk threw at its first line and `talos mcp test` failed for every server. Reading the
   banner's text proved nothing; every chunk is now LOADED, each in its own child process, and must load with the defence set. */
test('every chunk of the built CLI loads, and sets the defence when it does',{skip:!existsSync(DIST)?'no build':false},()=>{
  const chunks=readdirSync(DIST).filter(name=>/^chunk-.*\.js$/u.test(name));
  assert.ok(chunks.length>1);
  const env={...process.env};delete env.NoDefaultCurrentDirectoryInExePath;
  /* the one external a chunk may miss: Ink imports react-devtools-core only under DEV=true, when it is installed (bundle.mjs) */
  const OPTIONAL_DEV_ONLY=/^failed:Cannot find package 'react-devtools-core' imported from /u;
  const failures:string[]=[];let loaded=0;
  for(const name of chunks){
    const url=pathToFileURL(join(DIST,name)).href;
    const script=`try{await import(${JSON.stringify(url)});process.stdout.write('loaded:'+(process.env.NoDefaultCurrentDirectoryInExePath??''));}catch(error){process.stdout.write('failed:'+String(error?.message??error));}`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env,encoding:'utf8',timeout:60_000});
    if(result.stdout==='loaded:1'){loaded++;continue;}
    if(OPTIONAL_DEV_ONLY.test(result.stdout))continue;
    failures.push(`${name}: ${result.stdout||result.stderr}`);
  }
  assert.deepEqual(failures,[],'every chunk loads with the defence set');
  assert.ok(loaded>=chunks.length-1,'at most the DEV-only chunk is skipped');
});

test('the sandbox children get the variable too',()=>{
  assert.ok(MXC_CHILD_ENVIRONMENT_NAMES.includes('NoDefaultCurrentDirectoryInExePath'));
});

test('a bare program name never runs a copy planted in the working folder',{skip:process.platform!=='win32'?'Windows only':false},()=>{
  const folder=mkdtempSync(join(tmpdir(),'talos-exe-search-'));
  try{
    copyFileSync(process.execPath,join(folder,'git.exe'));
    const env={...process.env};delete env.NoDefaultCurrentDirectoryInExePath;
    const launch=(defence:boolean)=>{
      const script=`${defence?`await import(${JSON.stringify(DEFENCE)});`:''}const {spawnSync}=await import('node:child_process');const r=spawnSync('git',['--version'],{cwd:${JSON.stringify(folder)},encoding:'utf8'});process.stdout.write(String(r.stdout||r.error));`;
      return spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{env,encoding:'utf8'}).stdout;
    };
    assert.match(launch(false),/^v\d+\./u,'without the defence Windows ran the planted copy (the measurement still holds)');
    assert.match(launch(true),/^git version /u,'with the defence the real git ran');
  }finally{rmSync(folder,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
