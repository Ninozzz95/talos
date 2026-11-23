/*
 * Stage 3, the plan card (owner 02/10). Drawn as the approved mockup draws it — text AND style compared with the golden
 * frames step-04-permessi-e-piano-t12s at 120×40 and 80×24 — plus the owner's row with the two extra keys (a, c), which the
 * golden frame does not have. Keys: Enter approves asking before edits, a accepts edits, c starts clean, e edits in the
 * editor (the model then re-proposes), Esc keeps planning. A plan longer than the room shows its first steps and says how
 * many more.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {openPlanCard,planCardClick,planCardKey,planCardRows} from '../../src/tui/plan-card.ts';
import type {CardRow} from '../../src/tui/question-card-rows.ts';

const golden=JSON.parse(readFileSync(new URL('./fixtures/plan-card-golden.json',import.meta.url),'utf8')) as {frames:Record<string,{text:string[];style:string[]}>};
const PLAN='1. Move the resize pipeline into src/export/worker.ts\n2. Post jobs through a bounded queue (4 at a time)\n3. Keep the sync path for files under 1 MB\n4. Add a test that exports 50 images without blocking the event loop';
const card=(content=PLAN)=>openPlanCard({requestId:'r-1',hash:'sha256:x',content});
const text=(rows:CardRow[])=>rows.map(r=>r.map(s=>s.text).join('').replace(/\s+$/u,''));
const style=(rows:CardRow[])=>rows.map(r=>{let x=0;const out:Array<{start:number;end:number;roles:string}>=[];
  for(const s of r){const n=[...s.text].length;const roles=[...s.roles].sort().join(',');const last=out.at(-1);
    if(roles&&n){if(last&&last.roles===roles&&last.end===x)last.end=x+n;else out.push({start:x,end:x+n,roles});}x+=n;}
  return out.map(o=>`${o.start}+${o.end-o.start}:${o.roles}`).join(' ');});
const EXTRA='a approve and accept edits · c approve in a clean conversation';

for(const [size,width] of [['120x40',120],['80x24',80]] as const){
  test(`the plan card matches the approved mockup at ${size}, text and style (the owner's extra-keys row aside)`,()=>{
    const rows=planCardRows(card(),width);
    const mockupRows=rows.filter(r=>!r.map(s=>s.text).join('').includes(EXTRA));
    assert.equal(rows.length-mockupRows.length,1,'exactly one extra row');
    assert.deepEqual(text(mockupRows),golden.frames[size]!.text);
    assert.deepEqual(style(mockupRows),golden.frames[size]!.style);
    const extra=rows.find(r=>r.map(s=>s.text).join('').includes(EXTRA))!;
    assert.ok(extra.some(s=>s.roles.includes('faint')),'the extra keys are drawn like the hint');
  });
}

test('keys: Enter, a, c, e and Esc',()=>{
  const c=card();
  assert.deepEqual(planCardKey(c,{name:'return'}),{kind:'decide',decision:'ask-before-edits'});
  assert.deepEqual(planCardKey(c,{name:'a',text:'a'}),{kind:'decide',decision:'accept-edits'});
  assert.deepEqual(planCardKey(c,{name:'c',text:'c'}),{kind:'decide',decision:'clean-conversation'});
  assert.deepEqual(planCardKey(c,{name:'e',text:'e'}),{kind:'edit'});
  assert.deepEqual(planCardKey(c,{name:'escape'}),{kind:'decide',decision:'keep-planning'});
  assert.deepEqual(planCardKey(c,{name:'x',text:'x'}),{kind:'none'});
  assert.deepEqual(planCardKey(c,{name:'a',text:'a',ctrl:true}),{kind:'none'});
});

test('a long plan shows the steps that fit and says how many more; nothing is lost silently',()=>{
  const long=Array.from({length:30},(_,i)=>`${i+1}. step number ${i+1}`).join('\n');
  const rows=text(planCardRows(card(long),120,14));
  assert.equal(rows.length,14);
  assert.ok(rows.some(r=>r.includes('… +')&&r.includes('more steps · e opens the whole plan')),rows.join('\n'));
  const shown=rows.filter(r=>/^│ {3}\d+\. step number/u.test(r)).length;
  assert.ok(rows.some(r=>r.includes(`… +${30-shown} more steps`)),'the count matches what is hidden');
});

test('a plan without a numbered list: its bullets, else its lines',()=>{
  assert.deepEqual(card('# Goal\n- read the code\n- change it').steps,['read the code','change it']);
  assert.deepEqual(card('# Goal\nRead the code.\n\nChange it.').steps,['Goal','Read the code.','Change it.']);
});

/* Stage 6c «tutto cliccabile» (mockup `click`: papprove → Enter, pedit → e, preject → Escape). */
test('a click on the card\'s buttons is the key the button names',()=>{
  const state=card();
  assert.deepEqual(planCardClick(state,'approve'),planCardKey(state,{name:'return'}));
  assert.deepEqual(planCardClick(state,'edit'),planCardKey(state,{name:'e',text:'e'}));
  assert.deepEqual(planCardClick(state,'keep'),planCardKey(state,{name:'escape'}));
  assert.equal(planCardClick(state,'send'),null);
});
