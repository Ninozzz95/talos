/*
 * Stage 7.3: the first commands' sheets (/busy, /plan, /retry, /rename, /effort) built from the product's state with the
 * catalogue's words draw the approved mockup's golden frames (fixtures/panels-golden.json), and their effects become one
 * action each.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {asPage,COMMAND_PAGES,pageRows} from '../../src/tui/panel/page.ts';
import {KEYBINDINGS} from '../../src/tui/keybindings.ts';
import {busySheet,clearSheet,copySheet,diffSheet,helpKeyRows,helpSheet,librarySheet,type LibraryRow,memorySheet,type MemoryRow,notesSheet,permissionsSheet,ruleScopeSheet,type RuleView,type RecentView,queueSheet,tasksSheet,type NoteRow,type TaskView,compactSheet,modelSheet,providerSheet,type ModelRow,type ProviderView,effortSheet,exportSheet,forkSheet,sizeText,undoSheet,type UndoPoint,historySheet,planSheet,renameSheet,resumeSheet,retrySheet,sheetStep,type ResumeRow,type SheetState} from '../../src/tui/panel/commands.ts';
import {hintRow,hintRows,listItems,panelClick,panelHeight,panelKey,panelRows,type SegRow} from '../../src/tui/panel/sheet.ts';
import {assertGolden as sharedGolden,type GoldenFrame} from './golden-sheet.ts';
import {helpCommands} from '../../src/tui/slash-commands.ts';

const golden=JSON.parse(readFileSync(new URL('./fixtures/panels-golden.json',import.meta.url),'utf8')) as {frames:Record<string,{height:number;footRows:number;text:string[];style:string[]}>};
const text=(rows:SegRow[])=>rows.map(row=>row.map(s=>s.text).join('').replace(/\s+$/u,''));
const style=(rows:SegRow[])=>rows.map(row=>{let x=0;const out:Array<{start:number;end:number;roles:string}>=[];
  for(const s of row){const n=[...s.text].length;const roles=[...s.roles].sort().join(',');const last=out.at(-1);
    if(roles&&n){if(last&&last.roles===roles&&last.end===x)last.end=x+n;else out.push({start:x,end:x+n,roles});}x+=n;}
  return out.map(o=>`${o.start}+${o.end-o.start}:${o.roles}`).join(' ');});
const fitTo=(rows:SegRow[],w:number)=>rows.map(row=>{const out:SegRow=[];let n=0;for(const s of row){if(n>=w)break;const t=[...s.text].slice(0,w-n).join('');if(t)out.push({...s,text:t});n+=[...t].length;}return out;});

/* the mockup's history (PANELS.history) on Friday 2 October 2026 at 15:30 UTC: now · 14 min · 2 h · yesterday · Mon · Sep 27 · 26 · 25 */
const NOW=Date.UTC(2026,9,2,15,30);
const HISTORY=[['The login e2e test is flaky. Find out why and fix it.',Date.UTC(2026,9,2,15,30)],['Show me how sessions are refreshed',Date.UTC(2026,9,2,15,16)],
  ['Plan how to move image export to a worker thread. Do not change anything yet.',Date.UTC(2026,9,2,13,20)],
  ['In parallel: audit the dependencies, write e2e tests for checkout, update the API docs.',Date.UTC(2026,9,1,10,0)],['Add a rate limit to /search',Date.UTC(2026,8,28,10,0)],
  ['Bring docs/api.md in line with the v2 routes',Date.UTC(2026,8,27,10,0)],['Why does the build take 4 minutes?',Date.UTC(2026,8,26,10,0)],
  ['Rename refreshSession to renewSession everywhere',Date.UTC(2026,8,25,10,0)]].map(([text,at])=>({text:text as string,collapsedPastes:[],at:new Date(at as number).toISOString()}));
/* the mockup's conversations (PANELS.resume) at the same moment; the third part of a row is the model in the product, the
   mockup's own words here */
const RESUME:ResumeRow[]=([
  ['Flaky login test',Date.UTC(2026,9,2,15,30),48,'main','qwen3-coder',true,'The login e2e test is flaky. Find out why and fix it.','Fixed: the test now waits for the session cookie; 42 tests pass, 10 runs in a row.'],
  ['Move image export to a worker',Date.UTC(2026,9,2,13,20),31,'perf/export','plan approved',false,'Plan how to move image export to a worker thread.','Plan approved: 4 steps, step 2 of 4 done.'],
  ['Checkout e2e tests',Date.UTC(2026,9,1,10,0),64,'main','3 agents',false,'Write e2e tests for checkout.','9 tests written, all pass with the local fake.'],
  ['Rate limit on /search',Date.UTC(2026,8,28,10,0),22,'fix/rate-limit',null,false,'Add a rate limit to /search.','Token bucket, 30 requests a minute per key, tests added.'],
  ['API docs v2',Date.UTC(2026,8,27,10,0),17,'docs',null,false,'Bring docs/api.md in line with v2.','6 routes added, 2 removed.'],
  ['Dependency audit',Date.UTC(2026,8,25,10,0),12,'main',null,false,'Audit the dependencies.','4 safe upgrades proposed, 1 is a security fix.'],
] as const).map(([title,at,messages,branch,model,current,you,answer],i)=>({id:'s'+i,title,at:new Date(at).toISOString(),messages,branch,model,current,you,answer}));
/* the mockup's checkpoints (PANELS.undo) at the same moment, newest first */
const UNDO:UndoPoint[]=[
  {id:'k3',label:'Before: apply the fix',at:new Date(NOW-2*60_000).toISOString(),undone:false,files:[{path:'src/auth/login.ts',change:'modified',added:12,removed:3}],back:[{path:'src/auth/login.ts',change:'modified',added:12,removed:3}]},
  {id:'k2',label:'Before: The login e2e test is flaky…',at:new Date(NOW-6*60_000).toISOString(),undone:false,files:[],back:[{path:'src/auth/login.ts',change:'modified',added:12,removed:3}]},
  {id:'k1',label:'Before: Show me how sessions are refreshed',at:new Date(NOW-14*60_000).toISOString(),undone:false,files:[],back:[{path:'src/auth/login.ts',change:'modified',added:12,removed:3}]},
  {id:'k0',label:'Start of the conversation',at:new Date(NOW-21*60_000).toISOString(),undone:false,start:true,files:[{path:'test/e2e/login.spec.ts',change:'modified',added:4,removed:1}],back:[{path:'src/auth/login.ts',change:'modified',added:12,removed:3},{path:'test/e2e/login.spec.ts',change:'modified',added:4,removed:1}]},
];
/* the mockup's models (PANELS.model); the golden frame is drawn with the mockup's own effort words, the product passes its real
   scale (owner 03/10 «scala vera del prodotto») */
