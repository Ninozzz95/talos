/*
 * Stage 7.19 (mockup tasks; owner 03/10: the mockup's sheet in front, the task board's detail beside it): /tasks in the real
 * app, on the task board of a temporary profile — n adds, space marks done («today») and open again, e edits the title,
 * d twice deletes; each change reads the board back. Mount: the REAL TuiApp (r5a-s-fixture.ts), no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r';
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');

test('stage 7.19: /tasks — add, mark done and open again, edit, delete, on the real task board',async()=>{
  const root=join(env.root,'tasks-project');mkdirSync(root,{recursive:true});
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/tasks');app.press(ENTER);
    await app.waitFor('the empty sheet',x=>/── Tasks this project/u.test(x.text)&&/No tasks yet\./u.test(x.text));
    await app.type('n');await app.type('Write checkout tests');app.press(ENTER);
    let s=await app.waitFor('added',x=>/› \[ \] Write checkout tests +open/u.test(x.text));
    assert.match(flat(s.lines),/Task added/u);
    assert.match(s.text,/│ open · priority normal/u,'the board\'s detail beside the list');
    await app.type(' ');
    s=await app.waitFor('done',x=>/› \[x\] Write checkout tests +today/u.test(x.text));
    await app.type(' ');
    await app.waitFor('open again',x=>/› \[ \] Write checkout tests +open/u.test(x.text));
    await app.type('e');for(let i=0;i<'tests'.length;i++)app.press('\x7f');await app.type('flows');app.press(ENTER);
    await app.waitFor('edited',x=>/› \[ \] Write checkout flows +open/u.test(x.text));
    /* a change keeps the cursor on its row: add a second task, mark the second done, the cursor stays there */
    await app.type('n');await app.type('Second one');app.press(ENTER);
    await app.waitFor('the second',x=>/› \[ \] Second one/u.test(x.text));
    /* measured: a new task comes first. The older one is the second row; a change made there keeps the cursor there */
    const rowsNow=(await app.screen()).lines.filter(line=>/\[[ x]\] /u.test(line)).map(line=>line.replace(/ +│.*$/u,'').replace(/ +/gu,' ').trim());
    assert.deepEqual(rowsNow,['› [ ] Second one open','[ ] Write checkout flows open']);
    app.press('\x1b[B');await app.waitFor('on the second row',x=>/› \[ \] Write checkout flows/u.test(x.text));
    await app.type(' ');
    await app.waitFor('done, still under the cursor',x=>/› \[x\] Write checkout flows +today/u.test(x.text)&&/ {3}\[ \] Second one/u.test(x.text));
    /* measured: the board lists the latest changed first, and the cursor follows the task it changed */
    await app.type(' ');await app.waitFor('open again, first and under the cursor',x=>/› \[ \] Write checkout flows +open/u.test(x.text)&&/ {3}\[ \] Second one/u.test(x.text));
    app.press('\x1b[B');await app.waitFor('on Second one',x=>/› \[ \] Second one/u.test(x.text));
    await app.type('d');await app.type('d');
    await app.waitFor('the second deleted',x=>!/Second one/u.test(x.text)&&/› \[ \] Write checkout flows/u.test(x.text));
    await app.type('d');await app.type('d');
    await app.waitFor('deleted',x=>/No tasks yet\./u.test(x.text)&&/Deleted "Write checkout flows"/u.test(flat(x.lines)));
    await sleep(50);
  }finally{app.unmount();}
});
