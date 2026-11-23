/**
 * s42 — stage 3, MCP elicitation (owner 02/10: kernel patch, then the CLI; mockup step-17). A trusted MCP server
 * (fixtures/elicit-mcp-server.mjs, stdio) asks the person for a pull request's details while the model calls its tool.
 * The card of the approved mockup takes the composer's place; Enter sends the form, the server receives the values, the
 * transcript keeps them as «Your answers»; a second request cancelled with Esc says «Cancelled.». Fake provider `MCPPR`.
 */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {approvalVisible,assertEnglishOnly,idleFooter} from './checks.ts';
import {answerApproval,stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const SERVER=fileURLToPath(new URL('./fixtures/elicit-mcp-server.mjs',import.meta.url)).replaceAll('\\','/');
const s=stage({name:'s42',files:{'README.md':'# demo\n','.harness-ui-mcp.json':JSON.stringify({server:[{id:'github',comando:process.execPath,argomenti:[SERVER],allowlist:['create_pr']}]})}});
let t:TerminalSession;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const GRACE_MS=450;
async function toCard(prompt:string):Promise<Screen>{
  await t.submit(prompt);
  for(let i=0;i<3;i++){
    const next=await t.waitFor('the MCP card or an approval',x=>x.text.includes('(MCP server)')||approvalVisible(x),{timeout:45_000});
    if(next.text.includes('(MCP server)'))return next;
    await answerApproval(t,'1');
  }
  return t.waitFor('the MCP card',x=>x.text.includes('(MCP server)'),{timeout:30_000});
}

test('s42 · the trusted server\'s request opens the card as the mockup draws it',async()=>{
  const trusted=await s.profile.talos(['mcp','trust','github']);
  assert.equal(trusted.status,0,trusted.stderr+trusted.stdout);
  t=s.launch([],{cols:120,rows:40});
  await toComposer(t);
  const card=await toCard('MCPPR open the pull request');
  for(const row of ['github (MCP server) needs details to create the pull request','› Repository        acme/shop-api▍','Base branch       main',
    'Draft pull request[x] yes','Labels            [x] auth  [x] tests  [ ] bug','Review and send     Decline    ↑/↓ field · type to edit · space toggle · esc cancel'])
    assert.ok(card.text.includes(row),`the card shows «${row}»\n${card.text}`);
  assertEnglishOnly(card.text);
});

test('s42 · Enter sends the form: the server gets the values, the transcript keeps them',async()=>{
  await pause(GRACE_MS);
  t.press('down');t.press('down');await pause(100);t.press('space');await pause(100);
  t.press('enter');
  const done=await t.waitFor('the turn ended',x=>idleFooter(x)&&x.text.includes('Done: PR step finished.'),{timeout:30_000});
  for(const row of ['◆ Your answers','Repository  acme/shop-api','Draft pull request  no','Labels  auth, tests'])
    assert.ok(done.text.includes(row),`the transcript keeps «${row}»\n${done.text}`);
  const told=s.fake.chatRequests().at(-1)?.toolTexts?.map(x=>x.text).join('\n')??'';
  assert.match(told,/PR_CREATED/u,'the server received the answer');
  assert.match(told,/"draft":false/u);
});

test('s42 · Esc cancels: the server is told, the transcript says so',async()=>{
  await toCard('MCPPR again');
  await pause(GRACE_MS);
  t.press('esc');
  const after=await t.waitFor('the turn ended after the cancel',x=>idleFooter(x)&&x.text.includes('Cancelled.'),{timeout:30_000});
  assert.ok(!after.text.includes('(MCP server) needs details'));
  const told=s.fake.chatRequests().at(-1)?.toolTexts?.map(x=>x.text).join('\n')??'';
  assert.match(told,/PR_NOT_CREATED cancel/u);
});
