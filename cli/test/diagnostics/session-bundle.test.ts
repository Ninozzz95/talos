/*
 * 08/10/2026 (owner: «si approvo»): `talos diagnostic bundle --session <id|last>` puts ONE session's conversation in the bundle, opt-in, with secrets masked and
 * paths pseudonymised, so that the audit a person brings back carries what a defect needs. Until now the content flag was refused for good. These tests pin the
 * four promises of cli/src/diagnostics/session-bundle.ts (mask, fail closed, verify the output, bound the size) and the command around them.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {readZipEntries} from '../../src/archive/zip.ts';
import {runSystemCommand} from '../../src/commands/system-cli.ts';
import {createPathPseudonymizer} from '../../src/diagnostics/redact.ts';
import {buildSessionBundleEntry,sessionBundleFileName} from '../../src/diagnostics/session-bundle.ts';
import {resolveCliPaths} from '../../src/paths.ts';

const SECRET='env-secret-value-0123456789';
const ANTHROPIC_KEY='sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const BEARER='Bearer abcdefghijklmnopqrstuvwxyz0123456789ABCD';
const PEM='-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----';
const identity={value:(input:unknown)=>input};
const lines=(data:string)=>data.split('\n').filter(Boolean).map(line=>JSON.parse(line));
const build=(payload:unknown,extra:Partial<Parameters<typeof buildSessionBundleEntry>[0]>={})=>
  buildSessionBundleEntry({sessionId:'s-1',payload,secrets:[SECRET],pseudonymize:input=>identity.value(input),...extra});

test('SB-1: keys, tokens, PEM blocks, environment values and secret-named fields are masked everywhere in the conversation and in its metadata; counters survive',()=>{
  const entry=build({
    sessionId:'s-1',modello:'m',title:`about ${ANTHROPIC_KEY}`,
    eventi:[
      {type:'UserMessage',text:`my key is ${ANTHROPIC_KEY} and ${BEARER} and ${SECRET}`},
      {type:'ToolResult',output:`${PEM}\nAuthorization: ${BEARER}`,apiKey:'plain-api-key-value',password:'hunter2hunter2'},
      {type:'Usage',total_tokens:1234,max_tokens:8192,tokenLimitReached:false,tokens:{input:5,output:7}},
    ],
  });
  for(const leak of [ANTHROPIC_KEY,SECRET,'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC','plain-api-key-value','hunter2hunter2','abcdefghijklmnopqrstuvwxyz0123456789ABCD'])assert.equal(entry.data.includes(leak),false,`leaked: ${leak}`);
  assert.match(entry.data,/\[REDACTED:\d+\]/u);
  const usage=lines(entry.data).find(row=>row.type==='Usage');
  assert.deepEqual(usage,{type:'Usage',total_tokens:1234,max_tokens:8192,tokenLimitReached:false,tokens:{input:5,output:7}},'numbers and booleans under a secret-NAMED key are not secrets: a compaction bug is diagnosed with them');
  assert.equal(entry.summary.events,3);assert.equal(entry.summary.kept,3);assert.equal(entry.summary.truncated,false);
});

test('SB-1b: only a PLURAL counter key is walked; a singular token, a list of tokens or a strongly named key is masked whole, even with keepNumbers',()=>{
  const entry=build({eventi:[
    {type:'Usage',tokens:{input:5,output:7},total_tokens:12,inputTokens:{cached:3}},
    {type:'Auth',token:{value:'plain-looking-credential'},accessToken:'another-plain-looking-one',tokens:['list-entry-one-xx','list-entry-two-xx'],authorization:{tokens:{input:5}},apiKeyTokens:{n:1}},
  ]});
  const [usage,auth]=lines(entry.data).slice(1);
  assert.deepEqual(usage,{type:'Usage',tokens:{input:5,output:7},total_tokens:12,inputTokens:{cached:3}});
  for(const leak of ['plain-looking-credential','another-plain-looking-one','list-entry-one-xx','list-entry-two-xx'])assert.equal(entry.data.includes(leak),false,`leaked: ${leak}`);
  assert.equal(auth.authorization,'[REDACTED]');assert.equal(auth.apiKeyTokens,'[REDACTED]');assert.equal(auth.tokens,'[REDACTED]');assert.equal(auth.token,'[REDACTED]');
});

test('SB-2: paths go through the pseudonymiser, in events and in metadata',()=>{
  const pseudo=createPathPseudonymizer(['C:\\Users\\Someone\\private-project']);
  const entry=build({project:'C:\\Users\\Someone\\private-project',eventi:[{type:'ToolCall',path:'C:\\Users\\Someone\\private-project\\src\\a.ts'}]},{pseudonymize:input=>pseudo.value(input)});
  assert.equal(entry.data.includes('Someone'),false);
  assert.match(entry.data,/\[PATH:1\]/u);
});

test('SB-3: FAIL CLOSED — a value the redactor cannot walk (absurd depth) exports nothing at all',()=>{
  let deep:any={leaf:ANTHROPIC_KEY};for(let i=0;i<200_000;i+=1)deep={next:deep};
  assert.throws(()=>build({eventi:[{type:'Ok',text:'fine'},{type:'Hostile',value:deep}]}),(error:any)=>error?.code==='DIAGNOSTIC_REDACTION_FAILED'&&error?.message==='DIAGNOSTIC_REDACTION_FAILED');
});

test('SB-3b: a hole or a function in the event list is written as null; it never throws a raw TypeError',()=>{
  const entry=build({eventi:[undefined,{type:'Ok'},()=>1] as unknown[]});
  assert.deepEqual(lines(entry.data).slice(1),[null,{type:'Ok'},null]);
  assert.equal(entry.summary.events,3);
});

test('SB-4: the independent check — a transformation that brings a secret back is caught on the serialised output, raw or JSON-escaped',()=>{
  const putBack=(input:unknown)=>JSON.parse(JSON.stringify(input).replace(/\[REDACTED:\d+\]/gu,SECRET));
  assert.throws(()=>build({eventi:[{type:'UserMessage',text:`x ${SECRET}`}]},{pseudonymize:putBack}),(error:any)=>error?.code==='DIAGNOSTIC_REDACTION_FAILED');
  const awkward='quote"and\\slash-secret-value';
  const putBackEscaped=(input:unknown)=>JSON.parse(JSON.stringify(input).replace(/\[REDACTED:\d+\]/gu,awkward.replace(/["\\]/gu,match=>`\\${match}`)));
  assert.throws(()=>buildSessionBundleEntry({sessionId:'s',payload:{eventi:[{text:`x ${awkward}`}]},secrets:[awkward],pseudonymize:putBackEscaped}),(error:any)=>error?.code==='DIAGNOSTIC_REDACTION_FAILED','a secret with quotes and backslashes is found in its escaped form too');
  /* AL CONTRARIO: a short environment value (under 8 characters) is masked by the redactor but is never what aborts an export. */
  /* the mask of a short value is itself made of letters and digits (`[REDACTED:1]` contains "1" and "RED"): checking short values would abort every export */
  assert.doesNotThrow(()=>buildSessionBundleEntry({sessionId:'s',payload:{eventi:[{text:'a 1 b'}]},secrets:['1','RED'],pseudonymize:input=>input}));
});

