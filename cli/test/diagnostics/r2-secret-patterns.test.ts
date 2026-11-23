/*
 * R2 lane J — gate E12 (owner yes 2026-09-24, also for v1 output): vendor-prefix secret VALUE patterns inside
 * `createRedactor(...).text`, the one seam every output path shares (gate §6.2). Mask unchanged: `[REDACTED:<bytes>]` (Q-R2-11).
 * Every secret-shaped fixture is ASSEMBLED AT RUNTIME from pieces, so repository secret scanners (GitHub push protection,
 * gitleaks) never see a literal token in this file — the trick Qwen uses in its own scanner test (gate §6.1).
 */
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import test from 'node:test';
import {createRedactor,redactObject} from '../../src/diagnostics/redact.ts';
import {createEventBridge} from '../../src/events/bridge.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {safeTalosFailure} from '../../src/errors.ts';

const j=(...parts:string[])=>parts.join('');
const ALNUM='aB3dE5fG7hJ9kLmN2pQ4rS6tU8vW0xYz';
/** A deterministic high-entropy-looking body of exactly `n` characters from `alphabet` (always contains digits). */
function body(n:number,alphabet=ALNUM){let out='';for(let i=0;i<n;i++)out+=alphabet[(i*7+3)%alphabet.length];return out;}
const UPPER='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const HEX='0123456789abcdef';
const b64url=(value:unknown)=>Buffer.from(typeof value==='string'?value:JSON.stringify(value),'utf8').toString('base64url');
const DASH5='-'.repeat(5);
const pem=(label:string,lines=4)=>j(DASH5,'BEGIN ',label,DASH5,'\n',...Array.from({length:lines},(_,i)=>body(64,ALNUM+'+/').slice(i)+body(i+1)+'\n'),DASH5,'END ',label,DASH5);
const mask=(value:string)=>`[REDACTED:${Buffer.byteLength(value,'utf8')}]`;

const MUST_MATCH:ReadonlyArray<readonly [string,string]>=[
  ['OpenAI legacy',j('s','k-',body(48))],
  ['OpenAI project with - and _',j('s','k-','proj-',body(40,ALNUM+'-_'),'_',body(20))],
  ['OpenAI service account',j('s','k-','svcacct-',body(56,ALNUM+'_-'))],
  ['OpenAI admin',j('s','k-','admin-',body(58))],
  ['Anthropic API',j('s','k-','ant-','api03-',body(93,ALNUM+'_-'),'AA')],
  ['Anthropic admin',j('s','k-','ant-','admin01-',body(80,ALNUM+'_-'))],
  ['OpenRouter',j('s','k-','or-','v1-',body(64,HEX))],
  ['GitHub classic',j('gh','p_',body(36))],
  ['GitHub OAuth',j('gh','o_',body(36))],
  ['GitHub user-to-server',j('gh','u_',body(36))],
  ['GitHub server-to-server',j('gh','s_',body(36))],
  ['GitHub refresh',j('gh','r_',body(36))],
  ['GitHub fine-grained',j('github','_pat_',body(22),'_',body(59))],
  ['GitLab personal',j('gl','pat-',body(20))],
  ['GitLab personal long',j('gl','pat-',body(48,ALNUM+'_-'))],
  ['GitLab OAuth app',j('gl','oas-',body(64))],
  ['GitLab deploy',j('gl','dt-',body(20))],
  ['GitLab runner',j('gl','rt-',body(24))],
  ['GitLab runner registration',j('gl','rtr-',body(24))],
  ['GitLab CI job',j('gl','cbt-',body(24))],
  ['GitLab trigger',j('gl','ptt-',body(40,HEX))],
  ['GitLab feed',j('gl','ft-',body(20))],
  ['GitLab incoming mail',j('gl','imt-',body(20))],
  ['GitLab agent',j('gl','agent-',body(50))],
  ['GitLab workspace',j('gl','wt-',body(24))],
  ['GitLab SCIM',j('gl','soat-',body(24))],
  ['GitLab feature flags',j('gl','ffct-',body(24))],
  ['Slack bot',j('xo','xb-',body(12,'0123456789'),'-',body(13,'0123456789'),'-',body(24))],
  ['Slack user',j('xo','xp-',body(12,'0123456789'),'-',body(24))],
  ['Slack app-level',j('xo','xa-','2-',body(30))],
  ['Slack refresh',j('xo','xr-',body(30))],
  ['Slack session',j('xo','xs-',body(30))],
  ['Slack app token',j('xa','pp-','1-',body(11,UPPER),'-',body(13,'0123456789'),'-',body(64,HEX))],
  ['Google API',j('AI','za',body(35,ALNUM+'_-'))],
  ['AWS access key',j('AK','IA',body(16,UPPER))],
  ['AWS temporary key',j('AS','IA',body(16,UPPER))],
  ['Hugging Face',j('h','f_',body(34))],
  ['npm',j('np','m_',body(36))],
  ['PEM RSA private key',pem(j('RSA ','PRIVATE',' KEY'))],
  ['PEM PKCS#8 private key',pem(j('PRIVATE',' KEY'))],
  ['PEM encrypted private key',pem(j('ENCRYPTED ','PRIVATE',' KEY'))],
  ['PEM OpenSSH private key',pem(j('OPENSSH ','PRIVATE',' KEY'),6)],
  ['PEM EC private key',pem(j('EC ','PRIVATE',' KEY'),2)],
  ['JWT',j(b64url({alg:'HS256',typ:'JWT'}),'.',b64url({sub:'1234567890',name:'Test User',iat:1726000000}),'.',body(43,ALNUM+'-_'))],
];