const MOCK_SCALE=['off','low','medium','high','max'];
const MODELS:ModelRow[]=[
  {id:'openrouter:qwen3-coder',name:'qwen3-coder',provider:'OpenRouter',contextWindow:262_144,desc:'OpenRouter · $0.22 / $0.95 per M',caps:'tools · reasoning low to high',efforts:['low','medium','high']},
  {id:'openrouter:glm-5.3-flash',name:'glm-5.3-flash',provider:'OpenRouter',contextWindow:200_000,desc:'OpenRouter · $0.10 / $0.40 per M',caps:'tools · reasoning on or off',efforts:['off','medium']},
  {id:'openrouter:deepseek-v4',name:'deepseek-v4',provider:'OpenRouter',contextWindow:128_000,desc:'OpenRouter · $0.27 / $1.10 per M',caps:'tools · reasoning low to max',efforts:['low','medium','high','max']},
  {id:'openrouter:kimi-k2.5',name:'kimi-k2.5',provider:'OpenRouter',contextWindow:256_000,desc:'OpenRouter · $0.45 / $2.20 per M',caps:'tools · long context',efforts:['off']},
  {id:'anthropic:claude-sonnet-5-5',name:'claude-sonnet-5-5',provider:'Anthropic',contextWindow:1_000_000,desc:'Anthropic · $3 / $15 per M',caps:'tools · images · reasoning low to max',efforts:['low','medium','high','max']},
  {id:'ollama:gemma-4-12b',name:'gemma-4-12b',provider:'Ollama',contextWindow:32_000,desc:'Ollama · on this computer · free',caps:'tools · no reasoning',efforts:['off']},
];
/* the mockup's providers (PANELS.provider) */
const PROVIDERS:ProviderView[]=[
  {id:'openrouter',label:'OpenRouter',current:true,state:'key',desc:'412 models · key in the keychain',address:'https://openrouter.ai/api/v1',key:'stored',needsKey:true},
  {id:'anthropic',label:'Anthropic',current:false,state:'key',desc:'9 models · key from ANTHROPIC_API_KEY',address:'https://api.anthropic.com',key:'stored',needsKey:true},
  {id:'openai',label:'OpenAI',current:false,state:'none',desc:'press k to add a key',address:'https://api.openai.com/v1',key:'missing',needsKey:true},
  {id:'gemini',label:'Google Gemini',current:false,state:'none',desc:'press k to add a key',address:'https://generativelanguage.googleapis.com',key:'missing',needsKey:true},
  {id:'ollama',label:'Ollama',current:false,state:'local',desc:'3 models on this computer · no key needed',address:'http://localhost:11434',key:'none',needsKey:false},
  {id:'lmstudio',label:'LM Studio',current:false,state:'down',desc:'start its server, then press t',address:'http://localhost:1234/v1',key:'none',needsKey:false},
];
const QUEUED=[{id:'q1',kind:'prompt' as const,text:'Also run the auth unit tests'},{id:'q2',kind:'prompt' as const,text:'Then draft the commit message'}];
const SHEETS:Record<string,()=>SheetState>={
  'cmd-provider':()=>providerSheet(PROVIDERS),
  'cmd-model':()=>modelSheet(MODELS,{current:'openrouter:qwen3-coder',providerLabel:'OpenRouter',effort:'medium',scale:MOCK_SCALE}),
  'cmd-resume':()=>resumeSheet(RESUME,{project:'shop-api',now:NOW,offsetMinutes:0}),
  'cmd-undo':()=>undoSheet(UNDO,{canCut:true,now:NOW,offsetMinutes:0}),
  /* the mockup's frame is taken after the compaction ended (MOCKUP-FASE-UI-golden.mjs advances 4 s) */
  'cmd-compact':()=>compactSheet({phase:'done',messages:48,tokensBefore:61_200,tokensAfter:9_800,elapsedMs:3_000}),
  'cmd-export':()=>exportSheet({messages:48,file:'talos-flaky-login-2026-10-01.md'}),
  'cmd-fork':()=>forkSheet([{runId:'r2',text:'The login e2e test is flaky. Find out why and fix it.'},{runId:'r1',text:'Show me how sessions are refreshed'}],{canCut:true}),
  'cmd-history':()=>historySheet(HISTORY,{now:NOW,offsetMinutes:0}),
  'cmd-busy':()=>busySheet('queue'),
  'cmd-plan':()=>planSheet(false),
  'cmd-clear':()=>clearSheet('Flaky login test'),
  'cmd-queue':()=>queueSheet(QUEUED),
  'cmd-retry':()=>retrySheet('The login e2e test is flaky. Find out why and fix it.'),
  'cmd-rename':()=>renameSheet('Flaky login test'),
  'cmd-effort':()=>effortSheet('qwen3-coder',['low','medium','high'],'medium'),
};
/* owner 03/10: the golden comparison with the row of keys on two rows when it does not fit (golden-sheet.ts) */
const assertGolden=(sheet:SheetState,w:number,frame:GoldenFrame,keys?:string)=>sharedGolden(sheet.panel,w,frame,keys);
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  for(const [name,make] of Object.entries(SHEETS)){
    test(`${name} at ${size}: the command's sheet is the mockup's`,()=>assertGolden(make(),w,golden.frames[`${size}/${name}`]!));
  }
}

const press=(sheet:SheetState,...names:string[])=>{let current:SheetState|null=sheet;let action=null;for(const name of names){if(!current)break;const out=sheetStep(current,panelKey(current.panel,{name}));current=out.sheet;action=out.action??action;}return{sheet:current,action};};

test('each sheet\'s choice is one action, and the sheet closes',()=>{
  assert.deepEqual(press(busySheet('queue'),'ArrowDown','Enter'),{sheet:null,action:{kind:'busy',mode:'steer',notice:'While busy, Enter steers the turn'}});
  assert.deepEqual(press(planSheet(false),'Enter'),{sheet:null,action:{kind:'plan',on:true,notice:'Plan mode on · shift+tab also switches'}});
  assert.deepEqual(press(planSheet(true),'ArrowDown','Enter').action,{kind:'plan',on:false,notice:'Plan mode off'});
  assert.deepEqual(press(retrySheet('fix it'),'Enter').action,{kind:'retry',edit:false,text:'fix it'});
  assert.deepEqual(press(retrySheet('fix it'),'ArrowDown','Enter').action,{kind:'retry',edit:true,text:'fix it'});
  assert.deepEqual(press(retrySheet('fix it'),'ArrowDown','ArrowDown','Enter'),{sheet:null,action:null},'Cancel does nothing');
  assert.deepEqual(press(renameSheet('Old'),'Backspace','Backspace','Backspace','N','e','w','Enter').action,{kind:'rename',name:'New',notice:'Renamed to "New"'});
  const blank=press(renameSheet('A'),'Backspace','Enter');assert.equal(blank.action,null);assert.ok(blank.sheet,'an empty name keeps the sheet open');
  assert.deepEqual(press(renameSheet(''),' ','N','e','w',' ','Enter').action,{kind:'rename',name:'New',notice:'Renamed to "New"'},'the spaces around the name are not kept');
  assert.deepEqual(press(effortSheet('m',['low','medium','high'],'medium'),'ArrowRight','Enter').action,{kind:'effort',level:'high',notice:'Effort: high'});
  assert.deepEqual(press(busySheet('steer'),'Escape'),{sheet:null,action:null});
  /* stage 7.13 (mockup clear): the screen, a new conversation, or nothing */
  assert.deepEqual(press(clearSheet('Flaky login test'),'Enter'),{sheet:null,action:{kind:'clearScreen'}});
  assert.deepEqual(press(clearSheet('Flaky login test'),'ArrowDown','Enter'),{sheet:null,action:{kind:'newConversation'}});
  assert.deepEqual(press(clearSheet('Flaky login test'),'ArrowDown','ArrowDown','Enter'),{sheet:null,action:null},'Cancel does nothing');
});

/* stage 7.15 (mockup copy; Claude Code /copy picker, Codex /copy picker with quotes) */
const ANSWER=['## Why the login test was flaky','The test waited **500 ms** for the session cookie, but `refreshSession()` retries with a jittered backoff that can take up to **1.4 s** on a cold cache.',
  '- Replaced the fixed sleep with `await waitForSession(page)`','- Kept the retry, capped the jitter at 300 ms','- 42 tests pass, 10 runs in a row','```ts','await waitForSession(page, { timeoutMs: 3_000 })','```','The fix is in `src/auth/login.ts`; nothing else changed.'].join('\n');
const EARLIER='Sessions refresh in `src/auth/session.ts` through `refreshSession()`, which retries **3 times** with jitter.';
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  test(`cmd-copy at ${size}: the mockup's sheet, «1 line» where it wrote «1 lines» (owner 03/10, approved difference)`,()=>{
    const frame=golden.frames[`${size}/cmd-copy`]!;const sheet=copySheet([ANSWER,EARLIER]);
    const H=panelHeight(sheet.panel,w,frame.height,frame.footRows,0);assert.equal(H,frame.text.length);
    const rows=fitTo(panelRows(sheet.panel,w,H),w);
    assert.deepEqual(text(rows),frame.text.map(line=>line.replace(/ 1 lines\b/u,'  1 line')));
    const kept=frame.text.map((line,i)=>/ 1 lines\b/u.test(line)?null:i).filter((i):i is number=>i!==null);
    assert.deepEqual(kept.map(i=>style(rows)[i]),kept.map(i=>frame.style[i]));
  });
}

test('stage 7.15 /copy: each choice copies its own text; quotes come after the code blocks; Enter closes',()=>{
  /* a «>» inside a code block is the code's (a shell prompt), never a quote */
  const quoted='Read this:\n> first quoted line\n> second one\nand then\n```js\nx()\n```\n```sh\n> npm test\n```';
  const sheet=copySheet([quoted,'older one','older two','older three','older four']);
  const body=sheet.panel.tabs[0]!.body;assert.equal(body.kind,'list');
  assert.deepEqual(body.kind==='list'?body.items.map(item=>[item.label,item.meta]):[],[
    ['The whole last answer','10 lines'],['Code block 1 · js','1 line'],['Code block 2 · sh','1 line'],['Quote 1','2 lines'],
    ['Answer 2 back','1 line'],['Answer 3 back','1 line'],['Answer 4 back','1 line']]);
  assert.deepEqual(press(sheet,'ArrowDown','ArrowDown','ArrowDown','Enter'),{sheet:null,action:{kind:'copy',text:'first quoted line\nsecond one',notice:'Copied quote 1 · 2 lines'}});
  assert.deepEqual(press(sheet,'Enter').action,{kind:'copy',text:quoted,notice:'Copied the whole last answer · 10 lines'});
  assert.deepEqual(press(sheet,'ArrowDown','Enter').action,{kind:'copy',text:'x()',notice:'Copied code block 1 · js · 1 line'});
  assert.equal(copySheet([]).panel.tabs[0]!.body.kind,'list');
});

