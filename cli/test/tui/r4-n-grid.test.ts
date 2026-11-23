/**
 * R4 lane N — gate E13: every new line fits the R1 budget. The live `@` list (30 files, and its empty-state line) is driven
 * once and the app is resized through the R1 E12 grid, widths {40,41,60,80,100,120,160,200,240} × heights
 * {12,13,15,20,24,30,40,60,80}, with the checks of `r1-layout-grid.test.ts`: nothing below the frame, no wrapped line,
 * no row mixing a border with content (D-02), the composer in the last chrome rows (D-03); and here also: the list keeps
 * its highlighted row on screen.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test,{after} from 'node:test';
import {frameRowsFor} from '../../src/tui/components/terminal-shell.ts';
import {brokenBorders,composerRow,hermeticProfile,mountApp,sleep,type MountedApp,type Screen} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
fs.mkdirSync(path.join(env.root,'many'),{recursive:true});
for(let i=0;i<30;i++)fs.writeFileSync(path.join(env.root,'many',`file-${String(i).padStart(2,'0')}.txt`),'x');
const WIDTHS=[40,41,60,80,100,120,160,200,240];
const HEIGHTS=[12,13,15,20,24,30,40,60,80];
const dump=(s:Screen)=>s.lines.map((line,index)=>`${String(index).padStart(2)}|${line}`).join('\n');
function assertFrame(s:Screen,label:string,visible:RegExp){
  const frame=frameRowsFor(s.rows),where=`${label} at ${s.cols}×${s.rows}`;
  assert.deepEqual(s.lines.slice(frame).filter(line=>line.trim()!==''),[],`${where}: rows below the ${frame}-row frame are written\n${dump(s)}`);
  assert.equal(s.wrapped??0,0,`${where}: a line was wider than the screen and wrapped\n${dump(s)}`);
  assert.deepEqual(brokenBorders(s.lines),[],`${where}: rows mix a border with content (D-02)\n${dump(s)}`);
  const row=composerRow(s);
  assert.ok(row>=0,`${where}: the composer is on screen\n${dump(s)}`);
  const bottom=s.lines.findIndex((line,index)=>index>row&&/^╰─/u.test(line));
  assert.ok(bottom>=frame-6,`${where}: the composer ends on row ${bottom+1}, not in the last chrome rows (D-03)\n${dump(s)}`);
  assert.match(s.text,visible,`${where}: the list lost its line\n${dump(s)}`);
}
async function type(app:MountedApp,text:string){for(const ch of text){app.press(ch);await sleep(8);}}

/* `ready`: the list answers the whole token (the answers for `@m`, `@ma`… arrive first, and a new answer puts the
   highlight back on its first row). */
const STATES:Array<{name:string;token:string;ready:RegExp;move:number;visible:RegExp}>=[
  {name:'the live @ list of 30 files, highlight moved down',token:'@many/',ready:/› @many\/file-00\.txt/u,move:20,visible:/› @many\/file-20\.txt/u},
  {name:'the @ list empty-state line',token:'@zz',ready:/No files match zz/u,move:0,visible:/No files match zz/u},
];
for(const state of STATES){
  test(`R4-N E13 grid: ${state.name} at every size from 40×12 to 240×80`,{timeout:240_000},async()=>{
    const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths});
    try{
      await type(app,state.token);
      await app.waitFor('the list for the whole token',s=>state.ready.test(s.text));
      for(let i=0;i<state.move;i++){app.press('\u001B[B');await sleep(10);}
      await app.waitFor('the highlight',s=>state.visible.test(s.text));
      for(const cols of WIDTHS)for(const rows of HEIGHTS){await app.resize(cols,rows);assertFrame(await app.settle(),state.name,state.visible);}
    }finally{app.unmount();}
  });
}
