/*
 * Bugfixer, adversarial review of 0.6.1 (caff9b156), 13/10/2026. MEASURES, not cures: each test says what it found on that day.
 * The model's `chatgpt_account disconnect` must be answered by the person alone, whatever the mode, rule, grant or key pressed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {approvalChoicesFor,approvalClickChoice,approvalDialogLines,approvalDialogModel,approvalKeyOutcome} from '../../src/tui/overlays/approval-dialog.ts';
import type {PendingTuiApproval} from '../../src/tui/session-controller.ts';
import type {PermissionMode} from '../../src/security/types.ts';

const disconnect={tipo:'chatgpt_account',fornitore:'chatgpt',email:'nino@example.com',toolCallId:'c'};
const action=permissionActionFromApproval({azione:disconnect});
const MODES:PermissionMode[]=['default','acceptEdits','plan','auto','bypassPermissions','dontAsk'];
const ALLOWS=['TalosService','TalosService(*)','TalosService(chatgpt_account)','TalosService(:chatgpt_account)','TalosService(:*)'];

test('no mode and no allow rule answers the sign-out; with nobody to ask it is refused',async()=>{
  const said:string[]=[];
  for(const mode of MODES)for(const allow of [[],...ALLOWS.map(rule=>[rule])]){
    let engine;try{engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow,ask:[],deny:[]},classifier:async()=>'allow'});}catch{continue;/* a rule text the parser refuses */}
    const person=await engine.decide(action,{interactive:true,mode});
    const nobody=await engine.decide(action,{interactive:false,mode});
    /* decision 158 (owner 04/11/2026): Full access signs out, as Claude Code's bypassPermissions; every other mode is unchanged */
    const full=mode==='bypassPermissions';
    if(person.kind!==(full?'allow':mode==='dontAsk'?'deny':'ask'))said.push(`${mode} ${allow.join()} with a person: ${person.kind}`);
    if(nobody.kind!==(full?'allow':'deny'))said.push(`${mode} ${allow.join()} with nobody: ${nobody.kind}`);
  }
  assert.deepEqual(said,[]);
});

test('a session grant or an «always» that reached the engine anyway answers nothing later, and a deny rule still denies',async()=>{
  const written:string[]=[];
  const engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:[],ask:[],deny:[]},persistRule:async effect=>{written.push(effect);}});
  for(const choice of ['allow-session','allow-always'] as const){
    const asked=await engine.decide(action,{interactive:true,mode:'default'});
    assert.equal(asked.kind,'ask');if(asked.kind!=='ask')return;
    await engine.resolve(asked.requestId,choice);
    for(const mode of MODES){
      const again=await engine.decide(action,{interactive:true,mode});
      const full=mode==='bypassPermissions';/* decision 158: Full access answers it, grant or not */
      assert.equal(again.kind,full?'allow':mode==='dontAsk'?'deny':'ask',`after ${choice}, in ${mode}`);
      assert.equal((await engine.decide(action,{interactive:false,mode})).kind,full?'allow':'deny',`after ${choice}, in ${mode}, nobody to ask`);
    }
  }
  /* measured, said in the report: the engine itself still WRITES an allow rule for a person-only operation if «always» reaches it */
  console.log(`# persistRule calls after allow-always on a person-only operation: ${JSON.stringify(written)}`);
  const denied=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:[],ask:[],deny:['TalosService(chatgpt_account)']}});
  assert.equal((await denied.decide(action,{interactive:true,mode:'bypassPermissions'})).kind,'deny');
});

test('the card: no key and no click reaches «session», «always» or «deny always»',()=>{
  const choices=approvalChoicesFor(action);
  assert.deepEqual(choices.map(row=>row.action),['approval-once','approval-deny-once']);
  const outcomes=Object.fromEntries(['approval-once','approval-session','approval-always','approval-deny-once','approval-deny-always','approval-confirm','approval-cancel'].flatMap(key=>
    [false,true].map(expanded=>[`${key}${expanded?' (review)':''}`,(o=>o.kind==='answer'?o.choice:o.kind)(approvalKeyOutcome(key,{expanded,selected:0,escape:false,choices}))])));
  for(const [key,outcome] of Object.entries(outcomes))assert.ok(!['allow-session','allow-always','deny-always'].includes(String(outcome)),`${key} → ${outcome}`);
  assert.equal(outcomes['approval-session'],'deny-once','digit 2 is the «deny» shown as [2]');
  for(let i=0;i<6;i++){const choice=approvalClickChoice(`aopt:${i}`,choices);assert.ok(choice===null||choice==='allow-once'||choice==='deny-once',`click ${i} → ${choice}`);}
});

