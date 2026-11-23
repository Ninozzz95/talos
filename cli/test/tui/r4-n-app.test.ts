/*
 * R4 lane N — the navigation decisions measured on the REAL TuiApp through the REAL Ink 7.1.1 into an `@xterm/headless`
 * screen (the R1 layout fixture: no pty, no child process, no network, a temp profile). Q-R4-5 (Enter runs the highlighted
 * command, one dispatcher: E6), Q-R4-6 (Ctrl+L redraws, Alt+P opens the model picker), Q-R4-7 (Ctrl+C / Esc Esc / Ctrl+D
 * with a draft, pickers closed first: E7), Q-R4-8 (live `@` list: E8, E13), Q-R4-9 (a recalled paste stays collapsed: E9),
 * Q-R4-12 (mode names), Q-R4-13 (/status block).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {after,before,test} from 'node:test';
import {ESC,KEY,hermeticProfile,mountApp,sleep,type MountedApp,type Screen} from './r1-layout-fixture.ts';

let env:ReturnType<typeof hermeticProfile>;let app:MountedApp;
let rejectMode=false;
let nextFork=0;
before(async()=>{
  env=hermeticProfile();
  fs.mkdirSync(path.join(env.root,'src','util'),{recursive:true});
  fs.writeFileSync(path.join(env.root,'src','index.js'),'x');fs.writeFileSync(path.join(env.root,'src','util','strings.js'),'x');
  app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,onPermissionMode:async()=>{if(rejectMode)throw new Error('permission update refused');},onFork:async()=>`child-${++nextFork}`,onExport:(id:string)=>({sessionId:id,eventi:[{type:'RunStarted',runId:'r1',input:{prompt:'hello from the first turn'}}]})});
});
after(()=>{try{app?.unmount();}finally{env?.restore();}});

const CTRL_C='\u0003',CTRL_D='\u0004',CTRL_A='\u0001',ALT_P=`${ESC}p`,DOWN=`${ESC}[B`,SHIFT_TAB=`${ESC}[Z`,TAB='\t';
const PASTE=Array.from({length:60},(_,i)=>`line ${i+1} of a pasted log with some text`).join('\n');
const composerLine=(s:Screen)=>s.lines.find(line=>/^│ ›/u.test(line))??'';
const composerText=(s:Screen)=>composerLine(s).replace(/^│ ›\s?/u,'').replace(/│\s*$/u,'').trimEnd().replace(/^(?:Ask TALOS, \/ for commands, @ for files|Type to [^│]*)$/u,'')/* the mockup's placeholder is an empty composer */;
/* the mockup's mode words (footerRows) for the labels this file names */
const MODE_WORD:Record<string,string>={'accept edits':'accept edits',plan:'plan mode','Full access':'full access'};
const empty=(s:Screen)=>composerText(s)==='';
async function type(text:string){for(const ch of text){app.press(ch);await sleep(8);}}
async function clearDraft(){if(empty(await app.screen()))return;app.press(CTRL_C);await app.waitFor('the draft is cleared',empty);}
const noHint=(s:Screen)=>!/again to exit/u.test(s.text);

