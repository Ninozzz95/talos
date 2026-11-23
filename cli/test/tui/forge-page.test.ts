/* C9 of the redesign: Forge as a page. The switch, the declared risk and uses, and each key the forge's own act. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {forgeSheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {previousRevision,type ForgeData,type ForgeDetail} from '../../src/tui/panel/forge-page.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {panelKey} from '../../src/tui/panel/sheet.ts';

const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('')).join('\n');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const detail=(id:string,fields:Partial<ForgeDetail>):ForgeDetail=>({id,title:id,description:'',enabled:true,ownerManaged:true,ownerRevision:2,risk:'R1',capabilities:[],actions:[],scan:{ok:true},versions:[],...fields});
const DATA:ForgeData={state:'ready',error:null,
  rows:[{id:'csv',title:'CSV to table',enabled:true,ownerRevision:3,risk:'R2',ownerManaged:true},{id:'ping',title:'Ping a host',enabled:false,ownerRevision:null,risk:'R1',ownerManaged:false}],
  details:new Map([['csv',detail('csv',{title:'CSV to table',description:'Turns a CSV into a Markdown table.',ownerRevision:3,risk:'R2',capabilities:['file.read'],actions:[{nome:'convert'}],versions:[{revision:1},{revision:2},{revision:3}]})],
    ['ping',detail('ping',{enabled:false,ownerManaged:false,ownerRevision:null,capabilities:[],scan:{ok:false}})]])};

test('the forge as a page: on or off, the risk it declared, what it can use and does',()=>{
  const page=asPage(forgeSheet(DATA,{selectedId:'csv'}));const shown=all(pageRows(page.panel,120,24));
  assert.match(shown,/── Forge Tools made in the forge/u);assert.match(shown,/All 2 +Enabled 1 +Disabled 1/u);
  assert.match(shown,/\[x\] CSV to table .* v3 .*risk R2/u);assert.match(shown,/\[ \] Ping a host .*risk R1/u);
  assert.match(shown,/Can use +file\.read/u);assert.match(shown,/Does +convert/u);assert.match(shown,/Scan +passed/u);assert.match(shown,/Versions +1, 2, 3/u);
  assert.match(all(pageRows(asPage(forgeSheet(DATA,{selectedId:'ping'})).panel,120,24)),/Scan +blocked/u);
  const enabled=all(pageRows(asPage(forgeSheet(DATA,{filterAt:1})).panel,120,24));
  assert.match(enabled,/CSV to table/u);assert.doesNotMatch(enabled,/Ping a host/u,'the Enabled filter shows only what is on');
});

test('space turns one on or off, b goes back to the version before, and says when there is none',()=>{
  assert.deepEqual(press(asPage(forgeSheet(DATA,{selectedId:'csv'})),'space').action,{kind:'forge',verb:'disable',id:'csv'});
  assert.deepEqual(press(asPage(forgeSheet(DATA,{selectedId:'ping'})),'space').action,{kind:'forge',verb:'enable',id:'ping'});
  assert.deepEqual(press(asPage(forgeSheet(DATA,{selectedId:'csv'})),'b').action,{kind:'forge',verb:'back',id:'csv',revision:2});
  assert.equal(press(asPage(forgeSheet(DATA,{selectedId:'ping'})),'b').action?.kind,'notice');
  assert.equal(previousRevision(detail('x',{ownerRevision:1,versions:[{revision:1}]})),null);
  assert.match(all(pageRows(asPage(forgeSheet({...DATA,rows:[],details:new Map()})).panel,120,20)),/No forged tools yet\./u);
});
