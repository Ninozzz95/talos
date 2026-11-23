/* C9 of the redesign: Doctor as a page. The verdict in two lines, each check with what to do when it failed, r and x. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {doctorSheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {doctorDetail,type DoctorReport} from '../../src/tui/panel/doctor-page.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {panelKey} from '../../src/tui/panel/sheet.ts';

const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('')).join('\n');
/* the detail wraps in its column: read across the wrap and the divider */
const flat=(text:string)=>text.replace(/[ │]*\n[ │]*/gu,' ');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const READY:DoctorReport={ok:true,ready:true,status:'ready',reasons:[],version:'0.6.15',platform:'win32-x64',
  checks:[{id:'config-path',ok:true},{id:'git',ok:true},{id:'mcp',ok:true,detail:'not configured'}],sections:{providers:{state:'healthy',active:'openrouter'},context:{state:'absent',database:'absent'}}};
const BROKEN:DoctorReport={...READY,ok:false,ready:false,status:'needs attention',reasons:[{code:'PROVIDER_NOT_CHOSEN',message:'No provider is chosen yet.'}],
  checks:[{id:'config-path',ok:true},{id:'git',ok:false,detail:'spawn git ENOENT'},{id:'hooks',ok:false,detail:'invalid JSON (.talos/hooks.json)'}]};

test('two lines say whether a turn can run and how many checks pass',()=>{
  const ready=all(pageRows(asPage(doctorSheet(READY)).panel,120,24));
  assert.match(ready,/── Doctor Whether TALOS can work here, check by check/u);assert.match(ready,/✓ Ready: a turn can run here\./u);
  assert.match(ready,/3 of 3 checks pass · TALOS 0\.6\.15 · win32-x64/u);assert.match(ready,/Settings folder .* ok/u);assert.match(ready,/What it found/u);assert.match(ready,/Providers .* healthy/u);
  const broken=all(pageRows(asPage(doctorSheet(BROKEN)).panel,120,24));
  assert.match(broken,/! Needs attention: No provider is chosen yet\./u);assert.match(broken,/1 of 3 checks pass · 2 to look at · TALOS/u);
  assert.doesNotMatch(ready,/to look at/u,'nothing to look at, nothing said');
  /* Frontend 01/11: a state that is not plainly good says what it means here */
  const UPDATE={...READY,sections:{update:{state:'degraded',signature:'unavailable'}}};
  assert.match(all(pageRows(asPage(doctorSheet(UPDATE,{selectedId:'section:update'})).panel,120,24)),/1 to look at/u);
  /* the detail alone, its rows joined: beside the list the two columns interleave */
  const detailOf=(report:DoctorReport,id:string)=>doctorDetail(report,id,56).map(row=>row.map(segment=>segment.text).join('')).join(' ');
  assert.match(detailOf(UPDATE,'section:update'),/This build can't check the signature of updates; each download is still checked before it's installed\. TALOS keeps working\./u);
  assert.match(detailOf({...READY,sections:{providers:{state:'unknown'}}},'section:providers'),/Not contacted: the Doctor asks a provider only with «talos doctor --profile»/u);
  const failedCheck=all(pageRows(asPage(doctorSheet({...BROKEN,ready:true,reasons:[]})).panel,120,24));
  assert.match(failedCheck,/! Needs attention: the check «Git» failed/u,'a turn could run, but a check failed: not ready');
});

test('the first failed check is chosen, and says what to do',()=>{
  const broken=flat(all(pageRows(asPage(doctorSheet(BROKEN)).panel,120,24)));
  assert.match(broken,/› Git/u,'the cursor starts on what failed');assert.match(broken,/spawn git ENOENT/u);
  assert.match(broken,/What to do/u);assert.match(broken,/Install Git and make sure the git command works in a terminal, then press r\./u);
  const hooks=flat(all(pageRows(asPage(doctorSheet(BROKEN,{selectedId:'check:hooks'})).panel,120,24)));
  assert.match(hooks,/The file is not valid JSON: fix it or remove it, then press r\./u);
  assert.match(all(pageRows(asPage(doctorSheet(READY,{selectedId:'section:providers'})).panel,120,24)),/active +openrouter/u);
});

test('r checks again on the same row, x writes the report, and no report says so',()=>{
  const page=asPage(doctorSheet(BROKEN));
  assert.deepEqual(press(page,'r').action,{kind:'doctor',verb:'recheck',id:'check:git'});
  assert.deepEqual(press(page,'x').action,{kind:'doctor',verb:'export'});
  const none=all(pageRows(asPage(doctorSheet(null)).panel,120,20));
  assert.match(none,/The check could not run/u);
  /* suite 01/11: said once, in the head; the empty list neither repeats it nor offers r as if it added a row */
  assert.equal(none.split('The check could not run').length-1,1,'said once');
  assert.doesNotMatch(none,/to add one/u);assert.match(none,/No checks to show\./u);
});

test('tester 01/11 R9: «degraded» is yellow and counted with what failed; grey states say why they are normal; the update detail has no technical rows',()=>{
  const report:DoctorReport={...READY,sections:{update:{state:'degraded',manifestSchema:'talos.cli.release.v1',checksum:'sha256',signature:'unavailable',channel:'npm'},
    catalog:{state:'off',reason:'test-profile'},context:{state:'absent'}}};
  const page=all(pageRows(asPage(doctorSheet(report)).panel,140,30));
  assert.match(page,/1 to look at/u,'only the degraded one counts; off and absent are normal');
  const sheet=doctorSheet(report);const body=sheet.panel.tabs[0]!.body;
  assert.equal(body.kind==='list'?body.items[body.sel]?.id:'','section:update','the cursor starts on what is to look at');
  const update=flat(all(doctorDetail(report,'section:update',60).map(row=>[...row])));
  assert.match(update,/can't check the signature of updates; each download is still checked before it's installed\. TALOS keeps working\./u);
  assert.doesNotMatch(update,/manifestSchema|checksum|sha256|signature +unavailable/u,'the technical rows stay in the JSON export');
  assert.match(update,/channel/u,'the other rows stay');
  assert.match(flat(all(doctorDetail(report,'section:catalog',60).map(row=>[...row]))),/not downloaded; TALOS uses what each provider says/u);
});
