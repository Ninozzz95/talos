/*
 * Stage 7.11 (mockup PANELS.settings; owner 03/10): the Settings sheet draws the approved mockup's four golden frames from the
 * mockup's content — Status and Usage as measured rows, Context's grid from the parts of the window, Config as a form — and c
 * copies the status, Enter on Config saves. The product's own rows (no update rows until stage 9, the existing settings after
 * the mockup's, «Italiano · coming») are the app's data, not the sheet's.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {S,panelKey,panelRows,type FormField,type SegRow} from '../../src/tui/panel/sheet.ts';
import {sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {barSegs,barWidth,settingsSheet,tokensText,type SettingsState} from '../../src/tui/panel/settings-sheet.ts';
import {assertGolden} from './golden-sheet.ts';

const golden=JSON.parse(readFileSync(new URL('./fixtures/panels-golden.json',import.meta.url),'utf8')) as {frames:Record<string,{height:number;footRows:number;text:string[];style:string[]}>};
const text=(rows:SegRow[])=>rows.map(row=>row.map(s=>s.text).join('').replace(/\s+$/u,''));

const plain=(value:string)=>[S(value)];
/* the mockup's settings (PANELS.settings) */
const CONFIG:FormField[]=[
  {label:'Mouse',type:'bool',value:true,help:'Click, wheel and drag-to-select inside TALOS. Off: your terminal selects as before.'},
  {label:'View',type:'choice',value:'fullscreen',options:['fullscreen','classic']},
  {label:'Thinking',type:'choice',value:'collapsed',options:['collapsed','expanded','hidden']},
  {label:'Tool rows',type:'choice',value:'grouped',options:['grouped','one per call']},
  {label:'Reduce motion',type:'bool',value:false},
  {label:'Notify when done',type:'choice',value:'bell',options:['off','bell','desktop']},
  {label:'Updates',type:'choice',value:'automatic',options:['automatic','notify','off']},
  {label:'Update channel',type:'choice',value:'stable',options:['stable','preview']},
  {label:'Editor',type:'text',value:'code --wait'},
  {label:'Language',type:'choice',value:'English',options:['English','Italiano']},
];
const MOCK:SettingsState={
  status:[
    {label:'TALOS',value:plain('0.5.1 · Node 24.18 · Windows 11 · Windows Terminal')},
    {label:'Conversation',value:plain('Flaky login test · 48 messages · 7f3a2c')},
    {label:'Project',value:plain('~/projects/shop-api · main · 3 files changed')},
    {label:'Model',value:plain('qwen3-coder via OpenRouter · effort medium')},
    {label:'Mode',value:plain('asks before edits')},
    {label:'Agents',value:plain('0 this session')},
    {label:'MCP',value:[S('github ✓','ok'),S(' · '),S('linear needs sign-in','warn'),S(' · '),S('sqlite ✓','ok')]},
    {label:'Memory',value:plain('TALOS.md (project) · 2 entries about you')},
    {label:'Updates',value:[S('0.5.1 · up to date','ok'),S(' · automatic · stable channel · checked 2 h ago','dim')]},
    {label:'Fallback',value:plain('0.5.0 kept · talos update --rollback')},
  ],
  usage:[
    {label:'Conversation',value:plain('↑ 18.4k in · ↓ 6.1k out · 41.0k cached')},
    {label:'Cost',value:[S('$0.031','b'),S('  OpenRouter prices · cached at 10%','faint')]},
    {label:'Context',value:w=>[...barSegs(23,barWidth(w)),S('  23% of 262k','dim')]},
    {label:'Compactions',value:plain('none yet · automatic at 85%')},
    {label:'Per turn',value:[S('▁▂▃▅▂▁▇▃▂▁▂▄','acc'),S('  last 12 turns','faint')]},
    null,
    {label:'Today',value:plain('214k tokens · $0.19 in this project')},
    {label:'By model',value:[S('qwen3-coder 92%','dim'),S(' · ','faint'),S('glm-5.3-flash 8%','dim')]},
  ],
  context:{window:262_000,used:59_200,compactAt:85,hint:'Messages are the biggest slice: /compact frees most of it.',parts:[
    {label:'System prompt',tokens:3_100,role:'dim'},{label:'Tools',tokens:9_400,role:'acc'},{label:'MCP tools',tokens:6_200,role:'warn'},
    {label:'Memory files',tokens:1_800,role:'ok'},{label:'Messages',tokens:38_700,role:'err'}]},
  config:CONFIG,
};
const TABS=[['cmd-status-tab1-status',0],['cmd-status-tab2-usage',1],['cmd-status-tab3-context',2],['cmd-status-tab4-config',3]] as const;
for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  for(const [name,tab] of TABS){
    /* owner 03/10: at 80 columns Config's row of keys goes on two rows, where the mockup cut «esc close» (golden-sheet.ts) */
    test(`${name} at ${size}: the Settings tab is the mockup's`,()=>assertGolden(settingsSheet(MOCK,{tab}).panel,w,golden.frames[`${size}/${name}`]!));
  }
}

