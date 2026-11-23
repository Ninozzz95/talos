/**
 * s95 — row 126 of the owner's register, road A (owner 13/11/2026 04:35; judge v1759, approved for the CLI in v2605), on the real kernel:
 * a trusted MCP server (fixtures/tools-mcp-server.mjs) whose `add_label` is declared non-destructive, and the fake provider's
 * SAMECALLS<n>, which calls it n times in ONE answer with n labels. The kernel groups them (talosHarness.mjs `gruppiDelleChiamateDiFuori`)
 * and lists them on the first card; the card offers «[7] Allow all the same calls of this answer». After 7 the other calls ask no more
 * (the turn could not end otherwise: nobody answers a second card). The contrary: a plain [1] covers its call only, the next card comes.
 * Each card is judged on a whole frame (A5d `wholeFrame`), at 120×40 and 80×24.
 */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {approvalVisible,assertEnglishOnly,idleFooter} from './checks.ts';
import {answerApproval,stage,toComposer,wholeFrame} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const SERVER=fileURLToPath(new URL('./fixtures/tools-mcp-server.mjs',import.meta.url)).replaceAll('\\','/');
const s=stage({name:'s95',files:{'README.md':'# demo\n','.harness-ui-mcp.json':JSON.stringify({server:[{id:'gh',comando:process.execPath,argomenti:[SERVER],allowlist:['add_label']}]})}});
const ROW='[7] Allow all the same calls of this answer';
let t:TerminalSession;
/* only the card's own rows (from its title row `╭─` down), as s94 */
const cardText=(x:Screen)=>{const lines=x.lines.map(String);const at=lines.map(line=>line.includes('╭─')).lastIndexOf(true);return at<0?'':lines.slice(at).join('\n');};
const labelCard=(tag:string,n:number)=>wholeFrame(t,`the add_label card of «${tag} ${n}»`,x=>approvalVisible(x)&&new RegExp(`label: ${tag} ${n}(?!\\d)`,'u').test(cardText(x)),{timeout:45_000});
async function turnEnds():Promise<Screen>{return t.waitFor('the turn ended',x=>idleFooter(x)&&x.text.includes('Tool said:')&&!approvalVisible(x),{timeout:45_000});}
const toolTexts=()=>s.fake.chatRequests().at(-1)?.toolTexts?.map(x=>x.text).join('\n')??'';
/* round 2 (judge v2619, the reviewer's R5): every row [7] covered says who said yes and that it was for all of them, none says only «done» */
/* a tool row is its title line («Add label (gh MCP) · <why> · done») with the call's argument on the line under it */
const titleOf=(screen:Screen,tag:string,n:number)=>{const lines=screen.lines.map(String);const at=lines.findIndex(line=>new RegExp(`^\\s*label: ${tag} ${n}\\s*$`,'u').test(line));return at>0?lines[at-1]!:'';};
function assertAllRows(screen:Screen,tag:string,label:string){
  for(const n of [1,2,3]){
    const title=titleOf(screen,tag,n);
    assert.match(title,/Add label .*· you allowed all 3 calls · done/u,`${label}: the row of «${tag} ${n}» says «you allowed all 3 calls»\n${screen.text}`);
  }
}
function assertGroupCard(screen:Screen,tag:string,label:string){
  const text=cardText(screen);
  for(const row of ['The 3 calls this answer covers','Call 1 of 3','Call 2 of 3','Call 3 of 3',`label: ${tag} 1`,`label: ${tag} 2`,`label: ${tag} 3`,'[1] Allow once','[4] Deny',ROW])
    assert.ok(text.includes(row),`${label}: the card shows «${row}»\n${screen.text}`);
  assertEnglishOnly(screen.text);
}

test('s95 · 120×40: one card lists the 3 calls of the answer; 7 answers it and the other two ask no more',async()=>{
  const trusted=await s.profile.talos(['mcp','trust','gh']);
  assert.equal(trusted.status,0,trusted.stderr+trusted.stdout);
  t=s.launch([],{cols:120,rows:40});
  await toComposer(t,{whole:true});
  await t.submit('SAMECALLS all');
  assertGroupCard(await labelCard('all',1),'all',`120×40`);
  await answerApproval(t,'7');
  assertAllRows(await turnEnds(),'all','120×40');
  const told=toolTexts();
  for(const n of [1,2,3])assert.match(told,new RegExp(`LABEL_ADDED all ${n}`,'u'),`call ${n} ran\n${told}`);
});

test('s95 · 120×40, the contrary: a plain [1] covers its call only, the next call asks on its own card',async()=>{
  /* the kernel lists on each card the calls from that one on (`daQui`): 3, then 2, then a card of one call with no list */
  const card=(label:string,test:(text:string)=>boolean)=>wholeFrame(t,label,x=>approvalVisible(x)&&test(cardText(x)),{timeout:45_000});
  await t.submit('SAMECALLS one');
  await card('card 1 of the plain run',text=>text.includes('The 3 calls this answer covers'));
  await answerApproval(t,'1');
  await card('card 2 of the plain run',text=>text.includes('The 2 calls this answer covers')&&!text.includes('label: one 1'));
  await answerApproval(t,'1');
  const last=await card('card 3 of the plain run',text=>text.includes('label: one 3')&&!text.includes('calls this answer covers'));
  assert.equal(cardText(last).includes(ROW),false,`a card of one call offers no [7]\n${last.text}`);
  await answerApproval(t,'1');
  const plain=await turnEnds();
  for(const n of [1,2,3])assert.match(toolTexts(),new RegExp(`LABEL_ADDED one ${n}`,'u'));
  for(const n of [1,2,3])assert.match(titleOf(plain,'one',n),/Add label .*· you allowed once · done/u,`a plain 1 is «you allowed once» on «one ${n}»\n${plain.text}`);
  await t.close();
});

test('s95 · 80×24: the card keeps the list and every choice on a whole frame, and 7 answers it',async()=>{
  t=s.launch([],{cols:80,rows:24});
  await toComposer(t,{whole:true});
  await t.submit('SAMECALLS small');
  assertGroupCard(await labelCard('small',1),'small','80×24');
  await answerApproval(t,'7');
  assertAllRows(await turnEnds(),'small','80×24');
  for(const n of [1,2,3])assert.match(toolTexts(),new RegExp(`LABEL_ADDED small ${n}`,'u'));
  await t.close();
});
