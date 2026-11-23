/*
 * Stage 7.10d (mockup PANELS.setup; owner 03/10 «foglio a schede + Check vero, a costo minimo», «stesso foglio anche al primo
 * avvio»): the setup sheet draws the approved mockup's four golden frames (fixtures/panels-golden.json) from the product's
 * words, and each tab's Enter, submit or r is one action for the app — the key leaving the sheet with it, the field emptied.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {panelHeight,panelKey,panelRows,type SegRow} from '../../src/tui/panel/sheet.ts';
import {sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {setupSheet,type SetupState} from '../../src/tui/panel/setup-sheet.ts';
import {t} from '../../src/i18n/index.ts';

const golden=JSON.parse(readFileSync(new URL('./fixtures/panels-golden.json',import.meta.url),'utf8')) as {frames:Record<string,{height:number;footRows:number;text:string[];style:string[]}>};
const text=(rows:SegRow[])=>rows.map(row=>row.map(s=>s.text).join('').replace(/\s+$/u,''));
const style=(rows:SegRow[])=>rows.map(row=>{let x=0;const out:Array<{start:number;end:number;roles:string}>=[];
  for(const s of row){const n=[...s.text].length;const roles=[...s.roles].sort().join(',');const last=out.at(-1);
    if(roles&&n){if(last&&last.roles===roles&&last.end===x)last.end=x+n;else out.push({start:x,end:x+n,roles});}x+=n;}
  return out.map(o=>`${o.start}+${o.end-o.start}:${o.roles}`).join(' ');});
const fitTo=(rows:SegRow[],w:number)=>rows.map(row=>{const out:SegRow=[];let n=0;for(const s of row){if(n>=w)break;const part=[...s.text].slice(0,w-n).join('');if(part)out.push({...s,text:part});n+=[...part].length;}return out;});

/* the mockup's setup (PANELS.setup) */
const MOCK:SetupState={
  providers:[{id:'openrouter',label:'OpenRouter',local:false},{id:'anthropic',label:'Anthropic',local:false},{id:'openai',label:'OpenAI',local:false},{id:'ollama',label:'Ollama',local:true}],
  provider:'openrouter',
  key:{kind:'ask',provider:'OpenRouter',help:t('panel.setup.keyHelp',{store:'Windows Credential Manager'})},
  models:[{id:'openrouter:qwen3-coder',name:'qwen3-coder',desc:'262k context · $0.22 / $0.95 per M · good with tools'},{id:'openrouter:glm-5.3-flash',name:'glm-5.3-flash',desc:'200k context · $0.10 / $0.40 per M · fast'},{id:'openrouter:deepseek-v4',name:'deepseek-v4',desc:'128k context · $0.27 / $1.10 per M'}],
  current:'openrouter:qwen3-coder',
  checks:[{label:t('panel.setup.check.key'),state:'ok',detail:'312 ms'},{label:t('panel.setup.check.model'),state:'ok',detail:'first token in 0.8 s'},{label:t('panel.setup.check.tools'),state:'ok',detail:'read a file, ran a command'}],
  result:{ready:true},
};
const TABS=[['cmd-setup-tab1-1-provider',0],['cmd-setup-tab2-2-key',1],['cmd-setup-tab3-3-model',2],['cmd-setup-tab4-4-check',3]] as const;
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  for(const [name,tab] of TABS){
    test(`${name} at ${size}: the setup tab is the mockup's`,()=>{
      const frame=golden.frames[`${size}/${name}`]!;const sheet=setupSheet(MOCK,{tab});
      /* the one approved difference (owner 03/10): the key field names its provider, «API key» → «OpenRouter API key» */
      const expected=tab===1?frame.text.map(line=>line.replace('API key'+' '.repeat(11),'OpenRouter API key')):frame.text;
      const H=panelHeight(sheet.panel,w,frame.height,frame.footRows,0);
      assert.equal(H,frame.text.length);
      const rows=fitTo(panelRows(sheet.panel,w,H),w);
      assert.deepEqual(text(rows),expected);assert.deepEqual(style(rows),frame.style);
    });
  }
}

const step=(sheet:SheetState,name:string)=>sheetStep(sheet,panelKey(sheet.panel,{name}));
const type=(sheet:SheetState,value:string)=>{let current=sheet;for(const ch of value)current=step(current,ch).sheet!;return current;};