/* R5b D7 (Q-R5-17): /help is grouped and /help sits in "View", no longer on the first screen; the dialog is known by its title. */
const HELP_OPEN=/│Help +│/u,HELP_SHEET=/── Help TALOS \d+\.\d+ · \d+ commands/u;
test('R4-N Q-R4-5: Enter on the highlighted command runs it; after a typo Enter sends the text as typed',async()=>{
  await type('/he');
  await app.waitFor('the menu highlights /help',s=>/› \/help · /u.test(s.text));
  app.press(KEY.enter);
  /* stage 7.17: /help is the mockup's sheet (the ? key keeps its card of keys) */
  await app.waitFor('Enter ran /help',s=>HELP_SHEET.test(s.text));
  app.press(KEY.esc);
  const help=await app.waitFor('help closed',s=>!HELP_SHEET.test(s.text));
  assert.ok(empty(help),`the composer is empty after the command ran:\n${help.text}`);
  await type('/mdoel');
  const typo=await app.waitFor('the menu shows the fuzzy match',s=>/│Commands/u.test(s.text)&&s.text.includes('/model · '));
  assert.doesNotMatch(typo.lines.filter(line=>!/^│ ›/u.test(line)).join('\n'),/› \//u,'nothing is highlighted after a typo');
  app.press(KEY.enter);
  await app.waitFor('the typo answered "Did you mean"',s=>s.text.includes('Unknown /mdoel. Did you mean /model?'));
});

test('R4-N Q-R4-13/Q-R4-12: /status is a titled block with the mode in words; Shift+Tab shows human mode names',async()=>{
  /* stage 7.11 (mockup Settings): /status is the Settings sheet on its Status tab, the mode in words */
  await type('/status');app.press(KEY.enter);
  const status=await app.waitFor('the status tab',s=>/── Settings this project/u.test(s.text)&&/Mode {10}asks before edits/u.test(s.text));
  assert.doesNotMatch(status.text,/Mode: default/u);
  app.press(KEY.esc);await app.waitFor('the sheet closed',s=>!/── Settings this project/u.test(s.text)&&/ask before edits · shift\+tab/u.test(s.text));
  app.press(SHIFT_TAB);
  await app.waitFor('mode accept edits',s=>/ accept edits · shift\+tab/u.test(s.text));
  app.press(SHIFT_TAB);await app.waitFor('mode plan',s=>/ plan mode · shift\+tab/u.test(s.text));
  app.press(SHIFT_TAB);
  await app.waitFor('FA-CONFIRM-01: consent before Full access',s=>s.text.includes('Enable Full access?')&&/ plan mode · shift\+tab/u.test(s.text));
  app.press(KEY.enter);
  await app.waitFor('Enter cancels by default',s=>!s.text.includes('Enable Full access?')&&/ plan mode · shift\+tab/u.test(s.text));
  for(const cancel of [KEY.esc,CTRL_C]){
    app.press(SHIFT_TAB);await app.waitFor('consent opens again',s=>s.text.includes('Enable Full access?'));
    app.press(cancel);await app.waitFor('consent cancelled',s=>!s.text.includes('Enable Full access?')&&/ plan mode · shift\+tab/u.test(s.text));
  }
  app.press(SHIFT_TAB);await app.waitFor('consent opens for acceptance',s=>s.text.includes('Enable Full access?'));
  app.press(DOWN);await app.settle();app.press(KEY.enter);
  await app.waitFor('mode Full access',s=>!s.text.includes('Enable Full access?')&&/ full access · shift\+tab/u.test(s.text));
  app.press(SHIFT_TAB);await app.waitFor('default mode',s=>/ask before edits · shift\+tab/u.test(s.text));
  for(const label of ['accept edits','plan','Full access']){app.press(SHIFT_TAB);await app.waitFor(`reenter ${label}`,s=>s.text.includes(` ${MODE_WORD[label]} · shift+tab`)&&!s.text.includes('Enable Full access?'));}
  app.press(SHIFT_TAB);await app.waitFor('back to manual',s=>/ask before edits · shift\+tab/u.test(s.text));
});

test('R4-N Q-R4-7: Ctrl+C and Esc Esc clear a draft into history, Up brings it back, no exit is armed',async()=>{
  await type('a draft to keep');await app.waitFor('typed',s=>composerText(s)==='a draft to keep');
  app.press(CTRL_C);
  const cleared=await app.waitFor('Ctrl+C cleared the draft',empty);
  assert.ok(noHint(cleared),`no exit is armed by clearing a draft:\n${cleared.text}`);
  app.press(KEY.up);await app.waitFor('Up recalls the cleared draft',s=>composerText(s)==='a draft to keep');
  await clearDraft();
  await type('second draft');await app.waitFor('typed',s=>composerText(s)==='second draft');
  app.press(KEY.esc);await sleep(120);
  assert.equal(composerText(await app.screen()),'second draft','one Esc keeps the draft');
  app.press(KEY.esc);
  await app.waitFor('Esc Esc cleared the draft',empty);
  app.press(KEY.up);await app.waitFor('Up recalls it',s=>composerText(s)==='second draft');
  await clearDraft();
});

test('FA-ERROR-01: Shift+Tab and /plan failures stay visible and keep manual mode',async()=>{
  rejectMode=true;
  try{
    app.press(SHIFT_TAB);
    await app.waitFor('permission failure is visible',s=>s.text.includes('permission update refused')&&/ask before edits · shift\+tab/u.test(s.text));
    /* stage 7.3: /plan opens its sheet (the approved mockup); Enter on «Plan first» asks for plan mode */
    await type('/plan');app.press(KEY.enter);
    await app.waitFor('the plan sheet',s=>s.text.includes('Plan first'));await app.settle();
    app.press(KEY.enter);
    await app.waitFor('the failed plan choice closes the sheet without switching',s=>empty(s)&&!s.text.includes('Plan first')&&s.text.includes('permission update refused')&&/ask before edits · shift\+tab/u.test(s.text));
    await app.settle();assert.equal(app.exits().length,0);
  }finally{rejectMode=false;}
});

test('FA-SESSION-01: resume and fork, by ID and picker, leave Full access and require fresh consent',async()=>{
  for(const command of ['/resume s2','/fork s2','/resume','/fork']){
    for(const label of ['accept edits','plan']){app.press(SHIFT_TAB);await app.waitFor(label,s=>s.text.includes(` ${MODE_WORD[label]} · shift+tab`));}
    app.press(SHIFT_TAB);
    const next=await app.waitFor('Full access or its confirmation',s=>s.text.includes('Enable Full access?')||/ full access · shift\+tab/u.test(s.text));
    if(next.text.includes('Enable Full access?')){app.press(DOWN);await app.settle();app.press(KEY.enter);}
    await app.waitFor('Full access before changing session',s=>!s.text.includes('Enable Full access?')&&/ full access · shift\+tab/u.test(s.text));
    await type(command);app.press(KEY.enter);
    /* stage 7.5-7.6: /resume and /fork are the mockup's sheets; /fork forks the conversation in use from «latest» */
    if(command==='/resume'){await app.waitFor('the resume sheet',s=>s.text.includes('── Resume a conversation')&&s.text.includes('s1'));await app.settle();app.press(KEY.enter);}
    if(command==='/fork'){await app.waitFor('the fork sheet',s=>s.text.includes('── Fork from a message')&&s.text.includes('latest'));await app.settle();app.press(KEY.enter);}
    await app.waitFor(`${command} leaves Full access`,s=>empty(s)&&/ask before edits · shift\+tab/u.test(s.text));
    for(const label of ['accept edits','plan']){app.press(SHIFT_TAB);await app.waitFor(label,s=>s.text.includes(` ${MODE_WORD[label]} · shift+tab`));}
    app.press(SHIFT_TAB);await app.waitFor('new session needs consent',s=>s.text.includes('Enable Full access?'));
    app.press(DOWN);await app.settle();app.press(KEY.enter);
    await app.waitFor('confirmed new session',s=>!s.text.includes('Enable Full access?')&&/ full access · shift\+tab/u.test(s.text));
    app.press(SHIFT_TAB);await app.waitFor('manual for next case',s=>/ask before edits · shift\+tab/u.test(s.text));
  }
});

test('R4-N Q-R4-7: Ctrl+C closes an open dialog before arming any exit',async()=>{
  app.press('?');await app.waitFor('help open',s=>HELP_OPEN.test(s.text));
  app.press(CTRL_C);
  const closed=await app.waitFor('Ctrl+C closed help',s=>!HELP_OPEN.test(s.text));
  await sleep(100);
  assert.ok(noHint(await app.screen()),`closing the dialog armed no exit:\n${closed.text}`);
  assert.equal(app.exits().length,0);
});

test('R4-N Q-R4-6: Ctrl+L redraws the screen and keeps the draft; Alt+P opens the model picker (provider first)',async()=>{
  await type('keep me');const before=await app.waitFor('typed',s=>composerText(s)==='keep me');await app.settle();
  const bytes=app.bytes();
  app.press(KEY.ctrlL);await sleep(200);
  const after=await app.settle();
  assert.doesNotMatch(after.text,/search: /u,'Ctrl+L no longer opens a picker');
  assert.equal(composerText(after),'keep me','the draft is kept');
  assert.ok(app.bytes()>bytes,'the screen was written again');
  assert.equal(after.text,before.text,'the same screen, redrawn');
  await clearDraft();
  app.press(ALT_P);
  await app.waitFor('Alt+P opened the picker (no provider chosen: the provider list first)',s=>/│Provider|search: /u.test(s.text));
  app.press(CTRL_C);
  await app.waitFor('Ctrl+C closed the picker',s=>!/│Provider|search: /u.test(s.text));
  await sleep(100);assert.ok(noHint(await app.screen()));
});

test('R4-N Q-R4-8: the @ list opens while typing, moves with the arrows, inserts with Tab or Enter, never shows //',async()=>{
  await type('look at @src/');
  /* R5b D6: while typing, `@sr` already shows the project search (it names both paths too); the folder list is the one
     for the whole token, known by its source line `In src/`. */
  const live=await app.waitFor('the live list',s=>composerText(s)==='look at @src/'&&/In src\//u.test(s.text)&&s.text.includes('@src/index.js')&&s.text.includes('@src/util/'));
  assert.doesNotMatch(live.text,/@src\/\//u);
  assert.match(live.text,/› @src\/index\.js/u,'the first row is highlighted');
  app.press(TAB);
  const inserted=await app.waitFor('Tab inserted the file',s=>composerText(s)==='look at @src/index.js'&&!s.text.includes('@src/util/'));
  assert.doesNotMatch(inserted.text,/@src\/\//u);
  await clearDraft();
  await type('@src\\');
  await app.waitFor('a backslash lists the folder with forward slashes',s=>/› @src\/index\.js/u.test(s.text));
  app.press(DOWN);await app.waitFor('Down moved the highlight',s=>/› @src\/util\//u.test(s.text));
  app.press(KEY.enter);
  const folder=await app.waitFor('Enter opened the folder',s=>composerText(s)==='@src/util/'&&s.text.includes('@src/util/strings.js'));
  assert.equal(app.exits().length,0);assert.doesNotMatch(folder.text,/^Choose a provider\.$/mu,'Enter inserted, it did not send');
  app.press(KEY.esc);
  await app.waitFor('Esc closed the list and kept the text',s=>composerText(s)==='@src/util/'&&!s.text.includes('strings.js'));
  await clearDraft();
  await type('@zz');
  await app.waitFor('the empty-state line',s=>s.text.includes('No files match zz'));
  await clearDraft();
  await app.waitFor('the list is gone with the token',s=>!s.text.includes('No files match'));
});

test('R4-N Q-R4-9: a paste refused before sending and a recalled paste both stay collapsed',async()=>{
  app.press(`${ESC}[200~${PASTE}${ESC}[201~`);
  await app.waitFor('the paste collapsed',s=>/\[Pasted text #\d+ \+59 lines\]/u.test(s.text));/* UI Phase 1 (owner 27/09): the placeholder is Claude Code's `[Pasted text #N +X lines]`, X = the line breaks */
  app.press(KEY.enter);
  const refused=await app.waitFor('nothing sent (no provider), the draft is back',s=>/^ {2}Choose a provider\.$/mu.test(s.text)/* a notice stands two cells in (the mockup) */&&/\[Pasted text #\d+ \+59 lines\]/u.test(composerLine(s)));
  assert.doesNotMatch(refused.text,/line 30 of a pasted log/u);
  app.press(CTRL_C);await app.waitFor('cleared',empty);
  app.press(KEY.up);
  const recalled=await app.waitFor('recalled',s=>/\[Pasted text #\d+ \+59 lines\]/u.test(composerLine(s))||/line \d+ of a pasted log/u.test(s.text));
  assert.match(composerLine(recalled),/\[Pasted text #1 \+59 lines\]/u);
  assert.doesNotMatch(recalled.text,/line 30 of a pasted log/u);
  await clearDraft();
});

test('R4-N Q-R4-7: Ctrl+D deletes at the cursor with a draft; on an empty composer it arms the exit and says so',async()=>{
  await type('xy');await app.waitFor('typed',s=>composerText(s)==='xy');
  app.press(CTRL_A);await sleep(50);app.press(CTRL_D);
  await app.waitFor('Ctrl+D deleted forward',s=>composerText(s)==='y');
  await clearDraft();
  app.press(CTRL_D);
  const armed=await app.waitFor('the Ctrl+D exit hint',s=>s.text.includes('Press Ctrl+D again to exit'));
  assert.equal(app.exits().length,0,'one Ctrl+D does not exit');
  assert.ok(armed.lines.some(line=>line.trim()==='Press Ctrl+D again to exit'));
  await app.waitFor('the hint goes after the window',noHint,5_000);
  assert.equal(app.exits().length,0);
});
