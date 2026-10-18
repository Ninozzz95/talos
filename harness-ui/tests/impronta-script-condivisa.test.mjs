/*
 * ⛔⛔⛔ 17/10/2026 — l'impronta della fiducia di hook e server MCP con gli script del progetto, una regola sola con la CLI
 *   (owner: «Curare come gli hook, insieme alla CLI»; «Stessa regola, una nuova fiducia»; «Vince il desktop, si fissa anche quello»).
 *   Regola: `src/script-del-progetto.mjs` (la CLI 0.6.9 portata qui). File e processi VERI, cartelle temporanee.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { caricaHooks, fidaHook, improntaHook, improntaHookRegolaPrecedente, statoTrustHook, verificaTrust } from '../src/hook-registry.mjs';
import { caricaServerMcp, fidaServerMcp, statoTrustMcp, verificaTrustMcp } from '../src/mcp-registry.mjs';
import { areaDelProgetto, hookCommandTokens, referencedScripts } from '../src/script-del-progetto.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { TESTI } from '../frontend/src/i18n/testi/index.js';
/** la frase inglese del server è la voce inglese del dizionario (l'interfaccia la dice nella sua lingua dalla chiave) */
const voceInglese = (stato) => TESTI.en[stato.fraseChiave];

const sha = (testo) => createHash('sha256').update(testo).digest('hex');
function progetto(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'impronta-script-'));
  const cartellaTrust = mkdtempSync(join(tmpdir(), 'impronta-script-trust-'));
  t.after(() => { rimuoviCartellaDiProva(cartella); rimuoviCartellaDiProva(cartellaTrust); });
  const scrivi = (rel, testo) => { mkdirSync(join(cartella, rel, '..'), { recursive: true }); writeFileSync(join(cartella, rel), testo); };
  return { cartella, cartellaTrust, scrivi };
}
const hooks = (comando) => JSON.stringify({ hooks: [{ id: 'guardia', eventi: ['pre_tool_call'], comando }] });

test('IMP-01 — la fiducia vecchia di un hook il cui elenco non cambia resta valida: stessa impronta, byte per byte', async (t) => {
  const { cartella, scrivi } = progetto(t);
  scrivi('guardia.mjs', 'console.log("{}")\n'); scrivi('regole.json', '{"a":1}');
  for (const comando of ['node guardia.mjs', 'node "guardia.mjs" regole.json', 'node ./guardia.mjs', 'echo ciao', 'node -e "process.exit(0)"', 'node file-che-non-esiste.mjs']) {
    assert.equal(await improntaHook({ comando, cartella }), await improntaHookRegolaPrecedente({ comando, cartella }), comando);
  }
  assert.equal(await improntaHook({ comando: 'echo ciao', cartella }), sha('echo ciao'), 'senza file: l’impronta di sempre');
});

test('IMP-02 — un hook che esegue uno script in una cartella sua: la fiducia vecchia CADE (mai una migrazione silenziosa) e la carta dice perché; riapprovato, un import cambiato lo fa cadere di nuovo', async (t) => {
  const { cartella, cartellaTrust, scrivi } = progetto(t);
  scrivi('tools/guardia/index.mjs', "import './aiuto.mjs';\nconsole.log('{}');\n"); scrivi('tools/guardia/aiuto.mjs', 'export {}\n');
  scrivi('.harness-ui-hooks.json', hooks('node tools/guardia/index.mjs'));
  const [hook] = (await caricaHooks({ cartella })).hooks;
  const vecchia = await improntaHookRegolaPrecedente({ comando: hook.comando, cartella });
  assert.notEqual(hook.hash, vecchia, 'premessa: con la regola nuova l’elenco cambia (cartella + import)');
  await fidaHook({ cartellaTrust, hookId: hook.id, hash: vecchia }); // la fiducia data con la regola del 17/09
  assert.equal(await verificaTrust({ cartellaTrust, hookId: hook.id, hash: hook.hash }), false, '⛔ la fiducia vecchia NON vale per gli script mai guardati');
  const stato = await statoTrustHook({ cartellaTrust, hookId: hook.id, hash: hook.hash, comando: hook.comando, cartella });
  assert.equal(stato.motivo, 'regola-precedente');
  assert.equal(stato.fraseChiave, 'server.hook.trust.scriptsNowCovered');
  assert.match(stato.frase, /now also covers the project scripts it runs/u);
  assert.equal(stato.frase, voceInglese(stato));
  await fidaHook({ cartellaTrust, hookId: hook.id, hash: hook.hash });
  assert.equal(await verificaTrust({ cartellaTrust, hookId: hook.id, hash: hook.hash }), true, 'riapprovato: fidato');
  scrivi('tools/guardia/aiuto.mjs', 'export const sostituito = 1\n');
  const [dopo] = (await caricaHooks({ cartella })).hooks;
  assert.notEqual(dopo.hash, hook.hash, '⛔ un file IMPORTATO cambiato deve cambiare l’impronta');
  assert.equal((await statoTrustHook({ cartellaTrust, hookId: hook.id, hash: dopo.hash, comando: dopo.comando, cartella })).motivo, 'contenuto-cambiato');
});