/* stage 7.16 (mockup diff; owner 03/10: tabs Now and By turn — the tab row is the approved difference from cmd-diff) */
const DIFF_FILES=[
  {path:'src/auth/login.ts',add:12,del:3,note:'modified',hunks:['@@ -38,7 +38,9 @@ export async function login(page)','   await page.fill("#email", user.email)','   await page.click("button[type=submit]")','-  await page.waitForTimeout(500)','+  await waitForSession(page, { timeoutMs: 3_000 })','   expect(await page.cookie("sid")).toBeTruthy()','@@ -90,3 +92,13 @@','+export async function waitForSession(page, { timeoutMs }) {','+  const until = Date.now() + timeoutMs','+  while (Date.now() < until) {','+    if (await page.cookie("sid")) return','+    await page.waitForTimeout(50)','+  }','+  throw new Error("no session cookie after " + timeoutMs + " ms")','+}']},
  {path:'test/e2e/login.spec.ts',add:4,del:1,note:'modified',hunks:['@@ -12,4 +12,7 @@','-test("signs in", async ({ page }) => {','+test("signs in with a fresh cookie", async ({ page }) => {','+  await page.context().clearCookies()','   await login(page)','+  await expect(page).toHaveURL("/home")']},
  {path:'package.json',add:1,del:1,note:'modified',hunks:['@@ -9 +9 @@','-    "e2e": "playwright test",','+    "e2e": "playwright test --retries=0",']}];
const DIFF_TURNS=[{label:'The login e2e test is flaky. Find out why and fix it.',files:DIFF_FILES.slice(0,2)},{label:'Show me how sessions are refreshed',files:[]}];
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  test(`cmd-diff at ${size}: the mockup's sheet under the Now / By turn tabs (approved difference)`,()=>{
    const frame=golden.frames[`${size}/cmd-diff`]!;const sheet=diffSheet({sub:'main · 3 files · +17 −5 · not committed',files:DIFF_FILES,turns:DIFF_TURNS});
    /* the tab row takes one more row where the screen has it (120x40), else one row of the body (80x24, at its cap) */
    const H=panelHeight(sheet.panel,w,frame.height,frame.footRows,0);assert.equal(H,frame.text.length+(size==='120x40'?1:0));
    const rows=fitTo(panelRows(sheet.panel,w,H),w),got=text(rows);
    assert.equal(got[0],frame.text[0],'the title row is the mockup\'s');
    assert.equal(got[1],'  Now   By turn');
    /* the body is the mockup's; the row of keys is the mockup's with «tab next tab» before «esc close», as the mockup's own
       tabbed sheets write it (Settings, Setup) */
    const body=got.slice(2,-2);
    assert.deepEqual(body,frame.text.slice(1,1+body.length));assert.deepEqual(style(rows).slice(2,-2),frame.style.slice(1,1+body.length));
    assert.ok(body.length>=frame.text.length-4,'at most one body row given to the tabs');
    assert.equal(got.at(-2),'');
    assert.equal(got.at(-1),frame.text.at(-1)!.replace('   esc close','   tab next tab   esc close'));
  });
}

test('stage 7.16 /diff: o opens the file, c copies its patch; By turn lists your messages with what each changed',()=>{
  const sheet=diffSheet({sub:'main · 3 files · +17 −5 · not committed',files:DIFF_FILES,turns:DIFF_TURNS});
  assert.deepEqual(press(sheet,'ArrowDown','o').action,{kind:'diffOpen',path:'test/e2e/login.spec.ts'});
  const copied=press(sheet,'c');assert.equal(copied.action?.kind,'copy');assert.ok(copied.sheet,'the sheet stays open');
  assert.equal((copied.action as any).notice,'Patch copied · src/auth/login.ts');
  assert.match((copied.action as any).text,/^--- a\/src\/auth\/login\.ts\n\+\+\+ b\/src\/auth\/login\.ts\n@@ -38,7/u);
  const turns=press(sheet,'Tab').sheet!;const body=turns.panel.tabs[1]!.body;
  assert.deepEqual(body.kind==='list'?body.items.map(item=>[item.label,item.meta]):[],[['The login e2e test is flaky. Find out why and fix it.','+16 −4'],['Show me how sessions are refreshed','no files']]);
  const shown=text(fitTo(panelRows(turns.panel,120,30),120)).join('\n');
  assert.match(shown,/│ src\/auth\/login\.ts  modified/u);assert.match(shown,/│ test\/e2e\/login\.spec\.ts  modified/u);
  const empty=diffSheet({sub:'main · no changes since the last commit',files:[],turns:[]});
  const none=text(fitTo(panelRows(empty.panel,120,12),120)).join('\n');
  assert.match(none,/Nothing changed since the last commit\./u);
  assert.match(text(fitTo(panelRows(press(empty,'Tab').sheet!.panel,120,12),120)).join('\n'),/No turn of this conversation changed a file yet\./u);
});

/* stage 7.17 (mockup help): the mockup's own catalogue feeds the sheet (fixtures/mockup-commands.json) */
const MOCK=JSON.parse(readFileSync(new URL('./fixtures/mockup-commands.json',import.meta.url),'utf8')) as {groups:[string,string][];commands:Array<{name:string;group:string;desc:string;usage:string;fresh:boolean}>};
const HELP_COMMANDS=MOCK.commands.map(c=>({name:c.name,group:MOCK.groups.find(g=>g[0]===c.group)![1],usage:c.usage,desc:c.desc,fresh:c.fresh}));
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  /* FE-048: the Keys tab left its golden frame: it is generated from the registry now (test below) */
  for(const [tab,name] of [[0,'cmd-help-tab1-commands']] as const){
    test(`${name} at ${size}: the command's sheet is the mockup's`,()=>{
      const frame=golden.frames[`${size}/${name}`]!;const sheet=helpSheet(HELP_COMMANDS,{version:'0.5',tab});
      const H=panelHeight(sheet.panel,w,frame.height,frame.footRows,0);assert.equal(H,frame.text.length);
      const rows=fitTo(panelRows(sheet.panel,w,H),w);
      assert.deepEqual(text(rows),frame.text);assert.deepEqual(style(rows),frame.style);
    });
  }
}

test('FE-048 /help: the keys come from the registry, the person\'s own changes included, and every key of the frame is there',()=>{
  const rows=helpKeyRows(KEYBINDINGS,100).map(row=>row.map(segment=>segment.text).join(''));
  for(const key of ['alt+n','alt+d','alt+l','alt+j'])assert.ok(rows.some(row=>row.includes(key)),`${key} is missing`);
  assert.ok(rows.includes(' Everywhere'));
  const changed=KEYBINDINGS.map(binding=>binding.id==='view-bar'?{...binding,keys:['Ctrl+B']}:binding);
  const mine=helpKeyRows(changed,100).map(row=>row.map(segment=>segment.text).join(''));
  assert.ok(mine.some(row=>row.includes('ctrl+b')));assert.ok(!mine.some(row=>row.includes('alt+n')));
  const two=helpKeyRows(KEYBINDINGS,150,10);
  assert.ok(two.length<rows.length,'two columns when they do not fit and there is room');
});

test('FE-048 /help: on a page the keys scroll and say what is left',()=>{
  let panel:Panel=asPage(helpSheet(HELP_COMMANDS,{version:'0.5',tab:1})).panel;
  const shown=()=>pageRows(panel,80,12,{terminalColumns:80}).map(row=>row.map(segment=>segment.text).join('')).join('\n');
  assert.match(shown(),/↓ \d+ more/u);assert.doesNotMatch(shown(),/↑ \d+ more/u);
  panel=panelKey(panel,{name:'PageDown'}).panel;
  assert.match(shown(),/↑ 8 more/u);
});

test('stage 7.17 /help: Enter opens the command under the cursor; / searches the commands',()=>{
  const sheet=helpSheet(HELP_COMMANDS,{version:'0.5'});
  assert.deepEqual(press(sheet,'ArrowDown','Enter'),{sheet:null,action:{kind:'runCommand',name:'fork'}});
  const found=press(sheet,'/','d','i','f','f','Enter','Enter');
  assert.deepEqual(found.action,{kind:'runCommand',name:'diff'});
  /* the search reads what a command does too: «git» finds /diff */
  assert.deepEqual(press(sheet,'/','g','i','t','Enter','Enter').action,{kind:'runCommand',name:'diff'});
  /* the product's catalogue: the mockup's order, its group words, the «new» pill on what this version adds */
  const product=helpCommands();
  assert.deepEqual(product.slice(0,3).map(row=>row.name),['resume','fork','rename']);
  assert.equal(product.find(row=>row.name==='notes')?.group,'Work');
  /* 0.6.15: /remote is new in this version too (T4) */
  assert.deepEqual(product.filter(row=>row.fresh).map(row=>row.name),['transcript','remote']);
  const body=helpSheet(product,{version:'0.5'}).panel.tabs[0]!.body;
  assert.deepEqual(body.kind==='list'?body.items.filter(item=>item.badge).map(item=>[item.label,item.badge,item.badgeRoles]):[],[['/transcript','new','pill'],['/remote','new','pill']]);
});

