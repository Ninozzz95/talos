/*
 * ⛔⭐ BUG-16 (05/10/2026, owner: auto-retry NON negoziabile, ANCHE per i sub-agenti) — RETRY-02 si evolve.
 * RETRY-02 (29/09) diceva: un esito incerto non paga MAI una nuova richiesta. Resta VERO quando qualcosa
 * è stato consegnato (testo in storia, letture pure in volo nell'acceleratore VELOCITÀ). Ma quando il giro
 * perso NON ha prodotto NESSUN effetto — `parziale.content` vuoto E `partiteNelloStream.size === 0` —
 * «scrivi continua» non è più la prima strada: il kernel ritenta DA SOLO, come Claude Code (fino a 10,
 * attesa visibile) e Hermes (retry nel SUO giro, SDK spento). Budget per-giro, attesa `attesaDelTentativo`
 * con tetto 60 s e tetto facoltativo dell'ospite (G02-10), svegliabile dallo stop. Cap esaurito ⇒
 * PROVIDER_OUTCOME_UNKNOWN_ESAURITO (`ritentabile: true`, `esitiIncertiRitentati`): la scheda manuale
 * resta l'ultima spiaggia ma dice quanti reinvii ha già provati da sola.
 * Ramo: catch di `talosLavora` in `src/kernel/talosHarness.mjs`; dossier: `scratchpad/piano-bug16-auto-retry-2026-10-05.md` §9-§10.
 * I due test che assegnavano il vecchio contratto a esito zero-effetti stanno aggiornati in
 * `flusso-rotto-a-meta.test.mjs` (NOTHING-VISIBLE-RESENT, TOOL-CALL-HALF-RESENT).
 * ⛔ R-44 (31/10/2026): una chiamata annunciata e mai partita non è più un effetto, sul fornitore in rete. Vedi R44-*.
 * 401/400 NON ritentano (non migliorano ritentando — invariato); retry-after-ms > retry-after è già
 * ancorato in `tests/g02-lane-r-retry.test.mjs` (G02-10) e non si duplica qui.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
const traffico = () => Object.assign(new Error('Troppo traffico presso il fornitore.'), { code: 'PROVIDER_REQUEST_ERROR', classe: 'traffico', transitorio: true });

/** Un flusso che manda i suoi fotogrammi e poi si rompe (l'errore arriva DOPO i pezzi, come nel vivo). */
function flussoRotto(fotogrammi, errore) {
  let passo = 0;
  return new Response(new ReadableStream({
    pull(c) {
      if (passo < fotogrammi.length) { c.enqueue(enc.encode(`data: ${JSON.stringify(fotogrammi[passo])}\n\n`)); passo += 1; return; }
      c.error(errore);
    },
  }));
}
function flussoIntero(fotogrammi) {
  return new Response(new ReadableStream({
    start(c) {
      for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  }));
}
const testo = (t) => ({ choices: [{ delta: { content: t } }] });
const ragionamento = (t) => ({ choices: [{ delta: { reasoning: t } }] });
const fine = { choices: [{ delta: {}, finish_reason: 'stop' }] };

function rete(...risposte) {
  const corpi = [];
  return {
    corpi,
    fetch: async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      const r = risposte[corpi.length - 1];
      return typeof r === 'function' ? r() : r;
    },
  };
}
const base = (extra) => ({
  cartella: cartellaDiProva('talos-bug16-'), task: { consegna: 'riepiloga le mie risposte' }, modello: 'x', chiave: 'y',
  onDelta: () => {}, ...extra,
});
const raccogliRetry = (registro) => (e) => { if (e.tipo === 'provider-retry') registro.push(e); };

test('BUG16-SAFE-RESEND: esito incerto a zero effetti ⇒ un reinvio visibile, il giro chiude al 2° tentativo', async () => {
  const r = rete(
    () => flussoRotto([ragionamento('Sto pensando')], traffico()),
    () => flussoIntero([testo('Risposta intera.'), fine]),
  );
  const retry = [];
  const esito = await talosLavora(base({
    fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1,
    onGiro: raccogliRetry(retry),
  }));
  assert.equal(r.corpi.length, 2, 'esattamente due chiamate: la rotta e il reinvio');
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(retry.length, 1);
  assert.equal(retry[0].fase, 'attesa');
  assert.equal(retry[0].tentativo, 1);
  assert.equal(retry[0].tentativiMassimi, 10);
  assert.equal(retry[0].attesaMs, 1, 'il tetto facoltativo dell\'ospite (G02-10) lega anche questa attesa');
  assert.deepEqual(r.corpi[0].messages, r.corpi[1].messages, 'il reinvio non aggiunge nulla alla storia (zero effetti)');
});

