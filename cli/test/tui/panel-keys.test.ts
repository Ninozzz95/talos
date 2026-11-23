/*
 * Stage 7.2: the sheet's keys and clicks, as the approved mockup's `panelKey` and `panelClick` (MOCKUP-FASE-UI-2026-10-01.html:
 * 461-497) — a pure step that returns the sheet after the key and the effect the command carries out.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {askDelete,one,panelClick,panelKey,startEdit,type Panel,type PanelStep} from '../../src/tui/panel/sheet.ts';

const list=(extra={}):Panel=>one('Memory','',{kind:'list',sel:0,enter:'open',filterable:true,keys:[{key:'n',label:'new',adds:true},{key:'space',label:'toggle'},{key:'d',label:'delete'}],
  items:[{label:'Use pnpm'},{label:'Vitest units'},{label:'Problem json'}],...extra});
const keys=(panel:Panel,...names:string[])=>names.reduce<PanelStep>((step,name)=>panelKey(step.panel,{name}),{panel,effect:{kind:'none'}});
const sel=(panel:Panel)=>(panel.tabs[panel.tab]!.body as any).sel;

test('a list moves within its items, Enter chooses, a bound key acts, Esc closes',()=>{
  assert.equal(sel(keys(list(),'ArrowDown','ArrowDown','ArrowDown').panel),2,'↓ stops at the last');
  assert.equal(sel(keys(list(),'ArrowUp').panel),0,'↑ stops at the first');
  assert.equal(sel(keys(list(),'PageDown').panel),2);
  assert.deepEqual(keys(list(),'ArrowDown','Enter').effect,{kind:'enter',index:1,item:{label:'Vitest units'}});
  assert.deepEqual(keys(list(),' ').effect,{kind:'key',key:'space',index:0,item:{label:'Use pnpm'}},'space is the «space» key');
  assert.deepEqual(keys(list({items:[]}),'n').effect,{kind:'key',key:'n',index:null,item:null},'«n new» works on an empty list');
  assert.deepEqual(keys(list({items:[]}),' ').effect,{kind:'none'},'«space» needs an item');
  assert.deepEqual(keys(list(),'Escape').effect,{kind:'close'});
  assert.deepEqual(keys(list({items:[]}),'Enter').effect,{kind:'none'},'Enter on an empty list chooses nothing');
  assert.equal(sel(keys(list(),'ArrowDown','ArrowDown','/','u').panel),0,'typing a filter starts from the first match');
});

test('/ filters as you type; Enter keeps the filter, the first Esc clears it, the next closes',()=>{
  const typed=keys(list(),'/','v','i');
  assert.equal((typed.panel.tabs[0]!.body as any).filter,'vi');
  assert.deepEqual(keys(typed.panel,'Enter','Enter').effect,{kind:'enter',index:0,item:{label:'Vitest units'}},'Enter on the filtered list chooses what it shows');
  const kept=keys(typed.panel,'Enter');
  const cleared=keys(kept.panel,'Escape');assert.equal((cleared.panel.tabs[0]!.body as any).filter,'');assert.deepEqual(cleared.effect,{kind:'none'});
  assert.deepEqual(keys(cleared.panel,'Escape').effect,{kind:'close'});
  assert.equal((keys(list(),'/','x','Escape').panel.tabs[0]!.body as any).filter,'','Esc while typing the filter clears it');
});

test('the edit row takes text, Enter saves it as an effect, Esc drops it; «d again» deletes, any other key keeps',()=>{
  const editing=startEdit(list(),'Rename:','Use',false);
  const step=keys(editing,' ','p','n','x','Backspace','p','m','Enter');
  assert.deepEqual(step.effect,{kind:'edited',value:'Use pnpm'});assert.equal(step.panel.edit,null);
  assert.deepEqual(keys(startEdit(list(),'New:'),'a','Escape').effect,{kind:'none'});
  const asked=askDelete(keys(list(),'ArrowDown').panel);
  assert.deepEqual(keys(asked,'d').effect,{kind:'delete',index:1,item:{label:'Vitest units'}});
  const kept=keys(asked,'x');assert.deepEqual(kept.effect,{kind:'none'});assert.equal(kept.panel.confirmDel,null);
});

test('tabs: Tab and Shift+Tab, ←/→ when the list has no ←/→ of its own',()=>{
  const two:Panel={title:'Settings',tab:0,tabs:[{name:'Status',body:{kind:'info',lines:()=>[]}},{name:'Usage',body:{kind:'info',lines:()=>[]}},{name:'Config',body:{kind:'list',sel:0,items:[{label:'a'}]}}]};
  assert.equal(keys(two,'Tab').panel.tab,1);
  assert.equal(panelKey(two,{name:'Tab',shift:true}).panel.tab,2);
  assert.equal(keys(two,'ArrowRight','ArrowRight').panel.tab,2);
  assert.equal(keys({...two,tab:2},'ArrowLeft').panel.tab,1);
  assert.deepEqual(keys(list({lr:true}),'ArrowRight').effect,{kind:'lr',delta:1});
});

test('a form: ↑/↓ wrap, text edits, space toggles, ←/→ cycle a choice and stop a slider, Enter submits, Ctrl+C is the other button',()=>{
  const form=one('Export','',{kind:'form',sel:0,submit:'Save to file',alt:'Copy to clipboard',fields:[
    {label:'Format',type:'choice',options:['Markdown','JSON','JSONL'],value:'Markdown'},{label:'Tool output',type:'bool',value:false},
    {label:'Effort',type:'slider',options:['low','medium','high'],value:'high'},{label:'File',type:'text',value:'a.md'}]});
  assert.equal(sel(keys(form,'ArrowUp').panel),3,'↑ wraps');
  assert.deepEqual(keys(form,'ArrowLeft').effect,{kind:'change',field:0,value:'JSONL'},'a choice wraps');
  assert.deepEqual(keys(form,'ArrowDown',' ').effect,{kind:'change',field:1,value:true});
  assert.deepEqual(keys(form,'ArrowDown','ArrowDown','ArrowRight').effect,{kind:'change',field:2,value:'high'},'a slider stops at its end');
  assert.deepEqual(keys(form,'ArrowUp','x').effect,{kind:'change',field:3,value:'a.mdx'});
  assert.deepEqual(keys(form,'Enter').effect,{kind:'submit'});
  assert.deepEqual(panelKey(form,{name:'c',ctrl:true}).effect,{kind:'alt'});
  assert.deepEqual(keys(form,'c').effect,{kind:'none'},'a plain c is not the other button');
});

test('clicks: a key of the key row, a tab, an item (a second click is its Enter), a field, an option, the other button',()=>{
  assert.deepEqual(panelClick(list(),'pkey:Escape').effect,{kind:'close'});
  const tabbed:Panel={title:'M',tab:0,tabs:[{name:'A',body:{kind:'info',lines:()=>[]}},{name:'B',body:{kind:'info',lines:()=>[]}}]};
  assert.equal(panelClick(tabbed,'ptab:1').panel.tab,1);
  const first=panelClick(list(),'pitem:2');assert.equal(sel(first.panel),2);assert.deepEqual(first.effect,{kind:'none'});
  assert.deepEqual(panelClick(first.panel,'pitem:2').effect,{kind:'enter',index:2,item:{label:'Problem json'}});
  const form=one('Export','',{kind:'form',sel:0,alt:'Copy',fields:[{label:'Format',type:'choice',options:['Markdown','JSON'],value:'Markdown'},{label:'Tool output',type:'bool',value:false}]});
  assert.equal(sel(panelClick(form,'pfield:1').panel),1);
  assert.deepEqual(panelClick(form,'pfopt:0:1').effect,{kind:'change',field:0,value:'JSON'});
  assert.deepEqual(panelClick(form,'pfopt:1:t').effect,{kind:'change',field:1,value:true});
  assert.deepEqual(panelClick(panelClick(form,'pfopt:1:t').panel,'pfopt:1:t').effect,{kind:'change',field:1,value:false},'a second click turns it back off');
  assert.deepEqual(panelClick(form,'palt').effect,{kind:'alt'});
  assert.deepEqual(panelClick(form,'pfopt:0:9').effect,{kind:'none'},'an option that is not there');
});