test('Tab moves freely and says so; Enter on a provider or a model is one action; the sheet stays open',()=>{
  let out=step(setupSheet(MOCK),'Tab');
  assert.deepEqual(out.action,{kind:'setupTab',tab:1});assert.equal(out.sheet!.panel.tab,1);
  out=step(setupSheet(MOCK),'ArrowDown');out=step(out.sheet!,'Enter');
  assert.deepEqual(out.action,{kind:'setupProvider',id:'anthropic'});assert.ok(out.sheet);
  out=step(setupSheet(MOCK,{tab:2}),'ArrowDown');out=step(out.sheet!,'Enter');
  assert.deepEqual(out.action,{kind:'setupModel',id:'openrouter:glm-5.3-flash'});
  assert.equal(step(setupSheet(MOCK,{tab:3}),'r').action,null,'no tools check unless offered');
  assert.deepEqual(step(setupSheet({...MOCK,tools:true},{tab:3}),'r').action,{kind:'setupTools'});
  assert.deepEqual(step(setupSheet({...MOCK,engineDown:true,modelsNotice:'Ollama is not running'},{tab:2}),'r').action,{kind:'setupModels'});
});

test('the key leaves the sheet with its action and the field is emptied at once; nothing typed is «next»',()=>{
  const typed=type(setupSheet(MOCK,{tab:1}),'sk-or-secret');
  assert.match(text(panelRows(typed.panel,120,20)).join('\n'),/OpenRouter API key +••••••••••••▍/u,'masked while typed');
  const out=step(typed,'Enter');
  assert.deepEqual(out.action,{kind:'setupKey',use:'typed',key:'sk-or-secret'});
  assert.doesNotMatch(JSON.stringify(out.sheet!.panel.tabs[1]),/sk-or-secret/u,'nothing of the key stays on the sheet');
  assert.deepEqual(step(setupSheet(MOCK,{tab:1}),'Enter').action,{kind:'setupKey',use:'next'});
});

test('an environment key is used only on a yes; OpenRouter offers the browser first; a sign-in takes a code or tries again',()=>{
  const consent=setupSheet({...MOCK,key:{kind:'ask',provider:'OpenRouter',help:'h',consent:{variable:'OPENROUTER_API_KEY'}}},{tab:1});
  assert.match(text(panelRows(consent.panel,120,20)).join('\n'),/Environment key +No \(recommended\) +Use OPENROUTER_API_KEY/u);
  assert.deepEqual(step(consent,'Enter').action,{kind:'setupKey',use:'next',declined:true},'No is the default');
  assert.deepEqual(step(step(consent,'ArrowRight').sheet!,'Enter').action,{kind:'setupKey',use:'environment'});
  const browser=setupSheet({...MOCK,key:{kind:'ask',provider:'OpenRouter',help:'h',browser:true}},{tab:1});
  assert.deepEqual(step(browser,'Enter').action,{kind:'setupKey',use:'browser'});
  const pasted=type(step(step(step(browser,' ').sheet!,'ArrowDown').sheet!,'x').sheet!,'yz');
  assert.deepEqual(step(pasted,'Enter').action,{kind:'setupKey',use:'typed',key:'xyz'});
  const code=type(setupSheet({...MOCK,key:{kind:'login',lines:['Opened the browser.','https://openrouter.ai/auth'],foot:'waiting',paste:true,retry:false}},{tab:1}),'c0de');
  assert.deepEqual(step(code,'Enter').action,{kind:'setupKey',use:'code',key:'c0de'});
  assert.deepEqual(step(setupSheet({...MOCK,key:{kind:'login',lines:['x'],foot:'failed',paste:false,retry:true}},{tab:1}),'Enter').action,{kind:'setupKey',use:'retry'});
  const none=setupSheet({...MOCK,key:{kind:'none',text:'Ollama runs on this computer: no key needed.'}},{tab:1});
  const moved=step(none,'ArrowDown');
  assert.equal(moved.action,null);assert.equal((moved.sheet!.panel.tabs[1]!.body as any).sel,0,'a form of no fields does not move');
  assert.deepEqual(step(none,'Enter').action,{kind:'setupKey',use:'next'});
});

