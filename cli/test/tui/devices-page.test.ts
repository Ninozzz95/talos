/* C10 of the redesign: Devices as a page. The kernel's devices in words, their folders, n pairs with the card of /remote, d twice revokes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {devicesSheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {deviceRows,type DevicesData} from '../../src/tui/panel/devices-page.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {panelKey} from '../../src/tui/panel/sheet.ts';

const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('')).join('\n');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const TELEFONI=[{id:'pad1',nome:'Pad',inLinea:true,percorso:{tipo:'relay'},collegatoAlle:'2026-10-30T09:00:00Z'},{id:'ph2',nome:'Phone',inLinea:false,ultimaVoltaAlle:'2026-10-31T18:00:00Z'},
  {id:'old',nome:'Old',revocatoAlle:'2026-10-20T10:00:00Z',revocatoDa:'pc'},{id:'gone',nome:'Gone',revocatoAlle:'2026-10-21T10:00:00Z',revocatoDa:'telefono'}];
const DATA:DevicesData={available:true,error:null,pc:'Workstation',devices:deviceRows(TELEFONI,new Map([['pad1',[{name:'shop-api',path:'C:\\work\\shop-api',blocked:false},{name:'secrets',path:'C:\\secrets',blocked:true}]]]))};

test('the paired devices in words, and the ones revoked here leave the list',()=>{
  assert.deepEqual(DATA.devices.map(row=>[row.name,row.state]),[['Pad','online'],['Phone','offline'],['Gone','revoked-by-phone']]);
  const shown=all(pageRows(asPage(devicesSheet(DATA,{selectedId:'pad1'})).panel,120,24));
  assert.match(shown,/── Devices Devices paired with this PC · Workstation/u);
  assert.match(shown,/Pad .*online .*now, through the relay/u);assert.match(shown,/Phone .*offline .*seen /u);assert.match(shown,/Gone .*revoked by the device/u);
  assert.match(shown,/Folders it may work in/u);assert.match(shown,/shop-api +C:\\work\\shop-api/u);assert.match(shown,/secrets +blocked/u);
  assert.match(all(pageRows(asPage(devicesSheet({...DATA,devices:[]})).panel,120,20)),/No device is paired with this PC\. Press n to pair one\./u);
  /* Mobile 01/11: remote control off, the list stays and the page says it */
  const off=all(pageRows(asPage(devicesSheet({...DATA,off:true})).panel,120,24));
  assert.match(off,/Remote control is off: no device can reach this PC now\./u);assert.match(off,/Phone/u);
  assert.doesNotMatch(all(pageRows(asPage(devicesSheet(DATA)).panel,120,24)),/Remote control is off/u);
  /* Frontend 01/11: the state stands in one column whatever the length of what follows it */
  const lines=shown.split('\n');const at=(name:string,word:string)=>{const line=lines.find(row=>row.includes(` ${name} `))!;return line.indexOf(word);};
  assert.equal(at('Pad','online'),at('Phone','offline'),'online and offline start in the same column');
});

test('n pairs with the card of /remote, d asks naming the device, a second d revokes',()=>{
  const page=asPage(devicesSheet(DATA,{selectedId:'ph2'}));
  assert.deepEqual(press(page,'n'),{sheet:null,action:{kind:'devices',verb:'pair'}});
  const asked=press(page,'d').sheet!;assert.match(asked.panel.confirmWords!,/Revoke “Phone”\? It can no longer reach this PC\./u);
  assert.deepEqual(press(asked,'d').action,{kind:'devices',verb:'revoke',id:'ph2'});
  assert.notDeepEqual(press(press(page,'d').sheet!,'x').action,{kind:'devices',verb:'revoke',id:'ph2'},'another key keeps it');
});

test('Mobile 01/11: the second d is bound to the id the first named; a list read again takes the question back',()=>{
  const asked=press(asPage(devicesSheet(DATA,{selectedId:'ph2'})),'d').sheet!;
  /* the list is read again (a device came online, the order changed): a new page, the question is gone */
  const reread=asPage(devicesSheet({...DATA,devices:[DATA.devices[1]!,DATA.devices[0]!,DATA.devices[2]!]},{selectedId:'pad1'}));
  assert.equal(sheetStep(reread,{panel:{...reread.panel,confirmDel:0},effect:{kind:'delete',index:0,item:{id:'ph2',label:'Phone'}}} as any).action,null,'no armed id, no revoke');
  /* the row under the cursor is another device by the time of the second d: nothing is revoked */
  assert.equal(sheetStep(asked,{panel:asked.panel,effect:{kind:'delete',index:0,item:{id:'pad1',label:'Pad'}}} as any).action,null);
});

test('Mobile 01/11: a device\'s own name is untrusted text: no control or escape characters, 64 at most',()=>{
  const [row]=deviceRows([{id:'x',nome:`Evil\u001b]52;c;aGk=\u0007‮Pad${'y'.repeat(100)}`}]);
  assert.doesNotMatch(row!.name,/[\u0000-\u001f\u007f‮]/u);assert.ok([...row!.name].length<=64);
  assert.doesNotMatch(press(asPage(devicesSheet({...DATA,devices:[row!]})),'d').sheet!.panel.confirmWords!,/\u001b/u);
});
