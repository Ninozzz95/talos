/*
 * Revisione Z (04/11/2026), parte 3: il server dell'app del telefono (`TalosR4Avvio.kt` avvia `server.mjs` con `TALOS_LOCALE_OSPITE_DIR`)
 * gira lo stesso `server.mjs` del PC. Dopo la decisione 139 il catalogo dei blocchi è acceso di serie lì dentro, e una conversazione che
 * nasce nell'app del telefono (Codice sul server del telefono) non ha un `dispositivo` remoto: `blocchiViviAllaNascita` dice sì.
 * La condizione (1) del Mobile (forma del 04/11, 10:58) chiede il contrario fino a UI-137. Come per i Passi (`listaPassiDelServer`,
 * `telefono: accessoLocaleOspite.attivo`, PASSI-17 in `passi-del-giro.test.mjs`) e per `impostazioniApp`
 * (`accessoLocaleOspite.attivo ? null : ...`), il server del telefono deve restare senza catalogo.
 * Z-3.1 con gli OK di Mobile, CLI e Performance (04/11, 15:04): il segnale del telefono è `accessoLocaleOspite.attivo` OPPURE
 * `TALOS_KERNEL_SUL_TELEFONO=1` (il Codice in casa, `TalosCodiceInCasa.kt`, mette solo quella: correzione del Mobile). Condizione di
 * Performance: sul PC il primo messaggio di sistema resta byte per byte quello di oggi.
 * Z-3.2 (deciso da Performance): il catalogo si fissa alla NASCITA, come i Passi, e non segue il «nessuno davanti» del giro.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import { blocchiViviAllaNascita, catalogoBlocchiDaAmbiente, promptDelCatalogo } from '../src/blocchi/prompt-del-catalogo.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const PC = { clic: true };

/* La riga vera di `server.mjs`, valutata con un ambiente e un ospite finti: si prova il comportamento della riga, non solo il suo testo. */
function chiamataDelServer() {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const riga = /catalogoBlocchi: (catalogoBlocchiDaAmbiente\([^\n]*?\)), \/\//u.exec(server)?.[1] ?? '';
  return { server, riga, valuta: (env, attivo) => new Function('catalogoBlocchiDaAmbiente', 'process', 'accessoLocaleOspite', `return ${riga};`)(
    catalogoBlocchiDaAmbiente, { env }, { attivo }) };
}

test('REVZ-TEL-01 — the phone app server (accessoLocaleOspite.attivo or TALOS_KERNEL_SUL_TELEFONO=1) never turns the block catalog on', () => {
  const { server, riga, valuta } = chiamataDelServer();
  assert.match(riga, /accessoLocaleOspite\.attivo/u, `catalogoBlocchi in server.mjs ignores the phone host: «${riga}»`);
  assert.match(server, /catalogoBlocchi: catalogoBlocchiDaAmbiente\(process\.env, \{ telefono: accessoLocaleOspite\.attivo \}\)/u);
  assert.deepEqual(valuta({}, false), PC, 'the PC: on by default');
  assert.equal(valuta({ TALOS_CATALOGO_BLOCCHI: '0' }, false), null, 'the PC with the switch off');
  assert.equal(valuta({}, true), null, 'the phone app server (TalosR4Avvio.kt: TALOS_LOCALE_OSPITE_DIR)');
  assert.equal(valuta({ TALOS_KERNEL_SUL_TELEFONO: '1' }, false), null, 'the old Code at home (TalosCodiceInCasa.kt): only TALOS_KERNEL_SUL_TELEFONO=1');
  assert.equal(valuta({ TALOS_KERNEL_SUL_TELEFONO: '1', TALOS_CATALOGO_BLOCCHI: '1' }, true), null, 'nothing turns it on on the phone');
});

