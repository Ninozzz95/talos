/*
 * Stage 7.20 (mockup notes; owner 03/10: the mockup's sheet in front, the links beside the Markdown): /notes in the real app,
 * on the notes of a temporary profile — n adds a note that starts as its heading, e edits the title, v opens the whole note in
 * the editor and keeps what the editor saved, d twice deletes; each change reads the notes back. Enter puts the note in the
 * message being written (owner 03/10, the old panel's «c»). Mount: the REAL TuiApp
 * (r5a-s-fixture.ts), no network; the editor is a small script that adds a list to the file.
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

test('stage 7.20: /notes — add, edit the title, open in the editor, delete, on the real notes',async()=>{
  const root=join(env.root,'notes-project');mkdirSync(root,{recursive:true});
  const editor=join(env.root,'fake-editor.cjs');
  writeFileSync(editor,"const fs=require('fs');const file=process.argv[2];fs.appendFileSync(file,'\\n- Bump the version\\n- Tag and publish\\n');\n");
  const before={VISUAL:process.env.VISUAL};/* single quotes: inside double quotes the editor command reads a backslash as an escape (parseEditorCommand) */
  process.env.VISUAL=`'${process.execPath}' '${editor}'`;
  /* the real start creates the profile's folders (paths.ts ensureCliPaths); this mount does not */
  mkdirSync(env.paths.cacheRoot,{recursive:true});
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/notes');app.press(ENTER);
    await app.waitFor('the empty sheet',x=>/── Notes Markdown · this project/u.test(x.text)&&/No notes yet\./u.test(x.text));
    await app.type('n');await app.type('Release checklist');app.press(ENTER);
    let s=await app.waitFor('added',x=>/› Release checklist/u.test(x.text)&&/│ Release checklist/u.test(x.text));
    assert.match(flat(s.lines),/Note added/u);
    assert.match(s.text,/today/u);assert.match(s.text,/empty/u,'a note with only its heading says so');
    await app.type('e');await app.type(' 0.5');app.press(ENTER);
    await app.waitFor('edited',x=>/› Release checklist 0\.5/u.test(x.text));
    await app.type('v');
    s=await app.waitFor('the editor saved a list',x=>/│   • Bump the version/u.test(x.text)&&/2 items/u.test(x.text));
    assert.match(flat(s.lines),/Note saved from your editor/u);
    /* a change keeps the cursor on its note: add a second, change the one below it, the cursor stays there */
    await app.type('n');await app.type('Second one');app.press(ENTER);
    await app.waitFor('the second',x=>/› Second one/u.test(x.text));
    const order=(await app.screen()).lines.map(line=>line.trim()).filter(line=>/^(› )?(Second one|Release checklist)/u.test(line)).map(line=>line.replace(/ {2,}.*$/u,''));
    assert.deepEqual(order,['› Second one','Release checklist 0.5'],'measured: a new note comes first');
    app.press('\x1b[B');await app.waitFor('on the older note',x=>/› Release checklist 0\.5/u.test(x.text));
    await app.type('e');await app.type('!');app.press(ENTER);
    s=await app.waitFor('edited, still under the cursor',x=>/› Release checklist 0\.5!/u.test(x.text));
    /* measured: the notes list the latest changed first, so the edited note is now on top */
    const rows=(x:{lines:readonly string[]})=>x.lines.map(line=>line.trim()).filter(line=>/^(› )?(Second one|Release checklist|Third one)/u.test(line)).map(line=>line.replace(/ {2,}.*$/u,''));
    assert.deepEqual(rows(s),['› Release checklist 0.5!','Second one']);
    /* a deletion keeps the cursor on its row: with three notes, delete the middle one, the cursor goes to the one after it */
    await app.type('n');await app.type('Third one');app.press(ENTER);
    await app.waitFor('the third',x=>/› Third one/u.test(x.text));
    app.press('\x1b[B');await app.waitFor('on the middle note',x=>/› Release checklist 0\.5!/u.test(x.text));
    await app.type('d');await app.type('d');
    /* the toast names the deleted note, so the list is read row by row */
    s=await app.waitFor('the middle one deleted',x=>!x.lines.some(line=>/^(› )?Release checklist/u.test(line.trim()))&&/Deleted "Release checklist 0\.5!"/u.test(flat(x.lines)));
    assert.deepEqual(rows(s),['Third one','› Second one']);
    await app.type('d');await app.type('d');
    await app.waitFor('the second deleted',x=>/› Third one/u.test(x.text)&&!x.lines.some(line=>/^(› )?Second one/u.test(line.trim())));
    /* owner 03/10: Enter puts the note in the message being written, and the sheet closes */
    app.press(ENTER);
    s=await app.waitFor('attached',x=>/TALOS note reference \(note:/u.test(x.text)&&!/── Notes/u.test(x.text));
    assert.match(s.text,/Title: Third one/u);
    await sleep(50);
  }finally{app.unmount();if(before.VISUAL===undefined)delete process.env.VISUAL;else process.env.VISUAL=before.VISUAL;}
});
