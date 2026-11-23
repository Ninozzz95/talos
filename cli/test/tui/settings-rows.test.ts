/*
 * Stage 7.11 (mockup PANELS.settings; owner 03/10): the product's Status, Usage and Context rows. Given the mockup's facts they
 * read as the mockup does; a figure nobody reported says so; the kernel's parts of the window are read only when all are there.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {contextOf,homePath,osName,sparkline,statusLines,terminalName,usageLines,type StatusFacts} from '../../src/tui/settings-rows.ts';
import {buildContextStatus} from '../../src/runtime/context-status.ts';
import {compactionRatios,DEFAULT_COMPACT_AT_TOKENS,inputLimitOf} from '../../src/runtime/compaction-cap.ts';

const textOf=(lines:ReturnType<typeof statusLines>,width=120)=>lines.map(line=>line?`${line.label} | ${(typeof line.value==='function'?line.value(width):line.value).map(s=>s.text).join('')}`:'');

const FACTS:StatusFacts={version:'0.5.1',node:'24.18',os:'Windows 11',terminal:'Windows Terminal',
  conversation:{name:'Flaky login test',messages:48,id:'7f3a2c91e0'},project:{path:'~/projects/shop-api',branch:'main',changed:3},
  model:{name:'qwen3-coder',provider:'OpenRouter',effort:'medium'},mode:'default',agents:0,
  mcp:[{name:'github',state:'ok'},{name:'linear',state:'signin'},{name:'sqlite',state:'ok'}],memory:{files:['TALOS.md'],entries:2},extra:[]};

test('with the mockup\'s facts the Status rows read as the mockup\'s, in its colours',()=>{
  const lines=statusLines(FACTS);
  assert.deepEqual(textOf(lines),[
    'TALOS | 0.5.1 · Node 24.18 · Windows 11 · Windows Terminal','Conversation | Flaky login test · 48 messages · 7f3a2c',
    'Project | ~/projects/shop-api · main · 3 files changed','Model | qwen3-coder via OpenRouter · effort medium','Mode | asks before edits',
    'Agents | 0 this session','MCP | github ✓ · linear needs sign-in · sqlite ✓','Memory | TALOS.md (project) · 2 entries about you']);
  assert.deepEqual(lines[6]!.value instanceof Function?[]:(lines[6]!.value as any[]).map(s=>s.roles.join(',')),['ok','','warn','','ok']);
  const states=statusLines({...FACTS,mcp:[{name:'a',state:'failed'},{name:'b',state:'unchecked'}]})[6]!;
  assert.deepEqual((states.value as any[]).map(s=>[s.text,s.roles.join(',')]),[['a not answering','err'],[' · ',''],['b not checked','dim']]);
  const bare=textOf(statusLines({...FACTS,terminal:null,conversation:null,project:{path:'C:/w',branch:null,changed:null},model:null,mode:'plan',mcp:[],memory:{files:[],entries:null},extra:[{label:'Sandbox',value:'verified'}]}));
  assert.deepEqual(bare,['TALOS | 0.5.1 · Node 24.18 · Windows 11','Conversation | none yet: it starts with your first message','Project | C:/w','Model | none chosen · /setup',
    'Mode | plans first · changes nothing until you approve','Agents | 0 this session','MCP | no servers','Memory | no TALOS.md','Sandbox | verified']);
});

test('Usage: the conversation as measured, the project record when there is one; nothing invented',()=>{
  const snapshot={inputTokens:18_400,outputTokens:6_100,cachedTokens:41_000,windowTokens:262_000,percent:23,estimated:false,costUsd:0.031,costSource:'list-price',local:false,compactions:0};
  const lines=usageLines(snapshot,{priceSource:'OpenRouter',compactAt:85,record:{perTurn:[0,1,2,4,1,0,7,2,1,0,1,3],today:{tokens:214_000,usd:0.19},byModel:[{model:'qwen3-coder',share:0.92},{model:'glm-5.3-flash',share:0.08}]}});
  assert.deepEqual(textOf(lines),['Conversation | ↑ 18.4k in · ↓ 6.1k out · 41.0k cached','Cost | $0.031  OpenRouter prices',
    'Context | ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  23% of 262k','Compactions | none yet · automatic at 85%','Per turn | ▁▂▃▅▂▁█▃▂▁▂▄  last 12 turns','',
    'Today | 214k tokens · $0.19 in this project','By model | qwen3-coder 92% · glm-5.3-flash 8%']);
  assert.deepEqual(textOf(usageLines(null,{priceSource:null,compactAt:null,record:null})),['Conversation | not reported yet','Cost | unknown: no price source for this model','Context | window unknown','Compactions | none yet']);
  assert.match(textOf(usageLines({...snapshot,local:true,costUsd:null},{priceSource:null,compactAt:85,record:null}))[1]!,/local engine, no cost/u);
  assert.match(textOf(usageLines({...snapshot,costSource:'provider-reported'},{priceSource:'OpenRouter',compactAt:85,record:null}))[1]!,/as the provider reported it/u);
  assert.equal(sparkline([0,4,8]),'▁▅█');
  assert.doesNotMatch(textOf(usageLines(snapshot,{priceSource:null,compactAt:null,record:{perTurn:[5],today:null,byModel:[]}})).join('\n'),/Per turn/u,'one turn is not a trend');assert.equal(sparkline([0,0]),'▁▁');
});

test('Context: the kernel\'s parts only when all are there, estimated when it says so; the hint names the biggest slice',()=>{
  const snapshot={measurement:{tokens:{inputTokens:59_200,windowTokens:262_000,responseReserve:8_000,method:'provider',exact:true}},settings:{auto:true,triggerRatio:0.85}};
  const plain=contextOf(buildContextStatus({sessionId:'s',snapshot,sessionUsage:null}));
  /* 85 % of the input limit (240,900) is 204,765 tokens: 78.1 % of the 262k window the row names (s67 b, 14/10/2026) */
  assert.deepEqual({...plain,hint:plain?.hint??null},{window:262_000,used:59_200,compactAt:78.1,parts:null,hint:null});
  const parti={sistema:3_100,strumenti:9_400,strumentiMcp:6_200,memoria:1_800,messaggi:38_700,esatto:false};
  const parted=contextOf(buildContextStatus({sessionId:'s',snapshot:{...snapshot,parti},sessionUsage:null}))!;
  assert.deepEqual(parted.parts!.map(part=>[part.label,part.tokens,part.role]),[['System prompt',3_100,'dim'],['Tools',9_400,'acc'],['MCP tools',6_200,'warn'],['Memory files',1_800,'ok'],['Messages',38_700,'err']]);
  assert.equal(parted.estimated,true);assert.match(String(parted.hint),/Messages are the biggest slice/u);
  const half=buildContextStatus({sessionId:'s',snapshot:{...snapshot,parti:{sistema:1}},sessionUsage:null});
  assert.equal(half.parts,undefined,'a partial set is not shown');
  assert.equal(contextOf(null),null);
});

