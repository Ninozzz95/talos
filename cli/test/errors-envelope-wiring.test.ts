import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../src/main.ts';
import {TalosError} from '../src/errors.ts';

// APPDATA and LOCALAPPDATA are what `resolveCliPaths` reads on win32; the XDG trio is what it reads elsewhere.
// Setting only one family lets the other platform's real profile config leak into every test below.
const ENV_KEYS=['APPDATA','LOCALAPPDATA','XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','TALOS_TRACE_ID','TALOS_API_KEY'] as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
// C0, DEL, C1 (which holds U+0085 NEL and U+009B CSI), U+2028, U+2029.
const CONTROL=/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

function fakeIo(){const out:string[]=[];const err:string[]=[];return{out,err,io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''}};}

type Format='json'|'stream-json'|'text';
/** Runs one failing headless invocation in `format` with an isolated profile, and returns what a person or CI would see. */
async function failing(format:Format,thrown:unknown,env:Record<string,string|undefined>={},projectConfig?:string){
  const root=await mkdtemp(join(tmpdir(),'talos-envelope-'));
  const previous=Object.fromEntries(ENV_KEYS.map(k=>[k,process.env[k]])) as Record<string,string|undefined>;
  process.env.APPDATA=join(root,'appdata');process.env.LOCALAPPDATA=join(root,'localappdata');
  process.env.XDG_CONFIG_HOME=join(root,'config');process.env.XDG_STATE_HOME=join(root,'state');process.env.XDG_CACHE_HOME=join(root,'cache');
  delete process.env.TALOS_TRACE_ID;delete process.env.TALOS_API_KEY;
  for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  const project=join(root,'project');await mkdir(join(project,'.talos-cli'),{recursive:true});
  if(projectConfig!==undefined)await writeFile(join(project,'.talos-cli','config.json'),projectConfig);
  const f=fakeIo();let runtimeCalls=0;
  const argv=['--project',project,'-p','work',...(format==='json'?['--json']:format==='stream-json'?['--output-format','stream-json']:[])];
  try{
    const code=await main(argv,{io:f.io as any,createRuntime:async()=>{runtimeCalls++;throw thrown;}} as never);
    return{code,stdout:f.out.join(''),stderr:f.err.join(''),runtimeCalls};
  }finally{
    for(const k of ENV_KEYS){const v=previous[k];if(v===undefined)delete process.env[k];else process.env[k]=v;}
    await rm(root,{recursive:true,force:true});
  }
}

const unreachable=()=>Object.assign(new Error('provider unavailable'),{code:'PROVIDER_UNREACHABLE'});

test('one failure produces the identical envelope in json and in stream-json',async()=>{
  const env={TALOS_TRACE_ID:'trace-fixed-1'};
  const asJson=await failing('json',unreachable(),env);
  const asStream=await failing('stream-json',unreachable(),env);

  const result=JSON.parse(asJson.stdout.trim());
  assert.equal(result.schema,'talos.cli.result.v1');
  assert.equal(result.ok,false);
  assert.equal(result.error.code,'PROVIDER_UNREACHABLE');
  assert.equal(result.error.message,'provider unavailable');
  assert.equal(result.error.details.traceId,'trace-fixed-1');
  assert.equal(result.error.details.component,'cli');
  assert.equal(result.error.details.retryable,false);

  const event=JSON.parse(asStream.stdout.trim());
  assert.equal(event.schema,'talos.cli.event.v1');
  assert.equal(event.type,'run.failed');
  assert.equal(event.data.message,'provider unavailable');
  const {message:_dropped,...streamEnvelope}=event.data;
  assert.deepEqual(streamEnvelope,result.error.details);
});

