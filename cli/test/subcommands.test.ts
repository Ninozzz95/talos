import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {runSubcommand} from '../src/subcommands.ts';import {resolveCliPaths} from '../src/paths.ts';
import {parseCliArgs} from '../src/args.ts';
function io(){const out:string[]=[];const err:string[]=[];return{out,err,api:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''}} as any;}
async function fixture(){const root=await mkdtemp(join(tmpdir(),'talos-router-'));await mkdir(join(root,'harness-ui','src'),{recursive:true});const home=await mkdtemp(join(tmpdir(),'talos-home-'));return{root,paths:resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home)};}
test('router dispatches config without starting runtime',async()=>{const f=await fixture(),x=io();const code=await runSubcommand({command:'subcommand',interactive:false,outputFormat:'json',verbose:false,color:false,positionals:['config','list']} as any,{io:x.api,repoRoot:f.root,paths:f.paths});assert.equal(code,0);assert.match(x.out.join(''),/permissionMode/u);});
test('P9-JSON-AFTER-SUBCOMMAND: routed config list emits machine-readable JSON with trailing --json',async()=>{
  const f=await fixture(),x=io();
  const invocation=parseCliArgs(['config','list','--json']);
  assert.equal(await runSubcommand(invocation,{io:x.api,repoRoot:f.root,paths:f.paths}),0);
  assert.ok(JSON.parse(x.out.join('')),'output must be a JSON document');
  assert.equal(x.out.join('').trim().split('\n').length,1,'global JSON output must be one machine-readable line');
  assert.equal(x.err.length,0);
});
test('router maps bad usage to stable exit 2',async()=>{const f=await fixture(),x=io();const code=await runSubcommand({command:'subcommand',interactive:false,outputFormat:'text',verbose:false,color:false,positionals:['config','set']} as any,{io:x.api,repoRoot:f.root,paths:f.paths});assert.equal(code,2);assert.match(x.err.join(''),/CONFIG_SET_REQUIRES_PATH_VALUE/u);});
test('project trust status trust and revoke are available before runtime creation',async()=>{const f=await fixture(),x=io();const project=await mkdtemp(join(tmpdir(),'talos-project-command-'));await mkdir(join(project,'.talos-cli'),{recursive:true});await writeFile(join(project,'.talos-cli','config.json'),'{}\n');const base={command:'subcommand',interactive:false,outputFormat:'json',verbose:false,color:false,project,positionals:[]} as any;let runtimeCalls=0;const deps={io:x.api,repoRoot:f.root,paths:f.paths,createRuntimeContext:async()=>{runtimeCalls++;throw new Error('runtime must not start');}};
  assert.equal(await runSubcommand({...base,positionals:['project','status']},deps),0);assert.equal(JSON.parse(x.out.pop()).trusted,false);
  assert.equal(await runSubcommand({...base,positionals:['project','trust']},deps),0);assert.equal(JSON.parse(x.out.pop()).trusted,true);
  assert.equal(await runSubcommand({...base,positionals:['project','revoke']},deps),0);assert.equal(JSON.parse(x.out.pop()).trusted,false);assert.equal(runtimeCalls,0);
});

/* 0.6.14 (todo-0614 item 4): `talos remote` used to reach the model as the prompt «remote», a paid turn; it became a family.
   0.6.15 (owner 26/10/2026): the family is remote control (commands/remote-cli.ts). Still never a run: without a terminal the
   pairing says so before any runtime, an unknown operation is refused before any runtime, and nothing reaches a model. */
test('talos remote is a family, never a run: no terminal and an unknown operation are refused before any runtime',async()=>{
  assert.equal(parseCliArgs(['remote']).command,'subcommand');
  assert.equal(parseCliArgs(['remote','pair']).command,'subcommand');
  const f=await fixture();let runtimeCalls=0;
  const deps=(x:any)=>({io:x.api,repoRoot:f.root,paths:f.paths,createRuntimeContext:async()=>{runtimeCalls++;return {};}});
  for(const [argv,code] of [[['remote','--json'],'REMOTE_REQUIRES_TERMINAL'],[['remote','relay','--json'],'REMOTE_REQUIRES_TERMINAL'],[['remote','pair','--json'],'REMOTE_OPERATION_UNKNOWN'],[['remote','revoke','--json'],'REMOTE_PHONE_REQUIRED'],[['remote','list','extra','--json'],'REMOTE_EXTRA_ARGUMENT']] as const){
    const x=io();
    assert.notEqual(await runSubcommand(parseCliArgs([...argv]),deps(x)),0,argv.join(' '));
    assert.equal(JSON.parse(x.out.join('')).error.code,code,argv.join(' '));
  }
  assert.equal(runtimeCalls,0);
});

/* review 1 of 0.6.14 (A-3): a question in quotes is a prompt, and `talos remote --help` exits 0 like any family, with its operations */
test('talos remote --help lists its operations and exits 0; a quoted question is still a prompt',async()=>{
  assert.notEqual(parseCliArgs(['remote access is broken, why?']).command,'subcommand','one quoted argument is a prompt');
  const f=await fixture(),x=io();
  assert.equal(await runSubcommand(parseCliArgs(['remote','--help']),{io:x.api,repoRoot:f.root,paths:f.paths}),0);
  assert.match(x.out.join(''),/list, revoke, relay/u);
  const op=io();
  assert.equal(await runSubcommand(parseCliArgs(['remote','relay','--help']),{io:op.api,repoRoot:f.root,paths:f.paths}),0);
  assert.match(op.out.join(''),/talos remote relay \[n0\|<address>\]/u);
});