test('BUG16-PARTIAL-DELIVERED: testo già consegnato ⇒ NESSUN reinvio, scheda manuale onesta', async () => {
  const r = rete(
    () => flussoRotto([testo('Ecco il riepilogo:')], traffico()),
    () => flussoIntero([testo('mai'), fine]),
  );
  const retry = [];
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch, onGiro: raccogliRetry(retry) })), e => {
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.ok(e.messaggiDelGiro.some(m => m.content === 'Ecco il riepilogo:'), 'il frammento resta in storia per la ripresa esplicita');
    return true;
  });
  assert.equal(r.corpi.length, 1, 'con effetti consegnati RETRY-02 resta: nessuna nuova richiesta');
  assert.equal(retry.length, 0);
});

test('BUG16-CAP-10: dieci reinvii vani ⇒ PROVIDER_OUTCOME_UNKNOWN_ESAURITO, ritentabile, conto onesto', async () => {
  const rotta = () => flussoRotto([ragionamento('niente')], traffico());
  const r = rete(...Array.from({ length: 11 }, () => rotta));
  const retry = [];
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onGiro: raccogliRetry(retry) })), e => {
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO');
    assert.equal(e.ritentabile, true);
    assert.equal(e.esitiIncertiRitentati, 10);
    assert.equal(e.transitorio, false);
    assert.match(e.message, /10 automatic resends/u);
    /* K4b, riserva F1: la chiave è quella dell'esaurito (con il numero), non quella del caso base che la crea */
    assert.equal(e.chiave, 'server.providerOutcome.exhausted');
    assert.deepEqual(e.params, { n: 10 });
    return true;
  });
  assert.equal(r.corpi.length, 11, 'una rotta più dieci reinvii, poi il cap');
  assert.deepEqual(retry.map(e => e.tentativo), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('BUG16-STOP-DURING-WAIT: lo stop sveglia l\'attesa del reinvio, nessuna seconda chiamata', async () => {
  const stop = new AbortController();
  const r = rete(() => {
    /* L'aborto cade DENTRO l'attesa (≥500 ms), non durante la ricezione: il catch è già cominciato. */
    setTimeout(() => stop.abort(), 150);
    return flussoRotto([ragionamento('Sto pensando')], traffico());
  });
  const retry = [];
  const t0 = Date.now();
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, segnaleStop: stop.signal, onGiro: raccogliRetry(retry) }));
  /* R4 della review avversariale: due prove che lo stop ha SVEGLIATO l'attesa —
     1) la corsa finisce presto (abort a 150ms; l'attesa da svegliare era ≥500ms);
     2) il puntoDiFermata DICE che si era in attesa del reinvio, non una generica interruzione. */
  const durata = Date.now() - t0;
  assert.equal(esito.comeFinita, 'fermato');
  assert.ok(durata < 400, `lo stop deve svegliare l'attesa, non aspettare il backoff: ${durata}ms`);
  assert.match(esito.detto, /waiting to resend/, `il puntoDiFermata deve nominare l'attesa del reinvio: ${esito.detto}`);
  assert.equal(r.corpi.length, 1, 'dopo lo stop nessun reinvio');
  assert.equal(retry.length, 1, 'l\'attesa era cominciata (ed è stata svegliata dallo stop)');
});

test('BUG16-4XX-UNCHANGED: un 401 resta un errore secco, nessun reinvio', async () => {
  const r = rete(() => new Response(JSON.stringify({ error: { message: 'credenziale rifiutata' } }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
  const retry = [];
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch, onGiro: raccogliRetry(retry) })), e => {
    assert.equal(e.stato, 401);
    assert.equal(e.esitoIncerto, undefined, 'un 4xx-risposta non è un esito incerto');
    return true;
  });
  assert.equal(r.corpi.length, 1);
  assert.equal(retry.length, 0, '400/401 non migliorano ritentando: invariato');
});

test('BUG16-READ-IN-FLIGHT: una lettura pura partita blocca il reinvio (RETRY-02 resta per gli effetti in volo)', async () => {
  const cartella = cartellaDiProva('talos-bug16-lettura-');
  await writeFile(join(cartella, 'nota.txt'), 'contenuto di prova', 'utf8');
  const r = rete(
    () => flussoRotto([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'leggi', arguments: '{"percorso":"nota.txt"}' } }] } }] },
      /* L'acceleratore parte solo a flusso APERTO (escludi !== -1): l'inizio di una SECONDA
         chiamata finalizza la prima e fa scattare onChiamataCompleta sulla lettura. */
      { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_2', function: { name: 'leggi', arguments: '{"percorso":"a' } }] } }] },
    ], traffico()),
    () => flussoIntero([testo('mai raggiunto'), fine]),
  );
  const retry = [];
  await assert.rejects(talosLavora(base({ cartella, fetchDiRete: r.fetch, onGiro: raccogliRetry(retry) })), e => {
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN');
    return true;
  });
  assert.equal(r.corpi.length, 1, 'una lettura in volo è un attrezzo partito: nessun reinvio');
  assert.equal(retry.length, 0);
});