test('a secret planted in the message, in a detail and in the trace field reaches none of the three formats',async()=>{
  const secret='sk-live-9f3a2b7c4d1e';
  const env={TALOS_API_KEY:secret,TALOS_TRACE_ID:`trace-${secret}`};
  const thrown=()=>new TalosError({
    code:'PROVIDER_AUTH_REJECTED',component:'provider-gateway',retryable:true,
    hint:`Rotate ${secret} and retry`,
    docs:`https://example.invalid/keys?value=${secret}`,
    traceId:`trace-${secret}`
  },new Error(`auth rejected for ${secret}`));

  const asJson=await failing('json',thrown(),env);
  const asStream=await failing('stream-json',thrown(),env);
  const asText=await failing('text',thrown(),env);

  const result=JSON.parse(asJson.stdout.trim());
  // The fields must actually be present, or "the secret is absent" would be true for the wrong reason.
  assert.equal(result.error.details.component,'provider-gateway');
  assert.equal(result.error.details.retryable,true);
  assert.ok(String(result.error.details.traceId).startsWith('trace-'));
  assert.ok(String(result.error.details.hint).length>0);
  assert.ok(String(result.error.details.cause.message).length>0);

  for(const [name,text] of [['json',asJson.stdout],['stream-json',asStream.stdout],['text',asText.stderr]] as const){
    assert.equal(text.includes(secret),false,`${name} leaked the secret: ${text}`);
    assert.ok(text.includes('[REDACTED:'),`${name} did not carry a redaction marker: ${text}`);
  }
});

test('a code-shaped secret is redacted in the top-level error.code, not only inside details',async()=>{
  const declared='sk-live-9f3a2b7c4d1e';
  const derived='SKLIVE_9F3A2B7C4D1E';
  const rows=[
    {secret:declared,thrown:()=>Object.assign(new Error('boom'),{code:declared})},
    {secret:derived,thrown:()=>new Error(derived)}
  ];
  for(const row of rows){
    const env={TALOS_API_KEY:row.secret};
    const asJson=await failing('json',row.thrown(),env);
    const result=JSON.parse(asJson.stdout.trim());
    assert.equal(String(result.error.code).includes(row.secret),false,`top-level error.code leaked: ${asJson.stdout}`);
    assert.match(String(result.error.code),/^\[REDACTED:\d+\]$/u);
    assert.equal(result.error.code,result.error.details.code);
    const asStream=await failing('stream-json',row.thrown(),env);
    const asText=await failing('text',row.thrown(),env);
    for(const [name,text] of [['json',asJson.stdout],['stream-json',asStream.stdout],['text',asText.stderr]] as const)assert.equal(text.includes(row.secret),false,`${name} leaked ${row.secret}: ${text}`);
  }
});

test('named failures derive their public exit code from the canonical envelope code',async()=>{
  const rows=[
    {name:'PROVIDER_UNREACHABLE',thrown:()=>Object.assign(new Error('offline'),{code:'PROVIDER_UNREACHABLE'}),code:'PROVIDER_UNREACHABLE',exit:12},
    {name:'PROJECT_TRUST_REQUIRED',thrown:()=>Object.assign(new Error('untrusted'),{code:'PROJECT_TRUST_REQUIRED'}),code:'PROJECT_TRUST_REQUIRED',exit:2},
    {name:'SESSION_NOT_FOUND',thrown:()=>Object.assign(new Error('gone'),{code:'SESSION_NOT_FOUND'}),code:'SESSION_NOT_FOUND',exit:15},
    {name:'INTERRUPTED',thrown:()=>Object.assign(new Error('stopped'),{code:'INTERRUPTED'}),code:'INTERRUPTED',exit:130},
    {name:'TALOS_RUNTIME_NOT_FOUND',thrown:()=>new Error('TALOS_RUNTIME_NOT_FOUND'),code:'TALOS_RUNTIME_NOT_FOUND',exit:2},
    // Usage prose is normalized to one stable envelope code before exit-code classification.
    {name:'Unsupported model operation: x',thrown:()=>new Error('Unsupported model operation: x'),code:'CLI_USAGE_ERROR',exit:2},
    {name:'MXC_BACKEND_UNAVAILABLE: x',thrown:()=>new Error('MXC_BACKEND_UNAVAILABLE: x'),code:'MXC_BACKEND_UNAVAILABLE',exit:70},
    {name:'CONFIG_UNKNOWN_KEY:bogusKey',thrown:()=>new Error('CONFIG_UNKNOWN_KEY:bogusKey'),code:'CONFIG_UNKNOWN_KEY',exit:11},
    // A bare single word is a whole-message token and keeps its meaning: INTERRUPTED exits 130 without a declared code.
    {name:'INTERRUPTED (message only)',thrown:()=>new Error('INTERRUPTED'),code:'INTERRUPTED',exit:130},
    // A lone word or a drive letter before a colon is prose. None of these may report the word as a code.
    {name:'ERROR: disk full',thrown:()=>new Error('ERROR: disk full'),code:'INTERNAL_ERROR',exit:70},
    {name:'OK: all good',thrown:()=>new Error('OK: all good'),code:'INTERNAL_ERROR',exit:70},
    {name:'Windows path',thrown:()=>new Error(['C:','Users','x','file.txt'].join(String.fromCharCode(92))),code:'INTERNAL_ERROR',exit:70},
    {name:'INTERRUPTED: stopped',thrown:()=>new Error('INTERRUPTED: stopped'),code:'INTERNAL_ERROR',exit:70},
    {name:'ERROR_: x',thrown:()=>new Error('ERROR_: x'),code:'INTERNAL_ERROR',exit:70}
  ];
  for(const row of rows){
    const run=await failing('json',row.thrown());
    const result=JSON.parse(run.stdout.trim());
    assert.equal(result.error.code,row.code,`code for ${row.name}`);
    assert.equal(result.error.details.code,row.code,`envelope code for ${row.name}`);
    assert.equal(run.code,row.exit,`exit code for ${row.name}`);
  }
  const okText=await failing('text',new Error('OK: all good'));
  // R2 lane E realignment (Q-R2-4, gate E6): the human failure is three lines — headline, what to do, "Details: … (CODE) ·
  // where" — with the code once and no trace or component (JSON and verbose only). The old one-line format is gone.
  assert.equal(okText.stderr,'Error: TALOS could not finish this action.\nTry again; if it happens again, keep the log for a report.\nDetails: OK: all good · (INTERNAL_ERROR) · see talos logs\n');
});

