import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRAZIONE_AVVISO, TETTO_TOKEN_DEFAULT, FRAZIONE_FINESTRA,
  sogliaLegacy, valutaSogliaContesto, interpretaEventoCompattazione, testoRigaCompattazione, motivoUmano,
} from '../../src/components/compattazione-legacy.js';
import { impostaLingua } from '../../src/components/lingua.js';

/*
 * F5 (onda 2), 24/09/2026 — le funzioni PURE della compattazione legacy vista dalla chat.
 * Le superfici (avviso, barra, riga, nota del journal) si provano nel browser sulla 4176:
 * `tests/browser/compattazione-legacy.spec.mjs`.
 */

test('CTX-UI-LEGACY-THRESHOLD: la soglia è il minore fra il tetto (200K) e 0,75 della finestra; senza finestra vale il tetto', () => {
  assert.equal(TETTO_TOKEN_DEFAULT, 200_000);
  assert.equal(FRAZIONE_FINESTRA, 0.75);
  assert.equal(sogliaLegacy({ finestraToken: 200_000 }), 150_000);
  assert.equal(sogliaLegacy({ finestraToken: 1_310_720 }), 200_000, 'una finestra enorme non alza il tetto');
  assert.equal(sogliaLegacy({ finestraToken: null }), 200_000);
  assert.equal(sogliaLegacy({ finestraToken: 0 }), 200_000);
  assert.equal(sogliaLegacy({ finestraToken: 16_384 }), 12_288);
});

test('CTX-UI-LEGACY-WARNING: l’avviso scatta da 0,8 della soglia in su, mai con numeri mancanti o zero', () => {
  assert.equal(FRAZIONE_AVVISO, 0.8);
  assert.equal(valutaSogliaContesto({ tokenMisurati: 130_000, soglia: 150_000 }).mostra, true);
  assert.equal(valutaSogliaContesto({ tokenMisurati: 120_000, soglia: 150_000 }).mostra, true, 'esattamente 0,8 avvisa');
  assert.equal(valutaSogliaContesto({ tokenMisurati: 119_999, soglia: 150_000 }).mostra, false);
  assert.equal(valutaSogliaContesto({ tokenMisurati: 52_000, soglia: 150_000 }).mostra, false);
  for (const brutto of [{ tokenMisurati: 0, soglia: 150_000 }, { tokenMisurati: null, soglia: 150_000 }, { tokenMisurati: 130_000, soglia: 0 }, { tokenMisurati: NaN, soglia: 150_000 }, {}]) {
    assert.equal(valutaSogliaContesto(brutto).mostra, false, JSON.stringify(brutto));
  }
  impostaLingua('it');
  assert.equal(valutaSogliaContesto({ tokenMisurati: 130_000, soglia: 150_000 }).testo, 'Il contesto è quasi pieno (130.000 su 150.000 token).');
  assert.equal(valutaSogliaContesto({ tokenMisurati: 184_000, soglia: 150_000 }).testo, 'Il contesto ha superato la soglia (184.000 su 150.000 token).', 'oltre la soglia «quasi pieno» sarebbe falso');
  impostaLingua('en');
  assert.equal(valutaSogliaContesto({ tokenMisurati: 130_000, soglia: 150_000 }).testo, 'The context is almost full (130,000 of 150,000 tokens).');
  impostaLingua('it');
});

test('CTX-WINDOW-COPY — un limite prudenziale non è descritto come finestra del modello piena', () => {
  impostaLingua('it');
  assert.equal(valutaSogliaContesto({ tokenMisurati: 163_901, soglia: 750_000, source: 'route-minimum' }).mostra, false);
  const route = valutaSogliaContesto({ tokenMisurati: 650_000, soglia: 750_000, source: 'route-minimum' });
  assert.equal(route.mostra, true);
  assert.match(route.testo, /soglia prudenziale della route/u);
  assert.doesNotMatch(route.testo, /quasi pieno/u);
  const fallback = valutaSogliaContesto({ tokenMisurati: 163_901, soglia: 200_000, source: 'fallback' });
  assert.match(fallback.testo, /finestra del modello non verificata/u);
});

