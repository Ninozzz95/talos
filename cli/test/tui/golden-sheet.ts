/*
 * The golden comparison of a sheet with the approved mockup's frame (panels-golden.json), shared by the sheet tests.
 *
 * Owner 03/10: a row of keys that does not fit goes on two rows (the mockup cuts it: /undo ends on a broken «e», /queue,
 * /export and the Settings' Config lose «esc close»). Where it fits, the frame is the mockup's to the letter. Where it does
 * not, everything above the keys is; the sheet grows by the second row where there is room, and at its tallest the body
 * gives up an empty row; the two rows hold every key in order, the mockup's first, each within the width. `keys` is the row
 * of keys an approved difference expects instead of the mockup's (/notes «enter attach»).
 */
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import {hintRow,hintRows,panelHeight,panelRows,type Panel,type SegRow} from '../../src/tui/panel/sheet.ts';

export type GoldenFrame={height:number;footRows:number;text:string[];style:string[]};
export const text=(rows:SegRow[])=>rows.map(row=>row.map(s=>s.text).join('').replace(/\s+$/u,''));
export const style=(rows:SegRow[])=>rows.map(row=>{let x=0;const out:Array<{start:number;end:number;roles:string}>=[];
  for(const s of row){const n=[...s.text].length;const roles=[...s.roles].sort().join(',');const last=out.at(-1);
    if(roles&&n){if(last&&last.roles===roles&&last.end===x)last.end=x+n;else out.push({start:x,end:x+n,roles});}x+=n;}
  return out.map(o=>`${o.start}+${o.end-o.start}:${o.roles}`).join(' ');});
export const fitTo=(rows:SegRow[],w:number)=>rows.map(row=>{const out:SegRow=[];let n=0;for(const s of row){if(n>=w)break;const t=[...s.text].slice(0,w-n).join('');if(t)out.push({...s,text:t});n+=[...t].length;}return out;});

export function assertGolden(panel:Panel,w:number,frame:GoldenFrame,keys?:string){
  const n=hintRows(panel,w).length,full=text([hintRow(panel)])[0]!.trimEnd();
  const H=panelHeight(panel,w,frame.height,frame.footRows,0);
  const grew=H===frame.text.length+n-1;assert.ok(H===frame.text.length||grew,`height ${H} for the mockup's ${frame.text.length}`);
  const rows=fitTo(panelRows(panel,w,H),w);const mine=text(rows),theirs=frame.text;
  assert.equal(mine.length,H,'every row counted');
  /* TALOS_GOLDEN_RECORD=<file>: a frame the renderer now draws differently is written there (its old text and the new one), for a change
     of design someone approved (01/11: badges in a column, Frontend); never set in a normal run */
  if(n===1&&keys===undefined&&process.env.TALOS_GOLDEN_RECORD&&(JSON.stringify(mine)!==JSON.stringify(theirs)||JSON.stringify(style(rows))!==JSON.stringify(frame.style))){
    appendFileSync(process.env.TALOS_GOLDEN_RECORD,JSON.stringify({before:theirs,text:mine,style:style(rows)})+'\n');return;}
  if(n===1&&keys===undefined){assert.deepEqual(mine,theirs);assert.deepEqual(style(rows),frame.style);return;}
  const above=grew?theirs.length-2:theirs.length-2-(n-1);
  if(process.env.TALOS_GOLDEN_RECORD&&(JSON.stringify(mine.slice(0,above))!==JSON.stringify(theirs.slice(0,above))||JSON.stringify(style(rows).slice(0,above))!==JSON.stringify(frame.style.slice(0,above)))){
    appendFileSync(process.env.TALOS_GOLDEN_RECORD,JSON.stringify({before:theirs,text:[...mine.slice(0,above),...theirs.slice(above)],style:[...style(rows).slice(0,above),...frame.style.slice(above)]})+'\n');return;}
  assert.deepEqual(mine.slice(0,above),theirs.slice(0,above));assert.deepEqual(style(rows).slice(0,above),frame.style.slice(0,above));
  assert.ok(theirs.slice(above,-2).every(line=>!line.trim()),'the rows the body gives up are empty in the mockup');
  assert.equal(mine[above],theirs.at(-2),'the edit row');
  const mineKeys=mine.slice(-n).map(line=>line.trimEnd());
  assert.ok(mineKeys.every(line=>[...line].length<=w),'each row of keys within the width');
  assert.equal(mineKeys.map((line,i)=>i?line.trimStart():line).join('   '),full,'every key, in order');
  if(keys!==undefined){assert.equal(full,keys);return;}
  const cut=theirs.at(-1)!.trimEnd();assert.ok(full.startsWith(cut.slice(0,cut.lastIndexOf('   '))),'the mockup\'s keys first, in its order');
}