test('a failure raised by the real config loader keeps its code token and its exit code',async()=>{
  const asJson=await failing('json',new Error('runtime must not be reached'),{},'{"bogusKey":1}');
  assert.equal(asJson.runtimeCalls,0,'the config loader must fail before the runtime is created');
  const result=JSON.parse(asJson.stdout.trim());
  assert.equal(result.error.code,'CONFIG_UNKNOWN_KEY');
  assert.equal(result.error.details.code,'CONFIG_UNKNOWN_KEY');
  assert.equal(result.error.message,'CONFIG_UNKNOWN_KEY:bogusKey');
  assert.equal(asJson.code,11);

  const asText=await failing('text',new Error('runtime must not be reached'),{},'{"bogusKey":1}');
  // R2 lane E (gate E6): the code is printed once; the payload after its colon is the detail, worded as a configuration fault.
  assert.equal(asText.stderr,'Error: The command or the configuration is not valid.\nCheck the command, its options and the configuration.\nDetails: bogusKey · (CONFIG_UNKNOWN_KEY) · see talos --help\n');
  assert.equal(asText.code,11);

  const secretField=await failing('json',new Error('runtime must not be reached'),{},'{"providerRuntime":{"apiKey":"x"}}');
  const forbidden=JSON.parse(secretField.stdout.trim());
  assert.equal(forbidden.error.code,'SECRET_FIELD_FORBIDDEN');
  assert.equal(forbidden.error.message,'SECRET_FIELD_FORBIDDEN:config.providerRuntime.apiKey');
  assert.equal(secretField.code,70);
});

// R2 lane E realignment (Q-R2-4, gate E6): three lines instead of one; the trace id is JSON/verbose only.
test('the human format is three readable lines (what · what to do · details) and never becomes a JSON dump',async()=>{
  const run=await failing('text',new TalosError({code:'SANDBOX_REQUIRED_UNAVAILABLE',component:'execution-broker',retryable:false,hint:'Install the Windows sandbox backend',traceId:'trace-human-1'},new Error('processmodel.dll export missing')));
  assert.equal(run.stdout,'');
  const lines=run.stderr.split('\n').filter(Boolean);
  assert.equal(lines.length,3,`expected three lines, got ${JSON.stringify(run.stderr)}`);
  assert.equal(run.stderr.endsWith('\n'),true);
  assert.equal(run.stderr.includes('{'),false,`human output became a JSON dump: ${run.stderr}`);
  assert.equal(lines[0],'Error: The Windows sandbox is not available, so the command did not run.');
  assert.equal(lines[1],'Install the Windows sandbox backend','the thrower\'s own hint is the "what to do"');
  assert.equal(lines[2],'Details: processmodel.dll export missing · (SANDBOX_REQUIRED_UNAVAILABLE) · see talos doctor');
  assert.equal(run.stderr.includes('trace-human-1'),false,'the trace id is JSON-only outside verbose');
  assert.equal(run.code,10);
});

