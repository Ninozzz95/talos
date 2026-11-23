/* C5 through the real app: /usage opens the page from the project's record, ←/→ choose the day, s goes to this session's figures, Esc goes back. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import test,{after} from 'node:test';
import {usageRecordFile} from '../../src/sessions/usage-record.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());

test('/usage with no record says so, and the keys of this session are still there',async()=>{
  const root=join(env.root,'..',`usage-${Date.now()}`);mkdirSync(root,{recursive:true});
  const app=await mountR5a({cols:120,rows:30,root,paths:env.paths});
  try{
    await app.type('/usage');app.press('\r');
    const page=await app.waitFor('the page',x=>/── CLI usage/u.test(x.text)&&/No usage recorded in this project yet\./u.test(x.text));
    assert.match(page.text,/This project, as the CLI counted it/u);
    app.press('\x1b');
    await app.waitFor('back',x=>!/── CLI usage/u.test(x.text));
  }finally{app.unmount();}
});

test('/usage shows the record, ←/→ choose the day, and s opens this session in Settings',async()=>{
  const root=join(env.root,'..',`usage-full-${Date.now()}`);mkdirSync(root,{recursive:true});
  const file=usageRecordFile(env.paths.dataRoot,root);mkdirSync(dirname(file),{recursive:true});
  const day=(daysAgo:number)=>new Date(Date.now()-daysAgo*86_400_000).toISOString();
  writeFileSync(file,[{at:day(0),session:'a',model:'openai:sol-6.1',in:300,out:0,cached:0,usd:0.5},{at:day(1),session:'b',model:'qwen3',in:70,out:0,cached:0,usd:null}].map(row=>JSON.stringify(row)).join('\n')+'\n');
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/usage');app.press('\r');
    const page=await app.waitFor('today',x=>/── CLI usage/u.test(x.text)&&/300 tokens · 1 session · 1 turn · \$0\.50/u.test(x.text));
    assert.match(page.text,/sol-6\.1/u);
    app.press('\x1b[D');
    await app.waitFor('yesterday',x=>/70 tokens · 1 session · 1 turn/u.test(x.text));
    app.press('s');
    await app.waitFor('this session',x=>/── Settings/u.test(x.text));
  }finally{app.unmount();}
});