test('IMP-03 — un server MCP SENZA script ha l’impronta di oggi, byte per byte; nessuna frase se mai approvato', async (t) => {
  const { cartella, cartellaTrust, scrivi } = progetto(t);
  const voce = { id: 'fs', comando: 'npx', argomenti: ['-y', '@modelcontextprotocol/server-filesystem', 'C:/dati'], allowlist: ['read_file'] };
  scrivi('.harness-ui-mcp.json', JSON.stringify({ server: [voce] }));
  const [s] = (await caricaServerMcp({ cartella })).server;
  assert.equal(s.hash, sha(JSON.stringify({ comando: voce.comando, argomenti: voce.argomenti, allowlist: voce.allowlist })));
  const stato = await statoTrustMcp({ cartellaTrust, serverId: 'fs', hash: s.hash, comando: s.comando, argomenti: s.argomenti, allowlist: s.allowlist });
  assert.deepEqual({ motivo: stato.motivo, frase: stato.frase }, { motivo: 'mai-approvato', frase: null });
});

test('IMP-04 — un server MCP che lancia uno script del progetto: lo script cambiato lo rende NON fidato; la fiducia data alla sola dichiarazione cade con la sua frase', async (t) => {
  const { cartella, cartellaTrust, scrivi } = progetto(t);
  scrivi('server/mcp.mjs', '// v1\n');
  const voce = { id: 'mio', comando: 'node', argomenti: ['server/mcp.mjs'], allowlist: ['cerca'] };
  scrivi('.harness-ui-mcp.json', JSON.stringify({ server: [voce] }));
  const [s] = (await caricaServerMcp({ cartella })).server;
  const soloDichiarazione = sha(JSON.stringify({ comando: voce.comando, argomenti: voce.argomenti, allowlist: voce.allowlist }));
  assert.notEqual(s.hash, soloDichiarazione, 'premessa: lo script entra nell’impronta');
  await fidaServerMcp({ cartellaTrust, serverId: 'mio', hash: soloDichiarazione });
  assert.equal(await verificaTrustMcp({ cartellaTrust, serverId: 'mio', hash: s.hash }), false);
  const stato = await statoTrustMcp({ cartellaTrust, serverId: 'mio', hash: s.hash, comando: s.comando, argomenti: s.argomenti, allowlist: s.allowlist });
  assert.equal(stato.motivo, 'regola-precedente'); assert.equal(stato.fraseChiave, 'server.mcp.trust.scriptsNowCovered');
  assert.equal(stato.frase, voceInglese(stato));
  await fidaServerMcp({ cartellaTrust, serverId: 'mio', hash: s.hash });
  assert.equal(await verificaTrustMcp({ cartellaTrust, serverId: 'mio', hash: s.hash }), true);
  scrivi('server/mcp.mjs', '// v2: il modello l’ha riscritto\n');
  const [dopo] = (await caricaServerMcp({ cartella })).server;
  assert.equal(await verificaTrustMcp({ cartellaTrust, serverId: 'mio', hash: dopo.hash }), false, '⛔ lo script cambiato e il server ancora fidato');
  assert.equal((await statoTrustMcp({ cartellaTrust, serverId: 'mio', hash: dopo.hash, comando: dopo.comando, argomenti: dopo.argomenti, allowlist: dopo.allowlist })).motivo, 'contenuto-cambiato');
});