const CONTEXTS:ReadonlyArray<(value:string)=>string>=[
  value=>value,
  value=>`request failed with ${value} while retrying`,
  value=>`{"message":"${value}","ok":false}`,
  value=>`'${value}'`,
  value=>`(${value})`,
  value=>`line one\n${value}\nline three`,
  value=>`${value}.`,
  value=>`${value}, then`,
];

test('E12 RED — every vendor-prefix secret shape is masked in place, exactly, whatever surrounds it',()=>{
  const redactor=createRedactor([]);
  for(const [name,value] of MUST_MATCH){
    for(const context of CONTEXTS){
      const input=context(value);
      const output=redactor.text(input);
      assert.equal(output.includes(value),false,`${name} leaked in: ${JSON.stringify(input.slice(0,40))}`);
      assert.equal(output,input.replace(value,mask(value)),`${name}: the mask must cover exactly the token`);
    }
  }
});

test('E12 RED — Bearer credentials of 20+ characters are masked, the scheme word stays readable',()=>{
  const redactor=createRedactor([]);
  const token=body(40,ALNUM+'._~+/-');
  for(const scheme of ['Bearer','bearer','BEARER']){
    const input=`curl -H "X-Upstream: ${scheme} ${token}" https://example.invalid`;
    assert.equal(redactor.text(input),`curl -H "X-Upstream: ${scheme} ${mask(token)}" https://example.invalid`);
  }
  const padded=body(30)+'==';
  assert.equal(redactor.text(`sent Bearer ${padded} upstream`),`sent Bearer ${mask(padded)} upstream`);
});

test('E12 RED — a PEM private key cut off before its END line is still masked to the end of its body',()=>{
  const redactor=createRedactor([]);
  const full=pem(j('RSA ','PRIVATE',' KEY'),3);
  const cut=full.slice(0,full.indexOf(j(DASH5,'END')));
  const output=redactor.text(`stderr:\n${cut}`);
  assert.equal(output.includes(body(64,ALNUM+'+/')),false,'the key body leaked');
  assert.match(output,/^stderr:\n\[REDACTED:\d+\]/u);
});

const MUST_NOT_MATCH:ReadonlyArray<readonly [string,string]>=[
  ['short sk- word','sk-short'],
  ['sk- below the length floor',j('s','k-',body(19))],
  ['kebab-case sk- identifier without a digit','sk-learn-compatible-estimator-wrapper-class'],
  ['sk- inside a longer word','task-board-facade-0123456789abcdefghij'],
  ['sk- inside a path segment','C:\\Users\\me\\projects\\desk-top-9f3a2b7c4d1e5f6a7b8c9d0e\\index.ts'],
  ['GitHub one character short',j('gh','p_',body(35))],
  ['GitHub prefix in a file name','/home/me/ghp_notes/readme.md'],
  ['GitLab too short',j('gl','pat-','abc123')],
  ['Slack too short',j('xo','xb-','123')],
  ['Google too short',j('AI','za','Sy',body(10))],
  ['AWS too short','AKIA1234'],
  ['AWS inside a longer word',j('X','AK','IA',body(16,UPPER),'X')],
  ['AWS lowercase',j('ak','ia',body(16).toLowerCase())],
  ['Asia the continent','Asia is a continent and ASIAN markets opened'],
  ['Hugging Face cache dir','HF_HOME points at hf_cache_dir'],
  ['npm env var','npm_config_cache=C:\\npm-cache npm_lifecycle_event=test'],
  ['bearer of bad news','the bearer of bad news said: Bearer token required'],
  ['Bearer with a short token','Bearer abc123def456'],
  ['Bearer with a long plain word','Bearer internationalization'],
  ['KEYBOARD assignment','KEYBOARD=notsecret'],
  ['git SHA-1','commit e3b0c44298fc1c149afbf4c8996fb92427ae41e4 (HEAD -> main)'],
  ['SHA-256','sha256 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'],
  ['UUID','session 123e4567-e89b-12d3-a456-426614174000 resumed'],
  ['base64 of normal text',Buffer.from('Hello, this is a perfectly normal sentence about TALOS and its tools.','utf8').toString('base64')],
  ['base64 of JSON text',Buffer.from(JSON.stringify({hello:'world',n:1,list:[1,2,3]}),'utf8').toString('base64')],
  ['two base64url JSON segments (no signature)',j(b64url({alg:'none'}),'.',b64url({sub:'x'}))],
  ['dotted version string','eyJ.version.1.2.3'],
  ['PEM public key',j(DASH5,'BEGIN PUBLIC KEY',DASH5,'\n',body(64,ALNUM+'+/'),'\n',DASH5,'END PUBLIC KEY',DASH5)],
  ['PEM certificate',j(DASH5,'BEGIN CERTIFICATE',DASH5,'\n',body(64,ALNUM+'+/'),'\n',DASH5,'END CERTIFICATE',DASH5)],
  ['an existing mask','token [REDACTED:12] and [REDACTED]'],
  ['English prose','The skeleton key sketch asks for a GitHub token; see docs/ghp.md and the gl-pat guide.'],
];