test('control characters in any field cannot forge a second human line or reach the terminal raw',async()=>{
  const thrown=()=>new TalosError({
    code:'PROVIDER_UNREACHABLE\nError [OK]',
    component:'gateway\u001b[2J',
    retryable:true,
    hint:'retry\u2028later\u0085now\u009b31m',
    traceId:'trace\u2029z\u007f'
  },new Error('provider said\r\nError [OK]: forged line\u0000'));
  const asText=await failing('text',thrown());
  assert.equal(asText.stderr.endsWith('\n'),true);
  // R2 lane E realignment (Q-R2-4): three rows, each free of raw controls; component and trace left the human format.
  const body=asText.stderr.slice(0,-1);const rows=body.split('\n');
  assert.equal(rows.length,3,body);
  for(const row of rows)assert.equal(CONTROL.test(row),false,`raw control character reached stderr: ${JSON.stringify(asText.stderr)}`);
  assert.ok(body.includes('(PROVIDER_UNREACHABLE\\u000aError [OK])'),body);
  assert.ok(body.includes('retry\\u2028later\\u0085now\\u009b31m'),body);
  assert.ok(body.includes('provider said\\u000d\\u000aError [OK]: forged line\\u0000'),body);
  assert.equal(body.includes('gateway'),false,body);assert.equal(body.includes('trace\\u2029z'),false,body);

  // The machine formats keep the values exactly; JSON escaping is the consumer's contract there.
  const result=JSON.parse((await failing('json',thrown())).stdout.trim());
  assert.equal(result.error.details.component,'gateway\u001b[2J');
  assert.equal(result.error.details.hint,'retry\u2028later\u0085now\u009b31m');
  assert.equal(result.error.message,'provider said\r\nError [OK]: forged line\u0000');

  const plain=await failing('text',Object.assign(new Error('provider said\nError [OK]: forged'),{code:'PROVIDER_UNREACHABLE'}));
  assert.equal(plain.stderr.split('\n').length,4,`a plain message forged a line: ${JSON.stringify(plain.stderr)}`);// R2: three rows + the final newline
});

test('bidi, zero-width, BOM and lone surrogates are escaped in the human line and kept exactly in JSON',async()=>{
  const ch=(n:number)=>String.fromCharCode(n);
  const escaped=(n:number)=>String.fromCharCode(92)+'u'+n.toString(16).padStart(4,'0');
  // One row per class. The set is the one slice 13 escapes in the approval dialog, with the same convention,
  // because two surfaces must not disagree on what counts as a control.
  const rows:[string,number[]][]=[
    ['bidi embedding and override U+202A..U+202E',[0x202a,0x202b,0x202c,0x202d,0x202e]],
    ['bidi isolates U+2066..U+2069',[0x2066,0x2067,0x2068,0x2069]],
    ['arabic letter mark U+061C',[0x061c]],
    ['zero-width U+200B..U+200D',[0x200b,0x200c,0x200d]],
    ['byte order mark U+FEFF',[0xfeff]],
    ['lone high surrogates',[0xd800,0xdbff]],
    ['lone low surrogates',[0xdc00,0xdfff]]
  ];
  for(const [name,codes] of rows){
    for(const n of codes){
      const message=`invoice${ch(n)}fdp.exe`;
      const text=await failing('text',Object.assign(new Error(message),{code:'PROVIDER_UNREACHABLE'}));
      assert.equal(text.stderr.includes(ch(n)),false,`${name}: raw U+${n.toString(16)} reached stderr`);
      assert.ok(text.stderr.includes(`invoice${escaped(n)}fdp.exe`),`${name}: U+${n.toString(16)} not rendered as an escape: ${JSON.stringify(text.stderr)}`);
      const json=JSON.parse((await failing('json',Object.assign(new Error(message),{code:'PROVIDER_UNREACHABLE'}))).stdout.trim());
      assert.equal(json.error.message,message,`${name}: the JSON value changed`);
    }
  }
  // Not over-escaped: a well-formed surrogate pair, accented and CJK text stay readable in the human line.
  const readable=`ok ${ch(0xd83d)+ch(0xde00)} ${ch(0xe9)} ${ch(0x4e2d)}`;
  const plain=await failing('text',Object.assign(new Error(readable),{code:'PROVIDER_UNREACHABLE'}));
  assert.ok(plain.stderr.includes(readable),`readable text was escaped: ${JSON.stringify(plain.stderr)}`);
});

