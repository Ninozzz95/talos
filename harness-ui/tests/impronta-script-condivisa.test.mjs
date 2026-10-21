/*
 * ⛔⛔⛔ 17/10/2026 — l'impronta della fiducia di hook e server MCP con gli script del progetto, una regola sola con la CLI
 *   (owner: «Curare come gli hook, insieme alla CLI»; «Stessa regola, una nuova fiducia»; «Vince il desktop, si fissa anche quello»).
 *   Regola: `src/script-del-progetto.mjs` (la CLI 0.6.9 portata qui). File e processi VERI, cartelle temporanee.
 * ⛔ 20/10/2026 (richiesta della CLI): questo file NON importa il frontend, così gira anche nell'albero della CLI, che il frontend del
 *   desktop non lo ha. Il confronto «frase del server = voce inglese del dizionario» sta in `impronta-script-condivisa-dizionario.test.mjs`
 *   (solo desktop), come `terminale-senza-sessione` / `terminale-senza-sessione-desktop`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import { caricaHooks, fidaHook, improntaHook, improntaHookRegolaPrecedente, statoTrustHook, verificaTrust } from '../src/hook-registry.mjs';
import { caricaServerMcp, fidaServerMcp, statoTrustMcp, verificaTrustMcp } from '../src/mcp-registry.mjs';
import { areaDelProgetto, hookCommandTokens, referencedScripts } from '../src/script-del-progetto.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

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
  assert.match(stato.frase, /now also covers the project scripts it runs/u);
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
  /* 18/10/2026: i file appena scritti sono «racy» (IMP-13); qui l'orologio della memoria sta 10 s avanti, cioè file VECCHI */
  const area = await areaDelProgetto(cartella); const memoria = creaMemoriaDegliHash({ ora: () => Date.now() + 10_000 });
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

/* 18/10/2026 — I TIMESTAMP «RACY», come git (Nino3: sul Pad la ctime avanza a scatti, due scritture di fila hanno la stessa ctimeNs). */
test('IMP-13 — un file APPENA scritto si rilegge a ogni calcolo finché le sue date non sono più vecchie di 2 s; AL CONTRARIO, dopo sì dalla memoria', async (t) => {
  const { cartella, scrivi } = progetto(t);
  scrivi('tools/a.mjs', '// a\n');
  const area = await areaDelProgetto(cartella); const token = hookCommandTokens('node tools/a.mjs');
  let adesso = Date.now();
  const memoria = creaMemoriaDegliHash({ ora: () => adesso });
  const deiFile = (lette) => lette.filter((p) => /tools[\\/]a\.mjs$/u.test(p)).length;
  assert.equal(deiFile(await contaLetture(t, () => referencedScripts(area, token, { memoria }))), 1, 'inside one computation a racy file is read once');
  assert.equal(deiFile(await contaLetture(t, () => referencedScripts(area, token, { memoria }))), 1, '⛔ a racy entry was trusted');
  adesso += 5_000; // la voce si rimemorizza col momento nuovo: ora le date sono vecchie di più di 2 s
  await referencedScripts(area, token, { memoria });
  assert.equal(deiFile(await contaLetture(t, () => referencedScripts(area, token, { memoria }))), 0, 'an old enough entry is used');
});

test('IMP-14 — lo scenario del Pad: stessa dimensione, stessa mtime E stessa ctime (scatto grossolano), contenuto diverso → l’hash si ricalcola', () => {
  let adesso = 1_000_000;
  const memoria = creaMemoriaDegliHash({ ora: () => adesso });
  const stato = { size: 14, mtimeMs: 999_500, ctimeMs: 999_900, ino: 7 }; // date nello stesso scatto della lettura
  memoria.metti('/p/mcp.mjs', stato, { sha256: 'vecchio', imports: [] });
  assert.equal(memoria.cerca('/p/mcp.mjs', stato), null, '⛔ a racily clean entry was trusted: the file may have changed in the same tick');
  /* la forma esatta del Pad: la mtime RIMESSA vecchia con utimes, la ctime fresca dello stesso scatto: decide la ctime */
  const rimessa = { ...stato, mtimeMs: 900_000, ctimeMs: 999_900 };
  memoria.metti('/p/mcp.mjs', rimessa, { sha256: 'vecchio', imports: [] });
  assert.equal(memoria.cerca('/p/mcp.mjs', rimessa), null, '⛔ an old mtime hid a fresh ctime');
  adesso = 1_000_000;
  memoria.metti('/p/mcp.mjs', { ...stato, mtimeMs: 990_000, ctimeMs: 990_000 }, { sha256: 'h', imports: [] });
  assert.equal(memoria.cerca('/p/mcp.mjs', { ...stato, mtimeMs: 990_000, ctimeMs: 990_000 })?.sha256, 'h', 'AL CONTRARIO: dates 10 s older than the read are trusted');
  const delCalcolo = creaMemoriaDegliHash({ granaMs: 0, ora: () => adesso });
  delCalcolo.metti('/p/x.mjs', stato, { sha256: 'x', imports: [] });
  assert.equal(delCalcolo.cerca('/p/x.mjs', stato)?.sha256, 'x', 'inside ONE computation the rule is off: a file is read once');
});