test('SB-5: bounded — the first event, a visible gap, then the most recent events that fit; one giant event is clipped to its head',()=>{
  const big='X'.repeat(300);
  const events=Array.from({length:50},(_,index)=>({type:'E',index,text:big}));
  const entry=build({eventi:events},{maxBytes:6_000});
  const parsed=lines(entry.data);
  assert.ok(Buffer.byteLength(entry.data)<=6_000,`size ${Buffer.byteLength(entry.data)}`);
  assert.equal(parsed[0].schema,'talos.cli.diagnostic.session.v1');
  assert.equal(parsed[0].truncated,true);assert.equal(parsed[0].events,50);assert.equal(parsed[0].kept+parsed[0].omitted,50);
  assert.equal(parsed[1].index,0,'the first event stays: how the session began');
  assert.deepEqual(parsed[2],{talosDiagnostic:'omitted',events:parsed[0].omitted},'the gap is written where it is');
  assert.equal(parsed.at(-1).index,49,'the most recent event stays');
  const giant=build({eventi:[{type:'Small'},{type:'Giant',text:'Y'.repeat(100_000)},{type:'Small2'}]},{maxBytes:40_000});
  const rows=lines(giant.data);
  assert.equal(rows[2].talosDiagnostic,'event-clipped');assert.ok(rows[2].bytes>100_000);assert.equal(giant.summary.clipped,1);
  assert.ok(Buffer.byteLength(giant.data)<=40_000);
  /* AL CONTRARIO: a session that fits is not touched. */
  const small=build({eventi:[{type:'A'},{type:'B'}]});
  assert.equal(small.summary.truncated,false);assert.equal(small.summary.omitted,0);assert.equal(lines(small.data).length,3);
});

test('SB-6: linear in the number of events (a 200,000-event journal is cut in well under a few seconds)',()=>{
  const events=Array.from({length:200_000},(_,index)=>({type:'E',index}));
  const began=Date.now();
  const entry=build({eventi:events},{maxBytes:1_000_000});
  assert.ok(Date.now()-began<8_000,`took ${Date.now()-began} ms`);
  assert.ok(entry.summary.truncated);assert.ok(Buffer.byteLength(entry.data)<=1_000_000);
});

test('SB-7: the file name is safe whatever the id',()=>{
  assert.equal(sessionBundleFileName('abc-123'),'session-abc-123.jsonl');
  assert.equal(sessionBundleFileName('../../etc/passwd'),'session-etcpasswd.jsonl');
  assert.equal(sessionBundleFileName(''),'session-unknown.jsonl');
});