test('REVZ-TEL-02 — catalogoBlocchiDaAmbiente: on by default on the PC, off with the switch, never on the phone', () => {
  assert.deepEqual(catalogoBlocchiDaAmbiente({}), PC, 'on by default on the PC (decision 139)');
  assert.deepEqual(catalogoBlocchiDaAmbiente({}, { telefono: false }), PC, 'telefono:false is the PC');
  assert.deepEqual(catalogoBlocchiDaAmbiente({ TALOS_CATALOGO_BLOCCHI: '1' }, {}), PC);
  assert.equal(catalogoBlocchiDaAmbiente({ TALOS_CATALOGO_BLOCCHI: '0' }), null, 'the emergency switch');
  assert.equal(catalogoBlocchiDaAmbiente({}, { telefono: true }), null, 'the phone app server stays without the catalog');
  assert.equal(catalogoBlocchiDaAmbiente({ TALOS_CATALOGO_BLOCCHI: '1' }, { telefono: true }), null, 'not even the variable turns it on on the phone');
  assert.equal(catalogoBlocchiDaAmbiente({ TALOS_CATALOGO_BLOCCHI: '0' }, { telefono: true }), null);
  /* only a real `true`, like listaPassiDelServer: a truthy non-boolean does not count as the phone */
  assert.deepEqual(catalogoBlocchiDaAmbiente({}, { telefono: 'si' }), PC);
  /* the Code at home (correction of the Mobile): only TALOS_KERNEL_SUL_TELEFONO=1, one form */
  assert.equal(catalogoBlocchiDaAmbiente({ TALOS_KERNEL_SUL_TELEFONO: '1' }), null, 'TALOS_KERNEL_SUL_TELEFONO=1 alone is the phone');
  assert.equal(catalogoBlocchiDaAmbiente({ TALOS_KERNEL_SUL_TELEFONO: '1' }, { telefono: false }), null);
  assert.equal(catalogoBlocchiDaAmbiente({ TALOS_KERNEL_SUL_TELEFONO: '1', TALOS_CATALOGO_BLOCCHI: '1' }), null);
  assert.deepEqual(catalogoBlocchiDaAmbiente({ TALOS_KERNEL_SUL_TELEFONO: '0' }), PC);
  assert.deepEqual(catalogoBlocchiDaAmbiente({ TALOS_KERNEL_SUL_TELEFONO: 'true' }), PC, 'one form only, like the other switches');
  assert.deepEqual(catalogoBlocchiDaAmbiente(undefined, { telefono: false }), PC);
});

test('REVZ-TEL-03 — the Steps follow the same phone rule as the catalog: TALOS_KERNEL_SUL_TELEFONO=1 alone (the Code at home) keeps them off', async () => {
  const { listaPassiDelServer } = await import('../src/passi-del-server.mjs');
  assert.equal(listaPassiDelServer({}), true, 'the PC: on by default');
  assert.equal(listaPassiDelServer({}, { telefono: true }), false, 'the phone app server');
  assert.equal(listaPassiDelServer({ TALOS_KERNEL_SUL_TELEFONO: '1' }), false, 'the old Code at home: only TALOS_KERNEL_SUL_TELEFONO=1');
  assert.equal(listaPassiDelServer({ TALOS_KERNEL_SUL_TELEFONO: '1', TALOS_PASSI: '1' }, { telefono: false }), false, 'nothing turns them on on the phone');
  assert.equal(listaPassiDelServer({ TALOS_KERNEL_SUL_TELEFONO: '0' }), true, 'one form only');
  assert.equal(listaPassiDelServer({ TALOS_KERNEL_SUL_TELEFONO: 'true' }), true, 'one form only');
  /* the real server line, with a fake environment and host */
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const riga = /listaPassi: (listaPassiDelServer\([^\n]*?\)), \/\//u.exec(server)?.[1] ?? '';
  const valuta = (env, attivo) => new Function('listaPassiDelServer', 'process', 'accessoLocaleOspite', `return ${riga};`)(listaPassiDelServer, { env }, { attivo });
  assert.equal(valuta({}, false), true);
  assert.equal(valuta({}, true), false);
  assert.equal(valuta({ TALOS_KERNEL_SUL_TELEFONO: '1' }, false), false, 'the server line passes the real environment');
});

/* ---------- the whole wire: real registry → real agent-service → real kernel, the provider request taken on the fly ---------- */

async function finche(condizione, tetto = 5_000) {
  const fine = Date.now() + tetto;
  while (!condizione()) {
    if (Date.now() > fine) throw new Error('condizione mai vera');
    await new Promise((f) => setTimeout(f, 10));
  }
}

function registroDalFilo(t, opzioni = {}) {
  const richieste = [];
  const ingressi = [];
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-revz-filo-'));
  const rete = async (_url, init) => {
    richieste.push(JSON.parse(init.body).messages);
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  };
  const r = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => {
      ingressi.push(input);
      return avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, _giriMassimiInterno: 1, fetchDiRete: rete }) });
    },
    ...opzioni,
  });
  t.after(async () => { await r.chiudi?.({ attesaMassimaMs: 2_000 }).catch(() => {}); try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ } rimuoviCartellaDiProva(cartellaStore); });
  return { r, richieste, ingressi };
}
/* the first system message travels as text pieces (with the cache mark): read the text of the pieces */
const primoDiSistema = (messaggi) => {
  const m = messaggi.find((x) => x.role === 'system');
  return Array.isArray(m?.content) ? m.content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : String(m?.content ?? '');
};
async function primoDelPc(t, catalogoBlocchi) {
  const filo = registroDalFilo(t, { catalogoBlocchi, blocchiViviPerNuoveFn: blocchiViviAllaNascita(() => true) });
  filo.r.avvia('task');
  await finche(() => filo.richieste.length > 0);
  return primoDiSistema(filo.richieste[0]);
}