test('IMP-15 (CLI, 20/10) una cartella raggiunta da una giunzione verso fuori col `main` che ESCE: niente nome inventato, niente ENOENT', async (t) => {
  const prova = async (main, preparaProgetto) => {
    const { cartella, scrivi } = progetto(t);
    const fuori = mkdtempSync(join(tmpdir(), 'impronta-main-fuori-'));
    t.after(() => rimuoviCartellaDiProva(fuori));
    mkdirSync(join(fuori, 'pkg'), { recursive: true });
    writeFileSync(join(fuori, 'pkg', 'index.js'), '// dentro il pacchetto\n');
    writeFileSync(join(fuori, 'evil.js'), '// fuori\n');
    writeFileSync(join(fuori, 'pkg', 'package.json'), JSON.stringify({ main: typeof main === 'function' ? main({ cartella, fuori }) : main }));
    mkdirSync(join(cartella, 'a'), { recursive: true });
    preparaProgetto?.({ cartella, scrivi });
    try { symlinkSync(join(fuori, 'pkg'), join(cartella, 'a', 'j'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return null; }
    return (await referencedScripts(await areaDelProgetto(cartella), hookCommandTokens('node a/j'))).map((r) => r.path);
  };
  // `main` che esce con `..` verso un file del progetto (il caso della CLI): si fissa quel file, col suo nome vero
  const fuoriConPunti = await prova('../evil.js', ({ scrivi }) => scrivi('a/evil.js', '// progetto\n'));
  if (fuoriConPunti === null) return;
  assert.ok(fuoriConPunti.includes('a/evil.js'), JSON.stringify(fuoriConPunti));
  assert.ok(!fuoriConPunti.some((p) => p.includes('..') || /a\/a\//u.test(p)), 'mai un nome ricomposto a caso');
  // `main` assoluto dentro il progetto: si fissa come una risoluzione normale
  const assolutoDentro = await prova(({ cartella }) => join(cartella, 'vero.js'), ({ scrivi }) => scrivi('vero.js', '// vero\n'));
  assert.ok(assolutoDentro.includes('vero.js'), JSON.stringify(assolutoDentro));
  // `main` assoluto fuori dal progetto: non è del progetto, si salta (e niente ENOENT)
  const assolutoFuori = await prova(({ fuori }) => join(fuori, 'evil.js'));
  assert.ok(!assolutoFuori.some((p) => p.includes('evil')), JSON.stringify(assolutoFuori));
  // al contrario: l'ingresso SOTTO la cartella vera entra col nome scritto, come prima (scelta 1 dell'owner)
  const normale = await prova('index.js');
  assert.ok(normale.includes('a/j/index.js'), JSON.stringify(normale));
});

/*
 * ⛔ 20/10/2026 notte, S2 della revisione della CLI 0.6.11: un file fissato attraverso un SYMLINK verso fuori dal progetto. La memoria
 *   usava come chiave l'`lstat` del link, che non cambia quando cambia il bersaglio: l'impronta restava vecchia per tutta la vita del
 *   processo. IMP-16 col symlink vero: gira su Linux (il Pad, la CI) e su macOS, ed è saltata dove crearlo dà EPERM (Windows senza
 *   Developer Mode). Un'emulazione con `lstat` finto non vale: «symlink» lo leggerebbe anche il percorso delle cartelle, che fissa il
 *   file come `link:…` con un'impronta costante, cioè un'altra strada (misurato il 20/10).
 */
async function improntaDi(cartella, token, memoria) {
  return (await referencedScripts(await areaDelProgetto(cartella), hookCommandTokens(token), { memoria })).map((r) => `${r.path}=${r.sha256}`).sort();
}

test('IMP-16 — un file raggiunto da un symlink vero: il bersaglio cambia ⇒ l’impronta cambia, anche con la memoria', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'impronta-symlink-fuori-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  writeFileSync(join(fuori, 'run.mjs'), '// versione 1\n');
  scrivi('tools/.tieni', '');
  try { symlinkSync(join(fuori, 'run.mjs'), join(cartella, 'tools', 'run.mjs'), 'file'); } catch (errore) { t.skip(`symlink a file non creato (${errore.code})`); return; }
  const memoria = creaMemoriaDegliHash({ ora: () => Date.now() + 10_000 });
  const prima = await improntaDi(cartella, 'node tools/run.mjs', memoria);
  assert.ok(prima.some((r) => r.startsWith('tools/run.mjs=')), JSON.stringify(prima));
  writeFileSync(join(fuori, 'run.mjs'), '// versione 2\n'); // stessa dimensione
  utimesSync(join(fuori, 'run.mjs'), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  const dopo = await improntaDi(cartella, 'node tools/run.mjs', memoria);
  assert.notDeepEqual(dopo, prima, '⛔ il bersaglio è cambiato e l’impronta no');
  assert.deepEqual(dopo, await improntaDi(cartella, 'node tools/run.mjs', null), 'con e senza memoria, la stessa impronta');
});

test('IMP-18 (CLI, revisione 2 della 0.6.11) uno script IMPORTATO attraverso una giunzione verso fuori entra col nome scritto, e cambiarlo cambia l’impronta', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'impronta-import-fuori-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  writeFileSync(join(fuori, 'x.js'), 'console.log("V1")\n');
  writeFileSync(join(fuori, 'y.js'), '// fuori, mai importato dal progetto\n');
  scrivi('main.js', 'require("./lib/x.js")\nrequire("../' + basename(fuori) + '/y.js")\n');
  try { symlinkSync(fuori, join(cartella, 'lib'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const prima = await improntaDi(cartella, 'node main.js', null);
  assert.ok(prima.some((r) => r.startsWith('lib/x.js=')), `il file importato attraverso la giunzione entra col nome scritto: ${JSON.stringify(prima)}`);
  assert.ok(!prima.some((r) => r.includes('y.js')), 'AL CONTRARIO: un import che esce dal progetto anche per nome resta fuori');
  writeFileSync(join(fuori, 'x.js'), 'console.log("V2")\n');
  assert.notDeepEqual(await improntaDi(cartella, 'node main.js', null), prima, '⛔ il file importato è cambiato e l’impronta no');
});

test('IMP-19 (revisione del 21/10) un pacchetto Python IMPORTATO attraverso una giunzione entra col suo __init__.py, anche se ha __main__.py', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'impronta-pkg-fuori-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  mkdirSync(join(fuori, 'pkg'));
  writeFileSync(join(fuori, 'pkg', '__init__.py'), 'X = 1\n');
  writeFileSync(join(fuori, 'pkg', '__main__.py'), 'print(1)\n');
  scrivi('app.py', 'import lib.pkg\n');
  try { symlinkSync(fuori, join(cartella, 'lib'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const prima = await improntaDi(cartella, 'python app.py', null);
  assert.ok(prima.some((r) => r.startsWith('lib/pkg/__init__.py=')), JSON.stringify(prima));
  writeFileSync(join(fuori, 'pkg', '__init__.py'), 'X = 2\n');
  assert.notDeepEqual(await improntaDi(cartella, 'python app.py', null), prima, '⛔ __init__.py cambiato, impronta uguale');
});

test('IMP-20 (owner 21/10, «Seguirli») gli import di un file entrato attraverso una giunzione si seguono, col nome scritto', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'impronta-segui-fuori-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  writeFileSync(join(fuori, 'x.js'), 'require("./helper.js")\n');
  // l'helper importa di nuovo x.js (un giro chiuso) e un file che esce dal progetto anche per nome
  writeFileSync(join(fuori, 'helper.js'), 'require("./x.js")\nrequire("../../../../../../../../fuori-del-tutto.js")\n');
  scrivi('main.js', 'require("./lib/x.js")\n');
  try { symlinkSync(fuori, join(cartella, 'lib'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const prima = await improntaDi(cartella, 'node main.js', null);
  assert.deepEqual(prima.map((r) => r.split('=')[0]), ['lib/helper.js', 'lib/x.js', 'main.js'], 'l’helper entra col nome scritto, una volta sola, e niente esce');
  writeFileSync(join(fuori, 'helper.js'), 'require("./x.js")\n// cambiato\n');
  assert.notDeepEqual(await improntaDi(cartella, 'node main.js', null), prima, '⛔ l’helper è cambiato e l’impronta no');
});

test('IMP-21 (revisione del 21/10, S4) Node risolve dal percorso VERO: un `../comune/z.js` del file entrato per link non fissa lo z.js del progetto', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'impronta-vero-fuori-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  mkdirSync(join(fuori, 'pkg')); mkdirSync(join(fuori, 'comune'));
  writeFileSync(join(fuori, 'pkg', 'x.js'), 'require("../comune/z.js")\nrequire("./vicino.js")\n');
  writeFileSync(join(fuori, 'pkg', 'vicino.js'), '// accanto\n');
  writeFileSync(join(fuori, 'comune', 'z.js'), '// Z-FUORI\n');
  scrivi('comune/z.js', '// Z-DENTRO\n');
  scrivi('main.js', 'require("./lib/x.js")\n');
  try { symlinkSync(join(fuori, 'pkg'), join(cartella, 'lib'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const righe = (await improntaDi(cartella, 'node main.js', null)).map((r) => r.split('=')[0]);
  assert.ok(!righe.includes('comune/z.js'), `⛔ fissato lo z.js del progetto, che Node non esegue: ${JSON.stringify(righe)}`);
  // AL CONTRARIO: dove le due strade portano allo stesso file, il nome scritto resta
  assert.ok(righe.includes('lib/vicino.js'), JSON.stringify(righe));
  assert.ok(righe.includes('lib/x.js'), JSON.stringify(righe));
});

test('IMP-22 (revisione del 21/10, S5) due giunzioni che si chiamano a vicenda: niente righe finte che crescono', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'impronta-giro-fuori-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  writeFileSync(join(fuori, 'x.js'), 'require("./back/lib/x.js")\n');
  scrivi('main.js', 'require("./lib/x.js")\n');
  try {
    symlinkSync(fuori, join(cartella, 'lib'), 'junction');
    symlinkSync(cartella, join(fuori, 'back'), 'junction');
  } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const righe = (await improntaDi(cartella, 'node main.js', null)).map((r) => r.split('=')[0]);
  assert.ok(righe.length <= 3, `righe: ${JSON.stringify(righe)}`);
  assert.ok(!righe.some((r) => /back\/lib\/back/u.test(r)), JSON.stringify(righe));
});

test('IMP-23 (seconda revisione del 21/10, S4) un import che col nome scritto NON si risolve, ma col percorso vero porta DENTRO il progetto: il file che Node esegue entra', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'impronta-solo-vero-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  const nomeProgetto = cartella.split(/[\\/]/u).pop();
  // dal percorso vero (fuori/x.js) «../<progetto>/src/y.js» è il file del progetto; dal nome scritto (a/b/lib/x.js) non esiste
  writeFileSync(join(fuori, 'x.js'), `require("../${nomeProgetto}/src/y.js")\n`);
  scrivi('src/y.js', '// Y\n');
  scrivi('main.js', 'require("./a/b/lib/x.js")\n');
  mkdirSync(join(cartella, 'a', 'b'), { recursive: true });
  try { symlinkSync(fuori, join(cartella, 'a', 'b', 'lib'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const righe = (await improntaDi(cartella, 'node main.js', null)).map((r) => r.split('=')[0]);
  assert.ok(righe.includes('src/y.js'), `⛔ Node esegue src/y.js e l'impronta non lo fissa: ${JSON.stringify(righe)}`);
  assert.ok(righe.includes('a/b/lib/x.js'), JSON.stringify(righe));
});

/* Revisione 1 della CLI 0.6.12 (21/10/2026): S2-2a, S3-1, S2-2b (owner «Fissarlo col percorso vero»), domanda 1 (costo). */
test('IMP-24 (S2-2a) `from lib import helper` con lib raggiunta per giunzione: helper.py entra col nome scritto, senza la cartella; un attributo no', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'impronta-py-sotto-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  writeFileSync(join(fuori, '__init__.py'), 'from . import vicino\nVALORE = 1\n');
  writeFileSync(join(fuori, 'helper.py'), 'X = 1\n');
  writeFileSync(join(fuori, 'vicino.py'), 'Y = 1\n');
  writeFileSync(join(fuori, 'mai.py'), 'Z = 1\n');
  scrivi('main.py', 'from lib import helper, VALORE as v\n');
  try { symlinkSync(fuori, join(cartella, 'lib'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const prima = await improntaDi(cartella, 'python main.py', null);
  const nomi = prima.map((r) => r.split('=')[0]);
  assert.ok(nomi.includes('lib/helper.py'), `⛔ helper.py non fissato: ${JSON.stringify(nomi)}`);
  assert.ok(nomi.includes('lib/vicino.py'), `⛔ «from . import vicino» nel __init__.py linkato: ${JSON.stringify(nomi)}`);
  assert.ok(!nomi.includes('lib/mai.py'), 'la cartella NON si fissa (scelta 1): un file mai importato resta fuori');
  writeFileSync(join(fuori, 'helper.py'), 'X = 2\n');
  assert.notDeepEqual(await improntaDi(cartella, 'python main.py', null), prima, '⛔ helper.py cambiato, impronta uguale');
});

test('IMP-25 (S3-1) `import lib.helper` fissa anche lib/__init__.py (Python lo esegue prima), dentro il progetto', async (t) => {
  const { cartella, scrivi } = progetto(t);
  scrivi('lib/__init__.py', 'A = 1\n');
  scrivi('lib/helper.py', 'B = 1\n');
  scrivi('a/__init__.py', '');
  scrivi('a/b/__init__.py', '');
  scrivi('a/b/c.py', '');
  scrivi('main.py', 'import lib.helper\nimport a.b.c as abc\n');
  const nomi = (await improntaDi(cartella, 'python main.py', null)).map((r) => r.split('=')[0]);
  for (const atteso of ['lib/__init__.py', 'lib/helper.py', 'a/__init__.py', 'a/b/__init__.py', 'a/b/c.py']) assert.ok(nomi.includes(atteso), `${atteso}: ${JSON.stringify(nomi)}`);
});

test('IMP-26 i punti di un import relativo Python sono LIVELLI: `from .. import x` in pkg/sub/m.py è pkg/x.py, non pkg/sub/x.py', async (t) => {
  const { cartella, scrivi } = progetto(t);
  scrivi('pkg/x.py', '# giusto\n');
  scrivi('pkg/sub/x.py', '# sbagliato\n');
  scrivi('pkg/sub/m.py', 'from .. import x\n');
  scrivi('main.py', 'import pkg.sub.m\n');
  const nomi = (await improntaDi(cartella, 'python main.py', null)).map((r) => r.split('=')[0]);
  assert.ok(nomi.includes('pkg/x.py'), JSON.stringify(nomi));
  assert.ok(!nomi.includes('pkg/sub/x.py'), JSON.stringify(nomi));
});

test('IMP-27 (S2-2b, owner 21/10 «Fissarlo col percorso vero») il file che Node esegue FUORI dal progetto per percorso vero entra con id external:, i suoi import no', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const vendor = mkdtempSync(join(tmpdir(), 'impronta-vendor-'));
  t.after(() => rimuoviCartellaDiProva(vendor));
  mkdirSync(join(vendor, 'pkg'));
  writeFileSync(join(vendor, 'pkg', 'x.js'), 'require("../shared.js")\n');
  writeFileSync(join(vendor, 'shared.js'), 'require("./profondo.js")\n');
  writeFileSync(join(vendor, 'profondo.js'), '// oltre non si cammina\n');
  scrivi('main.js', 'require("./lib/x.js")\n');
  try { symlinkSync(join(vendor, 'pkg'), join(cartella, 'lib'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const prima = await improntaDi(cartella, 'node main.js', null);
  const nomi = prima.map((r) => r.split('=')[0]);
  const esterni = nomi.filter((n) => n.startsWith('external:'));
  assert.equal(esterni.length, 1, JSON.stringify(nomi));
  assert.match(esterni[0], /\/shared\.js$/u);
  assert.ok(!nomi.some((n) => /profondo/u.test(n)), 'i suoi import non si seguono');
  writeFileSync(join(vendor, 'shared.js'), 'require("./profondo.js")\n// cambiato\n');
  assert.notDeepEqual(await improntaDi(cartella, 'node main.js', null), prima, '⛔ shared.js cambiato, fiducia intatta');
});

test('IMP-28 (domanda 1) oltre il tetto delle risoluzioni lo si DICE con una riga, mai un taglio muto; sotto il tetto nessuna riga', async (t) => {
  const { cartella, scrivi } = progetto(t);
  scrivi('main.js', Array.from({ length: 40 }, (_, i) => `require("./manca-${i}.js")`).join('\n') + '\nrequire("./c.js")\n');
  scrivi('c.js', '');
  const area = await areaDelProgetto(cartella);
  const stretto = (await referencedScripts(area, hookCommandTokens('node main.js'), { memoria: null, maxRealpath: 20 })).map((r) => `${r.path}=${r.sha256}`);
  assert.ok(stretto.some((r) => r.startsWith('…resolutions=not-checked:resolutions-past-20')), JSON.stringify(stretto));
  const largo = (await referencedScripts(area, hookCommandTokens('node main.js'), { memoria: null })).map((r) => r.path);
  assert.ok(!largo.some((r) => r.startsWith('…resolutions')), JSON.stringify(largo));
  assert.ok(largo.includes('c.js'), JSON.stringify(largo));
});

test('IMP-29 (revisione del 21/10, S5) fuori dal progetto entra solo ciò che Node carica: un require fallito non fa entrare x.py o index.py', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const vendor = mkdtempSync(join(tmpdir(), 'impronta-vendor-ext-'));
  t.after(() => rimuoviCartellaDiProva(vendor));
  mkdirSync(join(vendor, 'pkg')); mkdirSync(join(vendor, 'cartella'));
  writeFileSync(join(vendor, 'pkg', 'x.js'), 'require("../solo-python")\nrequire("../cartella")\nrequire("../vero.js")\n');
  writeFileSync(join(vendor, 'solo-python.py'), '# Node non lo esegue\n');
  writeFileSync(join(vendor, 'cartella', 'index.py'), '# nemmeno questo\n');
  writeFileSync(join(vendor, 'vero.js'), '// questo sì\n');
  scrivi('main.js', 'require("./lib/x.js")\n');
  try { symlinkSync(join(vendor, 'pkg'), join(cartella, 'lib'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const esterni = (await improntaDi(cartella, 'node main.js', null)).map((r) => r.split('=')[0]).filter((n) => n.startsWith('external:'));
  assert.equal(esterni.length, 1, JSON.stringify(esterni));
  assert.match(esterni[0], /\/vero\.js$/u);
});

test('IMP-30 (revisione 3 della CLI 0.6.12, S2) fuori dal progetto: TypeScript entra (Node 24 lo esegue), un nome scritto per intero entra qualunque sia l estensione, ciò che Node non carica mai resta fuori', async (t) => {
  const { cartella, scrivi } = progetto(t);
  const vendor = mkdtempSync(join(tmpdir(), 'impronta-vendor-ts-'));
  t.after(() => rimuoviCartellaDiProva(vendor));
  mkdirSync(join(vendor, 'pkg'));
  writeFileSync(join(vendor, 'pkg', 'x.ts'), 'import "../shared.ts"\nrequire("../run.sh")\nrequire("../solo-python")\n');
  writeFileSync(join(vendor, 'shared.ts'), 'export const a: number = 1\n');
  writeFileSync(join(vendor, 'run.sh'), 'console.log("SH")\n');
  writeFileSync(join(vendor, 'solo-python.py'), '# Node non lo prova\n');
  scrivi('main.ts', 'import "./lib/x.ts"\n');
  try { symlinkSync(join(vendor, 'pkg'), join(cartella, 'lib'), 'junction'); } catch (errore) { t.skip(`giunzione non creata (${errore.code})`); return; }
  const prima = await improntaDi(cartella, 'node main.ts', null);
  const nomi = prima.map((r) => r.split('=')[0]);
  const esterno = (fine) => prima.find((r) => r.startsWith('external:') && r.split('=')[0].endsWith(fine));
  assert.ok(esterno('/shared.ts') && !esterno('/shared.ts').includes('not-checked'), `⛔ .ts eseguito da Node, fuori dall'impronta: ${JSON.stringify(nomi)}`);
  assert.ok(esterno('/run.sh') && !esterno('/run.sh').includes('not-checked'), `il nome scritto per intero entra: ${JSON.stringify(nomi)}`);
  assert.equal(esterno('/solo-python.py'), undefined, `Node non aggiunge .py: non lo carica mai, nessuna riga: ${JSON.stringify(prima)}`);
  writeFileSync(join(vendor, 'shared.ts'), 'export const a: number = 2\n');
  assert.notDeepEqual(await improntaDi(cartella, 'node main.ts', null), prima, '⛔ shared.ts cambiato, fiducia intatta');
});
