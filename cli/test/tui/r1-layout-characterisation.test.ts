/**
 * R1 lane L, gate E11 step 1: the frames of the REAL app, through the real Ink 7.1.1, in a fake TTY read back by
 * `@xterm/headless`, for the seven states the gate names (idle, help, model picker, approval, streaming, long-paste
 * recall, resumed) at 40×12, 60×20, 100×30 and 240×80.
 *
 * Each state asserts two things. What it SHOWS (the text that must survive the split of `app.ts` into regions: the
 * help's first command, the picker's search line, the approval's choices, the streamed text, the resumed answer) and
 * how the frame is BUILT (review D-02/D-03/D-04, owner decisions Q-R1-1/2/3/9): no row mixes a box border with other
 * content, the composer sits in the last rows of the screen, the roster line is on screen, and the person's latest
 * prompt is visible or announced. Before R1 the construction checks were red (recorded in the lane hand-back); the
 * content checks were green and must stay green.
 */
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {brokenBorders,composerRow,hermeticProfile,KEY,mountApp,sleep,type MountedApp,type Screen} from './r1-layout-fixture.ts';
import {APPROVAL_GRACE_MS} from '../../src/tui/overlays/approval-dialog.ts';
/* R5b D7 (Q-R5-17): /help is grouped and /help sits in "View", no longer on the first screen; the dialog is known by its title. */
const HELP_OPEN=/│Help +│/u;

const env=hermeticProfile();after(()=>env.restore());
const SIZES:Array<[number,number]>=[[40,12],[60,20],[100,30],[240,80]];
const PROMPT='PROMPT please summarize the project';
const ANSWER=['# Summary','',...Array.from({length:40},(_,i)=>`- point ${i+1} of a long answer`)].join('\n');
const RESUMED=[
  {type:'run.started',data:{runId:'r0'}},
  {type:'message.started',data:{messageId:'u0',role:'user'}},{type:'message.delta',data:{messageId:'u0',delta:PROMPT}},{type:'message.completed',data:{messageId:'u0'}},
  {type:'message.started',data:{messageId:'a0',role:'assistant'}},{type:'message.delta',data:{messageId:'a0',delta:ANSWER}},{type:'message.completed',data:{messageId:'a0'}},
  {type:'run.completed',data:{runId:'r0'}},
];
const PASTE=Array.from({length:60},(_,i)=>`line ${i+1} of a pasted log`).join('\n');

function dump(s:Screen){return s.lines.map((line,index)=>`${String(index).padStart(2)}|${line}`).join('\n');}
/* Construction: the frame never overwrites itself (D-02), the composer is in the last rows (D-03), the roster says
   what the session is doing. `bottomRows` is how far from the last row the composer's content row may sit: border,
   shortcut strip, roster, queue, reasoning and footer lines are the most that can follow it. */
function assertBuilt(s:Screen,label:string,{bottomRows=7,roster=true,card=false}:{bottomRows?:number;roster?:boolean;card?:boolean}={}){
  assert.deepEqual(brokenBorders(s.lines),[],`${label}: rows mix a border with content (D-02)\n${dump(s)}`);
  /* D1 of the redesign: a permission card stands in the composer's place */
  const row=card?s.lines.findIndex(line=>/^│ ╭─/u.test(line)):composerRow(s);
  assert.ok(row>=0,`${label}: the composer is on screen\n${dump(s)}`);
  const bottom=s.lines.findIndex((line,index)=>index>row&&/^╰─/u.test(line));
  assert.ok(bottom>=s.rows-bottomRows,`${label}: the composer ends on row ${bottom+1} of ${s.rows}, not in the last ${bottomRows} (D-03)\n${dump(s)}`);
  /* UI Phase 0 (owner 27/09, "like Claude Code"): without a working subagent the footer lists no agent. */
  if(roster)assert.doesNotMatch(s.text,/[•›●] main · /u,`${label}: no agent row without a working subagent\n${dump(s)}`);
}
function assertPromptVisibleOrAnnounced(s:Screen,label:string){
  assert.ok(s.text.includes(PROMPT.slice(0,Math.min(PROMPT.length,s.cols-12)))||/earlier messages? above|You: PROMPT/u.test(s.text),`${label}: the person's prompt is neither visible nor announced (D-04)\n${dump(s)}`);
}