test('REVZ-PC-01 (Performance) — on the PC the first system message stays byte for byte the one of today', async (t) => {
  /* today (b13064330) the PC host passed `catalogoBlocchiDaAmbiente(process.env)` = `{ clic: true }` with an empty environment */
  const oggi = await primoDelPc(t, { clic: true });
  assert.ok(oggi.includes(promptDelCatalogo(PC)), 'the comparison must look at a prefix WITH the catalog');
  const { valuta } = chiamataDelServer();
  for (const env of [{}, { TALOS_CATALOGO_BLOCCHI: '' }, { TALOS_CATALOGO_BLOCCHI: '1' }, { TALOS_KERNEL_SUL_TELEFONO: '0' }]) {
    assert.equal(await primoDelPc(t, valuta(env, false)), oggi, `PC, ${JSON.stringify(env)}: byte for byte`);
  }
  assert.equal((await primoDelPc(t, valuta({}, true))).includes('## Blocks'), false, 'and the phone app server has no catalog in the prefix');
  assert.equal((await primoDelPc(t, valuta({ TALOS_KERNEL_SUL_TELEFONO: '1' }, false))).includes('## Blocks'), false, 'nor the Code at home');
});

test('REVZ-Z32-01 (Performance) — the catalog is fixed at birth: PC closed at turn 2 and open at turn 3, same option and same prefix in turns 1, 2, 3', async (t) => {
  const filo = registroDalFilo(t, { catalogoBlocchi: catalogoBlocchiDaAmbiente({}), blocchiViviPerNuoveFn: blocchiViviAllaNascita(() => true) });
  const { sessionId } = filo.r.avvia('task', { senzaInterfacciaNelGiro: false });
  await finche(() => filo.richieste.length === 1);
  await filo.r.attendiAssestamento(sessionId);
  filo.r.resume(sessionId, 'avanti', [], { senzaInterfacciaNelGiro: true });
  await finche(() => filo.richieste.length === 2);
  await filo.r.attendiAssestamento(sessionId);
  filo.r.resume(sessionId, 'ancora', [], { senzaInterfacciaNelGiro: false });
  await finche(() => filo.richieste.length === 3);
  await filo.r.attendiAssestamento(sessionId);
  assert.equal(filo.ingressi[1].nessunoDavanti, true, 'the test must look at a turn with nobody in front');
  assert.deepEqual(filo.ingressi.map((i) => i.catalogoBlocchi ?? null), [PC, PC, PC], 'the option follows the birth, not the turn');
  const prefissi = filo.richieste.map(primoDiSistema);
  assert.ok(prefissi[0].includes(promptDelCatalogo(PC)));
  assert.equal(prefissi[1], prefissi[0], 'turn 2 (nobody in front): same prefix, byte for byte');
  assert.equal(prefissi[2], prefissi[0], 'turn 3 (back in front): same prefix, byte for byte');
});

test('REVZ-Z32-02 — a conversation BORN with nobody in front (automation) stays without the catalog, even when a person opens it later', async (t) => {
  const filo = registroDalFilo(t, { catalogoBlocchi: catalogoBlocchiDaAmbiente({}), blocchiViviPerNuoveFn: blocchiViviAllaNascita(() => true) });
  const { sessionId } = filo.r.avvia('task', { senzaInterfaccia: true });
  await finche(() => filo.richieste.length === 1);
  await filo.r.attendiAssestamento(sessionId);
  filo.r.resume(sessionId, 'la apro io', [], { senzaInterfacciaNelGiro: false });
  await finche(() => filo.richieste.length === 2);
  await filo.r.attendiAssestamento(sessionId);
  assert.equal(filo.ingressi[1].nessunoDavanti ?? false, false, 'the test must look at a turn with a person in front');
  assert.deepEqual(filo.ingressi.map((i) => Object.hasOwn(i, 'catalogoBlocchi')), [false, false]);
  assert.equal(filo.richieste.some((m) => primoDiSistema(m).includes('## Blocks')), false);
});