/* stage 7.19 (mockup tasks; owner 03/10: the mockup's sheet in front, what the board has more in the detail beside it) */
const TASKS:TaskView[]=[
  {id:'t1',title:'Fix the flaky login test',done:true,meta:'today',detail:{description:'The cookie arrives late.',status:'done',priority:'high',depends:[],evidence:['session 7f3a2c · 4 writes'],agents:[],schedules:[]}},
  {id:'t2',title:'Move image export to a worker',done:false,meta:'in progress',detail:{description:null,status:'in progress',priority:'normal',depends:['Fix the flaky login test'],evidence:[],agents:[],schedules:[]}},
  {id:'t3',title:'Write checkout e2e tests',done:false,meta:'agent working',detail:{description:null,status:'open',priority:'normal',depends:[],evidence:[],agents:['Write the checkout tests · running'],schedules:[]}},
  {id:'t4',title:'Update API docs for v2',done:true,meta:'Sep 27',detail:{description:null,status:'done',priority:'low',depends:[],evidence:[],agents:[],schedules:[]}},
  {id:'t5',title:'Rate limit /search',done:false,meta:'open',detail:{description:null,status:'open',priority:'normal',depends:[],evidence:[],agents:[],schedules:['Nightly check · every 1440 min']}}];
/* FE-048: /tasks is a page now, with filters over the list; under them the rows are still the mockup's */
const tasksWithoutFilters=()=>{const sheet=tasksSheet(TASKS);delete (sheet.panel.tabs[0]!.body as any).filters;return sheet;};
test('cmd-tasks at 80x24: the command\'s sheet is the mockup\'s (no detail on a narrow screen)',()=>{
  const frame=golden.frames['80x24/cmd-tasks']!;const sheet=tasksWithoutFilters();
  const H=panelHeight(sheet.panel,80,frame.height,frame.footRows,0);assert.equal(H,frame.text.length);
  const rows=fitTo(panelRows(sheet.panel,80,H),80);
  assert.deepEqual(text(rows),frame.text);assert.deepEqual(style(rows),frame.style);
});
test('cmd-tasks at 120x40: the mockup\'s rows with the board\'s detail beside them (approved difference)',()=>{
  const frame=golden.frames['120x40/cmd-tasks']!;const sheet=tasksWithoutFilters();
  const rows=text(fitTo(panelRows(sheet.panel,120,frame.text.length+4),120));
  assert.equal(rows[0],frame.text[0]);assert.equal(rows.at(-1),frame.text.at(-1));
  assert.match(rows[1]!,/^ › \[x\] Fix the flaky login test +today +│ Fix the flaky login test$/u);
  const all=rows.join('\n');
  assert.match(all,/│ done · priority high/u);assert.match(all,/│ The cookie arrives late\./u);assert.match(all,/│ Evidence/u);assert.match(all,/│ +session 7f3a2c · 4 writes/u);
  assert.doesNotMatch(all,/│ (Depends on|Agents|Schedules)$/mu,'a link kind with nothing in it is not drawn');
});
test('stage 7.19 /tasks: space marks done or open again, n adds, e edits the title, d twice deletes',()=>{
  assert.deepEqual(press(tasksSheet(TASKS),' ').action,{kind:'taskDone',id:'t1',done:false});
  assert.deepEqual(press(tasksSheet(TASKS),'ArrowDown',' ').action,{kind:'taskDone',id:'t2',done:true});
  assert.deepEqual(press(tasksSheet(TASKS),'n','A','b','Enter').action,{kind:'taskAdd',title:'Ab'});
  assert.equal(press(tasksSheet(TASKS),'n',' ','Enter').action,null);
  assert.deepEqual(press(tasksSheet(TASKS),'e','Backspace','X','Enter').action,{kind:'taskEdit',id:'t1',title:'Fix the flaky login tesX'});
  assert.deepEqual(press(tasksSheet(TASKS),'ArrowDown','d','d').action,{kind:'taskDelete',id:'t2'});
  assert.deepEqual(press(tasksSheet([]),'n','z','Enter').action,{kind:'taskAdd',title:'z'});
  assert.match(text(fitTo(panelRows(tasksSheet([]).panel,80,8),80)).join('\n'),/No tasks yet/u);
});

/* stage 7.20 (mockup notes; owner 03/10: what the notes have more — their links — in the detail beside the Markdown) */
const NOTES:NoteRow[]=[
  {id:'n1',title:'Release checklist 0.5',meta:'today',desc:'4 items',markdown:'## Release checklist\n- Bump the version\n- Run the full e2e suite\n- **Check** the changelog\n- Tag and publish',links:[]},
  {id:'n2',title:'Ideas: search ranking',meta:'Sep 29',desc:'boost exact matches',markdown:'## Search ranking\nBoost **exact** title matches, then recency.',links:['task · Rate limit /search']},
  {id:'n3',title:'Design sync',meta:'Sep 26',desc:'colours, empty states',markdown:'## Design sync\n- Empty states need a next step\n- Forge accent stays',links:[]}];
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  /* owner 03/10: Enter attaches the note to the message (the old notes panel's «c»), «enter attach» after «↑/↓ move» */
  test(`cmd-notes at ${size}: the command's sheet is the mockup's, with enter attach`,()=>{
    const frame=golden.frames[`${size}/cmd-notes`]!;
    assertGolden(notesSheet(NOTES),w,frame,frame.text.at(-1)!.trimEnd().replace('↑/↓ move   ','↑/↓ move   enter attach   '));
  });
}
test('stage 7.20 /notes: n adds, e edits the title, v opens the note in the editor, d twice deletes; links under the Markdown',()=>{
  assert.deepEqual(press(notesSheet(NOTES),'n','I','d','e','a','Enter').action,{kind:'noteAdd',title:'Idea'});
  assert.equal(press(notesSheet(NOTES),'n',' ','Enter').action,null,'a note with no title is not added');
  assert.deepEqual(press(notesSheet(NOTES),'ArrowDown','Enter'),{sheet:null,action:{kind:'noteAttach',id:'n2'}},'Enter attaches the note and closes the sheet');
  assert.deepEqual(press(notesSheet(NOTES),'e','Backspace','6','Enter').action,{kind:'noteEdit',id:'n1',title:'Release checklist 0.6'});
  assert.deepEqual(press(notesSheet(NOTES),'ArrowDown','v').action,{kind:'noteOpen',id:'n2'});
  assert.deepEqual(press(notesSheet(NOTES),'ArrowDown','ArrowDown','d','d').action,{kind:'noteDelete',id:'n3'});
  const wide=text(fitTo(panelRows(press(notesSheet(NOTES),'ArrowDown').sheet!.panel,120,20),120)).join('\n');
  assert.match(wide,/│ Linked to/u);assert.match(wide,/│ +task · Rate limit \/search/u);
  assert.match(text(fitTo(panelRows(notesSheet([]).panel,80,8),80)).join('\n'),/No notes yet/u);
});

test('stage 7.14 /queue: Enter sends now, u moves up, n adds, e edits in place, d twice deletes; the sheet stays open',()=>{
  assert.deepEqual(press(queueSheet(QUEUED),'Enter'),{sheet:null,action:{kind:'queueSend',id:'q1'}});
  let out=press(queueSheet(QUEUED),'ArrowDown','u');
  assert.deepEqual(out.action,{kind:'queueMove',id:'q2'});assert.ok(out.sheet,'u keeps the sheet');
  out=press(queueSheet(QUEUED),'n','a','b','Enter');
  assert.deepEqual(out.action,{kind:'queueAdd',text:'ab'});assert.ok(out.sheet);
  assert.equal(press(queueSheet(QUEUED),'n',' ','Enter').action,null,'an empty message is not added');
  out=press(queueSheet(QUEUED),'ArrowDown','e','Backspace','Backspace','Backspace','Backspace','Backspace','Backspace','Backspace','x','Enter');
  assert.deepEqual(out.action,{kind:'queueEdit',id:'q2',text:'Then draft the commit x'});
  assert.equal(press(queueSheet(QUEUED),'d','x').action,null,'any other key keeps it');
  out=press(queueSheet(QUEUED),'ArrowDown','d','d');
  assert.deepEqual(out.action,{kind:'queueDelete',id:'q2'});assert.ok(out.sheet);
  assert.deepEqual(press(queueSheet([]),'n','z','Enter').action,{kind:'queueAdd',text:'z'},'n works on an empty queue');
  const empty=text(fitTo(panelRows(queueSheet([]).panel,120,12),120)).join('\n');
  assert.match(empty,/Nothing queued\. While TALOS works, what you type waits here\./u);
  /* a queued command keeps its kind: its row says it is a command, and it is sent as typed */
  const command=text(fitTo(panelRows(queueSheet([{id:'c1',kind:'slash',text:'/clear'}]).panel,120,12),120)).join('\n');
  assert.match(command,/› \/clear/u);
});

