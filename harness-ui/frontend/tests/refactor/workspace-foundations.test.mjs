import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createScope, createRevision } from '../../src/app/lifecycle.ts';
import { decideStartup, normalizeTarget, shouldCommitStartup } from '../../src/app/startup-policy.ts';
import { SCREEN_BY_VIEW, VIEW_BY_DESTINATION, isView, routeForDestination } from '../../src/domain/navigation.ts';
import { normalizeWorkspacePreferences, createWorkspacePreferences, WORKSPACE_PREFERENCES_KEY } from '../../src/services/workspace-preferences.ts';
import { normalizeSessions } from '../../src/features/navigation/workspace-chrome.ts';
const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const memory = () => { const data = new Map(); return { data, getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }; };

test('BOOT: fresh standalone starts on Home with no side effects', () => {
  assert.deepEqual(decideStartup({mode:'standalone',restoreWorkspace:true}), {action:'navigate',target:{kind:'home'},reason:'home',notice:null,sideEffects:[]});
});
test('BOOT: embedded navigation stays with host', () => {
  assert.equal(decideStartup({mode:'embedded',restoreWorkspace:true,explicitLaunch:{status:'available',target:{kind:'workspace',id:'x'}}}).action,'delegate-to-host');
});
test('BOOT: intentional navigation wins over late restoration', () => {
  const d=decideStartup({mode:'standalone',restoreWorkspace:true,currentNavigation:{kind:'settings',section:'providers'},lastWorkspace:{status:'available',target:{kind:'workspace',id:'old'}}});
  assert.deepEqual(d.target,{kind:'settings',section:'providers'});
});
test('BOOT: explicit unavailable intent never opens another workspace', () => {
  const d=decideStartup({mode:'standalone',restoreWorkspace:true,explicitLaunch:{status:'unavailable'},lastWorkspace:{status:'available',target:{kind:'workspace',id:'old'}}});
  assert.equal(d.target.kind,'home');assert.equal(d.notice,'destination-unavailable');
});
test('BOOT: restore exact last workspace, not most recent available session', () => {
  const d=decideStartup({mode:'standalone',restoreWorkspace:true,lastWorkspace:{status:'available',target:{kind:'workspace',id:'chosen'}}});
  assert.deepEqual(d.target,{kind:'workspace',id:'chosen'});assert.deepEqual(d.sideEffects,[]);
});
test('BOOT: restoration is optional and never infers a permission', () => {
  const d=decideStartup({mode:'standalone',restoreWorkspace:false,lastWorkspace:{status:'available',target:{kind:'workspace',id:'x',permission:'Full access',execute:true}}});
  assert.equal(d.target.kind,'home');assert.deepEqual(d.sideEffects,[]);
});
for (const value of [null,{},[],{kind:'script',id:'x'},{kind:'workspace',id:''},{kind:'workspace',id:'a\0b'},{kind:'workspace',id:'x'.repeat(2049)}]) {
 test(`BOOT: rejects malformed target ${JSON.stringify(value).slice(0,60)}`,()=>assert.equal(normalizeTarget(value),null));
}
test('BOOT: valid target strips execution and consent fields',()=>assert.deepEqual(normalizeTarget({kind:'workspace',id:'x',execute:true,permission:'Full access'}),{kind:'workspace',id:'x'}));
test('CORE: stale and disposed startup results cannot commit',()=>{
 assert.equal(shouldCommitStartup(0,0,false),true);assert.equal(shouldCommitStartup(0,1,false),false);assert.equal(shouldCommitStartup(1,1,true),false);assert.equal(shouldCommitStartup(NaN,NaN,false),false);
});
test('CORE: revision invalidates prior UI work',()=>{const r=createRevision();const first=r.next();r.next();assert.equal(r.isCurrent(first),false);});
test('CORE: disposal releases every owned resource once even after errors',()=>{
 const s=createScope();const calls=[];s.own(()=>calls.push('a'));s.own(()=>{throw new Error('fixture');});s.own(()=>calls.push('b'));s.dispose();s.dispose();s.own(()=>calls.push('late'));
 assert.deepEqual(calls,['a','b','late']);assert.equal(s.signal.aborted,true);
});
test('PREFS: defaults do not inherit legacy keys or grant permissions',()=>{
 const st=memory();st.setItem('talos.harness.desktop.settings.v1',JSON.stringify({permissions:'Full access'}));
 const p=createWorkspacePreferences(()=>st);assert.equal(p.read().lastSession,null);assert.equal(p.read().density,'comfortable');assert.equal(st.data.size,1);
});
test('PREFS: getItem or denied getter cannot prevent workspace startup',()=>{
 const p=createWorkspacePreferences(()=>{throw new Error('SecurityError');});assert.equal(p.persistent,false);assert.doesNotThrow(()=>p.update({density:'compact'}));assert.equal(p.read().density,'compact');
});
test('PREFS: absence of storage is represented, not reported as persisted',()=>assert.equal(createWorkspacePreferences(()=>undefined).persistent,false));
test('PREFS: preset does not navigate, run tools, or change other preferences',()=>{
 const st=memory();const p=createWorkspacePreferences(()=>st);p.update({lastSession:'session-1'});p.setPreset('session-1','focus');
 assert.equal(p.presetFor('session-1'),'focus');assert.equal(p.presetFor('session-2'),'development');assert.equal(p.read().lastSession,'session-1');
 assert.equal(JSON.parse(st.getItem(WORKSPACE_PREFERENCES_KEY)).version,2);
});
test('PREFS: corrupt and future documents recover without changing stored bytes',()=>{
 const st=memory();st.setItem(WORKSPACE_PREFERENCES_KEY,'broken');assert.equal(createWorkspacePreferences(()=>st).read().version,2);assert.equal(st.getItem(WORKSPACE_PREFERENCES_KEY),'broken');
 assert.equal(normalizeWorkspacePreferences({version:999,density:'compact'}).density,'comfortable');
});
test('PREFS: returned snapshots do not mutate internal state',()=>{const p=createWorkspacePreferences(()=>memory());const a=p.read();a.density='compact';a.presets.x='focus';assert.equal(p.read().density,'comfortable');assert.equal(p.presetFor('x'),'development');});
test('PREFS: prototype keys are rejected',()=>{
 const p=createWorkspacePreferences(()=>memory());p.setPreset('__proto__','focus');assert.equal(Object.hasOwn(p.read().presets,'__proto__'),false);
});
test('PREFS: layout history is bounded to 64 entries',()=>{const p=createWorkspacePreferences(()=>memory());for(let i=0;i<100;i++)p.setPreset('x'+i,'focus');assert.equal(Object.keys(p.read().presets).length,64);});
test('NAV: all destinations point to a registered screen',()=>{for(const view of Object.values(VIEW_BY_DESTINATION))assert.ok(SCREEN_BY_VIEW[view]);assert.equal(isView('home'),true);assert.equal(routeForDestination('javascript:alert(1)'),null);});
test('HOME: real session IDs are deduplicated; unknown payloads are not invented',()=>{
 assert.deepEqual(normalizeSessions(null),[]);assert.deepEqual(normalizeSessions({items:[{},null,{sessionId:'x',nome:'one'},{sessionId:'x',nome:'two'}]}).map(r=>r.nome),['one']);
});
test('D21: neither native nor overlay introduction is in product markup',async()=>{
 const text=(await read('index.template.html'))+(await read('src/legacy/frammenti.html'));
 assert.doesNotMatch(text,/(?:id|data-apre-velo)=["'](?:veloIntro|introDialog)["']/);
 await assert.rejects(access(new URL('src/components/intro.js',root)));
});
test('D21: no startup intro owner, old restoration timer or import remains',async()=>{
 const text=await read('src/legacy/app.js');assert.doesNotMatch(text,/\b(?:creaIntro|apriIntroSeServe|apriIntroPrimoAvvio|apriUltimaSessioneDisponibileAllAvvio)\b/);
 assert.match(text,/ultimoSegmentoWorkspace/);assert.match(text,/shouldCommitStartup/);assert.match(text,/workspaceUI = createWorkspaceChrome/);
});
test('D21: historical exporter cannot overwrite owned production sources',async()=>{
 const text=await read('scripts/mockup-to-template.mjs');assert.doesNotMatch(text,/writeFile\(path\.join\(radice, '(?:index\.template\.html|src\/styles\/index\.css)'/);assert.match(text,/historical-reference/);
});
test('DS: semantic foundation and canonical controls are imported by the actual entry',async()=>{
 const text=await read('src/styles/main.css');assert.match(text,/design-system\/foundations\.css/);assert.match(text,/design-system\/controls\.css/);assert.match(text,/design-system\/workspace\.css/);
 assert.doesNotMatch(await read('src/styles/index.css'),/\.talos-button\{min-height/);
});
