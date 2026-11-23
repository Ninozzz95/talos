/*
 * Stage 7.5 (owner 03/10, «Tutto, lato CLI»): /resume in the real app is the mockup's sheet. Each conversation shows how many
 * messages it has and its last exchange (read from its events), the branch the CLI kept for it and its model; the one in use
 * says «this one» and is not resumed again; r renames in place, d asks and then deletes through the kernel, and a refusal
 * shows the list as it really is again.
 * Mount: the REAL TuiApp through Ink into `@xterm/headless` (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {createSessionMetadataStore,sessionMetadataRoot} from '../../src/sessions/metadata-store.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\x1b[B',BACKSPACE='\x7f',ESC='\x1b';
let n=0;const project=()=>{const root=join(env.root,`resume-sheet-${++n}`);mkdirSync(root,{recursive:true});return root;};
/* the kernel says each turn's branch (RunStarted.contesto.branch, agent-service.mjs) */
const events=(you:string,answer:string,branch:string|null=null)=>[{type:'RunStarted',input:{prompt:you},contesto:{progetto:null,cartella:'C:/p',branch}},{type:'TextMessageStart',messageId:'a',role:'assistant'},{type:'TextMessageContent',messageId:'a',delta:answer},{type:'TextMessageEnd',messageId:'a'}];

function runtimeWith(deleteSession:(id:string)=>Promise<void>){
  const deleted:string[]=[];let gone=new Set<string>();
  return{deleted,extra:{
    listSessions:async()=>[{sessionId:'s1',name:'Flaky login test',model:'qwen3-coder',updatedAt:new Date().toISOString()},{sessionId:'s-old',name:'Rate limit on search',model:'qwen3',updatedAt:new Date(Date.now()-3*3_600_000).toISOString()}].filter(row=>!gone.has(row.sessionId)),
    export:(id:string)=>({sessionId:id,eventi:id==='s-old'?events('Add a rate limit to /search.','Token bucket, 30 requests a minute per key.','fix/rate-limit'):events('The login test is flaky.','Fixed.')}),
    deleteSession:async(id:string)=>{await deleteSession(id);deleted.push(id);gone=new Set([...gone,id]);},
  }};
}

test('stage 7.5 /resume: the sheet with messages, branch and last exchange; rename in place; d d deletes through the kernel and takes the metadata with it',async()=>{
  const root=project();const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(env.paths.dataRoot)});
  const {deleted,extra}=runtimeWith(async()=>{});
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:extra});
  try{
    await app.type('/resume');app.press(ENTER);
    let s=await app.waitFor('the sheet',x=>/── Resume a conversation/u.test(x.text)&&/Rate limit on search/u.test(x.text));
    assert.match(s.text,/2 conversations/u);
    assert.match(s.text,/Flaky login test +this one/u,'the one in use');
    assert.match(s.text,/2 messages · fix\/rate-limit · qwen3/u,'messages and branch from its events (the kernel\'s), the model');
    app.press(DOWN);
    s=await app.waitFor('its last exchange',x=>/Last exchange/u.test(x.text)&&/› Add a rate limit to \/search\./u.test(x.text));
    assert.match(s.text,/Token bucket, 30 requests a minute per key\./u);
    /* r renames in place */
    await app.type('r');await app.waitFor('the edit row',x=>/Rename: Rate limit on search/u.test(x.text));
    for(let i=0;i<6;i++){app.press(BACKSPACE);await sleep(10);}
    await app.type('/search');app.press(ENTER);
    /* 13/10/2026 (flaky under load, 1 run in 10 with the type checker running beside it; older than 0.6.0, here since 0da9a4f7c of
       03/10): the name is on screen BEFORE it is on disk — the edit row itself reads «Rename: Rate limit on /search» as soon as it
       is typed, and the list row is renamed at once, while the store writes the file with an fsync. Waiting for the name alone
       let the read below overtake the write (`undefined`), and the name it then left in the shared profile made the next two
       tests time out «waiting for the sheet» (their rows read «Rate limit on /search»). The notice is said only after the write
       (app.ts, `renameSession`: `await …setName(…);addLocal(action.notice)`), and the edit row is gone by then. */
    await app.waitFor('the new name in the list, and the notice that it was saved',x=>/Renamed to "Rate limit on \/search"/u.test(x.text)&&!/Rename: /u.test(x.text));
    assert.equal((await store.get('s-old'))?.name,'Rate limit on /search');
    /* d asks, d again deletes */
    await app.type('d');await app.waitFor('the question',x=>/Press d again to delete/u.test(x.text));
    await app.type('d');
    s=await app.waitFor('gone from the list',x=>/Deleted "Rate limit on \/search"/u.test(x.text)&&/· 1 conversation /u.test(x.text));
    assert.deepEqual(s.lines.filter(line=>/Rate limit on \/search/u.test(line)).map(line=>line.trim()),['· Deleted "Rate limit on /search"'],`only the notice on the page names it:\n${s.text}`);
    assert.deepEqual(deleted,['s-old']);
    assert.equal(await store.get('s-old'),null,'what the CLI kept about it is gone too');
    /* the one in use: Enter does not resume it again */
    const resumes=app.calls.filter(call=>call.startsWith('resume')).length;
    app.press(ENTER);
    await app.waitFor('the notice',x=>/Already in this conversation/u.test(x.text)&&!/── Resume a conversation/u.test(x.text));
    assert.equal(app.calls.filter(call=>call.startsWith('resume')).length,resumes);
  }finally{app.unmount();}
});

