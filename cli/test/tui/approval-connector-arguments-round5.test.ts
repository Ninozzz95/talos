/*
 * Twin repair of desktop 0.2.2, round 5, CLI side (owner 14/11 14:15, choice A; judge v1878): what reviewer 3 measured on 4a56ed6c4
 * with the PC kernel of 1229750e4, and what reviewer 1 measured on the PC card that the terminal shares.
 *   RED: an argument named «__proto__» never reached the terminal card, while the tool received it: the v2 bridge rebuilds every object
 *        with `out[key]=…` (protocol/v2/events.ts `clean`), and «__proto__» set the prototype instead of becoming a field. Claude Code fixed
 *        the same defect (CHANGELOG 897, «hooks being handed values with `__proto__` keys silently removed»).
 *   RED (reviewer 1, RED 3): a top that is a list, a text or a number reached the card and the tool, but the terminal showed no row.
 *   YELLOWS: a short name made of invisible characters passed the 40-character check and its value was folded away; a long name the model
 *        wrote ending in «…(7)» was shown «(7) …» though the kernel never numbered it; the bridge masked `token_limit`, `secret_santa`,
 *        `password_hint` that the kernel leaves readable.
 * And a second project test for the mutants that only the reviewer's probe killed (M2 summary rows, M5 depth, M9 collapsed height).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {approvalDialogLines,approvalDialogModel} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';

/* the action the kernel's gate builds (talosHarness.mjs `cancelloDelloStrumentoDiFuori`), with `argomenti` as `argomentiPerLaCarta` returns it */
const action=(argomenti:unknown,extra:Record<string,unknown>={})=>({tipo:'mcp_tool',toolCallId:'c1',nome:'mcp__srv__do',server:'srv',attrezzo:'do',argomenti,...extra,
  frase:'It wants to use the tool «do» of the connector «srv».',fraseChiave:'server.approval.mcpTool',fraseParams:{server:'srv',attrezzo:'do'}});
function pendingFrom(azione:Record<string,unknown>):PendingTuiApproval{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const event=adapter.translate({type:'ApprovalRequested',requestId:'r1',azione}) as any;
  assert.equal(event?.type,'approval.required');
  const payload=event.payload as Record<string,unknown>;
  return{requestId:'r1',sessionId:'s1',action:permissionActionFromApproval(payload),rawPayload:payload,reason:'asks'};
}
const lineText=(line:any)=>line.kind==='row'?line.text:`${' '.repeat(line.indent)}${line.text}`;
const card=(azione:Record<string,unknown>,{expanded=false,columns=80}:{expanded?:boolean;columns?:number}={})=>
  approvalDialogLines(approvalDialogModel(pendingFrom(azione),{expanded}),{columns}).map(lineText);
const bridged=(azione:Record<string,unknown>)=>(createV2EventBridge('s-1',()=>'2026-11-14T10:00:00.000Z').translate({type:'ApprovalRequested',_sequenza:1,requestId:'q1',azione})?.data as any).action;

/* ------------------------------------------------------------------ «__proto__» ------------------------------------------------------------------ */
test('CLI-ARG-G5-01: an argument named «__proto__» (an own name, as JSON.parse makes it) stays a field through the v2 bridge',()=>{
  const args=bridged(action(JSON.parse('{"path":"notes.txt","__proto__":"VALPROTO-delete-all"}'))).arguments;
  assert.deepEqual(Object.keys(args),['path','__proto__'],'both names are own fields');
  assert.equal(Object.getOwnPropertyDescriptor(args,'__proto__')?.value,'VALPROTO-delete-all');
  assert.equal(Object.getPrototypeOf(args),Object.prototype,'the prototype is untouched');
});

test('CLI-ARG-G5-02: the terminal card shows «__proto__» and its value, also nested and holding an object, collapsed and expanded',()=>{
  for(const [raw,token] of [['{"path":"VALPATH","__proto__":"VALPROTO"}','VALPROTO'],['{"path":"VALPATH","__proto__":{"evil":"VALPOBJ"}}','VALPOBJ'],['{"outer":{"__proto__":"VALPIN"}}','VALPIN']] as const){
    for(const expanded of [false,true]){
      const text=card(action(JSON.parse(raw)),{expanded}).join('\n');
      assert.ok(text.includes('__proto__')&&text.includes(token),`${raw} (${expanded}): «__proto__» and ${token} on the card\n${text}`);
    }
  }
});

/* ------------------------------------------------------------- a top that is not an object ------------------------------------------------------------- */
test('CLI-ARG-G5-03: a top that is a list, a text or a number is ONE row of the card, its JSON, never a card with no rows',()=>{
  for(const [top,row] of [[['--delete-all','/'],'["--delete-all","/"]'],['rm -rf /','"rm -rf /"'],[42,'42'],[false,'false'],['','""']] as Array<[unknown,string]>){
    for(const expanded of [false,true]){
      const lines=card(action(top),{expanded});const text=lines.join('\n');
      assert.match(text,/What it sends:/u,`${row}: the heading`);
      assert.ok(lines.some(line=>line.trim()===row),`${row} (${expanded}): the row\n${text}`);
    }
  }
});