/* ⛔ R-44 (31/10/2026): una chiamata annunciata e mai partita non ferma più il reinvio sul fornitore in rete. Era il contrario fino a
   oggi; Performance ha perso così due corse del piano. Sui motori locali resta manuale. */
const chiamata = (id, indice, nome, argomenti) => ({ choices: [{ delta: { tool_calls: [{ index: indice, id, function: { name: nome, arguments: argomenti } }] } }] });
const ferma = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };

test('R44-RESENT: una scrittura annunciata e caduta prima del finish ⇒ un reinvio, e sul disco solo quella del secondo tentativo', async () => {
  const cartella = cartellaDiProva('talos-r44-');
  const r = rete(
    () => flussoRotto([chiamata('call_1', 0, 'scrivi', '{"percorso":"primo.txt","testo":"NO"}')], traffico()),
    () => flussoIntero([chiamata('call_2', 0, 'scrivi', '{"percorso":"secondo.txt","testo":"SI"}'), ferma]),
    () => flussoIntero([testo('Fatto.'), fine]),
  );
  const eventi = [], retry = [];
  const esito = await talosLavora(base({ cartella, fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onDelta: (e) => eventi.push(e), onGiro: raccogliRetry(retry) }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(r.corpi.length, 3, 'il primo tentativo, il reinvio e il giro dopo la scrittura');
  assert.equal(retry.filter((e) => e.fase === 'attesa').length, 1, 'il reinvio si vede');
  assert.equal(eventi.find((e) => e.tipo === 'tool-annullato')?.toolCallId, 'call_1', 'la carta della chiamata interrotta resta annullata');
  assert.equal(existsSync(join(cartella, 'primo.txt')), false, 'la chiamata interrotta non è partita');
  assert.equal(await readFile(join(cartella, 'secondo.txt'), 'utf8'), 'SI', 'quella rifatta sì, una volta');
  assert.equal(JSON.stringify(r.corpi[1].messages).includes('call_1'), false, 'la chiamata interrotta non resta nella storia');
});

test('R44-HALF: anche una chiamata a metà argomenti si rifà', async () => {
  const r = rete(
    () => flussoRotto([chiamata('call_1', 0, 'scrivi', '{"percorso":"a.t')], traffico()),
    () => flussoIntero([testo('Risposta intera.'), fine]),
  );
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1 }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(r.corpi.length, 2);
});

for (const modello of ['local:qwen', 'locale-ospite:qwen', 'ollama:qwen', 'lmstudio:qwen']) {
  test(`R44-LOCALE: sul motore locale (${modello}) la chiamata annunciata ferma il reinvio, come prima`, async () => {
    const r = rete(
      () => flussoRotto([chiamata('call_1', 0, 'scrivi', '{"percorso":"fuori.txt","testo":"NO"}')], traffico()),
      () => flussoIntero([testo('mai raggiunto'), fine]),
    );
    const eventi = [], retry = [];
    await assert.rejects(talosLavora(base({ modello, fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onDelta: (e) => eventi.push(e), onGiro: raccogliRetry(retry) })),
      { code: 'PROVIDER_OUTCOME_UNKNOWN' });
    assert.equal(r.corpi.length, 1, 'sul locale una caduta è più spesso il motore morto: la ripresa resta manuale');
    assert.equal(retry.length, 0);
    assert.equal(eventi.find((e) => e.tipo === 'tool-annullato')?.toolCallId, 'call_1');
  });
}

test('R44-CAP: dieci reinvii vani con la chiamata annunciata ⇒ PROVIDER_OUTCOME_UNKNOWN_ESAURITO, come gli altri', async () => {
  const rotta = () => flussoRotto([chiamata('call_1', 0, 'scrivi', '{"percorso":"a.txt","testo":"x"}')], traffico());
  const r = rete(...Array.from({ length: 12 }, () => rotta));
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1 })), { code: 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO' });
  assert.equal(r.corpi.length, 11, 'il tentativo più dieci reinvii, non uno di più');
});