test('stage 7.5 /resume: a deletion the kernel refuses says why and the conversation is still listed',async()=>{
  const root=project();
  const {deleted,extra}=runtimeWith(async()=>{throw Object.assign(new Error('Sessione ancora in corso'),{code:'SESSION_STILL_RUNNING'});});
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:extra});
  try{
    await app.type('/resume');app.press(ENTER);
    await app.waitFor('the sheet',x=>/── Resume a conversation/u.test(x.text)&&/Rate limit on search/u.test(x.text));
    app.press(DOWN);await sleep(60);await app.type('d');await sleep(60);await app.type('d');
    const s=await app.waitFor('listed again',x=>/Rate limit on search/u.test(x.text)&&/── Resume a conversation/u.test(x.text)&&!/Press d again/u.test(x.text));
    assert.deepEqual(deleted,[]);
    app.press(ESC);
    await app.waitFor('the reason',x=>/still running, so it was not deleted/u.test(x.text),5_000).catch(()=>{throw new Error(`no reason shown:\n${s.text}`);});
  }finally{app.unmount();}
});

test('stage 7.5 (R4-N, review D-08): a choice in a reopened /resume while a conversation is still attaching does not attach a second one at once',async()=>{
  const root=project();const subscribed:string[]=[];let slow=false;
  const sessions=[{sessionId:'s1',name:'Current'},{sessionId:'s-old',name:'Older one'},{sessionId:'s-two',name:'Another one'}];
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{
    listSessions:async()=>sessions,export:()=>null,
    subscribe:(id:string)=>{subscribed.push(id);return()=>{};},
    /* attaching ends by setting the permission mode: slow here, as a slow machine is */
    setPermissionMode:async()=>{if(slow)await sleep(1_500);},
  }});
  try{
    await app.type('/resume');app.press(ENTER);await app.waitFor('the sheet',x=>/── Resume a conversation/u.test(x.text)&&/Older one/u.test(x.text));
    slow=true;app.press(DOWN);await sleep(40);app.press(ENTER);
    await app.waitFor('closed',x=>!/── Resume a conversation/u.test(x.text));
    await app.type('/resume');app.press(ENTER);await app.waitFor('the sheet again',x=>/── Resume a conversation/u.test(x.text)&&/Another one/u.test(x.text));
    app.press(DOWN);await sleep(40);app.press(DOWN);await sleep(40);app.press(ENTER);
    await sleep(2_000);
    assert.deepEqual(subscribed.filter(id=>id!=='s1'),['s-old'],'the second choice waits for nothing: it is not attached on top of the first');
  }finally{app.unmount();}
});