test('CLI-ARG-G5-04: the top list goes through the v2 bridge as the kernel sent it; an absent or empty top makes no rows',()=>{
  assert.deepEqual(bridged(action(['--delete-all','/'])).arguments,['--delete-all','/']);
  for(const nothing of [undefined,null,{}]){
    const text=card(action(nothing)).join('\n');
    assert.doesNotMatch(text,/What it sends:/u,`${String(nothing)}: no heading without arguments`);
  }
});

/* ----------------------------------------------------- the width of a name is the width it is SHOWN at ----------------------------------------------------- */
test('CLI-ARG-G5-05: a short name of invisible characters is measured as shown: its value has its own row and is seen collapsed',()=>{
  for(const [name,columns] of [['\n'.repeat(39),80],['\u200b'.repeat(39),80],['\u202e'.repeat(28),60],['\t'.repeat(38),80],['\u200b'.repeat(7),60]] as Array<[string,number]>){
    const lines=card(action({[name]:'VALHIDDEN',title:'x'}),{columns});
    assert.ok(lines.some(line=>line.trim()==='VALHIDDEN'),`${JSON.stringify(name).slice(0,20)} at ${columns}: the value on its own row\n${lines.join('\n')}`);
  }
});

test('CLI-ARG-G5-06: thirty-nine wide characters are wider than 40 columns: the value goes under the name; a short plain name stays beside it',()=>{
  const lines=card(action({['名'.repeat(39)]:'VALWIDE',title:'Weekly'}));
  assert.ok(lines.some(line=>line.trim()==='VALWIDE'),lines.join('\n'));
  assert.ok(lines.some(line=>/^\s+title: Weekly$/u.test(line)));
});

/* ------------------------------------------------- «(n)» first only when the kernel numbered the name ------------------------------------------------- */
const TAGLIATO=`${'p'.repeat(1199)}…`;
test('CLI-ARG-G5-07: a long name the model wrote ending in «…(7)» is shown as written: the kernel did not number it',()=>{
  const fake=`${'r'.repeat(60)}…(7)`;
  const text=card(action({[fake]:'VALR'})).join('\n');
  assert.ok(!text.includes('(7) rrr'),`not reordered\n${text}`);
  assert.ok(text.includes(`${'r'.repeat(20)}`)&&text.includes('VALR'));
});

test('CLI-ARG-G5-08: the number goes first when the same name without it is on the same level, as the kernel numbers: «(2)» and «(3)»',()=>{
  const text=card(action({[TAGLIATO]:'one',[`${TAGLIATO}(2)`]:'two',nested:{[TAGLIATO]:'a',[`${TAGLIATO}(3)`]:'b'},[`${'s'.repeat(60)}…(2)`]:'alone'})).join('\n');
  assert.match(text,/\(2\) p{20}/u,'the kernel\'s «(2)» first');
  assert.match(text,/\(3\) p{20}/u,'nested, the kernel\'s «(3)» first');
  assert.ok(!text.includes('(2) sss'),'a numbered name with no twin on its level stays as written');
});

/* ------------------------------------------------------- the bridge's own rule on top of the kernel ------------------------------------------------------- */
/* ⛔ Round 6 (owner 14/11 17:13, judge v1895-v1896): Gate E11 is back on top of the kernel's masks, so a name holding a whole secret word
   (`token_limit`, `secret_santa`, `password_hint`) is masked again on the terminal, as on the CLI 0.6.14; names without one stay readable. */
test('CLI-ARG-G5-09: names without a secret word stay readable on the terminal (tokens, cookie_policy); E11 masks token_limit, secret_santa, password_hint',()=>{
  const args={token_limit:4000,secret_santa:'VALSANTA',password_hint:'VALHINT',tokens:'VALTOKENS',cookie_policy:'strict',max_tokens:4096,keyboard:'us'};
  const lines=card(action(args),{columns:120});const text=lines.join('\n');
  for(const row of ['tokens: VALTOKENS','cookie_policy: strict','max_tokens: 4096','keyboard: us'])
    assert.ok(lines.some(line=>line.trim()===row),`«${row}»\n${text}`);
  for(const value of ['VALSANTA','VALHINT','token_limit: 4000'])assert.ok(!text.includes(value),`«${value}» masked by E11\n${text}`);
});

