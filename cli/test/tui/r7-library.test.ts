/*
 * Stage 7.23 (mockup library; owner 03/10: the mockup's sheet, the rest as /library commands): /library in the real app, on a
 * temporary profile and project — a adds a file from a path, the row says its size and kind, Enter puts the library's «@»
 * reference in the message, d twice removes it. Mount: the REAL TuiApp (r5a-s-fixture.ts), no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r';
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');

test('stage 7.23: /library — add a file, mention it, remove it',async()=>{
  const root=join(env.root,'library-project');mkdirSync(root,{recursive:true});
  writeFileSync(join(root,'checkout-flows.md'),'## Guest checkout\n1. Cart\n2. Address\n3. Pay\n');
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/library');app.press(ENTER);
    await app.waitFor('the empty sheet',x=>/── Library files you keep for TALOS · mention them with @/u.test(x.text)&&/No files yet: press a to add one\./u.test(x.text));
    await app.type('a');await app.type('checkout-flows.md');app.press(ENTER);
    let s=await app.waitFor('added',x=>/› checkout-flows\.md +\d+ B/u.test(x.text)&&/Markdown · 4 lines/u.test(x.text));
    assert.match(flat(s.lines),/Added checkout-flows\.md/u);
    assert.match(s.text,/## Guest checkout/u,'the first lines beside the list');
    app.press(ENTER);
    /* the library's own reference: the stored copy's path inside the project, as the old library centre wrote it */
    s=await app.waitFor('mentioned',x=>!/── Library/u.test(x.text)&&/› @\.harness-ui-library\/lib-[\w-]+\/contenuto/u.test(x.text));
    /* the composer's file list opens on «@»: close it, then clear the composer */
    app.press('\x1b');await sleep(50);
    for(let i=0;i<200;i++)app.press('\x7f');
    await app.type('/library');app.press(ENTER);
    await app.waitFor('the sheet again',x=>/› checkout-flows\.md/u.test(x.text));
    await app.type('d');await app.type('d');
    s=await app.waitFor('removed',x=>/No files yet/u.test(x.text)&&/Removed checkout-flows\.md/u.test(flat(x.lines)));
    await sleep(50);
  }finally{app.unmount();}
});