/*
 * ⛔ 24/09/2026, 12:35 — IL CONTRATTO F3 È FUSO (`a8cdcc616` sull'integrazione) e ha forme diverse dal brief:
 *   inizio  `{ fase:'inizio', tokenPrima, soglia, motivo, coveredThrough, at }`           (session-registry.mjs:3084, agent-service.mjs:1127-1128)
 *   fine ok `{ fase:'fine', compattato:true, tokenPrima, tokenDopo, misura, coveredThrough, at, modello, motivo }` (:3111) — NIENTE `record`, l'`at` è al primo livello
 *   fine ko `{ fase:'fine', compattato:false, motivo: 'attrezzo'|'troncato'|'vuoto'|'errore: <testo>'|'superata'|'non-salvata', at }` (:3098-3112)
 *   annulla `{ fase:'annullata', at, coveredThrough }` sullo STESSO evento (:7779) — `talos.compattazione-annullata` non esiste (resta come alias)
 *   journal `{ riparato:true|false, completata, righeScartate, byteScartati, backup, errore? }` (:5210-5214)
 * Le fixture qui sotto sono quelle forme. RED misurato prima della cura: il codice del brief cadeva nel ramo «compattato
 * senza record» (niente `at` ⇒ niente Annulla) e ignorava `riparato:false`.
 */
const AT = '2026-09-24T07:00:00.000Z';
test('CTX-UI-LEGACY-EVENT-PARSE: le forme FUSE di F3 si leggono (at al primo livello, fase annullata, riparato:false), tutto il resto è null', () => {
  const inizio = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', tokenPrima: 184_000, soglia: 150_000, motivo: 'background', coveredThrough: 40, at: AT } });
  assert.deepEqual(inizio, { tipo: 'inizio', tokenMisurati: 184_000, soglia: 150_000, motivo: 'background' });
  assert.equal(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', tokenMisurati: 5 } }).tokenMisurati, 5, 'il nome del brief resta accettato');
  const fine = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, tokenPrima: 184_000, tokenDopo: 41_000, misura: 'stima', coveredThrough: 40, at: AT, modello: 'z-ai/glm-5.3-flash', motivo: 'background' } });
  assert.deepEqual(fine, { tipo: 'fine', compattato: true, tokenPrima: 184_000, tokenDopo: 41_000, record: { at: AT, coveredThrough: 40, riassunto: null, annullabile: true }, motivo: 'background', dettaglio: null });
  /* 26/09: la via manuale registra lo stesso evento con `annullabile:false` (il suo checkpoint non ha un record da riavvolgere). */
  assert.equal(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, motivo: 'manuale', annullabile: false, at: AT, tokenPrima: 9, tokenDopo: 3 } }).record.annullabile, false);
  assert.equal(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, record: { at: AT, riassunto: 'x' } } }).record.riassunto, 'x', 'se un giorno arriva `record.at`/`record.riassunto`, si accettano');
  assert.equal(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, tokenPrima: 1, tokenDopo: 1 } }).record, null, 'compattato senza `at`: nessun record da annullare');
  const vuoto = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: false, motivo: 'vuoto', at: AT } });
  assert.deepEqual(vuoto, { tipo: 'fine', compattato: false, tokenPrima: null, tokenDopo: null, record: null, motivo: 'vuoto', dettaglio: null });
  const errore = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: false, motivo: 'errore: HTTP 500 dal fornitore', at: AT } });
  assert.equal(errore.motivo, 'errore'); assert.equal(errore.dettaglio, 'HTTP 500 dal fornitore');
  for (const m of ['superata', 'non-salvata']) assert.equal(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: false, motivo: m, at: AT } }).motivo, m);
  assert.deepEqual(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'annullata', at: AT, coveredThrough: 40 } }), { tipo: 'annullata', at: AT });
  assert.deepEqual(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione-annullata', value: { at: AT } }), { tipo: 'annullata', at: AT }, 'il nome del brief resta come alias');
  assert.deepEqual(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true, completata: true, righeScartate: 3, byteScartati: 812, backup: 'C:\\x.bak' } }), { tipo: 'riparato', riparato: true, completata: true, righeScartate: 3, byteScartati: 812, backup: 'C:\\x.bak', errore: null });
  assert.deepEqual(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: false, completata: false, righeScartate: 0, byteScartati: 0, backup: null, errore: 'EPERM: operation not permitted' } }), { tipo: 'riparato', riparato: false, completata: false, righeScartate: 0, byteScartati: 0, backup: null, errore: 'EPERM: operation not permitted' });
  /* Owner 26/09/2026: il buco nel mezzo del salvataggio arriva fino alla nota — senza questa riga il campo si perdeva qui. */
  assert.deepEqual(interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true, completata: true, righeScartate: 2, byteScartati: null, backup: null, buco: { recuperataFinoAlGiro: 7, deltaScartati: 2 } } }).buco, { recuperataFinoAlGiro: 7, deltaScartati: 2 });
  assert.equal('buco' in interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true } }), false, 'una coda spezzata non ha buco');
  for (const altro of [null, {}, { type: 'RunFinished' }, { type: 'CUSTOM', name: 'talos.context', value: {} }, { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'boh' } }, { type: 'CUSTOM', name: 'talos.compattazione', value: null }, { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'annullata' } }, { type: 'CUSTOM', name: 'talos.compattazione-annullata', value: {} }]) {
    assert.equal(interpretaEventoCompattazione(altro), null, JSON.stringify(altro));
  }
});