test('IMP-05 — una GIUNZIONE che porta FUORI dal progetto: il file eseguito entra col nome scritto, e cambiarlo cambia l’impronta; AL CONTRARIO un file fuori nominato da sé resta fuori', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'impronta-script-fuori-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  writeFileSync(join(fuori, 'y.mjs'), '// v1\n');
  try { symlinkSync(fuori, join(cartella, 'giunzione'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  scrivi('guardia.mjs', '// g\n');
  const area = await areaDelProgetto(cartella);
  const righe = await referencedScripts(area, hookCommandTokens('node giunzione/y.mjs'));
  assert.deepEqual(righe.map((r) => r.path), ['giunzione/y.mjs']);
  const prima = await improntaHook({ comando: 'node giunzione/y.mjs', cartella });
  writeFileSync(join(fuori, 'y.mjs'), '// v2\n');
  assert.notEqual(await improntaHook({ comando: 'node giunzione/y.mjs', cartella }), prima, '⛔ il file eseguito attraverso la giunzione è cambiato e la fiducia no');
  const diretto = `node ${join(fuori, 'y.mjs').split('\\').join('/')}`;
  assert.equal(await improntaHook({ comando: diretto, cartella }), sha(diretto), 'un file fuori nominato col suo percorso fuori non è del progetto');
});

test('IMP-06 — una giunzione che resta DENTRO il progetto: un nome solo, quello del percorso vero, anche da due strade', async (t) => {
  const { cartella, scrivi } = progetto(t);
  scrivi('vero/z.mjs', '// z\n');
  try { symlinkSync(join(cartella, 'vero'), join(cartella, 'alias'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const area = await areaDelProgetto(cartella);
  const righe = await referencedScripts(area, hookCommandTokens('node alias/z.mjs vero/z.mjs'));
  assert.deepEqual(righe.map((r) => r.path), ['vero/z.mjs'], 'lo stesso file conta una volta, col nome vero');
  /* 18/10/2026, rosso sul runner della CI (TEMP = `C:\Users\RUNNER~1\…`): il prodotto risolve col `realpath` di fs.promises,
     che su Windows è quello NATIVO ed espande il nome corto 8.3 (`runneradmin`); `realpathSync` in JS no. Si confronta col nativo:
     il nome lungo è quello voluto (F-E-001, owner 12/10). Qui C: ha i nomi 8.3 spenti, quindi la prova vera è il runner. */
  assert.equal(area.canonicalRoot, realpathSync.native(cartella));
});

test('IMP-07 — elencaHooks/elencaServerMcp: una fiducia caduta porta la frase e la chiave; «mai approvato» resta com’era', async () => {
  const sessione = { avviaSessioneFn: async () => ({ comeFinita: 'concluso', detto: 'ok' }) };
  const registro = createSessionRegistry({
    avviaSessioneFn: ({ onEvento }) => { onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
    preparaEsecuzioneFn: () => ({ cartella: tmpdir(), comandoProva: 'npm test', task: { id: 't', consegna: 'x' } }), modello: 'm', chiave: 'k',
    caricaHooksFn: async () => ({ hooks: [{ id: 'a', eventi: ['pre_tool_call'], comando: 'node a.mjs', hash: 'h1' }, { id: 'b', eventi: ['pre_tool_call'], comando: 'echo b', hash: 'h2' }] }),
    verificaTrustFn: async () => false,
    statoTrustHookFn: async ({ hookId }) => (hookId === 'a'
      ? { fidato: false, motivo: 'regola-precedente', frase: 'F', fraseChiave: 'server.hook.trust.scriptsNowCovered' }
      : { fidato: false, motivo: 'mai-approvato', frase: null, fraseChiave: null }),
    caricaServerMcpFn: async () => ({ server: [{ id: 's', comando: 'node', argomenti: ['s.mjs'], allowlist: ['x'], hash: 'h3' }] }),
    verificaTrustMcpFn: async () => false,
    statoTrustMcpFn: async () => ({ fidato: false, motivo: 'contenuto-cambiato', frase: 'G', fraseChiave: 'server.mcp.trust.contentChanged' }),
  });
  void sessione;
  const { sessionId } = registro.avvia('t');
  for (let i = 0; i < 20 && !registro.elencaHooks; i += 1) await new Promise((r) => setTimeout(r, 10));
  const h = await registro.elencaHooks(sessionId);
  assert.deepEqual(h.hooks, [
    { id: 'a', eventi: ['pre_tool_call'], fidato: false, motivo: 'regola-precedente', frase: 'F', fraseChiave: 'server.hook.trust.scriptsNowCovered' },
    { id: 'b', eventi: ['pre_tool_call'], fidato: false },
  ]);
  const m = await registro.elencaServerMcp(sessionId);
  assert.deepEqual(m.server, [{ id: 's', comando: 'node', argomenti: ['s.mjs'], allowlist: ['x'], fidato: false, motivo: 'contenuto-cambiato', frase: 'G', fraseChiave: 'server.mcp.trust.contentChanged', connessione: null }]); // 0.1.33: `connessione` di r4 (mai avviato = null)
  await registro.chiudi?.({ attesaMassimaMs: 200 }).catch?.(() => {});
});

test('IMP-08 — le due vie della regola, una per una: un IMPORT di uno script alla radice, e un file vicino (non importato) di uno script in una cartella sua', async (t) => {
  const { cartella, scrivi } = progetto(t);
  scrivi('a.mjs', "import './lib/b.mjs';\n"); scrivi('lib/b.mjs', '// b1\n');
  scrivi('tools/srv/index.mjs', '// solo\n'); scrivi('tools/srv/dati.json', '{"v":1}');
  const importo = await improntaHook({ comando: 'node a.mjs', cartella });
  scrivi('lib/b.mjs', '// b2\n');
  assert.notEqual(await improntaHook({ comando: 'node a.mjs', cartella }), importo, '⛔ l’import cambiato non cambia l’impronta');
  const vicino = await improntaHook({ comando: 'node tools/srv/index.mjs', cartella });
  scrivi('tools/srv/dati.json', '{"v":2}');
  assert.notEqual(await improntaHook({ comando: 'node tools/srv/index.mjs', cartella }), vicino, '⛔ un file della cartella dello script cambiato non cambia l’impronta');
});

/* 17/10/2026 (owner «Memoria per dimensione e data, come git»): la memoria degli hash. Le letture si contano sostituendo per il tempo
   della prova `fs.promises.readFile`, che il modulo chiama a ogni lettura. */
import { promises as fspProva, utimesSync, statSync } from 'node:fs';
import { creaMemoriaDegliHash } from '../src/script-del-progetto.mjs';
async function contaLetture(t, fn) {
  const vera = fspProva.readFile; const lette = [];
  fspProva.readFile = (p, ...resto) => { lette.push(String(p)); return vera.call(fspProva, p, ...resto); };
  t.after(() => { fspProva.readFile = vera; });
  try { await fn(); } finally { fspProva.readFile = vera; }
  return lette;
}

test('IMP-09 — un file non toccato NON si rilegge al secondo calcolo; con la memoria spenta sì, e l’impronta è la stessa', async (t) => {
  const { cartella, scrivi } = progetto(t);
  scrivi('tools/srv/index.mjs', "import './aiuto.mjs';\n"); scrivi('tools/srv/aiuto.mjs', '// a\n');
  const area = await areaDelProgetto(cartella); const memoria = creaMemoriaDegliHash();
  const token = hookCommandTokens('node tools/srv/index.mjs');
  let primo, secondo, spenta;
  const letturePrima = await contaLetture(t, async () => { primo = await referencedScripts(area, token, { memoria }); });
  const lettureDopo = await contaLetture(t, async () => { secondo = await referencedScripts(area, token, { memoria }); });
  const lettureSpenta = await contaLetture(t, async () => { spenta = await referencedScripts(area, token, { memoria: null }); });
  const deiFile = (lette) => lette.filter((p) => /tools[\\/]srv[\\/](index|aiuto)\.mjs$/u.test(p)).length;
  assert.equal(deiFile(letturePrima), 2, 'premessa: il primo calcolo legge i due file, una volta ciascuno');
  assert.equal(deiFile(lettureDopo), 0, '⛔ un file non toccato è stato riletto');
  assert.equal(deiFile(lettureSpenta), 2, 'AL CONTRARIO: con la memoria spenta si legge');
  assert.deepEqual(secondo, primo); assert.deepEqual(spenta, primo, 'la memoria cambia quanto si legge, mai l’impronta');
});

test('IMP-10 — un file cambiato con un’altra data fa cadere la fiducia; e anche rimettendo la stessa dimensione e la stessa data di modifica, la data di cambiamento lo tradisce', async (t) => {
  const { cartella, cartellaTrust, scrivi } = progetto(t);
  scrivi('server/mcp.mjs', '// versione 1\n');
  scrivi('.harness-ui-mcp.json', JSON.stringify({ server: [{ id: 'mio', comando: 'node', argomenti: ['server/mcp.mjs'], allowlist: ['x'] }] }));
  const [s] = (await caricaServerMcp({ cartella })).server;
  await fidaServerMcp({ cartellaTrust, serverId: 'mio', hash: s.hash });
  scrivi('server/mcp.mjs', '// versione 2\n'); // stessa dimensione, altra data
  utimesSync(join(cartella, 'server/mcp.mjs'), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  const [dopo] = (await caricaServerMcp({ cartella })).server;
  assert.equal(await verificaTrustMcp({ cartellaTrust, serverId: 'mio', hash: dopo.hash }), false, '⛔ cambiato e ancora fidato');
  const file = join(cartella, 'server/mcp.mjs'); const prima = statSync(file);
  writeFileSync(file, '// versione 3\n'); utimesSync(file, prima.atime, prima.mtime); // stessa dimensione E stessa data di modifica
  const [terzo] = (await caricaServerMcp({ cartella })).server;
  assert.notEqual(terzo.hash, dopo.hash, 'la ctime è cambiata: la memoria non deve riusare l’hash vecchio');
});

test('IMP-11 — l’elenco si rilegge sempre: un file NUOVO nella cartella dello script si vede al calcolo dopo, anche con la memoria', async (t) => {
  const { cartella, scrivi } = progetto(t);
  scrivi('tools/srv/index.mjs', '// i\n');
  const area = await areaDelProgetto(cartella); const memoria = creaMemoriaDegliHash();
  const token = hookCommandTokens('node tools/srv/index.mjs');
  assert.deepEqual((await referencedScripts(area, token, { memoria })).map((r) => r.path), ['tools/srv/index.mjs']);
  scrivi('tools/srv/nuovo.mjs', '// n\n');
  assert.deepEqual((await referencedScripts(area, token, { memoria })).map((r) => r.path), ['tools/srv/index.mjs', 'tools/srv/nuovo.mjs']);
});

test('IMP-12 — la memoria ha un tetto: oltre `massimoVoci` esce la meno usata', async (t) => {
  const { cartella, scrivi } = progetto(t);
  for (const n of ['a', 'b', 'c']) scrivi(`tools/${n}.mjs`, `// ${n}\n`);
  const area = await areaDelProgetto(cartella); const memoria = creaMemoriaDegliHash({ massimoVoci: 2 });
  await referencedScripts(area, hookCommandTokens('node tools/a.mjs'), { memoria });
  assert.equal(memoria.voci, 2, 'tre file nella cartella, due voci al massimo');
});