test('stage 7.13: a conversation with nothing in it yet says so on «Start a new conversation»',()=>{
  const rows=fitTo(panelRows(clearSheet(null).panel,120,12),120);
  assert.ok(text(rows).includes('     nothing to keep yet: this conversation has no messages'),text(rows).join('\n'));
});

test('a click on the selected row is its Enter; a click on a slider step sets it; the ✕ closes',()=>{
  const busy=busySheet('queue');
  const first=sheetStep(busy,panelClick(busy.panel,'pitem:2'));assert.equal(first.action,null);
  assert.equal(sheetStep(first.sheet!,panelClick(first.sheet!.panel,'pitem:2')).action?.kind,'busy');
  const effort=effortSheet('m',['low','medium','high'],'medium');
  const low=sheetStep(effort,panelClick(effort.panel,'pfopt:0:0'));
  assert.equal(sheetStep(low.sheet!,panelClick(low.sheet!.panel,'pkey:Enter')).action?.kind,'effort');
  assert.equal((sheetStep(low.sheet!,panelClick(low.sheet!.panel,'pkey:Enter')).action as any).level,'low');
  assert.deepEqual(sheetStep(busy,panelClick(busy.panel,'pkey:Escape')),{sheet:null,action:null});
});

test('a model whose levels are not low/medium/high still gets its slider, without the words it has none for',()=>{
  const sheet=effortSheet('gpt',['minimal','low','high'],null);
  const body=sheet.panel.tabs[0]!.body as any;
  assert.deepEqual(body.fields[0].options,['minimal','low','high']);assert.equal(body.fields[0].value,'minimal');
  assert.equal(body.after().length,3,'a blank row, then low and high');
});

test('/effort opens on the level in use, «default» included, and its sub names only the model\'s levels',()=>{
  const sheet=effortSheet('qwen3',['default','low','medium','high','max'],'default');
  const body=sheet.panel.tabs[0]!.body as any;
  assert.equal(body.fields[0].value,'default');
  assert.equal(sheet.panel.sub,'qwen3 offers low, medium, high, max');
});

test('/history: Enter puts the message back with its pastes, c copies it and stays open, / filters',()=>{
  const drafts=[{text:'fix the\nlogin test',collapsedPastes:[{start:0,end:3,chars:3,lines:1}],at:new Date(NOW).toISOString()},{text:'add a rate limit',collapsedPastes:[]}];
  const sheet=historySheet(drafts,{now:NOW,offsetMinutes:0});
  assert.equal((sheet.panel.tabs[0]!.body as any).items[0].label,'fix the login test','one line');
  assert.equal((sheet.panel.tabs[0]!.body as any).items[1].meta,'','no time known, no time shown');
  assert.deepEqual(press(sheet,'ArrowDown','Enter'),{sheet:null,action:{kind:'history',draft:drafts[1]}});
  const copied=press(sheet,'c');assert.deepEqual(copied.action,{kind:'copy',text:'fix the\nlogin test',notice:'Copied the message'});assert.ok(copied.sheet,'copying keeps the sheet');
  assert.deepEqual(press(sheet,'/','r','a','t','e','Enter','Enter').action,{kind:'history',draft:drafts[1]},'the filtered row is the right draft');
});

test('/resume: Enter resumes, f forks, r renames in place, d asks then deletes; the conversation in use is never resumed again or deleted',()=>{
  const sheet=resumeSheet(RESUME,{project:'shop-api',now:NOW,offsetMinutes:0});
  assert.deepEqual(press(sheet,'ArrowDown','Enter'),{sheet:null,action:{kind:'resume',id:'s1'}});
  assert.deepEqual(press(sheet,'Enter'),{sheet:null,action:{kind:'notice',text:'Already in this conversation'}});
  assert.deepEqual(press(sheet,'ArrowDown','f'),{sheet:null,action:{kind:'fork',id:'s1',title:'Move image export to a worker'}});
  const renamed=press(sheet,'ArrowDown','r','Backspace','Backspace','Backspace','Backspace','Backspace','Backspace','t','h','r','e','a','d',' ','Enter');
  assert.deepEqual(renamed.action,{kind:'renameSession',id:'s1',name:'Move image export to a thread',notice:'Renamed to "Move image export to a thread"'});
  assert.equal((renamed.sheet!.panel.tabs[0]!.body as any).items[1].label,'Move image export to a thread','the list shows the new name');
  assert.equal(press(sheet,'ArrowDown','r','Escape').action,null,'Esc keeps the name');
  const blank=press(sheet,'ArrowDown','r',...Array(40).fill('Backspace'),'Enter');assert.equal(blank.action,null,'an empty name changes nothing');
  const asked=press(sheet,'ArrowDown','ArrowDown','d');assert.equal(asked.action,null);assert.notEqual(asked.sheet!.panel.confirmDel,null,'d asks first');
  const deleted=press(sheet,'ArrowDown','ArrowDown','d','d');
  assert.deepEqual(deleted.action,{kind:'deleteSession',id:'s2',title:'Checkout e2e tests'});
  assert.deepEqual((deleted.sheet!.panel.tabs[0]!.body as any).items.map((item:any)=>item.id),['s0','s1','s3','s4','s5'],'gone from the list, the sheet stays');
  assert.equal(deleted.sheet!.panel.sub,'shop-api · 5 conversations','the sub counts what is left');
  assert.equal(press(sheet,'ArrowDown','ArrowDown','d','x').action,null,'any other key keeps it');
  assert.deepEqual(press(sheet,'d'),{sheet:sheet,action:{kind:'notice',text:'This is the conversation you are in; resume another one to delete it'}});
  assert.deepEqual(press(sheet,'/','r','a','t','e','Enter','Enter').action,{kind:'resume',id:'s3'},'the filtered row is the right conversation');
});

test('/resume: no messages yet means no «Last exchange»; one message is «1 message»; no branch, no model: only what is known',()=>{
  const sheet=resumeSheet([{id:'x',title:'New',at:null,messages:1,branch:null,model:null,current:false,you:null,answer:null}],{project:'p',now:NOW,offsetMinutes:0});
  const body=sheet.panel.tabs[0]!.body as any;
  assert.equal(body.items[0].desc,'1 message');assert.equal(body.items[0].meta,'');
  assert.equal(sheet.panel.sub,'p · 1 conversation');
  const detail=text(body.detail(body.items[0],50));
  assert.ok(!detail.some((line:string)=>/Last exchange/u.test(line)),detail.join('\n'));
});

test('/resume with nothing to resume says so (review D-10)',()=>{
  const sheet=resumeSheet([],{project:'p',now:NOW,offsetMinutes:0});
  const rows=text(panelRows(sheet.panel,80,panelHeight(sheet.panel,80,24,1,0)));
  assert.ok(rows.some(line=>/No conversations to resume in this project yet\./u.test(line)),rows.join('\n'));
  assert.equal(sheet.panel.sub,'p · 0 conversations');
});

/* stage 7.6 /fork (mockup PANELS.fork; owner 03/10 «taglio prima + messaggio nel composer»): «latest» forks the whole
   conversation; an earlier message starts the new one just before it, the message back in the composer (when the kernel can) */
const TURNS=[{runId:'r2',text:'The login e2e test is flaky. Find out why and fix it.'},{runId:'r1',text:'Show me how sessions are refreshed'}];
test('/fork: «latest» forks it all; an earlier message cuts before it, only when the kernel can',()=>{
  assert.deepEqual(press(forkSheet(TURNS,{canCut:true}),'Enter'),{sheet:null,action:{kind:'forkHere',beforeRun:null,text:TURNS[0]!.text}});
  assert.deepEqual(press(forkSheet(TURNS,{canCut:true}),'ArrowDown','Enter'),{sheet:null,action:{kind:'forkHere',beforeRun:'r1',text:TURNS[1]!.text}});
  const only=forkSheet(TURNS,{canCut:false});
  assert.deepEqual((only.panel.tabs[0]!.body as any).items.map((item:any)=>item.meta),['latest'],'until the kernel can cut, only the whole conversation');
  const body=forkSheet(TURNS,{canCut:true}).panel.tabs[0]!.body as any;
  const earlier=text(body.detail(body.items[1],60));
  assert.ok(earlier.some((line:string)=>/everything before/u.test(line))&&earlier.some((line:string)=>/goes back in the composer/u.test(line)),earlier.join('\n'));
  const empty=forkSheet([],{canCut:true});
  assert.ok(text(panelRows(empty.panel,80,panelHeight(empty.panel,80,24,1,0))).some(line=>/No messages in this conversation yet\./u.test(line)));
});