for(const [cols,rows] of SIZES){
  test(`R1 characterisation ${cols}×${rows}: a fresh session at idle`,async()=>{
    const app=await mountApp({cols,rows,root:env.root,paths:env.paths});
    try{
      const idle=await app.screen();
      assert.match(idle.text,/Setup:|Choose a provider|Choose the model/u,'idle: the setup checklist is shown');
      assertBuilt(idle,`idle ${cols}×${rows}`);
    }finally{app.unmount();}
  });

  test(`R1 characterisation ${cols}×${rows}: resumed, help, model picker, approval, streaming, long paste`,async t=>{
    const app:MountedApp=await mountApp({cols,rows,root:env.root,paths:env.paths,history:RESUMED});
    try{
      await t.test('resumed: the answer is shown and the prompt is visible or announced',async()=>{
        const resumed=await app.waitFor('the resumed answer',s=>/point 40 of a long answer/u.test(s.text));
        assertBuilt(resumed,`resumed ${cols}×${rows}`);
        assertPromptVisibleOrAnnounced(resumed,`resumed ${cols}×${rows}`);
      });
      await t.test('help overlay',async()=>{
        app.press('?');
        const help=await app.waitFor('the help overlay',s=>HELP_OPEN.test(s.text));
        assertBuilt(help,`help ${cols}×${rows}`,{roster:false});
        app.press(KEY.esc);await app.waitFor('help closed',s=>!HELP_OPEN.test(s.text));
      });
      await t.test('model picker',async()=>{
        app.press(KEY.altP);/* R4 Q-R4-6: the model picker moved from Ctrl+L to Alt+P */
        const picker=await app.waitFor('the picker',s=>/search: /u.test(s.text));
        assertBuilt(picker,`picker ${cols}×${rows}`,{roster:false});
        app.press(KEY.esc);await app.waitFor('picker closed',s=>!/search: /u.test(s.text));
      });
      await t.test('approval',async()=>{
        app.emit('run.started',{runId:'r1'});
        app.emit('approval.required',{requestId:'q1',azione:{tipo:'comando',comando:'npm test'}});
        const approval=await app.waitFor('the approval',s=>/Permission/u.test(s.text));
        assertBuilt(approval,`approval ${cols}×${rows}`,{roster:false,card:true});
        /* R3 approval key race (owner decision): a key within APPROVAL_GRACE_MS of the dialog goes to the composer, so the
           dismissal waits for the dialog to take keys; Esc there denies and stops the turn (Q-R3-14). */
        await sleep(APPROVAL_GRACE_MS+50);app.press(KEY.esc);await sleep(150);
      });
      await t.test('streaming',async()=>{
        app.emit('message.started',{messageId:'a1',role:'assistant'});
        app.emit('message.delta',{messageId:'a1',delta:Array.from({length:50},(_,i)=>`streamed line ${i+1}`).join('\n\n')});
        const streaming=await app.waitFor('the streamed text',s=>/streamed line 50/u.test(s.text));
        assertBuilt(streaming,`streaming ${cols}×${rows}`);
        app.emit('message.completed',{messageId:'a1'});app.emit('run.completed',{runId:'r1'});await sleep(150);
      });
      await t.test('long paste expanded in the composer',async()=>{
        app.press(`${'\u001B'}[200~${PASTE}${'\u001B'}[201~`);
        await app.waitFor('the collapsed paste',s=>/\[Pasted text #\d+ \+59 lines\]/u.test(s.text));
        /* UI Phase 1 (owner 27/09): the cursor no longer opens it; pasting the same text again does (Claude Code) */
        app.press(`${'\u001B'}[200~${PASTE}${'\u001B'}[201~`);
        const expanded=await app.waitFor('the expanded paste',s=>/line \d+ of a pasted log/u.test(s.text));
        assertBuilt(expanded,`paste ${cols}×${rows}`);
      });
    }finally{app.unmount();}
  });
}
