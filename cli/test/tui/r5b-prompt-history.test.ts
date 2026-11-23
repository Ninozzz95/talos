/*
 * R5b D5 (owner decision Q-R5-15): prompt history survives the session. Per project, under the data root (never in the
 * project), the last 1,000 prompts; secret-shaped values are masked before they reach the disk; a collapsed paste stays
 * collapsed when ↑ brings it back; Ctrl+R searches it; `ui.history.persist: false` turns it off (nothing read, nothing
 * written). Before R5b the history was `React.useState([])` for the process: gone at every start (R4 E17, gate §11).
 * Hermetic (r1-layout-fixture.ts hermeticProfile): paths and projects live under a private root.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {appendFile,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {PROMPT_HISTORY_LIMIT,createPromptHistoryStore,maskDraft,promptHistoryEnabled,promptHistoryFile} from '../../src/tui/prompt-history-store.ts';
import {createRedactor} from '../../src/diagnostics/redact.ts';
import {editorFromDraft} from '../../src/tui/editor.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',UP='\x1b[A',CTRL_R='\x12';
let n=0;
const project=()=>{const root=join(env.root,`history-project-${++n}`);mkdirSync(root,{recursive:true});return root;};
const KEY='sk-proj-'+'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6';

test('R5b D5: kept per project under the data root, newest first, one row per text, the last 1,000',async()=>{
  const root=project(),other=project();
  const store=createPromptHistoryStore({paths:env.paths,projectRoot:root,secrets:[]});
  assert.ok(promptHistoryFile(env.paths,root).startsWith(env.paths.dataRoot),'under the data root');
  assert.ok(!promptHistoryFile(env.paths,root).startsWith(root),'never inside the project');
  assert.notEqual(promptHistoryFile(env.paths,root),promptHistoryFile(env.paths,other),'one file per project');
  await store.append({text:'first',collapsedPastes:[]});await store.append({text:'second',collapsedPastes:[]});await store.append({text:'first',collapsedPastes:[]});
  assert.deepEqual((await store.load()).map(row=>row.text),['first','second'],'newest first, a repeated prompt once');
  assert.deepEqual(await createPromptHistoryStore({paths:env.paths,projectRoot:other,secrets:[]}).load(),[],'the other project has its own');
  for(let i=0;i<PROMPT_HISTORY_LIMIT+250;i++)await store.append({text:`prompt ${i}`,collapsedPastes:[]});
  const rows=await store.load();
  assert.equal(PROMPT_HISTORY_LIMIT,1000);assert.equal(rows.length,1000);assert.equal(rows[0]!.text,`prompt ${PROMPT_HISTORY_LIMIT+249}`);
  const lines=(await readFile(promptHistoryFile(env.paths,root),'utf8')).split('\n').filter(Boolean).length;
  assert.ok(lines<=1200,`the file is pruned, not grown for ever (${lines} lines)`);
});

test('R5b D5: secret-shaped values and the environment\'s secrets are masked; a paste stays a paste after masking',()=>{
  const redactor=createRedactor(['my-env-secret-value']);
  const pasted=`line one\ntoken ${KEY}\nline three`;
  const text=`use ${KEY} and my-env-secret-value then [x]${pasted}[y] done`;
  const start=text.indexOf(pasted),end=start+pasted.length;
  const masked=maskDraft({text,collapsedPastes:[{start,end,chars:pasted.length,lines:3}]},redactor);
  assert.doesNotMatch(masked.text,/sk-proj-a1B2/u);assert.doesNotMatch(masked.text,/my-env-secret-value/u);
  assert.match(masked.text,/\[REDACTED:\d+\]/u);
  const block=masked.collapsedPastes[0]!;
  assert.equal(masked.text.slice(block.start,block.end).startsWith('line one'),true,'the block still covers the paste');
  assert.equal(masked.text.slice(block.end),'[y] done');
  assert.equal(block.chars,block.end-block.start);assert.equal(block.lines,3);
  assert.equal(editorFromDraft(masked).collapsedPastes.length,1,'↑ brings it back collapsed');
});

test('R5b D5: a damaged line is skipped, an oversized prompt is kept in memory only, and the file is private to the data root',async()=>{
  const root=project();const file=promptHistoryFile(env.paths,root);
  const store=createPromptHistoryStore({paths:env.paths,projectRoot:root,secrets:[]});
  await store.append({text:'kept',collapsedPastes:[]});
  await appendFile(file,'{not json\n');
  await store.append({text:'x'.repeat(70_000),collapsedPastes:[]});
  await store.append({text:'after',collapsedPastes:[]});
  assert.deepEqual((await store.load()).map(row=>row.text),['after','kept']);
});

test('R5b D5: ui.history.persist false turns it off',async()=>{
  const root=project();
  assert.equal(await promptHistoryEnabled({paths:env.paths,projectRoot:root}),true,'on by default');
  await mkdir(env.paths.configRoot,{recursive:true});
  await writeFile(join(env.paths.configRoot,'config.json'),JSON.stringify({version:2,ui:{history:{persist:false}}}));
  assert.equal(await promptHistoryEnabled({paths:env.paths,projectRoot:root}),false);
  await writeFile(join(env.paths.configRoot,'config.json'),JSON.stringify({version:2}));
});

test('R5b D5 in the real app: prompts sent in one session come back with ↑ and Ctrl+R in the next, masked on disk',async()=>{
  const root=project();
  const first=await mountR5a({cols:100,rows:30,root,paths:env.paths});
  try{
    await first.type('explain the parser');first.press(ENTER);await sleep(150);
    await first.type(`call it with ${KEY}`);first.press(ENTER);await sleep(150);
    await first.waitFor('both sent',()=>first.calls.filter(call=>call.startsWith('resume ')).length>=2);
    await sleep(300);
  }finally{first.unmount();}
  const disk=await readFile(promptHistoryFile(env.paths,root),'utf8');
  assert.match(disk,/explain the parser/u);assert.doesNotMatch(disk,/sk-proj-a1B2/u,'the key never reaches the disk');
  const second=await mountR5a({cols:100,rows:30,root,paths:env.paths});
  try{
    second.press(UP);
    await second.waitFor('the last prompt, masked',x=>/│ › call it with \[REDACTED:\d+\]/u.test(x.text));
    second.press(UP);
    await second.waitFor('the one before',x=>/│ › explain the parser/u.test(x.text));
    second.press('\x1b');second.press('\x1b');await sleep(100);
    await second.type('pars');second.press(CTRL_R);
    await second.waitFor('Ctrl+R finds it',x=>/explain the parser/u.test(x.text));
  }finally{second.unmount();}
});

test('R5b D5 in the real app: with ui.history.persist false nothing is written and nothing comes back',async()=>{
  const root=project();
  await createPromptHistoryStore({paths:env.paths,projectRoot:root,secrets:[]}).append({text:'kept before it was turned off',collapsedPastes:[]});
  await mkdir(env.paths.configRoot,{recursive:true});
  await writeFile(join(env.paths.configRoot,'config.json'),JSON.stringify({version:2,ui:{history:{persist:false}}}));
  try{
    const app=await mountR5a({cols:100,rows:30,root,paths:env.paths});
    try{
      await sleep(300);app.press(UP);await sleep(300);
      assert.doesNotMatch((await app.screen()).text,/kept before it was turned off/u,'nothing is read');
      await app.type('not to be kept');app.press(ENTER);await sleep(400);
    }finally{app.unmount();}
    const dir=join(env.paths.dataRoot,'history');
    const names=await readdir(dir).catch(()=>[] as string[]);
    for(const name of names)assert.doesNotMatch(await readFile(join(dir,name),'utf8'),/not to be kept/u);
  }finally{await writeFile(join(env.paths.configRoot,'config.json'),JSON.stringify({version:2}));}
});

test('R5b D5: ui.history accepts only persist, a boolean; a configuration that cannot be read keeps the history off',async()=>{
  const {writeConfigScope}=await import('../../src/config/load.ts');
  const root=project();
  await assert.rejects(writeConfigScope({paths:env.paths,projectRoot:root,scope:'user',patch:{ui:{history:{persist:'no'}}} as any}),/CONFIG_INVALID_UI/u);
  await assert.rejects(writeConfigScope({paths:env.paths,projectRoot:root,scope:'user',patch:{ui:{history:{keep:true}}} as any}),/CONFIG_INVALID_UI/u);
  await mkdir(env.paths.configRoot,{recursive:true});
  await writeFile(join(env.paths.configRoot,'config.json'),'{broken');
  try{assert.equal(await promptHistoryEnabled({paths:env.paths,projectRoot:root}),false,'nothing written by doubt');}
  finally{await writeFile(join(env.paths.configRoot,'config.json'),JSON.stringify({version:2}));}
});

test('stage 7.4: each kept message keeps when it was sent, also after the file is compacted',async()=>{
  const root=project();const store=createPromptHistoryStore({paths:env.paths,projectRoot:root,secrets:[]});
  const file=promptHistoryFile(env.paths,root);await mkdir(join(file,'..'),{recursive:true});
  /* 1.201 rows sent on 27 September, one minute apart: the next send goes past the compaction threshold */
  const at=(i:number)=>new Date(Date.UTC(2026,8,27,0,0)+i*60_000).toISOString();
  await writeFile(file,Array.from({length:1201},(_,i)=>JSON.stringify({v:1,text:`message ${i}`,collapsedPastes:[],at:at(i)})+'\n').join(''));
  const before=await store.load();
  assert.equal(before[0]!.at,at(1200),'load() returns when it was sent');
  await store.append({text:'the newest',collapsedPastes:[]});
  const raw=(await readFile(file,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assert.ok(raw.length<=PROMPT_HISTORY_LIMIT,`compacted: ${raw.length} rows`);
  const old=raw.find(row=>row.text==='message 1200');
  assert.equal(old.at,at(1200),'a kept row is not restamped by the compaction');
  const rows=await createPromptHistoryStore({paths:env.paths,projectRoot:root,secrets:[]}).load();
  assert.equal(rows[0]!.text,'the newest');assert.ok(Date.parse(rows[0]!.at!)>Date.parse(at(1200)));
  assert.equal(rows[1]!.at,at(1200));
  /* a row without a readable time shows none rather than a wrong one */
  await appendFile(file,JSON.stringify({v:1,text:'no time',collapsedPastes:[],at:'later'})+'\n');
  const last=(await createPromptHistoryStore({paths:env.paths,projectRoot:root,secrets:[]}).load())[0]!;
  assert.equal(last.text,'no time');assert.equal(last.at,undefined);
});