/* stage 7.7 /export (mockup PANELS.export; Claude Code: copy or save; OpenCode: include thinking / tool details) */
test('/export: Enter saves, Ctrl+C copies; the format changes the file\'s extension; the switches decide what goes in',()=>{
  const sheet=exportSheet({messages:48,file:'talos-flaky-login-2026-10-01.md'});
  const base={format:'md',toolOutput:false,thinking:false,file:'talos-flaky-login-2026-10-01.md'};
  assert.deepEqual(press(sheet,'Enter'),{sheet:null,action:{kind:'export',to:'file',...base}});
  const json=press(sheet,'ArrowRight');assert.equal((json.sheet!.panel.tabs[0]!.body as any).fields[3].value,'talos-flaky-login-2026-10-01.json');
  assert.deepEqual(press(sheet,'ArrowRight','ArrowRight','Enter').action,{kind:'export',to:'file',...base,format:'jsonl',file:'talos-flaky-login-2026-10-01.jsonl'});
  assert.deepEqual(press(sheet,'ArrowLeft','Enter').action,{kind:'export',to:'file',...base,format:'jsonl',file:'talos-flaky-login-2026-10-01.jsonl'},'it wraps');
  assert.deepEqual(press(sheet,'ArrowDown',' ','ArrowDown',' ','Enter').action,{kind:'export',to:'file',...base,toolOutput:true,thinking:true});
  const copied=sheetStep(sheet,panelKey(sheet.panel,{name:'c',ctrl:true}));
  assert.deepEqual(copied,{sheet:null,action:{kind:'export',to:'clipboard',...base}});
  const named=press(sheet,'ArrowUp',...Array(31).fill('Backspace'),'n','o','t','e','s','Enter');
  assert.deepEqual(named.action,{kind:'export',to:'file',...base,file:'notes'},'a name of your own');
  const blank=press(sheet,'ArrowUp',...Array(31).fill('Backspace'),'Enter');assert.equal(blank.action,null);assert.ok(blank.sheet,'no name, nothing saved');
  assert.equal(press(sheet,'ArrowUp',...Array(31).fill('Backspace'),'x','ArrowDown','ArrowDown','ArrowDown','ArrowRight').sheet!.panel.tabs[0]!.body.kind,'form');
});

test('a size as the notices say it: bytes, KB, MB',()=>{
  assert.equal(sizeText(512),'512 B');assert.equal(sizeText(1023),'1023 B');
  assert.equal(sizeText(1024),'1 KB');assert.equal(sizeText(18*1024+300),'18 KB');
  assert.equal(sizeText(3*1024*1024+200*1024),'3.2 MB');
});

/* stage 7.8 /undo (owner 03/10 «foglio intero, conversazione via fork»): f puts files back now; Enter and c (the conversation)
   come with the kernel's cut */
test('/undo: f puts the files back to that point; an undone point comes back with f; Enter and c only when the kernel can',()=>{
  const sheet=undoSheet(UNDO,{canCut:false,now:NOW,offsetMinutes:0});
  assert.deepEqual(press(sheet,'f'),{sheet:null,action:{kind:'undoFiles',id:'k3',redo:false}});
  assert.deepEqual(press(sheet,'ArrowDown','f').action,{kind:'undoFiles',id:'k2',redo:false},'a point without its own files still puts back the newer ones');
  assert.equal(press(sheet,'Enter').action,null,'no conversation without the kernel');
  assert.equal(press(sheet,'c').action,null);
  const undone=undoSheet([{...UNDO[0]!,undone:true}],{canCut:false,now:NOW,offsetMinutes:0});
  assert.deepEqual(press(undone,'f').action,{kind:'undoFiles',id:'k3',redo:true});
  const nothing=undoSheet([{id:'q',label:'Before: hi',at:null,undone:false,files:[],back:[]}],{canCut:false,now:NOW,offsetMinutes:0});
  assert.deepEqual(press(nothing,'f'),{sheet:nothing,action:{kind:'notice',text:'No files to put back'}});
  const cut=undoSheet(UNDO,{canCut:true,now:NOW,offsetMinutes:0});
  assert.deepEqual(press(cut,'Enter').action,{kind:'undoCut',id:'k3',files:true});
  assert.deepEqual(press(cut,'c').action,{kind:'undoCut',id:'k3',files:false});
});

test('/undo rows: the files of each point; the start says what changed since; a binary file names no count',()=>{
  const body=undoSheet([{id:'b',label:'Before: logo',at:null,undone:false,files:[{path:'logo.png',change:'modified'},{path:'a.ts',change:'added',added:3,removed:0}],back:[{path:'logo.png',change:'modified'}]}],{canCut:false,now:NOW,offsetMinutes:0}).panel.tabs[0]!.body as any;
  assert.equal(body.items[0].desc,'2 files changed');
  const detail=text(body.detail(body.items[0],60));
  assert.ok(detail.some((line:string)=>/^  logo\.png  modified$/u.test(line)),detail.join('\n'));
  assert.equal((undoSheet(UNDO,{canCut:false,now:NOW,offsetMinutes:0}).panel.tabs[0]!.body as any).items[3].desc,'2 files changed since');
});

/* stage 7.9 /compact (mockup PANELS.compact; owner 03/10 «foglio subito + patch per il conteggio»): the three real steps, then
   the result; never a counter after the end */
test('/compact: read, writing the summary with its time, then the result with before → after and the percentage',()=>{
  const at=(sheet:SheetState,now=0)=>text(panelRows(sheet.panel,100,panelHeight(sheet.panel,100,40,2,0),now));
  const running=at(compactSheet({phase:'summary',messages:48,tokensBefore:61_200,tokensAfter:null,elapsedMs:12_400}));
  assert.ok(running.some(l=>/^  ✓ Reading the conversation +48 messages · 61\.2k tokens$/u.test(l)),running.join('\n'));
  assert.ok(running.some(l=>/^  \S Writing the summary +12s$/u.test(l)),running.join('\n'));
  assert.ok(running.some(l=>/^  · Replacing the history$/u.test(l)),running.join('\n'));
  assert.ok(!running.some(l=>/Context/u.test(l)),'no result before the end');
  const done=compactSheet({phase:'done',messages:48,tokensBefore:61_200,tokensAfter:9_800,elapsedMs:30_000});
  const rows=at(done);
  assert.ok(rows.some(l=>/^  ✓ Writing the summary +9\.8k tokens$/u.test(l)),rows.join('\n'));
  assert.ok(rows.some(l=>/^  ✓ Replacing the history +done$/u.test(l)));
  assert.ok(rows.some(l=>l==='  Context 61.2k → 9.8k tokens (−84%) · the transcript keeps every message'),rows.join('\n'));
  assert.ok(!rows.some(l=>/30s/u.test(l)),'the time does not run on after the end');
  assert.deepEqual(sheetStep(done,panelClick(done.panel,'pkey:Escape')),{sheet:null,action:null},'Close');
});

test('/compact: nothing to summarize says so; a failure says where it stopped and what to do',()=>{
  const at=(sheet:SheetState)=>text(panelRows(sheet.panel,100,panelHeight(sheet.panel,100,40,2,0),0));
  const already=at(compactSheet({phase:'already',messages:3,tokensBefore:null,tokensAfter:null,elapsedMs:900}));
  assert.ok(already.some(l=>/Already compact/u.test(l)),already.join('\n'));
  const failed=at(compactSheet({phase:'failed',messages:48,tokensBefore:61_200,tokensAfter:null,elapsedMs:4_000,error:{headline:'Compacting this conversation did not work; the previous context stays in use.',todo:'Try again in a moment.'}}));
  assert.ok(failed.some(l=>/^  ✗ Writing the summary +Compacting this conversation did not work/u.test(l)),failed.join('\n'));
  assert.ok(failed.some(l=>l==='  Try again in a moment.'),'what to do, under the steps');
  assert.ok(failed.some(l=>/^  · Replacing the history$/u.test(l)),'nothing was replaced');
});

/* stage 7.10 /model (mockup PANELS.model; Claude Code: ←/→ set the effort in /model; Codex: model and effort are one choice) */
test('/model: Enter uses the model with the effort on its row; ←/→ move the effort among the levels the model offers',()=>{
  const sheet=modelSheet(MODELS,{current:'openrouter:qwen3-coder',providerLabel:'OpenRouter',effort:'medium',scale:MOCK_SCALE});
  assert.deepEqual(press(sheet,'Enter'),{sheet:null,action:{kind:'model',id:'openrouter:qwen3-coder',effort:'medium',notice:'Model: qwen3-coder · effort medium'}});
  assert.deepEqual(press(sheet,'ArrowRight','Enter').action,{kind:'model',id:'openrouter:qwen3-coder',effort:'high',notice:'Model: qwen3-coder · effort high'});
  assert.deepEqual(press(sheet,'ArrowRight','ArrowRight','ArrowRight','Enter').action?.effort,'high','it stops at the highest the model offers');
  assert.deepEqual(press(sheet,'ArrowLeft','ArrowLeft','ArrowLeft','Enter').action?.effort,'low');
  assert.deepEqual(press(sheet,'ArrowDown','ArrowDown','ArrowDown','Enter').action,{kind:'model',id:'openrouter:kimi-k2.5',effort:'off',notice:'Model: kimi-k2.5 · effort off'},'a model that does not offer the effort takes its own');
  assert.deepEqual(press(sheet,'/','g','e','m','Enter','Enter').action?.id,'ollama:gemma-4-12b','the filter');
  const rows=text(panelRows(press(sheet,'ArrowDown','ArrowDown').sheet!.panel,120,panelHeight(sheet.panel,120,40,2,0)));
  assert.ok(rows.some(line=>/Effort  ● off ── ● low ── ◆ medium ── ● high ── ● max/u.test(line)),'the row follows the selected model: deepseek keeps medium');
});

