/**
 * s67 — the Settings sheet's Context tab (`/context`) on the BUILT CLI, two surfaces of 0.6.4:
 *   (a) 36178a01b: after one turn against the fake model, the tab draws what the LAST request was made of — the parts grid
 *       (System prompt, Tools, MCP tools, Memory files, Messages) — marked as an estimate;
 *   (b) 798d78e42: a model whose configured window is 1,000,000 is summarised at 200,000 tokens at the latest — the tab's
 *       «compacts by itself at N%» is at most 200,000 tokens of that window (the 50 % rule alone said 500,000).
 * Fake model on 127.0.0.1 only (fake-provider.ts); nothing else is reached.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FAKE_MODEL_ID,exitTalos,stage,toComposer} from './harness.ts';
import {idleFooter} from './checks.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s67',files:{'README.md':'# demo\n'}});
const PARTS=['System prompt','Tools','MCP tools','Memory files','Messages'];
const contextTab=(x:Screen)=>x.text.includes('── Settings')&&/\bwindow · .* used \(\d+%\) · compacts by itself at [\d.]+%/u.test(x.text);

async function openContext(t:TerminalSession){
  await t.submit('/context');
  return t.waitFor('the Context tab',contextTab,{timeout:20_000});
}

test('s67 (a) · after one turn, /context draws the last request\'s parts, marked as an estimate',async()=>{
  const set=await s.profile.talos(['config','set',`models.${FAKE_MODEL_ID}.contextWindow`,'131072','--scope','user']);
  assert.equal(set.status,0,`config set failed: ${set.stdout}${set.stderr}`);
  const t=s.launch([],{cols:120,rows:40});
  try{
    await toComposer(t);
    await t.submit('hello there');
    await t.waitFor('the answer',x=>idleFooter(x)&&/\bOK\b/u.test(x.text),{timeout:30_000});
    assert.ok(s.fake.chatRequests().length>=1,'the premise: one request reached the fake model');
    const tab=await openContext(t);
    for(const part of PARTS)assert.match(tab.text,new RegExp(`■ ${part.replace(/ /gu,' ')}\\s+\\d`,'u'),`the grid's legend names «${part}»\n${tab.text}`);
    assert.match(tab.text,/· parts estimated/u,`the parts are marked as an estimate\n${tab.text}`);
    assert.match(tab.text,/■ Free\s+\d/u);
    assert.match(tab.text,/131k window/u,`the window the person set\n${tab.text}`);
    t.press('esc');
    await t.waitFor('the sheet closed',x=>!x.text.includes('── Settings'),{timeout:10_000});
    assert.equal(await exitTalos(t),true);
  }finally{await t.close();}
});

test('s67 (b) · a 1,000,000-token window: /context says it compacts at 200,000 tokens at the latest',async()=>{
  const set=await s.profile.talos(['config','set',`models.${FAKE_MODEL_ID}.contextWindow`,'1000000','--scope','user']);
  assert.equal(set.status,0,`config set failed: ${set.stdout}${set.stderr}`);
  const t=s.launch([],{cols:120,rows:40});
  try{
    await toComposer(t);
    /* the tab measures once something was said («Nothing measured yet» before) */
    await t.submit('hello again');
    await t.waitFor('the answer',x=>idleFooter(x)&&/\bOK\b/u.test(x.text),{timeout:30_000});
    const tab=await openContext(t);
    const row=/(\d+)k window · .* compacts by itself at ([\d.]+)%/u.exec(tab.text);
    assert.ok(row,`the window row\n${tab.text}`);
    assert.equal(Number(row![1]),1000,`the window the person set\n${tab.text}`);
    const at=Number(row![2]);
    assert.ok(at*1_000_000/100<=200_000,`compacts at ${at}% of 1,000,000 = ${at*10_000} tokens, past the 200,000 cap\n${tab.text}`);
    assert.ok(at>0,`a threshold of 0%\n${tab.text}`);
    /* the Usage tab says the same share beside «N% of 1000k» (tab: Config, Status, Usage) */
    t.press('tab');t.press('tab');t.press('tab');
    const usage=await t.waitFor('the Usage tab',x=>/automatic at [\d.]+%/u.test(x.text),{timeout:10_000});
    const automatic=Number(/automatic at ([\d.]+)%/u.exec(usage.text)![1]);
    assert.equal(automatic,at,`the Usage tab says ${automatic}%, the Context tab ${at}%\n${usage.text}`);
    t.press('esc');
    await t.waitFor('the sheet closed',x=>!x.text.includes('── Settings'),{timeout:10_000});
    assert.equal(await exitTalos(t),true);
  }finally{await t.close();}
});