test('before a provider or a model the tabs say what comes first; a long list gets «/ search»',()=>{
  const empty:SetupState={...MOCK,provider:null,key:null,models:null,checks:null,result:null};
  assert.match(text(panelRows(setupSheet(empty,{tab:1}).panel,80,14)).join('\n'),/Choose a provider first\./u);
  assert.match(text(panelRows(setupSheet(empty,{tab:2}).panel,80,14)).join('\n'),/Choose a provider first\./u);
  assert.match(text(panelRows(setupSheet(empty,{tab:3}).panel,80,14)).join('\n'),/Choose a model first\./u);
  assert.match(text(panelRows(setupSheet({...MOCK,models:null},{tab:2}).panel,80,14)).join('\n'),/Reading the models…/u);
  const many={...MOCK,providers:Array.from({length:9},(_,i)=>({id:`p${i}`,label:`P${i}`,local:false}))};
  assert.match(text(panelRows(setupSheet(many).panel,120,20)).join('\n'),/\/ search/u);
  assert.doesNotMatch(text(panelRows(setupSheet(MOCK).panel,120,20)).join('\n'),/\/ search/u);
  /* a name that already says local is not told twice */
  const named=text(panelRows(setupSheet({...MOCK,providers:[{id:'ollama',label:'Ollama Local',local:true},{id:'llamacpp',label:'Local engine (llama.cpp)',local:true},{id:'lmstudio',label:'LM Studio',local:true}]}).panel,120,20)).join('\n');
  assert.match(named,/Ollama · no key/u);assert.match(named,/Local engine \(llama\.cpp\) · no key/u);assert.match(named,/LM Studio · no key/u);
});

test('what was moved or typed in a tab stays when the app redraws the sheet',()=>{
  const moved=step(setupSheet(MOCK,{tab:2}),'ArrowDown').sheet!;
  const again=setupSheet({...MOCK,current:'openrouter:deepseek-v4'},{tab:2,prev:moved.panel});
  assert.equal((again.panel.tabs[2]!.body as any).sel,1);
  const typed=type(setupSheet(MOCK,{tab:1}),'abc');
  const redrawn=setupSheet({...MOCK,key:{kind:'ask',provider:'OpenRouter',help:'h',testing:true}},{tab:1,prev:typed.panel});
  assert.equal((redrawn.panel.tabs[1]!.body as any).fields[0].value,'abc');
  assert.match(text(panelRows(redrawn.panel,120,20)).join('\n'),/Testing the key…/u);
  /* the field the person moved to stays selected too */
  const consent={...MOCK,key:{kind:'ask' as const,provider:'OpenRouter',help:'h',consent:{variable:'OPENROUTER_API_KEY'}}};
  const down=step(setupSheet(consent,{tab:1}),'ArrowDown').sheet!;
  assert.equal((setupSheet({...consent,key:{...consent.key,testing:true}},{tab:1,prev:down.panel}).panel.tabs[1]!.body as any).sel,1);
});

/* 14/10/2026 (owner: «the Z.AI key only to the address you chose», «Te lo chiede quando metti la chiave»): on the Key tab the Z.AI
   address is the first field, the plan preselected; whatever leaves the tab (a typed key, Next) carries the address chosen. */
test('Z.AI: the address is asked first on the Key tab, the plan first, and it leaves with the key',()=>{
  const options=['GLM Coding Plan (Recommended)','pay-as-you-go balance','GLM Coding Plan (China)','pay-as-you-go balance (China)'];
  const zai={...MOCK,provider:'zai',key:{kind:'ask' as const,provider:'Z.AI',help:'h',address:{options}}};
  const sheet=setupSheet(zai,{tab:1});
  assert.match(text(panelRows(sheet.panel,160,20)).join('\n'),/Z\.AI address +GLM Coding Plan \(Recommended\)/u);
  assert.deepEqual(step(sheet,'Enter').action,{kind:'setupKey',use:'next',address:0});
  const china=step(step(sheet,'ArrowRight').sheet!,'ArrowRight').sheet!;
  const typed=type(step(china,'ArrowDown').sheet!,'zai-secret');
  assert.deepEqual(step(typed,'Enter').action,{kind:'setupKey',use:'typed',key:'zai-secret',address:2});
  assert.deepEqual(step(setupSheet(MOCK,{tab:1}),'Enter').action,{kind:'setupKey',use:'next'},'no address for another provider');
});
