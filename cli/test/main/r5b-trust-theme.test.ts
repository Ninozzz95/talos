/*
 * R5b D4 (owner decision Q-R5-14): the trust question is drawn in the person's theme. It is asked before the project is
 * trusted, so only the USER configuration is read for it — a theme written in the folder being asked about is not.
 * Before R5b the question was always drawn in Calm.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {main} from '../../src/main.ts';
import {resolveCliPaths} from '../../src/paths.ts';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';

function io(){return{stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''} as any;}
const untrusted=(project:string)=>({trusted:false,reason:'PROJECT_UNTRUSTED',workspace:{requestedRoot:project,canonicalRoot:project,gitRoot:null,nestedRepository:false,identityHash:'r5b'},resources:[],storeSchema:null,migrationRequired:false,folder:{decided:false,source:null,path:null,sessionOnly:false,parent:join(project,'..')}} as any);

test('R5b D4: the trust question gets the user\'s theme, never one written in the untrusted folder',async()=>{
  const paths=resolveCliPaths(process.env,process.platform,homedir());
  assert.match(paths.configRoot,/talos-cli-test-run/iu,'the runner\'s private profile, never the real one (this test writes a user config)');
  const root=await mkdtemp(join(tmpdir(),'r5b-trust-theme-'));const project=join(root,'project');
  await mkdir(join(project,'.talos-cli'),{recursive:true});
  await writeFile(join(project,'.talos-cli','config.json'),JSON.stringify({version:2,ui:{theme:'noir'}}));
  await mkdir(paths.configRoot,{recursive:true});
  await writeFile(join(paths.configRoot,'config.json'),JSON.stringify({version:1,ui:{theme:'coral'}}));
  const asked:any[]=[];
  const code=await main(['--project',project],{io:io(),
    assessProjectTrust:async()=>untrusted(project),
    promptProjectTrust:async(x:any)=>{asked.push(x);return'cancel';},
    createRuntimeContext:async()=>{throw new Error('must not start');}} as any);
  assert.equal(code,2);
  assert.equal(asked.length,1);
  assert.equal(asked[0].theme,'signal','the user\'s v1 coral, moved to its v2 theme; the folder\'s noir is not read');
});