test('/model: the product\'s own scale; a level the model does not offer is greyed',()=>{
  const real=['default','low','medium','high','xhigh','max'];
  const sheet=modelSheet([{...MODELS[0]!,efforts:['default','low','medium','high']}],{current:'openrouter:qwen3-coder',providerLabel:'OpenRouter',effort:'default',scale:real});
  const panel=sheet.panel;const extra=(panel.tabs[0]!.body as any).extra(120) as any[][];
  const segs=extra[1]!.map((seg:any)=>[seg.text,[...seg.roles].join(',')]);
  assert.deepEqual(segs.filter(([text]:any)=>/default|xhigh|max/u.test(text)),[['◆ default','acc,b'],['● xhigh','faint'],['● max','faint']]);
});

test('/model: the sub names the model in use, also when it belongs to another provider',()=>{
  assert.equal(modelSheet(MODELS,{current:'openrouter:deepseek-v4',providerLabel:'OpenRouter',effort:'medium',scale:MOCK_SCALE}).panel.sub,'deepseek-v4 via OpenRouter');
  assert.equal(modelSheet(MODELS,{current:'openai:gpt-5-mini',providerLabel:'OpenRouter',effort:'medium',scale:MOCK_SCALE}).panel.sub,'OpenRouter · in use: openai:gpt-5-mini');
  assert.equal(modelSheet(MODELS,{current:null,providerLabel:'OpenRouter',effort:'medium',scale:MOCK_SCALE}).panel.sub,'OpenRouter');
});

/* stage 7.10b /provider (mockup PANELS.provider; owner 03/10 «foglio + subito /model del nuovo provider») */
test('/provider: Enter uses the provider; k asks for its key, masked; t tests it; a provider with no key needs none',()=>{
  const sheet=providerSheet(PROVIDERS);
  assert.deepEqual(press(sheet,'ArrowDown','Enter'),{sheet:null,action:{kind:'provider',id:'anthropic'}});
  const asking=press(sheet,'ArrowDown','ArrowDown','k');
  assert.deepEqual(asking.sheet!.panel.edit,{label:'API key for OpenAI:',value:'',mask:true});
  const rows=text(panelRows(asking.sheet!.panel,120,panelHeight(asking.sheet!.panel,120,40,2,0)));
  assert.ok(!rows.some(line=>/sk-/u.test(line)),'nothing typed yet');
  const typed=press(sheet,'ArrowDown','ArrowDown','k','s','k','-','1','2');
  assert.ok(text(panelRows(typed.sheet!.panel,120,panelHeight(typed.sheet!.panel,120,40,2,0))).some(line=>/API key for OpenAI: +•••••/u.test(line)),'the key shows as dots');
  assert.deepEqual(press(sheet,'ArrowDown','ArrowDown','k','s','k','-','1','2','Enter').action,{kind:'providerKey',id:'openai',key:'sk-12'});
  assert.equal(press(sheet,'ArrowDown','ArrowDown','k','Enter').action,null,'an empty key changes nothing');
  assert.deepEqual(press(sheet,'t').action,{kind:'providerTest',id:'openrouter'});
  assert.deepEqual(press(sheet,'ArrowDown','ArrowDown','ArrowDown','ArrowDown','k').action,{kind:'notice',text:'Ollama needs no key'});
});

test('/provider: a list longer than the sheet shows can be searched with /; the mockup\'s six cannot',()=>{
  assert.equal((providerSheet(PROVIDERS).panel.tabs[0]!.body as any).filterable,undefined);
  const many=Array.from({length:30},(_,i)=>({...PROVIDERS[2]!,id:`p${i}`,label:`Provider ${i}`}));
  assert.deepEqual(press(providerSheet(many),'/','2','9','Enter','Enter').action,{kind:'provider',id:'p29'});
});

test('/provider: the filter finds a provider by its id and description too, as the picker did',()=>{
  const many=Array.from({length:12},(_,i)=>({...PROVIDERS[2]!,id:i===7?'zai-anthropic':`p${i}`,label:i===7?'Z.ai (Anthropic API)':`Provider ${i}`,search:i===3?'models served in Europe':''}));
  assert.deepEqual(press(providerSheet(many),'/','z','a','i','-','a','n','t','Enter','Enter').action,{kind:'provider',id:'zai-anthropic'});
  assert.deepEqual(press(providerSheet(many),'/','e','u','r','o','p','e','Enter','Enter').action,{kind:'provider',id:'p3'});
});

/* stage 7.21 (mockup permissions; owner 03/10: rules obeyed at once, saved where the person chooses, the last 50 decisions,
   the project's trust in one row over the modes) */
const RULES:RuleView[]=[{rule:'Bash(npm test:*)',effect:'allow',meta:'project'},{rule:'Read(src/**)',effect:'allow',meta:'project'},{rule:'Bash(git push:*)',effect:'ask',meta:'you'},{rule:'Read(.env*)',effect:'deny',meta:'you'},{rule:'WebFetch(domain:docs.stripe.com)',effect:'allow',meta:'project'}];
const RECENT:RecentView[]=[
  {id:'d0',label:'rm -rf dist',outcome:'denied by you',bad:true,meta:'4 min ago',desc:'TALOS was told why and used npm run clean instead',rule:'Bash(rm -rf dist)'},
  {id:'d1',label:'Edit src/auth/login.ts',outcome:'allowed once',bad:false,meta:'6 min ago',desc:'from the approval card',rule:'Edit(src/auth/login.ts)'},
  {id:'d2',label:'Read ~/.ssh/config',outcome:'blocked',bad:true,meta:'1 h ago',desc:'outside the project and secret: never without asking',rule:null}];
const perms=(over:Partial<Parameters<typeof permissionsSheet>[0]>={})=>permissionsSheet({mode:'default',trusted:null,rules:RULES,recent:RECENT,...over});
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  for(const [tab,name] of [[0,'tab1-mode'],[1,'tab2-rules'],[2,'tab3-recent']] as const){
    test(`cmd-permissions-${name} at ${size}: the command's sheet is the mockup's`,()=>assertGolden(perms({tab}),w,golden.frames[`${size}/cmd-permissions-${name}`]!));
  }
}
test('stage 7.21 /permissions Mode: the project\'s trust over the modes (approved difference); Enter uses a mode',()=>{
  const rows=text(fitTo(panelRows(perms({trusted:true}).panel,120,16),120));
  assert.equal(rows[2],'  This project: trusted · /permissions trust');
  assert.match(text(fitTo(panelRows(perms({trusted:false}).panel,120,16),120)).join('\n'),/This project: not trusted · \/permissions trust/u);
  assert.deepEqual(press(perms(),'ArrowDown','Enter'),{sheet:null,action:{kind:'permissionMode',mode:'acceptEdits',label:'Accept edits'}});
  assert.deepEqual(press(perms({mode:'plan'}),'ArrowDown','ArrowDown','ArrowDown','Enter').action,{kind:'permissionMode',mode:'bypassPermissions',label:'Full access'});
});
test('stage 7.21 /permissions Rules: space turns allow/ask/deny, e edits the words, d twice deletes, n asks where to save',()=>{
  assert.deepEqual(press(perms({tab:1}),' ').action,{kind:'ruleEffect',index:0,effect:'ask'});
  assert.deepEqual(press(perms({tab:1}),'ArrowDown','ArrowDown',' ').action,{kind:'ruleEffect',index:2,effect:'deny'});
  assert.deepEqual(press(perms({tab:1}),'ArrowDown','ArrowDown','ArrowDown',' ').action,{kind:'ruleEffect',index:3,effect:'allow'});
  assert.deepEqual(press(perms({tab:1}),'e','Backspace','Backspace','x',')','Enter').action,{kind:'ruleEdit',index:0,rule:'Bash(npm test:x)'});
  assert.deepEqual(press(perms({tab:1}),'ArrowDown','d','d').action,{kind:'ruleDelete',index:1});
  assert.equal(press(perms({tab:1}),'n',' ','Enter').action,null,'an empty rule asks nothing');
  const typed=press(perms({tab:1}),'n','R','e','a','d','(','x',')','Enter');
  assert.equal(typed.action,null);assert.equal(typed.sheet?.name,'ruleScope');
  assert.match(text(fitTo(panelRows(typed.sheet!.panel,80,12),80)).join('\n'),/Save rule allow Read\(x\)[\s\S]*● Only you, in this project[\s\S]*Shared with the project[\s\S]*All your projects/u);
  assert.deepEqual(press(typed.sheet!,'Enter'),{sheet:null,action:{kind:'ruleAdd',rule:'Read(x)',effect:'allow',scope:'project-user'}});
  assert.deepEqual(press(typed.sheet!,'ArrowDown','Enter').action,{kind:'ruleAdd',rule:'Read(x)',effect:'allow',scope:'project'});
  assert.deepEqual(press(typed.sheet!,'ArrowDown','ArrowDown','Enter').action,{kind:'ruleAdd',rule:'Read(x)',effect:'allow',scope:'user'});
  const back=press(typed.sheet!,'Escape');assert.equal(back.action,null);assert.equal(back.sheet?.name,'permissions');assert.equal(back.sheet?.panel.tab,1,'Esc goes back to the rules');
  assert.match(text(fitTo(panelRows(perms({tab:1,rules:[]}).panel,80,12),80)).join('\n'),/No rules yet/u);
});
test('stage 7.21 /permissions Recent: a makes a decision an allow rule, asking where; one that cannot be a rule says so',()=>{
  const asked=press(perms({tab:2}),'a');assert.equal(asked.sheet?.name,'ruleScope');
  assert.deepEqual(press(asked.sheet!,'Enter').action,{kind:'ruleAdd',rule:'Bash(rm -rf dist)',effect:'allow',scope:'project-user'});
  assert.deepEqual(press(perms({tab:2}),'ArrowDown','ArrowDown','a').action,{kind:'notice',text:'This request cannot be a rule: it is answered each time.'});
  assert.match(text(fitTo(panelRows(perms({tab:2,recent:[]}).panel,80,12),80)).join('\n'),/No decisions yet in this project\./u);
  assert.deepEqual(ruleScopeSheet('Read(x)','allow',perms()).context?.pendingRule,{rule:'Read(x)',effect:'allow'});
});

