/**
 * s94 — A5j, road B (owner 13/11/2026 04:35; judge's plan on paper 19/11/2026, posts 3, 4 and 8), on the real kernel: a trusted MCP
 * server (fixtures/tools-mcp-server.mjs) and the fake provider's NOTOOL<n>, which calls create_pr n times with n different titles, then
 * list_prs of the same server. The connector's card offers «[6] No to this tool until your next message» (the PC's words, desktop 0.2.3
 * chat.js:1498). After 6 the other create_pr calls of the turn get no card (the kernel's `noAlloStrumentoDelGiro`), list_prs still
 * asks; the next message of the person brings the card back. Each card is judged on a whole frame (A5d `wholeFrame`), at 120×40 and 80×24:
 * every choice is on screen. The measure of the plan: ten refused calls of one tool cost ten cards with Deny, one with 6.
 */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {approvalVisible,assertEnglishOnly,idleFooter} from './checks.ts';
import {answerApproval,stage,toComposer,wholeFrame} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const SERVER=fileURLToPath(new URL('./fixtures/tools-mcp-server.mjs',import.meta.url)).replaceAll('\\','/');
const s=stage({name:'s94',files:{'README.md':'# demo\n','.harness-ui-mcp.json':JSON.stringify({server:[{id:'gh',comando:process.execPath,argomenti:[SERVER],allowlist:['create_pr','list_prs']}]})}});
const ROW='[6] No to this tool until your next message';
let t:TerminalSession;
/* the card takes the composer's place at the bottom (approvalCardRows, `│ ╭─ ` on its title row): only its own rows are read, so a
   transcript row of an earlier call can never pass for the card on screen */
const cardText=(x:Screen)=>{const lines=x.lines.map(String);const at=lines.map(line=>line.includes('╭─')).lastIndexOf(true);return at<0?'':lines.slice(at).join('\n');};
const card=(label:string,what:RegExp)=>wholeFrame(t,label,x=>approvalVisible(x)&&what.test(cardText(x)),{timeout:45_000});
/* each turn's titles carry the turn's word (NOTOOL <word>), so a row of an earlier turn can never pass for this turn's card */
const prCard=(tag:string,n:number)=>card(`the create_pr card of «${tag} pr ${n}»`,new RegExp(`${tag} pr ${n}(?!\\d)`,'u'));
const listCard=()=>card('the list_prs card',/list_prs|List prs|list prs/u);
async function turnEnds():Promise<Screen>{return t.waitFor('the turn ended',x=>idleFooter(x)&&x.text.includes('Tool said:')&&!approvalVisible(x),{timeout:45_000});}
const toolTexts=()=>s.fake.chatRequests().at(-1)?.toolTexts?.map(x=>x.text).join('\n')??'';
function assertWholeCard(screen:Screen,label:string){
  for(const row of ['[1] Allow once','[2] Allow for this session','[3] Always allow','[4] Deny',ROW])
    assert.ok(screen.text.includes(row),`${label}: the card shows «${row}»\n${screen.text}`);
  assertEnglishOnly(screen.text);
}

test('s94 · 120×40: the connector card offers 6; after it the same tool asks no more in this turn, another tool of the server does',async()=>{
  const trusted=await s.profile.talos(['mcp','trust','gh']);
  assert.equal(trusted.status,0,trusted.stderr+trusted.stdout);
  t=s.launch([],{cols:120,rows:40});
  await toComposer(t,{whole:true});
  await t.submit('NOTOOL first');
  assertWholeCard(await prCard('first',1),'120×40');
  await answerApproval(t,'6');
  await listCard();
  await answerApproval(t,'1');
  const done=await turnEnds();
  /* the kernel's own sentence on the refused calls' rows (talosHarness.mjs, via `no-allo-strumento-nel-giro`) */
  assert.match(done.text,/said no to this tool until their next message/u,`the rows say the outcome\n${done.text}`);
  /* judge v2325: the call answered with 6 is the person's no, «denied» as a plain Deny; the later ones keep the core's «failed» (known limit) */
  assert.match(done.text,/first pr 1 · denied/u,`the answered call is denied\n${done.text}`);
  assert.match(done.text,/first pr 2 · failed/u,`the later call keeps the core's word (known limit)\n${done.text}`);
  const told=toolTexts();
  assert.equal(/PR_CREATED/u.test(told),false,`no create_pr ran\n${told}`);
  assert.match(told,/PRS_LISTED/u,'list_prs ran');
});

test('s94 · 120×40: the next message brings the card back; a plain Deny does not cover the next title, 6 does',async()=>{
  await t.submit('NOTOOL again');
  await prCard('again',1);
  await answerApproval(t,'4');
  await prCard('again',2);
  await answerApproval(t,'6');
  await listCard();
  await answerApproval(t,'4');
  const done=await turnEnds();
  console.log(`[s94 rows]\n${done.lines.filter(line=>/again pr|said no|did not approve|REFUSED/u.test(line)).join('\n')}`);
  assert.equal(/PR_CREATED/u.test(toolTexts()),false);
});

test('s94 · measure: ten refused calls of one tool, ten cards with Deny, one with 6',async()=>{
  let withDeny=0;
  await t.submit('NOTOOL10 deny each');
  for(let n=1;n<=10;n++){await prCard('deny',n);withDeny++;await answerApproval(t,'4');}
  await listCard();await answerApproval(t,'4');await turnEnds();
  let withSix=0;
  await t.submit('NOTOOL10 six once');
  await prCard('six',1);withSix++;await answerApproval(t,'6');
  await listCard();await answerApproval(t,'4');await turnEnds();
  console.log(`[s94 measure] create_pr cards for 10 refused calls: Deny ${withDeny}, «No to this tool» ${withSix}`);
  assert.deepEqual([withDeny,withSix],[10,1]);
  await t.close();
});

test('s94 · 80×24: the card keeps every choice on a whole frame, and 6 answers it',async()=>{
  t=s.launch([],{cols:80,rows:24});
  await toComposer(t,{whole:true});
  await t.submit('NOTOOL small');
  assertWholeCard(await prCard('small',1),'80×24');
  await answerApproval(t,'6');
  await listCard();
  await answerApproval(t,'4');
  await turnEnds();
  assert.equal(/PR_CREATED/u.test(toolTexts()),false);
});
