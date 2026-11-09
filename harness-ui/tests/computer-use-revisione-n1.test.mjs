/*
 * N1 della revisione delle cure R (04/11/2026): un COLLEGAMENTO d'invio si legge come la tastiera. Le sonde del revisore aggiravano C7 con
 * un trattino, un punto esclamativo, una freccia, il verbo in fondo (tedesco), quattro parole o più, e con NON_E_UN_INVIO che scattava su
 * una parola qualsiasi dopo il verbo. In Accesso pieno col sospetto acceso il link non visto non fermava: è uno dei tre fermi della 159.
 * Prove scritte prima della cura: sul ramo fix/cu-cure-revisione-r-2026-11-04 @ 1d4b66429 sono rosse tutte e quattro. N1-04 è rossa per
 * la tastiera: Invio su un link («Send», «Post», «Pubblica amministrazione», «Come inviare un pacco») è invio perché INVIO_FORTE cerca il
 * verbo in tutto il nome. Quindi la cura NON è «INVIO_FORTE sul nome del link» (romperebbe REV-R-08): è UNA lettura dei link, la stessa
 * per il clic e per Invio (R3: Invio su un collegamento lo attiva come il clic).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaAzione, POLITICHE } from '../src/computer-use/protezioni.mjs';

const PIENO = POLITICHE.pcAccessoPieno;
const SEMPRE = POLITICHE.pcConsentiSempre;
const ctx = (over = {}) => ({ richiesta: { pagare: false, inviare: false, cancellare: false }, sospetto: false, piano: { domini: [], app: [] }, ...over });
const vuota = { elementi: [], dominio: 'posta.example' };
const val = (azione, bersaglio, politica, contesto = ctx()) => valutaAzione({ azione, bersaglio, schermata: vuota, politica, contesto });
const link = (nome) => ({ ruolo: 'collegamento', nome });

// le sonde del revisore (rapporto REVISIONE-CURE-CU-R-2026-11-04.md, N1), tutte verbo d'invio + oggetto
const SONDE = ['Send e-mail', 'Invia e-mail', 'Invia!', 'Send email »', 'Send →', 'Nachricht senden', 'Kommentar absenden',
  'Invia la tua candidatura ora', 'Send a message to Anna', 'Invia segnalazione di sicurezza', 'Pubblica la tua opinione', 'Send to office',
  "Invia all'ufficio"];
// navigazione: verbo che non comanda, sezione o aggettivo SUBITO dopo il verbo, verbo non in testa (REV-R-08 e le sue frasi lunghe)
const NAVIGAZIONE = ['Upload', 'Post', 'Send', 'Pubblica amministrazione', 'Pubblica istruzione', 'Post recenti', 'Recent posts',
  'Come inviare un pacco', 'How to send money', 'Messaggi inviati', 'Sent messages', 'Pubblica amministrazione digitale',
  'Post recenti della settimana', 'Pubblica amministrazione: servizi online', 'Sent items'];

test('N1-01: link d\'invio con trattino, segni, frecce, verbo in fondo o 4+ parole ⇒ invio (Consenti sempre: carta)', () => {
  const fuori = [];
  for (const nome of SONDE) {
    const r = val({ tipo: 'premi' }, link(nome), SEMPRE);
    if (r.protezione !== 'invio' || r.decisione !== 'chiedi') fuori.push(`${nome} → ${r.protezione}/${r.decisione}`);
  }
  assert.deepEqual(fuori, []);
});

test('N1-02 (decisione 159): in Accesso pieno col sospetto acceso il clic su quei link FERMA', () => {
  const fuori = [];
  for (const nome of SONDE) {
    const r = val({ tipo: 'premi' }, link(nome), PIENO, ctx({ sospetto: true }));
    if (r.protezione !== 'invio' || r.decisione !== 'ferma') fuori.push(`${nome} → ${r.protezione}/${r.decisione}`);
  }
  assert.deepEqual(fuori, []);
});

test('N1-03: clic e Invio sullo stesso link dicono la stessa cosa (protezione e decisione)', () => {
  const diversi = [];
  for (const nome of [...SONDE, ...NAVIGAZIONE]) {
    const clic = val({ tipo: 'premi' }, link(nome), SEMPRE);
    const invio = val({ tipo: 'tasti', combinazione: 'enter' }, link(nome), SEMPRE);
    if (clic.protezione !== invio.protezione || clic.decisione !== invio.decisione) diversi.push(`${nome}: clic ${clic.protezione}/${clic.decisione}, Invio ${invio.protezione}/${invio.decisione}`);
  }
  assert.deepEqual(diversi, []);
});

test('N1-04 (verso contrario): link di navigazione, anche lunghi, non sono invii, né al clic né con Invio', () => {
  const dentro = [];
  for (const nome of NAVIGAZIONE) {
    for (const azione of [{ tipo: 'premi' }, { tipo: 'tasti', combinazione: 'enter' }]) {
      const r = val(azione, link(nome), SEMPRE);
      if (r.protezione === 'invio') dentro.push(`${nome} (${azione.tipo})`);
    }
  }
  assert.deepEqual(dentro, []);
  // il nome intero resta la regola dei campi: un campo di chat «Send a message» si mette a fuoco senza carta
  assert.equal(val({ tipo: 'premi' }, { ruolo: 'campo', nome: 'Send a message' }, SEMPRE).protezione, null);
});