test('TALOS_TRACE_ID is inherited only as printable non-space ASCII of at most 128 characters',async()=>{
  const accepted128='t'.repeat(127)+'~';
  const rejected={
    newline:'ci-run-7\nError [OK]: forged line (trace z)',
    whitespaceOnly:'   ',
    innerSpace:'ci run 7',
    ansi:'\u001b[2Jwiped',
    lineSeparator:'a\u2028b',
    nonAscii:'tracé',
    overLength:'t'.repeat(129),
    hundredThousand:'x'.repeat(100_000)
  };
  for(const [name,value] of Object.entries(rejected)){
    const result=JSON.parse((await failing('json',unreachable(),{TALOS_TRACE_ID:value})).stdout.trim());
    assert.match(String(result.error.details.traceId),UUID,`${name} was not replaced by a generated id`);
    const text=await failing('text',unreachable(),{TALOS_TRACE_ID:value});
    assert.equal(text.stderr.split('\n').length,4,`${name} forged a line: ${JSON.stringify(text.stderr.slice(0,200))}`);// R2: three rows + the final newline
    assert.ok(text.stderr.length<400,`${name} was emitted verbatim (${text.stderr.length} chars)`);
  }
  const kept=JSON.parse((await failing('json',unreachable(),{TALOS_TRACE_ID:accepted128})).stdout.trim());
  assert.equal(kept.error.details.traceId,accepted128);
});

test('an error that cannot be inspected still leaves through an envelope instead of an unhandled rejection',async()=>{
  const hostile={get code():string{throw new Error('code getter exploded');},get message():string{throw new Error('message getter exploded');}};
  const run=await failing('json',hostile);
  const result=JSON.parse(run.stdout.trim());
  assert.equal(result.schema,'talos.cli.result.v1');
  assert.equal(result.ok,false);
  assert.equal(result.error.details.code,'INTERNAL_ERROR');
  assert.equal(result.error.details.component,'cli');
  assert.equal(result.error.details.retryable,false);
  assert.ok(String(result.error.details.traceId).length>0);
  assert.equal(run.code,70);
});