test('E12 RED — false-positive guards: English, paths, UUIDs, git SHAs and base64 of normal text pass unchanged',()=>{
  const redactor=createRedactor([]);
  for(const [name,input] of MUST_NOT_MATCH)assert.equal(redactor.text(input),input,name);
});

test('E12 — value patterns are additive: name-based masking, usage counters and exact values behave as before',()=>{
  const out=redactObject({usage:{prompt_tokens:12,completion_tokens:3},provider:{apiKey:'abcdef',note:'token=xyz'},safe:'ok'},['xyz']) as any;
  assert.deepEqual(out.usage,{prompt_tokens:'[REDACTED]',completion_tokens:'[REDACTED]'},'diagnostics redactObject keeps its substring key rule (v1 behaviour, frozen)');
  assert.equal(out.provider.apiKey,'[REDACTED:6]');
  assert.equal(out.provider.note,'token=[REDACTED:3]');
  assert.equal(out.safe,'ok');
  const exact=createRedactor(['plain-secret-value']);
  assert.equal(exact.text('x plain-secret-value y'),'x [REDACTED:18] y');
});

test('E12 RED — the shared seam reaches every output path: redactObject, v1 bridge, v2 bridge and the failure envelope',()=>{
  const secret=j('gh','p_',body(36));
  const nested=redactObject({detail:{list:[`clone with ${secret}`]}}) as any;
  assert.equal(nested.detail.list[0],`clone with ${mask(secret)}`);

  const v1=createEventBridge('session-1',()=> '2026-09-24T00:00:00.000Z').translate({type:'TextMessageContent',messageId:'m',delta:`here: ${secret}`});
  assert.ok(v1);
  assert.equal(JSON.stringify(v1).includes(secret),false,'v1 stream leaked the token');

  const v2=createV2EventBridge('session-1',()=> '2026-09-24T00:00:00.000Z').translate({type:'TextMessageContent',_sequenza:1,messageId:'m',delta:`here: ${secret}`});
  assert.ok(v2);
  assert.equal(JSON.stringify(v2).includes(secret),false,'v2 stream leaked the token');

  const failure=safeTalosFailure(new Error(`upstream rejected ${secret}`),{component:'provider',traceId:'t'},[]);
  assert.equal(JSON.stringify(failure).includes(secret),false,'failure envelope leaked the token');
});

test('E12 — bounded quantifiers: adversarial near-misses of 200k characters finish quickly',()=>{
  const redactor=createRedactor([]);
  const inputs=[
    j('s','k-','a-'.repeat(100_000)),
    j('ey','J').repeat(70_000),
    j('Bearer ','x'.repeat(19),' ').repeat(9_000),
    j(DASH5,'BEGIN ','PRIVATE',' KEY',DASH5,'\n').repeat(6_000),
    'AKIA'.repeat(50_000),
  ];
  for(const input of inputs){
    const started=performance.now();
    redactor.text(input);
    assert.ok(performance.now()-started<1500,`slow input ${JSON.stringify(input.slice(0,24))}: ${Math.round(performance.now()-started)} ms`);
  }
});

test('E12 — the frozen v1 goldens hold no secret-shaped value: the redactor leaves every byte as it is',async()=>{
  const root=new URL('../fixtures/protocol/v1/',import.meta.url);
  const names=(await readdir(root)).sort();
  assert.equal(names.length,7);
  const redactor=createRedactor([]);
  for(const name of names){
    const raw=await readFile(new URL(name,root),'utf8');
    assert.equal(redactor.text(raw),raw,name);
  }
});
