import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createScope, createRevision } from '../../src/app/lifecycle.ts';
import { decideStartup, normalizeTarget, shouldCommitStartup } from '../../src/app/startup-policy.ts';
import { SCREEN_BY_VIEW, VIEW_BY_DESTINATION, isView, routeForDestination } from '../../src/domain/navigation.ts';
import { normalizeWorkspacePreferences, createWorkspacePreferences, WORKSPACE_PREFERENCES_KEY } from '../../src/services/workspace-preferences.ts';
import { normalizeSessions, sessioniDaRiprendere } from '../../src/features/navigation/workspace-chrome.ts';
const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const memory = () => { const data = new Map(); return { data, getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }; };

test('BOOT: fresh standalone starts on Home with no side effects', () => {
  assert.deepEqual(decideStartup({mode:'standalone',restoreWorkspace:true}), {action:'navigate',target:{kind:'home'},reason:'home',notice:null,sideEffects:[]});
});
test('BOOT: embedded navigation stays with host', () => {
  assert.equal(decideStartup({mode:'embedded',restoreWorkspace:true,explicitLaunch:{status:'available',target:{kind:'workspace',id:'x'}}}).action,'delegate-to-host');
});
/* 23/09/2026, decisione owner: «Provider e accessi» è tolta dalle Impostazioni e i fornitori vivono
   solo in Laboratorio modelli → scheda «Provider». Il test protegge ancora la stessa cosa — una
   navigazione voluta vince sul ripristino tardivo — con una destinazione che esiste. */
test('BOOT: intentional navigation wins over late restoration', () => {
  const d=decideStartup({mode:'standalone',restoreWorkspace:true,currentNavigation:{kind:'settings',section:'models',labTab:'providers'},lastWorkspace:{status:'available',target:{kind:'workspace',id:'old'}}});
  assert.deepEqual(d.target,{kind:'settings',section:'models',labTab:'providers'});
});
test('BOOT: the retired providers settings target is redirected, not dropped to Home', () => {
  assert.deepEqual(normalizeTarget({kind:'settings',section:'providers'}),{kind:'settings',section:'models',labTab:'providers'});
  const d=decideStartup({mode:'standalone',restoreWorkspace:true,explicitLaunch:{status:'available',target:{kind:'settings',section:'providers'}}});
  assert.deepEqual(d.target,{kind:'settings',section:'models',labTab:'providers'});assert.equal(d.reason,'explicit-launch');
  assert.deepEqual(normalizeTarget({kind:'settings',section:'models'}),{kind:'settings',section:'models'});
  assert.equal(normalizeTarget({kind:'settings',section:'account'}),null);
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
 const p=createWorkspacePreferences(()=>st);assert.equal(p.read().lastSession,null);assert.equal(p.read().density,'compact');assert.equal(st.data.size,1);
});
test('UI-DEFAULTS-FRESH: a new workspace is compact while a saved comfortable choice remains',()=>{
 const fresh=memory();assert.equal(createWorkspacePreferences(()=>fresh).read().density,'compact');
 assert.equal(fresh.data.size,0,'startup does not persist a synthetic choice');
 const stored=memory();stored.setItem(WORKSPACE_PREFERENCES_KEY,JSON.stringify({version:2,density:'comfortable',restoreWorkspace:true,lastSession:null}));
 const preferences=createWorkspacePreferences(()=>stored);preferences.adoptLegacyDensity('compatta');
 assert.equal(preferences.read().density,'comfortable');
});
test('PREFS: getItem or denied getter cannot prevent workspace startup',()=>{
 const p=createWorkspacePreferences(()=>{throw new Error('SecurityError');});assert.equal(p.persistent,false);assert.doesNotThrow(()=>p.update({density:'compact'}));assert.equal(p.read().density,'compact');
});
test('PREFS: absence of storage is represented, not reported as persisted',()=>assert.equal(createWorkspacePreferences(()=>undefined).persistent,false));
/* ⛔ 18/09/2026 — questa prova diceva «un preset non naviga, non esegue attrezzi, non cambia le
   altre preferenze». I preset sono stati eliminati (ordine dell'owner): l'INTENZIONE resta e si
   prova su un cambio qualunque — una preferenza non ne tocca un'altra. */
