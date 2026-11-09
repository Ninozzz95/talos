/*
 * `senzaIstruzioniDelProgetto` (forma B del blocco CLI del 02/11/2026, OK di tutte le sessioni): una cartella di cui la persona non si
 * fida non scrive nel prompt. Il preambolo perde le istruzioni e tiene la mappa; spenta di serie, il testo resta identico byte per byte.
 * Le prove del filo intero (registro, ripresa, /resume) stanno più sotto: `agent-service` e il registro ricostruiscono campo per campo.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { avviaSessione } from '../src/agent-service.mjs';
import { contestoDelProgetto } from '../src/contesto-del-progetto.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SEGRETO = 'ISTRUZIONE-DELLA-CARTELLA-7731';
const radici = [];
after(async () => { for (const r of radici) await rimuoviCartellaDiProvaAttesa(r); });

async function progetto() {
  const radice = await mkdtemp(join(tmpdir(), 'talos-senza-istruzioni-'));
  radici.push(radice);
  await mkdir(join(radice, '.git'));
  await mkdir(join(radice, 'src', 'dentro'), { recursive: true });
  await writeFile(join(radice, 'AGENTS.md'), `# Regole\n${SEGRETO}-AGENTS\n`);
  await writeFile(join(radice, 'CLAUDE.md'), `# Regole\n${SEGRETO}-CLAUDE\n`);
  await writeFile(join(radice, 'src', 'AGENTS.md'), `# Sotto\n${SEGRETO}-SOTTO\n`);
  await writeFile(join(radice, 'src', 'dentro', 'CLAUDE.md'), `# Più sotto\n${SEGRETO}-PIU-SOTTO\n`);
  await writeFile(join(radice, 'src', 'dentro', 'a.txt'), 'x\n');
  return radice;
}
const creaFiltro = async () => () => true;

test('con l\'opzione il preambolo non porta nessun file di istruzioni, da nessuna cartella, e tiene la mappa', async () => {
  const radice = await progetto();
  for (const cartella of [radice, join(radice, 'src'), join(radice, 'src', 'dentro')]) {
    const con = await contestoDelProgetto({ cartella, creaFiltro, permesso: 'p1', modello: 'm1', statoVolatile: false });
    assert.match(String(con?.testo), new RegExp(SEGRETO), `${cartella}: di serie le istruzioni ci sono`);
    const senza = await contestoDelProgetto({ cartella, creaFiltro, permesso: 'p1', modello: 'm1', statoVolatile: false, senzaIstruzioni: true });
    assert.doesNotMatch(String(senza?.testo), new RegExp(SEGRETO), cartella);
    assert.ok(String(senza?.testo).length > 0, 'la mappa e la scheda restano');
  }
});

test('la cache non confonde i due: acceso dopo spento, e spento dopo acceso, ognuno il suo testo', async () => {
  const radice = await progetto();
  const base = { cartella: radice, creaFiltro, permesso: 'p2', modello: 'm2', statoVolatile: false };
  const prima = await contestoDelProgetto(base);
  const senza = await contestoDelProgetto({ ...base, senzaIstruzioni: true });
  const dopo = await contestoDelProgetto(base);
  assert.doesNotMatch(String(senza?.testo), new RegExp(SEGRETO));
  assert.equal(dopo.testo, prima.testo, 'spenta, byte per byte come prima');
  assert.equal(dopo.riusato, true, 'spenta usa la stessa voce di cache di sempre');
});

/* Il filo intero: `agent-service` e il registro ricostruiscono l'ingresso campo per campo (condizione del Desktop). */
const finito = { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [] };

test('agent-service: l\'opzione arriva al preambolo, al giro e alla traccia; spenta, nessuno dei tre la vede', async () => {
  const radice = await progetto();
  const giro = async (extra) => {
    const eventi = []; let visto = null;
    await avviaSessione({ cartella: radice, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { eventi.push(e); },
      talosLavoraFn: async (input) => { visto = input; return finito; }, ...extra });
    return { visto, contesto: eventi.find((e) => e.type === 'RunStarted')?.contesto };
  };
  const senza = await giro({ senzaIstruzioniDelProgetto: true });
  assert.doesNotMatch(String(senza.visto.contestoDelProgetto), new RegExp(SEGRETO));
  assert.equal(senza.visto.senzaIstruzioniDelProgetto, true);
  assert.equal(senza.contesto.senzaIstruzioniDelProgetto, true, 'si vede nella traccia del giro');
  const di_serie = await giro({});
  assert.match(String(di_serie.visto.contestoDelProgetto), new RegExp(SEGRETO));
  assert.equal('senzaIstruzioniDelProgetto' in di_serie.visto, false, 'golden: il campo non esiste nemmeno');
  assert.equal('senzaIstruzioniDelProgetto' in di_serie.contesto, false);
});

