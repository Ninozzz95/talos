/**
 * R1 lane L, gate E12: the deterministic grid. Widths {40,41,60,80,100,120,160,200,240} × heights
 * {12,13,15,20,24,30,40,60,80} × the seven E11 states, through the REAL app and Ink in a fake TTY read back by
 * `@xterm/headless` (r1-layout-fixture.ts). One app per state is driven into the state once and then resized through
 * all 81 sizes, which also exercises E8 (recompute on every resize, no stale fragment).
 *
 * At every size and state: the frame never writes below its own height (Q-R1-6 frame policy), no line is wider than the
 * screen (the terminal never had to wrap one), no row mixes a box border with other content (review D-02), the
 * composer ends in the last chrome rows (D-03), and where the person sent a prompt it is visible or announced (D-04).
 * No new dependency: `fast-check` is used by none of the competitors either (gate §7); the grid is fixed.
 */
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {frameRowsFor} from '../../src/tui/components/terminal-shell.ts';
import {brokenBorders,composerRow,hermeticProfile,KEY,mountApp,sleep,type MountedApp,type Screen} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const WIDTHS=[40,41,60,80,100,120,160,200,240];
const HEIGHTS=[12,13,15,20,24,30,40,60,80];
const PROMPT='PROMPT grid question';
const ANSWER=['# Answer','',...Array.from({length:60},(_,i)=>`- item ${i+1} of the answer, long enough to wrap at forty columns`)].join('\n');
const HISTORY=[
  {type:'run.started',data:{runId:'r0'}},
  {type:'message.started',data:{messageId:'u0',role:'user'}},{type:'message.delta',data:{messageId:'u0',delta:PROMPT}},{type:'message.completed',data:{messageId:'u0'}},
  {type:'message.started',data:{messageId:'a0',role:'assistant'}},{type:'message.delta',data:{messageId:'a0',delta:ANSWER}},{type:'message.completed',data:{messageId:'a0'}},
  {type:'run.completed',data:{runId:'r0'}},
];
const PASTE=Array.from({length:60},(_,i)=>`line ${i+1} of a pasted log`).join('\n');

const dump=(s:Screen)=>s.lines.map((line,index)=>`${String(index).padStart(2)}|${line}`).join('\n');
function assertFrame(s:Screen,label:string,{prompt,card=false}:{prompt:boolean;card?:boolean}){
  const frame=frameRowsFor(s.rows);
  const where=`${label} at ${s.cols}×${s.rows}`;
  assert.deepEqual(s.lines.slice(frame).filter(line=>line.trim()!==''),[],`${where}: rows below the ${frame}-row frame are written\n${dump(s)}`);
  assert.equal(s.wrapped??0,0,`${where}: a line was wider than the screen and wrapped\n${dump(s)}`);
  assert.deepEqual(brokenBorders(s.lines),[],`${where}: rows mix a border with content (D-02)\n${dump(s)}`);
  /* D1 of the redesign: a permission card stands in the composer's place, and the footer stays under it */
  const row=card?s.lines.findIndex(line=>/^│ ╭─/u.test(line)):composerRow(s);
  assert.ok(row>=0,`${where}: the composer is on screen\n${dump(s)}`);
  if(card)assert.ok(s.lines.some(line=>/^ (ask before edits|plan mode|accept edits|full access)/u.test(line)),`${where}: the footer stays under a card\n${dump(s)}`);
  const bottom=s.lines.findIndex((line,index)=>index>row&&/^╰─/u.test(line));
  assert.ok(bottom>=frame-6,`${where}: the composer ends on row ${bottom+1}, not in the last chrome rows of the ${frame}-row frame (D-03)\n${dump(s)}`);
  if(prompt)assert.ok(s.text.includes(PROMPT)||/earlier messages? above|You: PROMPT/u.test(s.text),`${where}: the person's prompt is neither visible nor announced (D-04)\n${dump(s)}`);
}
async function walkGrid(app:MountedApp,label:string,opts:{prompt:boolean;card?:boolean}){
  for(const cols of WIDTHS)for(const rows of HEIGHTS){
    await app.resize(cols,rows);
    assertFrame(await app.settle(),label,opts);
  }
}

const STATES:Array<{name:string;history?:typeof HISTORY;prompt:boolean;card?:boolean;enter:(app:MountedApp)=>Promise<void>}>=[
  {name:'idle',prompt:false,enter:async()=>{}},
  {name:'resumed',history:HISTORY,prompt:true,enter:async app=>{await app.waitFor('the answer',s=>/item 60 of the answer/u.test(s.text));}},
  {name:'help',prompt:false,enter:async app=>{app.press('?');await app.waitFor('help',s=>/│Help +│/u.test(s.text));/* R5b D7: grouped /help, known by its title */}},
  {name:'model picker',prompt:false,enter:async app=>{app.press(KEY.altP);await app.waitFor('picker',s=>/search: /u.test(s.text));}},
  {name:'approval',history:HISTORY,prompt:false,card:true,enter:async app=>{app.emit('run.started',{runId:'r1'});app.emit('approval.required',{requestId:'q1',azione:{tipo:'comando',comando:'npm test'}});await app.waitFor('approval',s=>/Permission/u.test(s.text));}},
  {name:'streaming',history:HISTORY,prompt:true,enter:async app=>{app.emit('run.started',{runId:'r1'});app.emit('message.started',{messageId:'a1',role:'assistant'});app.emit('message.delta',{messageId:'a1',delta:Array.from({length:80},(_,i)=>`streamed line ${i+1}`).join('\n\n')});await app.waitFor('stream',s=>/streamed line 80/u.test(s.text));}},
  {name:'long paste',history:HISTORY,prompt:true,enter:async app=>{app.press(`\u001B[200~${PASTE}\u001B[201~`);await app.waitFor('paste',s=>/\[Pasted text #\d+ \+59 lines\]/u.test(s.text));/* UI Phase 1: pasting it again expands it */app.press(`\u001B[200~${PASTE}\u001B[201~`);await app.waitFor('expanded',s=>/line \d+ of a pasted log/u.test(s.text));}},
];

for(const state of STATES){
  test(`R1 E12 grid: ${state.name} at every size from 40×12 to 240×80`,{timeout:240_000},async()=>{
    const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,...(state.history?{history:state.history}:{})});
    try{await state.enter(app);await sleep(50);await walkGrid(app,state.name,{prompt:state.prompt,...(state.card?{card:true}:{})});}
    finally{app.unmount();}
  });
}