test('CLI-ARG-G5-10: what the kernel masked stays exactly as the kernel wrote it; a real key shape in a value is still masked',()=>{
  const key='sk-proj-9f3a1c7e5b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a';
  const args=bridged(action({api_key:'[redacted]',note:`uses ${key}`,token_limit:4000})).arguments;
  assert.equal(args.api_key,'[redacted]','the kernel\'s mask, one rule');
  assert.equal(args.token_limit,'[REDACTED]','round 6: E11 on top of the kernel');
  assert.ok(!JSON.stringify(args).includes(key),'a value shaped like a key is still masked in text');
  /* ⛔ outside the arguments of a card the bridge keeps its own rule: a secret field of any other event is still masked */
  const other=createV2EventBridge('s-1',()=>'2026-11-14T10:00:00.000Z').translate({type:'ApprovalRequested',_sequenza:2,requestId:'q2',azione:{tipo:'shell',comando:'ls',password:'hunter2'}})?.data as any;
  assert.doesNotMatch(JSON.stringify(other),/hunter2/u);
});

/* ------------------------------------------------- the mutants only the reviewer's probe killed ------------------------------------------------- */
const fields=(n:number)=>Object.fromEntries(Array.from({length:n},(_,i)=>[`field${i}`,`VAL${String(i).padStart(2,'0')}`]));
test('CLI-ARG-G5-11: collapsed, exactly twelve argument rows are shown, the twelfth included, then how many more',()=>{
  const text=card(action(fields(13))).join('\n');
  assert.match(text,/field11: VAL11/u,'the twelfth row is shown collapsed');
  assert.doesNotMatch(text,/field12: VAL12/u,'the thirteenth waits for v');
  assert.match(text,/1 more line/u);
});

test('CLI-ARG-G5-12: thirty arguments: collapsed rows 1 to 12 and «18 more»; expanded all thirty',()=>{
  const lines=card(action(fields(30)));const text=lines.join('\n');
  assert.equal(lines.filter(line=>/^\s+field\d+: VAL\d\d$/u.test(line)).length,12,text);
  assert.match(text,/18 more lines/u);
  assert.equal(card(action(fields(30)),{expanded:true}).filter(line=>/^\s+field\d+: VAL\d\d$/u.test(line)).length,30);
});

test('CLI-ARG-G5-13: a list of objects four levels deep: the deepest value is a row of its own (REV3-25)',()=>{
  const lines=card(action({items:[{a:{b:{c:'VALLIST4'}}}]}));
  assert.ok(lines.some(line=>/^\s+c: VALLIST4$/u.test(line)),lines.join('\n'));
});

test('CLI-ARG-G5-14: an object seven levels deep, as the kernel keeps it, is read to its last value',()=>{
  const deep=JSON.parse(`${'{"a":'.repeat(7)}"VALDEEP7"${'}'.repeat(7)}`);
  const lines=card(action(deep),{expanded:true});
  assert.ok(lines.some(line=>/^\s+a: VALDEEP7$/u.test(line)),lines.join('\n'));
});

test('CLI-ARG-G5-15: collapsed, a long value (cut by the kernel at 1,200) takes at most 3 lines and says how much is folded (REV3-26)',()=>{
  const lines=card(action({body:`${'x'.repeat(1199)}…`}));
  assert.ok(lines.filter(line=>/xxxxxxxx/u.test(line)).length<=3,lines.join('\n'));
  assert.ok(lines.some(line=>/more characters/u.test(line)),lines.join('\n'));
});

test('CLI-ARG-G5-16: collapsed, a long nested value of words takes at most 3 lines (REV3-27)',()=>{
  const lines=card(action({outer:{note:'word '.repeat(240)}}));
  assert.ok(lines.filter(line=>/word word/u.test(line)).length<=3,lines.join('\n'));
});

/* A second test for the mutant of the cure that one test killed (agente-cura-gemella-giro-5, on a copy): «a top that is not an object
   makes no rows» was killed by CLI-ARG-G5-03 alone. */
test('CLI-ARG-G5-17: a top list of objects is one row, its JSON, with the kernel\'s mask kept and the cut count said',()=>{
  const lines=card(action([{api_key:'[redacted]',path:'/VALROOT'}],{argomentiTagliati:2}));const text=lines.join('\n');
  assert.ok(lines.some(line=>line.trim()==='[{"api_key":"[redacted]","path":"/VALROOT"}]'),text);
  assert.ok(text.includes('Values cut on this card (…): 2.'),`the cut count is said\n${text}`);
});

/* «the bridge skips the key shapes inside the kernel's arguments» was killed by CLI-ARG-G5-10 alone: a key shape deep in a list inside an
   object, and in a top list, is still masked by the bridge, while the kernel's names stay as written. */
test('CLI-ARG-G5-18: a value shaped like a key, deep in the arguments or in a top list, is still masked by the bridge; names untouched',()=>{
  const key='ghp_0123456789abcdefghijABCDEFGHIJ0123456789';
  const deep=bridged(action({outer:{list:[`token ${key}`,'plain']},token_limit:4000})).arguments;
  assert.deepEqual(Object.keys(deep),['outer','token_limit']);
  assert.equal(deep.outer.list[1],'plain');
  assert.ok(!JSON.stringify(deep).includes(key),JSON.stringify(deep));
  const top=bridged(action([`--key=${key}`,'/']));
  assert.ok(!JSON.stringify(top.arguments).includes(key),JSON.stringify(top.arguments));
});