/* stage 7.22 (mockup memory; owner 03/10: Project = the project's files line by line and its facts, You = the preferences) */
const PROJECT:MemoryRow[]=[
  {id:'file:TALOS.md:4',label:'Use pnpm, never npm',meta:'TALOS.md · line 4',desc:'The lockfile is pnpm-lock.yaml; npm install breaks the workspace links.',file:{path:'/w/TALOS.md',line:4}},
  {id:'file:TALOS.md:9',label:'Tests: vitest units, Playwright e2e',meta:'TALOS.md · line 9',desc:'Run e2e with pnpm e2e and units with pnpm test.',file:{path:'/w/TALOS.md',line:9}},
  {id:'m1',label:'API errors are RFC 9457 problem+json',meta:'learned Sep 27',desc:'Every 4xx and 5xx returns type, title, status and detail.'}];
const YOU:MemoryRow[]=[{id:'m2',label:'Short answers, details on request',meta:'you · Sep 20',desc:'Prefers short paragraphs.'},{id:'m3',label:'Never commit without asking',meta:'you · Sep 18',desc:'Always ask before git commit or push.'}];
const mem=(over:Partial<Parameters<typeof memorySheet>[0]>={})=>memorySheet({project:PROJECT,you:YOU,...over});
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  for(const [tab,name] of [[0,'tab1-project'],[1,'tab2-you']] as const){
    test(`cmd-memory-${name} at ${size}: the command's sheet is the mockup's`,()=>assertGolden(mem({tab}),w,golden.frames[`${size}/cmd-memory-${name}`]!));
  }
}
test('stage 7.22 /memory: n adds to the tab in view, e edits a memory or opens a file\'s line, d twice deletes a memory',()=>{
  assert.deepEqual(press(mem(),'n','X','Enter').action,{kind:'memoryAdd',title:'X',you:false});
  assert.deepEqual(press(mem({tab:1}),'n','Y','Enter').action,{kind:'memoryAdd',title:'Y',you:true});
  assert.deepEqual(press(mem(),'Tab','n','Y','Enter').action,{kind:'memoryAdd',title:'Y',you:true},'Tab then n adds to You');
  assert.equal(press(mem(),'n',' ','Enter').action,null);
  assert.deepEqual(press(mem(),'e').action,{kind:'memoryOpenFile',path:'/w/TALOS.md',line:4});
  assert.deepEqual(press(mem(),'ArrowDown','ArrowDown','e','Backspace','Backspace','Backspace','Backspace','n','!','Enter').action,{kind:'memoryEdit',id:'m1',title:'API errors are RFC 9457 problem+n!'});
  assert.deepEqual(press(mem(),'d').action,{kind:'notice',text:'This line is in TALOS.md · line 4: press e to change it there.'});
  assert.deepEqual(press(mem({tab:1}),'ArrowDown','d','d').action,{kind:'memoryDelete',id:'m3'});
  assert.match(text(fitTo(panelRows(mem({you:[],tab:1}).panel,80,12),80)).join('\n'),/Nothing remembered here yet\./u);
});

/* stage 7.23 (mockup library; owner 03/10: the mockup's sheet, the rest as /library commands) */
const LIBRARY:LibraryRow[]=[
  {id:'l1',name:'stripe-api-2026-09.pdf',meta:'2.4 MB',desc:'PDF · 212 pages · indexed',preview:['Stripe API reference','PaymentIntents · create, confirm, capture','…']},
  {id:'l2',name:'design-tokens.json',meta:'14 KB',desc:'JSON · 310 tokens',preview:['{','  "color.forge": "#c98b32",','  "space.2": "8px"','}']},
  {id:'l3',name:'checkout-flows.md',meta:'6 KB',desc:'Markdown · 4 flows',preview:['## Guest checkout','1. Cart','2. Address','3. Pay']}];
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  test(`cmd-library at ${size}: the command's sheet is the mockup's`,()=>assertGolden(librarySheet(LIBRARY),w,golden.frames[`${size}/cmd-library`]!));
}
test('stage 7.23 /library: Enter mentions the file and closes, a adds from a path, d twice removes',()=>{
  assert.deepEqual(press(librarySheet(LIBRARY),'ArrowDown','Enter'),{sheet:null,action:{kind:'libraryMention',id:'l2'}});
  assert.deepEqual(press(librarySheet(LIBRARY),'a','d','o','c','s','/','x','.','m','d','Enter').action,{kind:'libraryAdd',path:'docs/x.md'});
  assert.equal(press(librarySheet(LIBRARY),'a',' ','Enter').action,null);
  assert.deepEqual(press(librarySheet([]),'a','y','Enter').action,{kind:'libraryAdd',path:'y'},'a works on an empty library');
  assert.deepEqual(press(librarySheet(LIBRARY),'ArrowDown','ArrowDown','d','d').action,{kind:'libraryDelete',id:'l3'});
  assert.match(text(fitTo(panelRows(librarySheet([]).panel,80,12),80)).join('\n'),/No files yet: press a to add one\./u);
});

test('FE-048: the tasks are filtered by state on the page, each filter says how many, and a filter survives a reload',()=>{
  const task=(id:string,state:'open'|'doing'|'done')=>({id,title:id,done:state==='done',state,meta:'',detail:{description:null,status:state,priority:'normal',depends:[],evidence:[],agents:[],schedules:[]}});
  const tasks=[task('a','open'),task('b','doing'),task('c','done'),task('d','open')];
  const body=(filterAt:number)=>tasksSheet(tasks,{filterAt}).panel.tabs[0]!.body as any;
  assert.deepEqual(body(0).filters.map((filter:any)=>filter.name),['All 4','To do 2','In progress 1','Done 1']);
  assert.deepEqual(listItems(body(1)).map(item=>item.id),['a','d']);
  assert.deepEqual(listItems(body(2)).map(item=>item.id),['b']);
  assert.deepEqual(listItems(body(3)).map(item=>item.id),['c']);
  assert.equal(listItems(body(0)).length,4);
});

test('FE-048: what the chat behind a page is told stands on the page with no tick; a toast of something done keeps its own',()=>{
  const sheet=asPage(tasksSheet([]));
  const row=(options:{toast?:string;note?:string})=>pageRows(sheet.panel,100,20,options).map(cells=>cells.map(segment=>segment.text).join('')).find(line=>/refused|saved/u.test(line))!;
  assert.match(row({note:'refused: still running'}),/^ · refused/u);
  assert.match(row({toast:'saved'}),/^ ✓ saved/u);
  assert.match(row({toast:'saved',note:'refused'}),/^ ✓ saved/u);
});

test('FE-048: the commands that are pages are the owner\'s list, and the quick ones stay cards',()=>{
  for(const name of ['help','diff','memory','notes','tasks','library','model','provider','resume','fork','history','settings','permissions'])assert.ok(COMMAND_PAGES.has(name),name);
  for(const name of ['effort','plan','rename','clear','copy','export','undo','queue','busy','retry'])assert.equal(COMMAND_PAGES.has(name),false,name);
});
