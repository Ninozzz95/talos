/*
 * Stage 7.22 (mockup memory; owner 03/10: Project = the lines of the instruction files TALOS loaded and the project's facts,
 * You = the preferences): /memory in the real app, on a temporary profile and project — the AGENTS.md line with where it is,
 * n adds to the tab in view, e edits, d twice deletes; a file's line is not deleted here but opened in the editor; /memory
 * search opens the sheet filtered. Mount: the REAL TuiApp (r5a-s-fixture.ts), no network; the editor is a small script.
 */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',TAB='\t',ESC='\x1b';
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');
const listed=(x:{lines:readonly string[]},label:string)=>x.lines.some(line=>new RegExp(`^(› )?${label}`,'u').test(line.trim()));

test('stage 7.22: /memory — a file\'s line, memories added to Project and You, edited and deleted, a search',async()=>{
  const root=join(env.root,'memory-project');mkdirSync(root,{recursive:true});
  writeFileSync(join(root,'AGENTS.md'),'# Shop\n- Use pnpm, never npm. The lockfile is pnpm-lock.yaml.\n');
  const opened=join(env.root,'opened.txt'),editor=join(env.root,'fake-editor.cjs');
  /* the editor is called with the file last: it writes that path into opened.txt */
  writeFileSync(editor,"require('fs').writeFileSync(process.argv[2],process.argv[3]);\n");
  const before=process.env.VISUAL;process.env.VISUAL=`'${process.execPath}' '${editor}' '${opened}'`;
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,props:{loadedFiles:['AGENTS.md']}});
  try{
    await app.type('/memory');app.press(ENTER);
    let s=await app.waitFor('the Project tab with the file\'s line',x=>/── Memory what TALOS remembers/u.test(x.text)&&/› Use pnpm, never npm +AGENTS\.md · line 2/u.test(x.text));
    assert.match(s.text,/The lockfile is pnpm-lock\.yaml\./u);
    await app.type('d');
    await app.waitFor('a file\'s line is changed in its file',x=>/This line is in AGENTS\.md · line 2: press e to change it there\./u.test(flat(x.lines)));
    await app.type('e');
    await app.waitFor('opened in the editor',x=>/Opened AGENTS\.md in your editor/u.test(flat(x.lines)));
    assert.ok(existsSync(opened)&&readFileSync(opened,'utf8').endsWith('AGENTS.md'),'the editor got the file');
    await app.type('n');await app.type('API errors are problem json');app.press(ENTER);
    s=await app.waitFor('added to Project',x=>/› API errors are problem json +you · today/u.test(x.text));
    assert.match(flat(s.lines),/Memory added/u);
    app.press(TAB);
    await app.waitFor('You, empty',x=>/Nothing remembered here yet\./u.test(x.text));
    await app.type('n');await app.type('Short answers');app.press(ENTER);
    await app.waitFor('added to You',x=>/› Short answers +you · today/u.test(x.text)&&!listed(x,'Use pnpm'));
    await app.type('e');await app.type(' please');app.press(ENTER);
    await app.waitFor('edited',x=>/› Short answers please/u.test(x.text));
    await app.type('d');await app.type('d');
    s=await app.waitFor('deleted',x=>/Nothing remembered here yet\./u.test(x.text)&&/Deleted "Short answers please"/u.test(flat(x.lines)));
    app.press(ESC);await app.waitFor('closed',x=>!/── Memory/u.test(x.text));
    await app.type('/memory search pnpm');app.press(ENTER);
    s=await app.waitFor('filtered',x=>/── Memory/u.test(x.text)&&listed(x,'Use pnpm')&&!listed(x,'API errors'));
    await sleep(50);
  }finally{app.unmount();if(before===undefined)delete process.env.VISUAL;else process.env.VISUAL=before;}
});