test('stage 7.6 /fork: the sheet of your messages in this conversation; «latest» forks it all, named after it',async()=>{
  const root=project();const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(env.paths.dataRoot)});
  await store.setName('s1','Flaky login test');
  const forked:string[]=[];
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{
    export:(id:string)=>({sessionId:id,eventi:[{type:'RunStarted',runId:'r1',input:{prompt:'Show me how sessions are refreshed'}},{type:'RunStarted',runId:'r2',input:{prompt:'The login e2e test is flaky. Find out why and fix it.'}}]}),
    fork:async(id:string)=>{forked.push(id);return 's-fork';},
  }});
  try{
    await app.type('/fork');app.press(ENTER);
    const s=await app.waitFor('the sheet',x=>/── Fork from a message/u.test(x.text)&&/latest/u.test(x.text));
    assert.match(s.text,/› The login e2e test is flaky\. Find out why … +latest/u,'the row cut to its column, as the mockup');
    assert.doesNotMatch(s.text,/1 back/u,'until the kernel can cut, only the whole conversation');
    assert.match(s.text,/The new conversation keeps everything up to/u);
    app.press(ENTER);
    await app.waitFor('the notice',x=>/Forked at "The login e2e test is flaky\. Find out why and fix…" · you are now in "Flaky login test \(fork\)"/u.test(x.text));/* the message cut at 50, as the mockup */
    assert.deepEqual(forked,['s1']);
    assert.equal((await store.get('s-fork'))?.name,'Flaky login test (fork)');
  }finally{app.unmount();}
});

test('stage 7.7 /export: the sheet saves the conversation as chosen, and copies it — never to the real clipboard',async()=>{
  const root=project();const clip=join(root,'clipboard.txt');const before=process.env.TALOS_CLIPBOARD_FILE;process.env.TALOS_CLIPBOARD_FILE=clip;
  const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(env.paths.dataRoot)});await store.setName('s1','Flaky login test');
  const eventi=[{type:'RunStarted',runId:'r1',input:{prompt:'why is it flaky?'}},{type:'ToolCallStart',toolCallId:'c1',toolCallName:'leggi'},{type:'ToolCallEnd',toolCallId:'c1'},{type:'ToolCallResult',toolCallId:'c1',content:'TOOL-RESULT-BODY'},
    {type:'TextMessageStart',messageId:'a1',role:'assistant'},{type:'TextMessageContent',messageId:'a1',delta:'It waits for the cookie now.'},{type:'TextMessageEnd',messageId:'a1'}];
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{export:(id:string)=>({sessionId:id,name:'Flaky login test',eventi})}});
  try{
    await app.type('/export');app.press(ENTER);
    const s=await app.waitFor('the sheet',x=>/── Export this conversation · 2 messages/u.test(x.text));
    const name=/talos-flaky-login-test-\d{4}-\d{2}-\d{2}\.md/u.exec(s.text)?.[0];assert.ok(name,s.text);
    app.press(ENTER);
    await app.waitFor('saved',x=>x.text.includes(`Saved ${name} · `)&&/· [0-9]+ B/u.test(x.text));
    const saved=readFileSync(join(root,name!),'utf8');
    assert.match(saved,/It waits for the cookie now\./u);assert.doesNotMatch(saved,/TOOL-RESULT-BODY/u,'tool output only when asked');
    /* Tool output on, then Ctrl+C copies */
    await app.type('/export');app.press(ENTER);await app.waitFor('the sheet again',x=>/── Export this conversation/u.test(x.text));
    app.press(DOWN);await sleep(40);app.press(' ');await app.waitFor('on',x=>/Tool output +● on/u.test(x.text));
    app.press('\x03');
    await app.waitFor('copied',x=>/Copied the conversation · \d+ B/u.test(x.text));
    assert.match(readFileSync(clip,'utf8'),/TOOL-RESULT-BODY/u,'what the tool returned is in');
  }finally{app.unmount();if(before===undefined)delete process.env.TALOS_CLIPBOARD_FILE;else process.env.TALOS_CLIPBOARD_FILE=before;}
});
