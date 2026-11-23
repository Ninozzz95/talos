/*
 * Twin repair of desktop 0.2.2, round 6, CLI side (owner 14/11 17:13, judge v1895-v1896: «the CLI puts E11 back in round 6»).
 * Reviewer 3 after round 5, measured end to end (CLI 3cd6f6e39 + PC kernel 6be2789f0): the terminal card showed in clear names the
 * CLI 0.6.14 masked, 16 of 24 in the probe against 2 of 24 before (`password_confirmation`, `api_key_2`, `apiKeyValue`, `token_value`,
 * `secret_answer`, `authorization_header`…). Round 5 made the bridge trust the kernel's name rule for the arguments of an outside tool, and
 * the kernel's rule (forme-di-segreto.mjs `nomeDiCampoSegreto`) wants the secret word at the END of the name, as Hermes does
 * (agent/redact.py:493-497, «Suffix-only»). The bridge now puts its own Gate E11 rule back ON TOP of the kernel's: a name is masked when
 * it is an exact secret name or holds a whole secret word anywhere; usage counters (prompt_tokens, token_count) stay readable.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {approvalDialogLines,approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

const action=(argomenti:unknown,tipo='mcp_tool')=>({tipo,toolCallId:'c1',nome:'mcp__srv__do',server:'srv',attrezzo:'do',argomenti,
  frase:'It wants to use the tool «do» of the connector «srv».',fraseChiave:'server.approval.mcpTool',fraseParams:{server:'srv',attrezzo:'do'}});
function pendingFrom(azione:Record<string,unknown>):PendingTuiApproval{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const event=adapter.translate({type:'ApprovalRequested',requestId:'r1',azione}) as any;
  assert.equal(event?.type,'approval.required');
  const payload=event.payload as Record<string,unknown>;
  return{requestId:'r1',sessionId:'s1',action:permissionActionFromApproval(payload),rawPayload:payload,reason:'asks'};
}
const lineText=(line:any)=>line.kind==='row'?line.text:`${' '.repeat(line.indent)}${line.text}`;
const card=(azione:Record<string,unknown>)=>approvalDialogLines(approvalDialogModel(pendingFrom(azione),{expanded:true}),{columns:120}).map(lineText).join('\n');
const bridged=(azione:Record<string,unknown>)=>(createV2EventBridge('s-1',()=>'2026-11-14T10:00:00.000Z').translate({type:'ApprovalRequested',_sequenza:1,requestId:'q1',azione})?.data as any).action;

/* the 14 names reviewer 3 found in clear on 3cd6f6e39 (the kernel leaves them: the secret word is not at the end) */
const NEW_IN_CLEAR=['password_confirmation','passwordConfirm','new_password_again','password_new','api_key_2','api_key_old','apiKeyValue',
  'client_secret_2','token_value','access_token_raw','auth_token_b64','secret_answer','secret_text','authorization_header'];

test('CLI-ARG-G6-01: the 14 names reviewer 3 saw in clear are masked by the bridge on top of the kernel, each value gone',()=>{
  for(const name of NEW_IN_CLEAR){
    const args=bridged(action({[name]:`VAL-${name}-plain`})).arguments;
    assert.ok(!JSON.stringify(args).includes(`VAL-${name}-plain`),`${name}: ${JSON.stringify(args)}`);
    assert.deepEqual(Object.keys(args),[name],'the name stays, only the value is masked');
  }
});

test('CLI-ARG-G6-02: on the terminal card, the same names show no value, collapsed rows included',()=>{
  const args=Object.fromEntries(NEW_IN_CLEAR.map(name=>[name,`VAL-${name}-plain`]));
  const text=card(action(args));
  for(const name of NEW_IN_CLEAR){
    assert.ok(text.includes(name),`${name} is a row\n${text}`);
    assert.ok(!text.includes(`VAL-${name}-plain`),`${name} value hidden\n${text}`);
  }
});

test('CLI-ARG-G6-03: a whole secret word anywhere in the name, at any depth and in a list, also for plugin and Tool Forge cards',()=>{
  for(const tipo of ['mcp_tool','plugin_tool','forge_tool']){
    const args=bridged(action({outer:{db:{secret_answer:'VALDEEP'}},list:[{api_key_old:'VALLIST'}],note:'plain'},tipo)).arguments;
    const text=JSON.stringify(args);
    assert.ok(!text.includes('VALDEEP')&&!text.includes('VALLIST'),`${tipo}: ${text}`);
    assert.equal(args.note,'plain');
  }
});

test('CLI-ARG-G6-04: an exact secret name is masked whatever its case or separators: Authorization, X-Api-Key, id_token, CLIENT-SECRET',()=>{
  for(const name of ['Authorization','X-Api-Key','id_token','CLIENT-SECRET','refreshToken','passwd']){
    const args=bridged(action({[name]:`VAL-${name}`})).arguments;
    assert.ok(!JSON.stringify(args).includes(`VAL-${name}`),`${name}: ${JSON.stringify(args)}`);
  }
});

test('CLI-ARG-G6-05: usage counters stay readable: token_count, tokenPrima, tokenDopo, prompt_tokens with their numbers',()=>{
  const args=bridged(action({token_count:120,tokenPrima:5000,tokenDopo:900,prompt_tokens:12,total_tokens:40})).arguments;
  assert.deepEqual(args,{token_count:120,tokenPrima:5000,tokenDopo:900,prompt_tokens:12,total_tokens:40});
});

test('CLI-ARG-G6-06: on the terminal card a counter is a readable row, while a text under the same counter name is masked',()=>{
  const text=card(action({token_count:120,tokenDopo:900}));
  assert.ok(text.includes('token_count: 120')&&text.includes('tokenDopo: 900'),text);
  const words=bridged(action({token_count:'VALCOUNTTEXT'})).arguments;
  assert.ok(!JSON.stringify(words).includes('VALCOUNTTEXT'),'a counter is a number: a text under that name is a secret word');
});

test('CLI-ARG-G6-07: what the kernel already masked stays the kernel\'s mask; an honest name without a secret word stays readable',()=>{
  const args=bridged(action({password:'[redacted]',api_key:'[redacted]',path:'notes.txt',keyboard:'us',cookie_policy:'strict'})).arguments;
  assert.deepEqual(args,{password:'[redacted]',api_key:'[redacted]',path:'notes.txt',keyboard:'us',cookie_policy:'strict'});
});