test('a cyclic, BigInt or throwing field fails over safely, and fallback exit codes follow the fallback envelope',async()=>{
  const secret='sk-live-9f3a2b7c4d1e';
  const cyclic:any={};cyclic.self=cyclic;
  const fixedMessage='The failure could not be rendered safely';
  // `textFallback`: whether the human format falls back too. A BigInt only breaks JSON serialisation, so its text line renders normally.
  const rows=[
    // First on purpose: the fallback runs precisely because redaction failed, so the error's own message is unredacted
    // there, and a fallback that echoed it would leak exactly this.
    {name:'secret in the message itself, cyclic name',exit:12,textFallback:true,thrown:()=>Object.assign(new Error(`upstream said ${secret}`),{code:'PROVIDER_UNREACHABLE',name:cyclic})},
    {name:'cyclic cause name',exit:12,textFallback:true,thrown:()=>Object.assign(new Error('boom'),{code:'PROVIDER_UNREACHABLE',name:cyclic})},
    {name:'BigInt cause name',exit:12,textFallback:false,thrown:()=>Object.assign(new Error('boom'),{code:'PROVIDER_UNREACHABLE',name:10n})},
    {name:'throwing getter inside hint',exit:11,textFallback:true,thrown:()=>new TalosError({code:'PROVIDER_AUTH_REJECTED',component:'provider-gateway',retryable:false,hint:{get detail():string{throw new Error(`getter ${secret}`);}} as any,traceId:`trace-${secret}`})}
  ];
  const env={TALOS_API_KEY:secret,TALOS_TRACE_ID:'ci-inherited-7'};
  for(const row of rows){
    for(const format of ['json','stream-json','text'] as const){
      const run=await failing(format,row.thrown(),env);
      const text=format==='text'?run.stderr:run.stdout;
      const expectedExit=format==='text'&&!row.textFallback?row.exit:70;
      assert.equal(run.code,expectedExit,`${row.name} [${format}] exit code`);
      assert.equal(text.includes(secret),false,`${row.name} [${format}] leaked: ${text}`);
      // R2 lane E realignment (Q-R2-4): the human format is three rows; the machine formats stay one line.
      assert.equal(text.split('\n').length,format==='text'?4:2,`${row.name} [${format}] has the wrong number of lines`);
      if(format==='text'){
        if(row.textFallback)assert.equal(text,`Error: TALOS could not finish this action.\nTry again; if it happens again, keep the log for a report.\nDetails: ${fixedMessage} · (INTERNAL_ERROR) · see talos logs\n`,`${row.name} [text] did not fall back to the fixed lines: ${text}`);
        continue;
      }
      const parsed=JSON.parse(text.trim());
      assert.equal(format==='json'?parsed.error.message:parsed.data.message,fixedMessage,`${row.name} [${format}] fallback message must be the fixed text`);
      const envelope=format==='json'?parsed.error.details:(({message:_m,...rest})=>rest)(parsed.data);
      assert.deepEqual(Object.keys(envelope).sort(),['code','component','retryable','traceId'],`${row.name} [${format}] fallback carries extra fields`);
      assert.equal(envelope.code,'INTERNAL_ERROR');
      assert.equal(envelope.component,'cli');
      assert.equal(envelope.retryable,false);
      assert.match(String(envelope.traceId),UUID,`${row.name} [${format}] fallback trace id must be generated, not inherited or attacker-derived`);
    }
  }
});

test('without an inherited trace id every failure still carries a distinct non-empty one',async()=>{
  const first=JSON.parse((await failing('json',unreachable())).stdout.trim());
  const second=JSON.parse((await failing('json',unreachable())).stdout.trim());
  assert.match(String(first.error.details.traceId),UUID);
  assert.match(String(second.error.details.traceId),UUID);
  assert.notEqual(first.error.details.traceId,second.error.details.traceId);
});


test('startup argument failures use the same envelope renderer before a runtime exists',async()=>{
  for(const format of ['json','stream-json','text'] as const){
    const f=fakeIo();
    const argv=format==='json'
      ? ['--json','--permission-mode','BOGUS','-p','work']
      : format==='stream-json'
        ? ['--output-format','stream-json','--permission-mode','BOGUS','-p','work']
        : ['--permission-mode','BOGUS','-p','work'];
    const code=await main(argv,{io:f.io as any} as never);
    assert.equal(code,2);
    if(format==='text'){
      assert.equal(f.out.join(''),'');
      // R2 lane E realignment (Q-R2-4): three rows, the code once.
      assert.equal(f.err.join(''),'Error: The command line is not valid.\nCheck the command, its options and the configuration.\nDetails: Invalid permission mode: BOGUS · (CLI_USAGE_ERROR) · see talos --help\n');
      continue;
    }
    assert.equal(f.err.join(''),'');
    const parsed=JSON.parse(f.out.join('').trim());
    const envelope=format==='json'?parsed.error.details:(({message:_message,...rest})=>rest)(parsed.data);
    assert.equal(format==='json'?parsed.error.code:parsed.data.code,'CLI_USAGE_ERROR');
    assert.equal(envelope.code,'CLI_USAGE_ERROR');
    assert.equal(envelope.component,'cli');
    assert.equal(envelope.retryable,false);
    assert.ok(String(envelope.traceId).length>0);
  }
});