test('CTX-UI-LEGACY-ROW-TEXT: la riga dice i numeri quando li ha, e non li inventa quando non li ha', () => {
  assert.equal(testoRigaCompattazione({ stato: 'riassunta', tokenPrima: 184_000, tokenDopo: 41_000 }), 'Conversazione riassunta · 184.000 → 41.000 token');
  assert.equal(testoRigaCompattazione({ stato: 'riassunta', tokenPrima: null, tokenDopo: null }), 'Conversazione riassunta');
  assert.equal(testoRigaCompattazione({ stato: 'annullata', tokenPrima: 184_000, tokenDopo: 41_000 }), 'Riassunto annullato · la conversazione intera torna al modello');
  assert.equal(testoRigaCompattazione({ stato: 'non-riuscita', motivo: 'vuoto' }), 'Conversazione non riassunta · il modello ha risposto vuoto');
  assert.equal(testoRigaCompattazione({ stato: 'non-riuscita' }), 'Conversazione non riassunta');
  // i tre motivi del contratto fuso (session-registry.mjs:3098, :3106, :3112): frasi umane, mai un nome tecnico
  assert.equal(testoRigaCompattazione({ stato: 'non-riuscita', motivo: 'superata' }), 'Conversazione non riassunta · la conversazione è andata avanti nel frattempo: il riassunto non vale più');
  assert.equal(testoRigaCompattazione({ stato: 'non-riuscita', motivo: 'non-salvata' }), 'Conversazione non riassunta · il riassunto non è stato salvato su disco');
  // 24/09/2026: la chiusura del ripristino per un riassunto rimasto a metà (session-registry.mjs, ripristina)
  assert.equal(testoRigaCompattazione({ stato: 'non-riuscita', motivo: 'interrotta' }), 'Conversazione non riassunta · il server si è fermato mentre riassumeva: la conversazione resta intera');
  assert.equal(testoRigaCompattazione({ stato: 'non-riuscita', motivo: 'errore', dettaglio: 'HTTP 500 dal fornitore' }), 'Conversazione non riassunta · il fornitore ha risposto con un errore (HTTP 500 dal fornitore)');
  impostaLingua('en');
  assert.equal(testoRigaCompattazione({ stato: 'riassunta', tokenPrima: 184_000, tokenDopo: 41_000 }), 'Conversation summarized · 184,000 → 41,000 tokens');
  impostaLingua('it');
  assert.equal(motivoUmano('sconosciuto-xyz'), 'sconosciuto-xyz', 'un motivo non tradotto si riporta com’è, non si nasconde');
});
