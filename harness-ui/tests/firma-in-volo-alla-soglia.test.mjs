/*
 * 03/11/2026 — la FIRMA del riassunto in volo alla SOGLIA (istantanea spenta, il default di `talosLavora`). Col contratto «mai aspettare»
 * (28/10) l'emergenza non aspetta più niente, e S2-2-FIRMA-PREPARAZIONE-01 non toccava più la firma: il mutante «firma sempre valida»
 * sopravviveva (misurato in copia il 03/11). Alla soglia la firma decide ancora una cosa che si vede (nucleo, `compattaDovuta`, il ritorno
 * «inVolo && inVoloVale» prima della decisione):
 *   - firma della storia vera ⇒ il giro NON compatta: il riassunto in volo coprirà questo punto, e pagarne un altro sarebbe doppio;
 *   - firma di un'altra storia ⇒ quel riassunto non vale, e alla soglia si compatta adesso.
 * In tutti e due i casi il giro non aspetta il riassunto in volo: si guarda l'ORDINE, non l'orologio, come Hermes che aspetta un
 * predicato (`tests/agent/test_periodic_scheduler.py:10`); e come Codex, che prima di usare il riassunto in volo controlla che valga
 * ancora (`async_compaction.rs:157-179`, citato nel nucleo). Revisione della CLI (03/11): il riassunto in volo aspetta un CANCELLO che la
 * prova apre quando il giro torna (riserva 10 s), e la scena si costruisce dal peso misurato di sistema e attrezzi, così resta sempre a
 * metà fra soglia ed emergenza; una premessa sul peso della richiesta lo controlla in tutti e due i versi.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SOGLIA = 4_000;
const EMERGENZA = 4_800; // 0,90 della finestra implicita 4.000 / 0,75
const META = (SOGLIA + EMERGENZA) / 2;
const storia = (coppie) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` },
]).flat();
const coppiePer = (token) => { let c = 1; while (stima(storia(c + 1)) < token) c += 1; return c; };
const finale = { role: 'user', content: 'Adesso continua' };
const rispondi = (contenuto, prompt) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'stop' }], usage: { prompt_tokens: prompt, completion_tokens: 1 } });
const pesoDi = (corpo) => stima(corpo.messages) + compattazione.stimaDegliAttrezzi(corpo.tools);

function conTetto(t) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(SOGLIA);
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
}

/* Il peso di sistema e attrezzi, misurato su un giro corto che non compatta: la richiesta meno i suoi messaggi utente/assistente. */
async function pesoFisso(t) {
  const cartella = cartellaDiProva('talos-firma-soglia-peso-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const corti = [finale];
  let peso = null;
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: corti,
    contestoDelProgetto: 'Project files:\n', fetchDiRete: async (_u, o) => { const c = JSON.parse(o.body); if (c.tools?.length && peso === null) peso = pesoDi(c) - stima(corti); return rispondi('fatto', 10); } });
  assert.ok(Number.isFinite(peso) && peso > 0, 'premise: the fixed weight of system and tools was measured');
  return peso;
}

async function giroColRiassuntoInVolo(t, firmaDi) {
  conTetto(t);
  const fisso = await pesoFisso(t);
  const cartella = cartellaDiProva('talos-firma-soglia-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const messaggi = [...storia(coppiePer(META - fisso)), finale];
  let apriCancello;
  let arrivato = false;
  const cancello = new Promise((ok) => { apriCancello = ok; });
  const riserva = setTimeout(() => apriCancello(), 10_000);
  t.after(() => { clearTimeout(riserva); apriCancello(); });
  const inVolo = Object.assign(cancello.then(() => { arrivato = true; return null; }), { firma: firmaDi(messaggi) });
  const motivi = [];
  let primaRichiesta = null;
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) return rispondi('## Riassunto\nbreve.', 10);
    primaRichiesta ??= pesoDi(corpo);
    return rispondi('fatto', stima(corpo.messages));
  };
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
    contestoDelProgetto: 'Project files:\n', fetchDiRete, compattazioneInArrivo: inVolo,
    onGiro: (e) => { if (e?.tipo === 'compattazione-inizio') motivi.push([e.motivo, e.tokenMisurati]); } });
  const finitoPrima = !arrivato;
  apriCancello();
  return { finitoPrima, motivi, primaRichiesta, fisso };
}

test('FIRMA-SOGLIA-01 — at the threshold, an inherited summary whose signature belongs to another history does not count: the turn compacts now, without waiting for it', async (t) => {
  const { finitoPrima, motivi, fisso } = await giroColRiassuntoInVolo(t, () => ({ coveredThrough: 2, impronta: 'impronta-di-un-altra-storia', base: compattazione.chiaveBaseDelRecord(null) }));
  assert.deepEqual(motivi.map(([m]) => m), ['soglia'], `the threshold compaction ran, and not the emergency (${JSON.stringify(motivi)}; system and tools ${fisso})`);
  const [[, token]] = motivi;
  assert.ok(token >= SOGLIA && token < EMERGENZA, `premise: the measured request sits between threshold and emergency (${token})`);
  assert.equal(finitoPrima, true, 'the turn waited for a summary that no longer applies');
});

test('FIRMA-SOGLIA-02 — AL CONTRARIO: with the signature of the real history the summary in flight covers the threshold: no second compaction, and still no waiting', async (t) => {
  const { finitoPrima, motivi, primaRichiesta, fisso } = await giroColRiassuntoInVolo(t, (m) => ({ coveredThrough: 2, impronta: compattazione.improntaDelPrefisso(m, 2), base: compattazione.chiaveBaseDelRecord(null) }));
  /* senza questa premessa, una richiesta scesa sotto la soglia renderebbe verde il test a vuoto (revisione della CLI) */
  assert.ok(primaRichiesta >= SOGLIA && primaRichiesta < EMERGENZA, `premise: the request the model receives sits between threshold and emergency (${primaRichiesta}; system and tools ${fisso})`);
  assert.deepEqual(motivi, [], `nothing compacted while a valid summary is in flight (${JSON.stringify(motivi)})`);
  assert.equal(finitoPrima, true, 'the threshold never stops the chat');
});