test('the environment as the terminal and the system say it; the home folder as ~',()=>{
  assert.equal(osName('win32','10.0.26200'),'Windows 11');assert.equal(osName('win32','10.0.19045'),'Windows 10');assert.equal(osName('darwin','24.0.0'),'macOS');
  assert.equal(terminalName({WT_SESSION:'x'}),'Windows Terminal');assert.equal(terminalName({TERM_PROGRAM:'vscode'}),'VS Code');assert.equal(terminalName({}),null);
  assert.equal(homePath('C:\\Users\\Ann\\projects\\shop-api','C:\\Users\\Ann'),'~/projects/shop-api');assert.equal(homePath('D:/work','C:\\Users\\Ann'),'D:/work');
});

/*
 * Acceptance s67 (b), 14/10/2026, on the built CLI: a 1,000,000-token window, summarised at 200,000 tokens at the latest
 * (798d78e42) — and the Context tab read «1000k window · … used (2%) · compacts by itself at 24%»: 24 % of the INPUT LIMIT
 * (the window less the reply's reserve and the margin), written beside a window and a «used» share OF THE WINDOW. Read as the
 * row reads, 240,000 tokens. The threshold is written as a share of the window the row names, like «used», never past it.
 */
test('Context: «compacts by itself at N%» is a share of the window the row names (the 1M window: at most 200,000 tokens)',()=>{
  /* the ratio the CLI gives the engine for this window (compaction-cap.ts, the default cap) */
  const {triggerRatio}=compactionRatios({inputLimit:inputLimitOf({windowTokens:1_000_000,responseReserve:16_384,method:'heuristic'}),compactAtTokens:DEFAULT_COMPACT_AT_TOKENS,currentTarget:null});
  const huge={measurement:{tokens:{inputTokens:16_500,windowTokens:1_000_000,responseReserve:16_384,method:'heuristic',exact:false}},settings:{auto:true,triggerRatio}};
  const status=buildContextStatus({sessionId:'s',snapshot:huge,sessionUsage:null});
  assert.ok(status.budget!.triggerTokens<=200_000,'the premise: the engine compacts at 200,000 tokens at the latest');
  const shown=contextOf(status)!;
  assert.ok(shown.compactAt*shown.window/100<=200_000,`the row says ${shown.compactAt}% of ${shown.window} = ${shown.compactAt*shown.window/100} tokens`);
  assert.equal(shown.compactAt,Math.floor(status.budget!.triggerTokens/1_000_000*1000)/10);
  /* the same share on the Usage tab's «automatic at N%», beside «N% of <window>» */
  const usage=usageLines({inputTokens:16_500,outputTokens:340,cachedTokens:null,percent:1.65,windowTokens:1_000_000,compactions:0,costUsd:null,costSource:null,local:true,estimated:false} as any,{priceSource:null,compactAt:shown.compactAt,record:null});
  assert.ok(usage.some(line=>line&&typeof line.value!=='function'&&JSON.stringify(line.value).includes(`automatic at ${shown.compactAt}%`)));
});
