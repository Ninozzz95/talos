/*
 * L3-4 (owner 13/10/2026, D3: «si contano solo le risposte ripetute DI FILA») — le copie identiche.
 *
 * Prima: `risposteRipetuteNelGiro` contava TUTTE le risposte con copie del giro, anche lontane fra loro: in un giro lungo, la
 * terza sbadataggine (la sesta con la guardia dei giri in tondo) fermava il lavoro con «ripetizione» benché in mezzo il modello
 * avesse lavorato bene. Ora una risposta SENZA copie azzera il conto: si ferma solo chi non ne esce.
 * La guardia dei giri in tondo (stessa chiamata, stesso risultato) resta com'è: qui i risultati cambiano a ogni lettura, così a
 * decidere è solo il tetto.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { RISPOSTE_RIPETUTE_MASSIME_CON_GUARDIA, RISPOSTE_RIPETUTE_MASSIME_NEL_GIRO, talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const enc = new TextEncoder();
const sse = (fotogrammi) => new Response(new ReadableStream({ start(c) { for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }));
/** Una risposta con cinque copie della stessa chiamata. */
const valanga = (n) => Array.from({ length: 5 }, (_, i) => ({ choices: [{ delta: { tool_calls: [{ index: i, id: `v${n}_${i}`, function: { name: 'leggi', arguments: '{"percorso":"uno.txt"}' } }] } }] }));
/** Una risposta buona: UNA chiamata, a un altro file. */
const buona = (n) => [{ choices: [{ delta: { tool_calls: [{ index: 0, id: `b${n}`, function: { name: 'leggi', arguments: '{"percorso":"due.txt"}' } }] } }] }];
const testo = (t) => [{ choices: [{ delta: { content: t } }] }];

/** `copione`: una lettera per risposta — V = valanga di copie, B = buona; finito il copione il modello conclude. */
async function giro(t, copione, { guardia }) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-copie-di-fila-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'uno.txt'), 'inizio'); writeFileSync(join(cartella, 'due.txt'), 'inizio');
  let richieste = 0; const eventi = [];
  const esito = await talosLavora({
    cartella, task: { consegna: 'leggi i file' }, modello: 'x', chiave: 'y', onDelta: () => {}, guardiaGiriInTondo: guardia,
    onGiro: (e) => eventi.push(e), chiediApprovazioneFn: async () => true,
    fetchDiRete: async () => {
      richieste += 1;
      /* i risultati cambiano a ogni richiesta: la guardia dei giri in tondo (che conta i risultati IDENTICI) non entra in gioco */
      writeFileSync(join(cartella, 'uno.txt'), `uno ${richieste}`); writeFileSync(join(cartella, 'due.txt'), `due ${richieste}`);
      const passo = copione[richieste - 1];
      return sse(passo === 'V' ? valanga(richieste) : passo === 'B' ? buona(richieste) : testo('Finito.'));
    },
  });
  const scartate = eventi.filter((e) => e.tipo === 'copie-scartate');
  return { esito, richieste, scartate: scartate.length, conti: scartate.map((e) => e.risposte) };
}

for (const [nome, guardia, tetto] of [['con la guardia (desktop, CLI)', true, RISPOSTE_RIPETUTE_MASSIME_CON_GUARDIA], ['senza la guardia', false, RISPOSTE_RIPETUTE_MASSIME_NEL_GIRO]]) {
  test(`L3-4-01 ${nome} — copie in ${tetto + 2} risposte NON di fila: il giro si conclude, e il conto riparte da 1 ogni volta`, async (t) => {
    const copione = 'VB'.repeat(tetto + 2);
    const { esito, richieste, scartate, conti } = await giro(t, copione, { guardia });
    assert.equal(scartate, tetto + 2, 'il controllo positivo: le copie ci sono state davvero, più volte del tetto');
    assert.equal(esito.comeFinita, 'concluso');
    assert.equal(richieste, copione.length + 1);
    assert.deepEqual(conti, Array(tetto + 2).fill(1), 'una risposta buona azzera: chi guarda legge sempre «1»');
  });

  test(`L3-4-02 ${nome}, al contrario — ${tetto} risposte con copie DI FILA fermano ancora il giro, anche dopo una buona`, async (t) => {
    const { esito, richieste } = await giro(t, `VB${'V'.repeat(tetto + 3)}`, { guardia });
    assert.equal(esito.comeFinita, 'ripetizione');
    assert.equal(richieste, 2 + tetto, 'la prima con copie e la buona non contano: si ferma alla tetto-esima DI FILA');
    assert.match(esito.detto, new RegExp(`did it again in ${tetto} answers of this turn`, 'u'));
  });
}