test('PREFS: an update changes one preference and leaves the others alone',()=>{
 const st=memory();const p=createWorkspacePreferences(()=>st);
 p.update({lastSession:'session-1'});
 assert.equal(p.read().lastSession,'session-1');assert.equal(p.read().density,'compact');assert.equal(p.read().restoreWorkspace,true);
});
test('PREFS: corrupt and future documents recover without changing stored bytes',()=>{
 const st=memory();st.setItem(WORKSPACE_PREFERENCES_KEY,'broken');assert.equal(createWorkspacePreferences(()=>st).read().version,2);assert.equal(st.getItem(WORKSPACE_PREFERENCES_KEY),'broken');
 assert.equal(normalizeWorkspacePreferences({version:999,density:'compact'}).density,'compact');
});
test('PREFS: returned snapshots do not mutate internal state',()=>{const p=createWorkspacePreferences(()=>memory());const a=p.read();a.density='comfortable';a.lastSession='x';assert.equal(p.read().density,'compact');assert.equal(p.read().lastSession,null);});
/* ⛔ 18/09/2026 — qui si provava che la storia delle disposizioni stava entro 64 voci: era un tetto
   della mappa dei PRESET, uscita con la funzione. Nessun altro campo ha una mappa, quindi la prova
   non ha più soggetto e non si riscrive «per far numero». */
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

/* 30/09/2026, decisione owner («nascondile»): le conversazioni degli AIUTANTI (sotto-agenti di una delega) stanno dentro la chat
   che le ha create, come nella barra (`sessioniRadice`) e come Hermes (`hermes_state_common.py:208-210`: elencabili = radici
   + rami/reset, mai i sotto-agenti). Sul 4174 la Home ne mostrava 6 come «Sessione senza nome» in cima a «Riprendi il lavoro». */
test('HOME-RECENTI-RADICI: «Riprendi il lavoro» mostra solo le chat vere, al massimo 8, dalla più recente', () => {
  const t = (m) => `2026-09-30T10:${String(m).padStart(2, '0')}:00.000Z`;
  const sessioni = normalizeSessions({ items: [
    { sessionId: 'madre', nome: 'Chat vera', avviataAlle: t(1) },
    { sessionId: 'figlia', taskId: 'delega:madre', padreId: 'madre', profonditaDelega: 1, avviataAlle: t(9) },
    { sessionId: 'nipote-senza-padre-noto', profonditaDelega: 2, avviataAlle: t(8) },
    { sessionId: 'ramo', nome: 'Ramo', forkDa: 'madre', avviataAlle: t(7) },
    ...Array.from({ length: 9 }, (_, i) => ({ sessionId: `altra-${i}`, nome: `Altra ${i}`, avviataAlle: t(20 + i) })),
  ] });
  const righe = sessioniDaRiprendere(sessioni);
  assert.equal(righe.length, 8, 'al massimo otto righe');
  assert.deepEqual(righe.map((r) => r.sessionId).slice(0, 2), ['altra-8', 'altra-7'], 'dalla più recente');
  const tutte = sessioniDaRiprendere(sessioni, Infinity).map((r) => r.sessionId);
  assert.ok(!tutte.includes('figlia'), 'una figlia con padreId non è una chat da riprendere');
  assert.ok(!tutte.includes('nipote-senza-padre-noto'), 'profondità di delega > 0 basta, anche senza padreId');
  assert.ok(tutte.includes('madre') && tutte.includes('ramo'), 'radici e rami restano');
  assert.deepEqual(sessioniDaRiprendere([]), []);
  // solo aiutanti ⇒ niente da riprendere: la Home mostra lo stato vuoto, non una lista vuota senza spiegazione
  assert.deepEqual(sessioniDaRiprendere(normalizeSessions({ items: [{ sessionId: 'f', padreId: 'x', profonditaDelega: 1 }] })), []);
});