test('adattatore: con l\'opzione nessuna sezione entra, né alla cattura né alla preparazione; di serie sì', async () => {
  const radice = await progetto();
  await writeFile(join(radice, 'AGENTS.md'), `# Uno\n${SEGRETO}-UNO\n\n## Due\n${SEGRETO}-DUE\n`.repeat(40));
  const giro = async (extra) => {
    const messaggi = [{ role: 'user', content: 'x' }, { role: 'tool', tool_call_id: 't', name: 'read_file', content: 'y' }];
    const hooks = { capture: async () => null, prepare: async (i) => i };
    const adapter = createOwnerRuntimeAdapter({ importFn: async () => ({ talosLavora: async (input) => {
      await input.contextHooks.capture?.({ messages: messaggi }); await input.contextHooks.prepare?.({ messages: messaggi }); return input.contextHooks; } }) });
    return { uscita: await adapter.talosLavora({ cartella: radice, contextHooks: hooks, fetchDiRete: async () => Response.json({}), ...extra }), hooks, messaggi };
  };
  const senza = await giro({ senzaIstruzioniDelProgetto: true });
  assert.equal(senza.uscita, senza.hooks, 'gli hook restano quelli del chiamante, nessun iniettore');
  assert.doesNotMatch(JSON.stringify(senza.messaggi), new RegExp(SEGRETO));
  const di_serie = await giro({});
  assert.notEqual(di_serie.uscita, di_serie.hooks, 'al contrario: di serie l\'iniettore c\'è');
});

function banco(t, senzaIstruzioniDelProgettoFn, store) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-senza-banco-')); radici.push(radice);
  const corse = [];
  const registro = createSessionRegistry({ cartellaStore: store, modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...(senzaIstruzioniDelProgettoFn ? { senzaIstruzioniDelProgettoFn } : {}),
    preparaEsecuzioneFn: (id) => ({ ok: true, cartella: radice, task: { id, consegna: 'Verifica.' }, comandoProva: null }),
    avviaSessioneFn: async (input) => { corse.push(input); input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' });
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'Verifica.' }, { role: 'assistant', content: 'ok' }] } }; } });
  t.after(() => registro.chiudi());
  return { registro, corse, radice };
}
const intestazioneDi = (store, id) => JSON.parse(readFileSync(join(store, `${id}.jsonl`), 'utf8').split('\n')[0]);
const pausa = () => new Promise((r) => { setTimeout(r, 60); });

test('registro: fissata alla nascita, salvata, ereditata dalla biforcazione, uguale alla ripresa anche se ora la cartella è fidata', async (t) => {
  const store = mkdtempSync(join(tmpdir(), 'talos-senza-store-')); radici.push(store);
  const a = banco(t, () => true, store);
  const { sessionId } = a.registro.avvia('prima');
  await pausa();
  assert.equal(a.corse[0].senzaIstruzioniDelProgetto, true);
  assert.equal(intestazioneDi(store, sessionId).senzaIstruzioniDelProgetto, true, 'nel giornale, così la ripresa lo sa');
  const ramo = a.registro.forka(sessionId);
  await pausa();
  assert.equal(a.corse.at(-1).senzaIstruzioniDelProgetto, true, 'la biforcazione eredita');
  assert.equal(intestazioneDi(store, ramo.sessionId).senzaIstruzioniDelProgetto, true);
  await a.registro.chiudi();
  const b = banco(t, () => false, store);
  await b.registro.ripristina();
  await b.registro.resume(sessionId, 'ancora');
  await pausa();
  assert.equal(b.corse.at(-1).senzaIstruzioniDelProgetto, true, 'ripresa: resta com\'era nata, anche con la cartella ora fidata');
});

test('registro: di serie niente cambia; una funzione che fallisce vale «non fidata»', async (t) => {
  const store = mkdtempSync(join(tmpdir(), 'talos-senza-store-')); radici.push(store);
  const a = banco(t, null, store);
  const { sessionId } = a.registro.avvia('seconda');
  await pausa();
  assert.equal('senzaIstruzioniDelProgetto' in a.corse[0], false, 'golden: spenta, l\'ingresso è quello di ieri');
  assert.equal('senzaIstruzioniDelProgetto' in intestazioneDi(store, sessionId), false, 'golden: l\'intestazione è quella di ieri');
  const b = banco(t, () => { throw new Error('non so'); }, store);
  b.registro.avvia('terza');
  await pausa();
  assert.equal(b.corse[0].senzaIstruzioniDelProgetto, true);
});