test('R44-STOP: lo stop durante l\'attesa del reinvio ferma il giro, e la chiamata non si rifà', async () => {
  const stop = new AbortController();
  const r = rete(() => {
    setTimeout(() => stop.abort(), 150);
    return flussoRotto([chiamata('call_1', 0, 'scrivi', '{"percorso":"a.txt","testo":"x"}')], traffico());
  });
  const cartella = cartellaDiProva('talos-r44-stop-');
  const esito = await talosLavora(base({ cartella, fetchDiRete: r.fetch, segnaleStop: stop.signal }));
  assert.equal(esito.comeFinita, 'fermato');
  assert.equal(r.corpi.length, 1, 'dopo lo stop nessun reinvio');
  assert.equal(existsSync(join(cartella, 'a.txt')), false);
});

test('R44-CARTA: una lettura che vuole la domanda non parte nello stream: nessuna carta aperta, il reinvio la lascia al giro buono', async () => {
  const cartella = cartellaDiProva('talos-r44-carta-');
  const domande = [];
  const fuori = '../fuori-r44.txt';
  const r = rete(
    () => flussoRotto([
      chiamata('call_1', 0, 'leggi', JSON.stringify({ percorso: fuori })),
      chiamata('call_2', 1, 'leggi', '{"percorso":"a'),
    ], traffico()),
    () => flussoIntero([testo('Risposta intera.'), fine]),
  );
  const retry = [];
  const esito = await talosLavora(base({ cartella, fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onGiro: raccogliRetry(retry),
    chiediApprovazioneFn: async (a) => { domande.push(a); return false; } }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(domande.length, 0, 'la carta si apre solo dopo una risposta completa: una caduta non ne lascia una sospesa');
  assert.equal(r.corpi.length, 2);
  assert.equal(retry.filter((e) => e.fase === 'attesa').length, 1);
});

test('R44-READ: al contrario, una lettura DAVVERO partita prima della caduta continua a fermare il reinvio', async () => {
  const cartella = cartellaDiProva('talos-r44-lettura-');
  await writeFile(join(cartella, 'nota.txt'), 'contenuto', 'utf8');
  const r = rete(
    () => flussoRotto([chiamata('call_1', 0, 'leggi', '{"percorso":"nota.txt"}'), chiamata('call_2', 1, 'scrivi', '{"percorso":"a')], traffico()),
    () => flussoIntero([testo('mai raggiunto'), fine]),
  );
  const eventi = [];
  await assert.rejects(talosLavora(base({ cartella, fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onDelta: (e) => eventi.push(e) })), { code: 'PROVIDER_OUTCOME_UNKNOWN' });
  assert.equal(r.corpi.length, 1);
  const lettura = eventi.find((e) => e.tipo === 'tool-annullato' && e.toolCallId === 'call_1');
  assert.equal(lettura?.partita, true, 'la lettura è avvenuta: non si dice «not run»');
  assert.doesNotMatch(lettura.motivo, /not run/u);
  assert.equal(eventi.find((e) => e.tipo === 'tool-annullato' && e.toolCallId === 'call_2')?.partita, undefined, 'la seconda chiamata non è partita');
});

test('BUG16-TWO-BREAKS: due rotte a zero effetti ⇒ due reinvii, chiusura al 3° tentativo', async () => {
  const rotta = () => flussoRotto([ragionamento('no')], traffico());
  const r = rete(rotta, rotta, () => flussoIntero([testo('Al terzo va.'), fine]));
  const retry = [];
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onGiro: raccogliRetry(retry) }));
  assert.equal(r.corpi.length, 3);
  assert.equal(esito.comeFinita, 'concluso');
  assert.deepEqual(retry.map(e => e.tentativo), [1, 2], 'il budget è per-giro e cresce a ogni esito incerto');
});

test('BUG16-PROGRESSO-RICOMINCIA: una risposta CONSEGNATA (giro con tool eseguito) azzera il budget — la rottura dopo ricomincia da 1', async () => {
  const cartella = cartellaDiProva('talos-bug16-progresso-');
  await writeFile(join(cartella, 'nota.txt'), 'contenuto di prova', 'utf8');
  const rotta = () => flussoRotto([ragionamento('no')], traffico());
  /* Un giro che consegna e CONTINUA è quello con la tool call (una risposta solo testo chiuderebbe
     la generazione): il giro buono esegue `leggi`, poi la corsa continua e si ritrova una rotta. */
  const giroBuono = () => flussoIntero([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_9', function: { name: 'leggi', arguments: '{"percorso":"nota.txt"}' } }] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ]);
  const r = rete(rotta, giroBuono, rotta, () => flussoIntero([testo('Riparte pulito.'), fine]));
  const retry = [];
  const esito = await talosLavora(base({ cartella, fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onGiro: raccogliRetry(retry) }));
  assert.equal(r.corpi.length, 4);
  assert.equal(esito.comeFinita, 'concluso');
  assert.deepEqual(retry.map(e => e.tentativo), [1, 1], 'il progresso consegnato ricomincia il conto (non è 2)');
});
