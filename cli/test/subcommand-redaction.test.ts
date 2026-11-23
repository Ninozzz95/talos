import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {runSubcommand} from '../src/subcommands.ts';import {resolveCliPaths} from '../src/paths.ts';import {exitCodeForError} from '../src/errors.ts';
// B1 slice 17. The subcommand failure path wrote error messages without redaction, while main.ts redacted
// the same class of failure. Measured at f6deb873 through the built binary: with a secret in TALOS_TOKEN,
// `project status --token=<secret>` printed the secret twice in JSON stdout.
const SECRET='sk-live-SLICE17-4b9e2c7a1d';
function io(){const out:string[]=[];const err:string[]=[];return{out,err,api:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''}} as any;}
async function fixture(){const root=await mkdtemp(join(tmpdir(),'talos-s17-root-'));await mkdir(join(root,'harness-ui','src'),{recursive:true});const home=await mkdtemp(join(tmpdir(),'talos-s17-home-'));return{root,home,paths:resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home)};}
function inv(outputFormat:'json'|'stream-json'|'text',positionals:string[]){return{command:'subcommand',interactive:false,outputFormat,verbose:false,color:false,positionals} as any;}
// Hermetic on Windows: resolveCliPaths ignores XDG_* on win32, so APPDATA and LOCALAPPDATA are pointed away
// from the real profile too. Two reviews in this phase measured tests reading the real profile otherwise.
// Hermetic in the environment as well: EVERY variable the redactor treats as secret is removed for the test's
// duration, because an ambient one changes what gets redacted — measured, GIT_PASSWORD=on or MAX_TOKENS=2 on the
// host turned three of these tests red. The name rule mirrors SECRET_KEY in cli/src/diagnostics/redact.ts.
const SECRET_NAME=/^(?:.*(?:api[-_]?key|authorization|password|secret|token).*)$/iu;
async function withEnv<T>(home:string,secret:string|undefined,run:()=>Promise<T>,name='TALOS_TOKEN'):Promise<T>{
  const keys=[...new Set([...Object.keys(process.env).filter(k=>SECRET_NAME.test(k)),name,'APPDATA','LOCALAPPDATA'])];
  const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  for(const k of keys)delete process.env[k];
  process.env.APPDATA=join(home,'appdata');process.env.LOCALAPPDATA=join(home,'localappdata');
  if(secret!==undefined)process.env[name]=secret;
  try{return await run();}finally{for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
}

test('a real failure that echoes an environment secret prints it in neither JSON field',async()=>{
  const f=await fixture(),x=io();
  const code=await withEnv(f.home,SECRET,()=>runSubcommand(inv('json',['project','status',`--token=${SECRET}`]),{io:x.api,repoRoot:f.root,paths:f.paths}));
  const printed=x.out.join('')+x.err.join('');
  assert.equal(printed.includes(SECRET),false,`secret reached the output: ${printed}`);
  const body=JSON.parse(x.out.join(''));
  assert.equal(body.ok,false);assert.match(body.error.message,/^Unknown option: --token=\[REDACTED:\d+\]$/u);
  assert.equal(code,2);
  // `--token=` is also caught by the redactor's assignment rule, so on its own it would pass with no
  // environment secrets at all. A neutral option name is caught only by the environment list.
  const neutral=io();
  await withEnv(f.home,SECRET,()=>runSubcommand(inv('json',['project','status',`--label=${SECRET}`]),{io:neutral.api,repoRoot:f.root,paths:f.paths}));
  assert.equal(neutral.out.join('').includes(SECRET),false,`secret reached the output: ${neutral.out.join('')}`);
});

test('the same failure in text mode prints no secret on stderr',async()=>{
  const f=await fixture(),x=io();
  const code=await withEnv(f.home,SECRET,()=>runSubcommand(inv('text',['project','status',`--label=${SECRET}`]),{io:x.api,repoRoot:f.root,paths:f.paths}));
  assert.equal(x.err.join('').includes(SECRET),false,`secret reached stderr: ${x.err.join('')}`);
  // R2 lane E realignment (Q-R2-4): three lines, the code once, no trace (JSON and verbose only).
  assert.match(x.err.join(''),/^Error: The command line is not valid.\n.+\nDetails: Unknown option: --label=\[REDACTED:\d+\] · \(CLI_USAGE_ERROR\) · see talos --help\n$/u);
  assert.equal(code,2);
});

test('a runtime context that fails with a secret in its message is redacted too',async()=>{
  const f=await fixture(),x=io();
  const failing=async()=>{throw new Error(`provider rejected key ${SECRET}`);};
  const code=await withEnv(f.home,SECRET,()=>runSubcommand(inv('json',['provider','list']),{io:x.api,repoRoot:f.root,paths:f.paths,createRuntimeContext:failing}));
  const printed=x.out.join('')+x.err.join('');
  assert.equal(printed.includes(SECRET),false,`secret reached the output: ${printed}`);
  assert.match(JSON.parse(x.out.join('')).error.message,/^provider rejected key \[REDACTED:\d+\]$/u);
  // 70, measured at f6deb873 with errors.ts unchanged: free text carries no taxonomy token. The slice's
  // first draft asserted 11, copied from a review report without measuring; 11 belongs to a coded error.
  assert.equal(code,70);
});

test('a secret held under a non-TALOS secret name is redacted as well',async()=>{
  // Only TALOS_TOKEN was exercised before, so treating that one name as secret — or ignoring *_API_KEY — survived.
  const f=await fixture(),x=io();
  const code=await withEnv(f.home,SECRET,()=>runSubcommand(inv('json',['project','status',`--label=${SECRET}`]),{io:x.api,repoRoot:f.root,paths:f.paths}),'OPENAI_API_KEY');
  assert.equal(x.out.join('').includes(SECRET),false,`secret reached the output: ${x.out.join('')}`);
  assert.equal(code,2);
});

test('text mode prints the redacted message of a coded error, not its code',async()=>{
  const f=await fixture(),x=io();
  const failing=async()=>{throw Object.assign(new Error(`provider rejected key ${SECRET}`),{code:'PROVIDER_AUTH_REJECTED'});};
  const code=await withEnv(f.home,SECRET,()=>runSubcommand(inv('text',['provider','list']),{io:x.api,repoRoot:f.root,paths:f.paths,createRuntimeContext:failing}));
  // R2 lane E realignment (Q-R2-4): the redacted message is the English detail; the code once.
  assert.match(x.err.join(''),/^Error: The provider key could not be used.\n.+\nDetails: provider rejected key \[REDACTED:\d+\] · \(PROVIDER_AUTH_REJECTED\) · see talos provider list\n$/u);
  assert.equal(code,11);
});

test('a secret inside a real error.code is redacted, while exit classification uses the canonical pre-redaction code',async()=>{
  const f=await fixture(),x=io();
  const raw=Object.assign(new Error('provider refused the request'),{code:`PROVIDER_REJECTED_${SECRET}`});
  const failing=async()=>{throw raw;};
  const code=await withEnv(f.home,SECRET,()=>runSubcommand(inv('json',['provider','list']),{io:x.api,repoRoot:f.root,paths:f.paths,createRuntimeContext:failing}));
  const printed=x.out.join('');
  assert.equal(printed.includes(SECRET),false,`secret reached the output: ${printed}`);
  assert.match(JSON.parse(printed).error.code,/^PROVIDER_REJECTED_\[REDACTED:\d+\]$/u);
  // The canonical envelope preserves the declared code before presentation redaction, so the taxonomy remains stable.
  assert.equal(code,exitCodeForError(raw));
});

test('the exit code is derived from the canonical pre-redaction envelope, not from redacted presentation text',async()=>{
  // A taxonomy failure keeps its number; a free-text failure keeps its number. Redaction must not
  // move either, because classification happens before presentation fields are redacted.
  const f=await fixture();
  const usage=io();
  assert.equal(await withEnv(f.home,SECRET,()=>runSubcommand(inv('json',['config','set']),{io:usage.api,repoRoot:f.root,paths:f.paths})),2);
  const typo=io();
  assert.equal(await withEnv(f.home,SECRET,()=>runSubcommand(inv('json',['project','status',`--token=${SECRET}`]),{io:typo.api,repoRoot:f.root,paths:f.paths})),2);
  // A secret can overlap a taxonomy token. Presentation redaction may rewrite the printed code, but
  // classification has already happened against the canonical envelope.
  const overlap=io();
  assert.equal(await withEnv(f.home,'CONFIG_SET',()=>runSubcommand(inv('json',['config','set']),{io:overlap.api,repoRoot:f.root,paths:f.paths})),2);
  assert.match(JSON.parse(overlap.out.join('')).error.code,/\[REDACTED:\d+\]/u);
});

test('with no secret in the environment the unified envelope remains stable and readable',async()=>{
  const f=await fixture();
  const json=io();
  assert.equal(await withEnv(f.home,undefined,()=>runSubcommand(inv('json',['project','status','--bogus']),{io:json.api,repoRoot:f.root,paths:f.paths})),2);
  const body=JSON.parse(json.out.join(''));
  assert.equal(body.ok,false);
  assert.equal(body.error.code,'CLI_USAGE_ERROR');
  assert.equal(body.error.message,'Unknown option: --bogus');
  assert.equal(body.error.details.code,'CLI_USAGE_ERROR');
  assert.equal(body.error.details.component,'cli');
  assert.equal(body.error.details.retryable,false);
  assert.ok(String(body.error.details.traceId).length>0);
  assert.deepEqual(json.err,[]);
  const text=io();
  assert.equal(await withEnv(f.home,undefined,()=>runSubcommand(inv('text',['project','status','--bogus']),{io:text.api,repoRoot:f.root,paths:f.paths})),2);
  // R2 lane E realignment (Q-R2-4).
  assert.match(text.err.join(''),/^Error: The command line is not valid.\n.+\nDetails: Unknown option: --bogus · \(CLI_USAGE_ERROR\) · see talos --help\n$/u);
  assert.deepEqual(text.out,[]);
});


test('stream-json subcommand failures expose the same redacted envelope as JSON',async()=>{
  const f=await fixture(),json=io(),stream=io();
  await withEnv(f.home,SECRET,()=>runSubcommand(inv('json',['project','status',`--label=${SECRET}`]),{io:json.api,repoRoot:f.root,paths:f.paths}));
  await withEnv(f.home,SECRET,()=>runSubcommand(inv('stream-json',['project','status',`--label=${SECRET}`]),{io:stream.api,repoRoot:f.root,paths:f.paths}));
  const jsonBody=JSON.parse(json.out.join(''));
  const event=JSON.parse(stream.out.join(''));
  assert.equal(event.type,'run.failed');
  assert.equal(event.data.message,jsonBody.error.message);
  const {message:_message,...streamEnvelope}=event.data;
  assert.equal(streamEnvelope.code,jsonBody.error.details.code);
  assert.equal(streamEnvelope.component,jsonBody.error.details.component);
  assert.equal(streamEnvelope.retryable,jsonBody.error.details.retryable);
  assert.ok(String(streamEnvelope.traceId).length>0);
  assert.ok(String(jsonBody.error.details.traceId).length>0);
  assert.equal(stream.out.join('').includes(SECRET),false);
});
