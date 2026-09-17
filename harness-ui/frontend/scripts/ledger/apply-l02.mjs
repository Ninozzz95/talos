/** L02 deterministic source transition. It never updates Git refs or invokes a model. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2] || 'harness-ui/frontend');
const require=createRequire(resolve(root,'../package.json'));
const ts=require('typescript');
const hash=b=>createHash('sha256').update(b).digest('hex');
const original='fd4baae755ffe993d0523c0cc0251bfd0abcf5e424fc8c17ae57080cfb6c747b';
const expected='8457a951caf69910e214760e6536abbbe99f08ab45bd6a5c70992ea7098e7ae3';
const f=root+'/src/legacy/app.js';let src=fs.readFileSync(f,'utf8');
if(hash(src)===expected){console.log('L02 already integrated');}
else {
assert.equal(hash(src),original,'Source differs from approved baseline: no fuzzy application');
function replaceOnce(before,after){if(src.split(before).length!==2)throw Error('Expected unique block '+before.slice(0,90));src=src.replace(before,after);}
function fn(name,text){const ast=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let hits=[];function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)hits.push(n);ts.forEachChild(n,walk)}walk(ast);if(hits.length!==1)throw Error('Function '+name+': '+hits.length);const n=hits[0];src=src.slice(0,n.getStart(ast))+text+src.slice(n.end);}
src=`import { createApplicationState } from '../app/state.ts';
import { createLifetime } from '../infrastructure/lifecycle.ts';
import { createRequestCoordinator } from '../domain/resource-state.ts';
import { createApiClient } from '../infrastructure/api/client.ts';
import { createHostBridge } from '../infrastructure/host/bridge.ts';
import { createPreferences } from '../infrastructure/persistence/preferences.ts';
import { createSessionStreamFactory } from '../infrastructure/events/session-stream.ts';
`+src;
replaceOnce("  'use strict';",`  'use strict';

  // L02: the new owners are on the production path. The legacy controller
  // remains a compatibility facade until its feature lots are migrated.
  const applicationLifetime = createLifetime(() => console.warn('Risorsa UI non rilasciata correttamente.'));
  const hostBridge = createHostBridge(window);
  const apiClient = createApiClient({ fetchImpl: fetchSorvegliata, endpoint: API, signal: applicationLifetime.signal });
  const metricsRequests = createRequestCoordinator();
  const sessionStreams = createSessionStreamFactory({ endpoint: id => API(\`/api/v1/sessions/\${encodeURIComponent(id)}/events\`) });
  applicationLifetime.own(() => metricsRequests.dispose());
  applicationLifetime.own(() => sessionStreams.dispose());
  let desktopPreferences = null;
  function preferenceStore() {
    return desktopPreferences ||= createPreferences({ storage: () => window.localStorage, allowedKeys: [DESKTOP_SETTINGS_KEY] });
  }
  const streamWarnings = new Set();
  function segnalaProblemaFlusso(tipo) {
    if (streamWarnings.has(tipo)) return;
    streamWarnings.add(tipo);
    console.warn(tipo === 'unsupported' ? 'Evento sessione non supportato dalla UI.' : 'Evento sessione non leggibile.');
  }`);
fn('ROOT', 'function ROOT() { return hostBridge.root(); }');
fn('HOST', 'function HOST() { return hostBridge.host(); }');
fn('API', 'function API(pathname) { return hostBridge.apiUrl(pathname); }');
fn('embeddedDemoOnly', "function embeddedDemoOnly() { return hostBridge.embedded() && !hostBridge.baseUrl(); }");
{
 const ast=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let hits=[];
 function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='state'&&ts.isObjectLiteralExpression(n.initializer))hits.push(n);ts.forEachChild(n,walk)}walk(ast);
 if(hits.length!==1)throw Error('state declaration not unique');const n=hits[0];
 src=src.slice(0,n.getStart(ast))+`applicationState = createApplicationState(${n.initializer.getText(ast)})`+src.slice(n.end);
 replaceOnce('  const applicationState = createApplicationState(', '  const applicationState = createApplicationState(');
 // The object literal is preserved byte for byte. Only its owner is changed.
 const end=src.indexOf('});',n.getStart(ast));
 // Locate the declaration anew rather than finding a nested object terminator.
 const next=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let statement;
 function scan(x){if(ts.isVariableDeclaration(x)&&x.name.getText(next)==='applicationState')statement=x.parent.parent;ts.forEachChild(x,scan)}scan(next);
 src=src.slice(0,statement.end)+`\n  const state = applicationState.legacy;\n`+src.slice(statement.end);
}
replaceOnce('window.__talosHarnessHostViewChange?.(view);','hostBridge.changeView(view);');
replaceOnce('window.__talosHarnessHostPermissionChange?.(state.permissions);','hostBridge.changePermission(state.permissions);');
replaceOnce('window.__talosHarnessHostBack?.();','hostBridge.back();');
replaceOnce("window.addEventListener('offline', () => sorveglianza.segnalaBrowser(false));", "applicationLifetime.listen(window, 'offline', () => sorveglianza.segnalaBrowser(false));");
replaceOnce("window.addEventListener('online', () => sorveglianza.segnalaBrowser(true));", "applicationLifetime.listen(window, 'online', () => sorveglianza.segnalaBrowser(true));\n  applicationLifetime.own(() => sorveglianza.ferma());");
replaceOnce("      sorveglianza?.segnalaRete(false, 'fetch');", "      if (!init?.signal?.aborted && error?.name !== 'AbortError') sorveglianza?.segnalaRete(false, 'fetch');");
fn('apiGet', `function apiGet(pathname, options) { return apiClient.get(pathname, options); }`);
fn('apiPost', `function apiPost(pathname, body, options) { return apiClient.post(pathname, body, options); }`);
fn('apiScrivi', `function apiScrivi(metodo, pathname, body, options) { return apiClient.request(metodo, pathname, { ...options, body }); }`);
fn('apriFlussoFiglia', `function apriFlussoFiglia(sessionId, onEvento) {
    const sorgente = sessionStreams.open({ sessionId, onEvent: onEvento,
      onError: () => segnalaProblemaFlusso('invalid'), onUnsupported: () => segnalaProblemaFlusso('unsupported') });
    return () => sorgente.close();
  }`);
// Preserve the replay, deduplication, and end-of-stream policy in the real controller.
{
 const begin=src.indexOf('    const source = new EventSource(API(`/api/v1/sessions/${encodeURIComponent(sessionId)}/events`));');
 if(begin<0)throw Error('main stream missing');
 const end=src.indexOf('\n  }',begin);
 src=src.slice(0,begin)+`    state.realSession.eventSource?.close();
    const source = sessionStreams.open({
      sessionId,
      isCurrent: () => generation === state.realSession.generation && state.realSession.id === sessionId,
      onState: stato => { if (stato === 'open') state.realSession.inRigiocata = true; },
      onEvent: evento => {
        sorveglianza?.segnalaEventoVivo();
        segnaTappaLatenza('primoEvento');
        handleRealEvent(evento, generation);
      },
      onError: () => segnalaProblemaFlusso('invalid'),
      onUnsupported: () => segnalaProblemaFlusso('unsupported'),
      onChannelError: readyState => {
        // Replay can contain multiple completed turns: only the expected EOF,
        // not the first RunFinished, closes this subscription.
        if (state.realSession.eventoTerminaleVisto) {
          source.close();
          if (state.realSession.eventSource === source) state.realSession.eventSource = null;
          return;
        }
        sorveglianza?.segnalaSse(readyState);
        if (readyState === EventSource.CLOSED) appendStatusNote('Connessione agli eventi interrotta.', true);
      },
    });
    state.realSession.eventSource = source;
    segnaTappaLatenza('sseCollegato');`+src.slice(end);
}
replaceOnce('  function nuovaGenerazioneSessione({ continua = false } = {}) {', `  function nuovaGenerazioneSessione({ continua = false } = {}) {
    metricsRequests.invalidate();`);
replaceOnce('    if (!sessionId) { state.realSession.cacheSessione = null; return; }', '    if (!sessionId) { metricsRequests.invalidate(); state.realSession.cacheSessione = null; return; }');
replaceOnce('          const dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(sessionId)}/metrics`);', `          const risposta = await metricsRequests.run({ workspaceId: null, sessionId }, signal =>
            apiGet(\`/api/v1/sessions/\${encodeURIComponent(sessionId)}/metrics\`, { signal }));
          if (risposta.kind !== 'current' || applicationLifetime.disposed) return;
          const dati = risposta.value;`);
replaceOnce('        if (richiestaCacheSessione !== richiesta || state.realSession.id !== sessionId || state.realSession.generation !== generation) return;', '        if (applicationLifetime.disposed || richiestaCacheSessione !== richiesta || state.realSession.id !== sessionId || state.realSession.generation !== generation) return;');
replaceOnce("      const raw = JSON.parse(window.localStorage.getItem(DESKTOP_SETTINGS_KEY) || '{}');", "      const lettura = preferenceStore().read(DESKTOP_SETTINGS_KEY);\n      const raw = lettura.kind === 'ready' ? lettura.value : {};");
replaceOnce('      window.localStorage.setItem(DESKTOP_SETTINGS_KEY, JSON.stringify({', '      preferenceStore().write(DESKTOP_SETTINGS_KEY, {');
// Replace the corresponding close only inside the save function, not every JSON block.
{
 const ast=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 // The preceding replacement leaves one extra close; correct using the exact preserved fields.
 replaceOnce('        workspaces: normalizzaWorkspaces(safe.workspaces),\n      }));', '        workspaces: normalizzaWorkspaces(safe.workspaces),\n      });');
}
replaceOnce('  window.__talosHarnessDestroy = () => {', '  window.__talosHarnessDestroy = () => {\n    applicationLifetime.dispose();');
replaceOnce('    delete window.__talosHarnessUiRuntime;', '    applicationState.dispose();\n    delete window.__talosHarnessUiRuntime;');
const ast=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
if(ast.parseDiagnostics.length)throw Error(JSON.stringify(ast.parseDiagnostics.map(x=>({start:x.start,message:x.messageText}))));
assert.equal(hash(src),expected,'Transformed source differs from reviewed candidate');
fs.writeFileSync(f,src);console.log('Integrated in real legacy controller',src.length);
}
// Remaining reviewed transitions are deterministic, scoped and idempotent.
const pkgPath=root+'/package.json';
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.scripts.typecheck='tsc --noEmit';
pkg.scripts['test:foundation']='node --test tests/contract/foundation.test.mjs tests/contract/new-production-graph.test.mjs';
pkg.devDependencies.typescript='5.9.2';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
const lockPath=root+'/package-lock.json';
const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
const backendLock=JSON.parse(fs.readFileSync(resolve(root,'../package-lock.json'),'utf8'));
assert.equal(backendLock.packages['node_modules/typescript'].version,'5.9.2');
lock.packages[''].devDependencies.typescript='5.9.2';
lock.packages['node_modules/typescript']=backendLock.packages['node_modules/typescript'];
fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n');
function update(relative,before,after) {
 const path=root+'/'+relative;let text=fs.readFileSync(path,'utf8');
 if(text.includes(after))return;
 assert.equal(text.split(before).length,2,'Expected unique transition in '+relative);
 fs.writeFileSync(path,text.replace(before,after));
}
update('scripts/verify.mjs','const commands = [',"const commands = [\n  ['typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']],");
update('scripts/extract-legacy-contract.mjs', '/window\\.(__talosHarness[A-Za-z0-9_]+)/g', '/\\b(?:window|windowObj)\\.(__talosHarness[A-Za-z0-9_]+)/g');
for(const name of ['api-client','host-bridge','persistence','session-events','session-stream'])
 fs.rmSync(root+'/src/contracts/'+name+'.js',{force:true});
console.log('L02 source/config transitions applied; tests and typecheck remain mandatory.');