const step=(sheet:SheetState,name:string)=>sheetStep(sheet,panelKey(sheet.panel,{name}));

test('each command opens its own tab; c copies the status; Enter on Config saves what is on the form',()=>{
  assert.equal(settingsSheet(MOCK,{tab:'context'}).panel.tab,2);
  const copied=step(settingsSheet(MOCK),'c');
  assert.equal(copied.action?.kind,'copy');
  assert.match((copied.action as any).text,/^TALOS {9}0\.5\.1 · Node 24\.18/u);assert.match((copied.action as any).text,/MCP {11}github ✓ · linear needs sign-in · sqlite ✓/u);
  let config=step(settingsSheet(MOCK,{tab:'config'}),'ArrowDown').sheet!;config=step(config,'ArrowRight').sheet!;
  assert.deepEqual(step(config,'Enter').action,{kind:'settingsSave',values:{Mouse:true,View:'classic',Thinking:'collapsed','Tool rows':'grouped','Reduce motion':false,'Notify when done':'bell',Updates:'automatic','Update channel':'stable',Editor:'code --wait',Language:'English'}});
  assert.equal(step(settingsSheet(MOCK,{tab:'usage'}),'c').action,null,'c copies on Status only');
});

test('a change on Config stays while the other tabs fill in; an option not offered yet is faint and skipped',()=>{
  const changed=step(step(settingsSheet({...MOCK,status:null},{tab:'config'}),'ArrowDown').sheet!,'ArrowRight').sheet!;
  const redrawn=settingsSheet(MOCK,{tab:3,prev:changed.panel});
  assert.equal((redrawn.panel.tabs[3]!.body as any).fields[1].value,'classic');
  const language:FormField={label:'Language',type:'choice',value:'English',options:['English','Italiano · coming'],off:['Italiano · coming']};
  const sheet=settingsSheet({...MOCK,config:[language]},{tab:'config'});
  assert.equal(step(sheet,'ArrowRight').sheet!.panel.tabs[3]!.body.kind==='form'&&(step(sheet,'ArrowRight').sheet!.panel.tabs[3]!.body as any).fields[0].value,'English');
  const row=panelRows(sheet.panel,120,14).find(r=>r.some(s=>s.text.includes('Italiano')))!;
  assert.deepEqual(row.find(s=>s.text.includes('Italiano'))!.roles,['faint']);
  assert.equal(row.find(s=>s.text.includes('Italiano'))!.action,undefined,'not a click target');
});

test('without the parts the grid shows what is used and free; the parts estimated say so; tokens as the legend writes them',()=>{
  const rows=text(panelRows(settingsSheet({...MOCK,context:{window:262_000,used:59_200,compactAt:85,parts:null}},{tab:'context'}).panel,120,20)).join('\n');
  assert.match(rows,/■ Used +59\.2k +23%/u);assert.match(rows,/■ Free +202\.8k +77%/u);
  const estimated=text(panelRows(settingsSheet({...MOCK,context:{...MOCK.context!,estimated:true}},{tab:'context'}).panel,120,20)).join('\n');
  assert.match(estimated,/compacts by itself at 85% · parts estimated/u);
  assert.equal(tokensText(950),'950');assert.equal(tokensText(41_000),'41.0k');
  /* a part under half a percent still has its cell, so it is never missing from the grid */
  const tiny=panelRows(settingsSheet({...MOCK,context:{...MOCK.context!,parts:[{label:'Memory files',tokens:500,role:'ok'}]}},{tab:'context'}).panel,120,20);
  assert.ok(tiny.some(row=>row.some(segment=>segment.text==='■ '&&segment.roles.includes('ok'))),'one ok cell');
  assert.match(text(panelRows(settingsSheet({status:null,usage:null,context:null,config:null}).panel,80,12)).join('\n'),/Reading…/u);
});