/* ---- the command ---- */
function sealedKeyring(){return{keyring:{resolve:()=>{throw Object.assign(new Error('sealed by the test'),{code:'MODULE_NOT_FOUND'});},load:()=>{throw new Error('the sealed test keyring never loads a module');}}};}
async function command(registry:any){
  const root=await mkdtemp(join(tmpdir(),'talos-sbx-'));await mkdir(join(root,'harness-ui','src'),{recursive:true});
  const home=await mkdtemp(join(tmpdir(),'talos-sbh-'));
  const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);
  for(const p of [paths.configRoot,paths.dataRoot,paths.cacheRoot,paths.logsRoot])await mkdir(p,{recursive:true});
  const out:string[]=[];
  const c:any={invocation:{outputFormat:'text'},io:{writeOut:(s:string)=>out.push(s),writeErr:()=>{},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:root,repoRoot:root,paths,
    createRuntimeContext:async()=>({registry,runtime:{listSessions:async()=>[{id:'s-old',sessionId:'s-old'},{id:'s-new',sessionId:'s-new'}]}})};
  return{root,paths,out,c};
}
const registry=(extra:Record<string,unknown>={})=>({esporta:(id:string)=>id==='s-new'||id==='s-old'?{sessionId:id,title:'t',eventi:[{type:'UserMessage',text:`key ${ANTHROPIC_KEY}`},{type:'Usage',total_tokens:7}]}:null,...extra});
const entriesOf=async(file:string)=>readZipEntries(await readFile(file));

test('SB-8: without --session the bundle is content-free exactly as before, and --include-content stays refused',async()=>{
  const x=await command(registry());const file=join(x.root,'plain.zip');
  assert.equal(await runSystemCommand(x.c,'diagnostic',['bundle','--out',file],sealedKeyring()),0);
  const entries=await entriesOf(file);
  assert.deepEqual([...entries.keys()].sort(),['config.json','doctor.json','logs.json','manifest.json']);
  const manifest=JSON.parse(entries.get('manifest.json')!.toString('utf8'));
  assert.equal(manifest.includesContent,false);assert.equal(manifest.sessions,undefined);
  await assert.rejects(()=>runSystemCommand(x.c,'diagnostic',['bundle','--out',join(x.root,'c.zip'),'--include-content'],sealedKeyring()),(error:any)=>error?.message==='DIAGNOSTIC_CONTENT_EXPORT_DISABLED');
});

test('SB-9: --session <id> adds that one conversation, redacted; the manifest says so; the person is told what is and is not masked',async()=>{
  const x=await command(registry());const file=join(x.root,'with-session.zip');
  assert.equal(await runSystemCommand(x.c,'diagnostic',['bundle','--out',file,'--session','s-old'],sealedKeyring()),0);
  const entries=await entriesOf(file);
  assert.deepEqual([...entries.keys()].sort(),['config.json','doctor.json','logs.json','manifest.json','session-s-old.jsonl']);
  const session=entries.get('session-s-old.jsonl')!.toString('utf8');
  assert.equal(session.includes(ANTHROPIC_KEY),false);assert.match(session,/\[REDACTED:\d+\]/u);
  const manifest=JSON.parse(entries.get('manifest.json')!.toString('utf8'));
  assert.equal(manifest.includesContent,true);assert.equal(manifest.sessions[0].sessionId,'s-old');assert.equal(manifest.redaction.failClosed,true);
  const said=x.out.join('');
  assert.match(said,/includes the conversation of session s-old/u);assert.match(said,/are NOT/u);
});

test('SB-10: --session last is the last row of the list; an unknown session fails and writes no file',async()=>{
  const x=await command(registry());const file=join(x.root,'last.zip');
  assert.equal(await runSystemCommand(x.c,'diagnostic',['bundle','--out',file,'--session','last'],sealedKeyring()),0);
  assert.ok((await entriesOf(file)).has('session-s-new.jsonl'));
  const missing=join(x.root,'missing.zip');
  await assert.rejects(()=>runSystemCommand(x.c,'diagnostic',['bundle','--out',missing,'--session','nope'],sealedKeyring()),(error:any)=>error?.message==='SESSION_NOT_FOUND');
  await assert.rejects(()=>stat(missing),'no partial file after a failed export');
});

test('SB-11: a conversation that cannot be proved clean writes NO bundle at all (fail closed at the command, not only in the builder)',async()=>{
  let deep:any={leaf:'x'};for(let i=0;i<200_000;i+=1)deep={next:deep};
  const x=await command(registry({esporta:(id:string)=>({sessionId:id,eventi:[{type:'Hostile',value:deep}]})}));
  const file=join(x.root,'hostile.zip');
  await assert.rejects(()=>runSystemCommand(x.c,'diagnostic',['bundle','--out',file,'--session','s-old'],sealedKeyring()),(error:any)=>error?.code==='DIAGNOSTIC_REDACTION_FAILED');
  await assert.rejects(()=>stat(file),'nothing is written');
});