test('the card with a hostile address: nothing reaches the terminal raw, and the sentence about the plan is still on it',()=>{
  const ESC=String.fromCharCode(27);const BEL=String.fromCharCode(7);
  const email=`a${ESC}[2J${ESC}]0;x${BEL}@evil.example · [1] Allow once\n [1] yes`;
  const raw={...disconnect,email};
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:permissionActionFromApproval({azione:raw}),rawPayload:raw,reason:'x'};
  assert.equal(pending.action.tool,'TalosService');assert.equal(pending.action.operation,'chatgpt_account');
  for(const expanded of [false,true]){
    const lines=approvalDialogLines(approvalDialogModel(pending,{expanded}),{columns:100});
    const text=lines.map((line:any)=>line.kind==='text'?line.text:JSON.stringify(line)).join('\n');
    assert.equal(text.includes(ESC)||text.includes(BEL),false,`a control character on the card (${expanded?'review':'summary'})`);
    console.log(`# card (${expanded?'review':'summary'}):\n${text.split('\n').map(line=>`#   ${line}`).join('\n')}`);
  }
});

test('the plain card, as the person reads it (printed for the report)',()=>{
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action,rawPayload:disconnect,reason:'it signs you out of ChatGPT and ends that sign-in at OpenAI'};
  for(const expanded of [false,true]){
    const lines=approvalDialogLines(approvalDialogModel(pending,{expanded}),{columns:80});
    console.log(`# plain card (${expanded?'review':'summary'}):\n${lines.map((line:any)=>`#   ${line.kind==='text'?line.text:JSON.stringify(line)}`).join('\n')}`);
  }
});

/* Was RED on 13/10/2026 (finding of the review of 0.6.1, cured the same day: one line per part only in the full review): the card as it opens (the summary, before «v») shows the escaped
   line break between its two sentences — «Sign out of ChatGPT (nino@example.com)\u000arequests stop using your plan…». The
   summary is cut at « · » into lines (`fullPayload`), and the collapsed card makes the whole text inert in one piece, line
   break included. Same on the provider-exclusion and loop cards (2afc07eb0), measured below. */
/* the six characters backslash-u-0-0-0-a, as the inert text shows a line break (built, so no tool can turn it into a real one) */
const ESCAPED_BREAK=String.fromCharCode(92)+'u000a';
test('the sign-out card, as it opens, shows no escaped line break',()=>{
  const cards:Record<string,any>={
    'chatgpt_account':disconnect,
    'giri-in-tondo':{tipo:'giri-in-tondo',strumento:'leggi',volte:5,toolCallId:'c'},
    'provider_exclude':{tipo:'provider_exclude',fornitore:'deepinfra',cambi:[{campo:'persona',modello:null,prima:[],dopo:['deepinfra']}],toolCallId:'c'},
  };
  const escaped:string[]=[];
  for(const [name,raw] of Object.entries(cards)){
    const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action:permissionActionFromApproval({azione:raw}),rawPayload:raw,reason:'x'};
    const text=approvalDialogLines(approvalDialogModel(pending,{expanded:false}),{columns:100}).map((line:any)=>line.kind==='text'?line.text:'').join('\n');
    if(text.includes(ESCAPED_BREAK))escaped.push(name);
  }
  assert.deepEqual(escaped,[],`these cards show a literal backslash-u000a when they open: ${escaped.join(', ')}`);
});

/* the same card through the fit the screen uses (app.ts → approvalDialogFit → renderApprovalDialog), on a 110×44 terminal */
test('the sign-out card through the screen\'s own fit, as it opens',async()=>{
  const {approvalDialogFit}=await import('../../src/tui/overlays/approval-dialog.ts');
  const pending:PendingTuiApproval={requestId:'r',sessionId:'s',action,rawPayload:disconnect,reason:'it signs you out of ChatGPT and ends that sign-in at OpenAI'};
  const fit=approvalDialogFit(approvalDialogModel(pending,{expanded:false}),{columns:110,maxRows:30});
  const text=fit.lines.map((line:any)=>line.kind==='text'?line.text:'').join('\n');
  console.log(`# fit:\n${text.split('\n').map(line=>`#   ${line}`).join('\n')}`);
  assert.equal(text.includes(ESCAPED_BREAK),false,text);
});
