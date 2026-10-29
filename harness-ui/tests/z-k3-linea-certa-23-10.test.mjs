/*
 * 23/10/2026 — Z-K3, revisione 10 della CLI sul pezzo C (finestra da 8.192 token). Sul rifiuto del fornitore COI NUMERI si sa la linea
 *   oltre la quale la richiesta è rifiutata di certo: la finestra vera senza riserva d'uscita, nella scala della stima della richiesta
 *   rifiutata, meno la parte fissa. Una proiezione senza riassunto pagato (il riassunto senza modello, la sola coda) che la passa non si
 *   scrive e non riparte: il giro finisce al primo rifiuto, «non entra» detto una volta per finestra. Prima: il riassunto senza modello si
 *   scriveva (la storia diventava un indice) e la richiesta ripartiva per essere rifiutata di nuovo.
 * Fornitore finto ONESTO: conta stima dei messaggi + stima degli schemi, rifiuta oltre la finestra coi numeri nella forma di OpenAI.
 *   Ogni regola si prova nei due versi; e senza numeri la strada resta quella di prima (decide il fornitore).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima, rigaLinguaDelleRisposte } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const FINESTRA = 8_192;
/* 28/10/2026 (riverifica del blocco 13, RIV13-1): la finta conta il TESTO di ogni messaggio, anche di uno a pezzi. Prima un messaggio
   marcato per la cache valeva 0 — era la regola sui dati esterni (156 token) — e questi scenari erano tarati su quel buco: spostato il
   marcatore, i conti cambiavano senza che il nucleo facesse niente di diverso. Il sistema dello scenario si accorcia di quanto pesa la nota. */
const corpoOnesto = (corpoJson) => { const c = JSON.parse(corpoJson); return { ...c, messages: c.messages.map((m) => (Array.isArray(m.content) && m.content.every((p) => p?.type === 'text') ? { ...m, content: m.content.map((p) => p.text).join('') } : m)) }; };
const NOTA_NON_CONTATA = 620;
const rifiuto = (message) => new Response(JSON.stringify({ error: { message } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
function fornitoreOnesto({ conNumeri = true, scala = 1 } = {}) {
  const conti = { richieste: 0, rifiutate: 0, riassunti: 0 };
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoOnesto(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.richieste += 1;
    const veri = Math.round((stima(corpo.messages) + compattazione.stimaDegliAttrezzi(corpo.tools)) * scala);
    if (veri > FINESTRA) {
      conti.rifiutate += 1;
      return rifiuto(conNumeri
        ? `This model's maximum context length is ${FINESTRA} tokens. However, you requested ${veri} tokens. Please reduce the length of the messages.`
        : `This model's maximum context length is ${FINESTRA} tokens (context_length_exceeded)`);
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: veri, completion_tokens: 1 } });
  };
  return { fetchDiRete, conti };
}
/* 28/10: nato con la regola di lingua (LINGUA-RISP), così in coda non si aggiunge niente e la matematica della finestra resta quella del caso */
const sistema = (caratteri) => ({ role: 'system', content: `You are a coding agent.\n${'regola del progetto '.repeat(Math.round(caratteri / 20))}\n\n${rigaLinguaDelleRisposte()}` });
const coppie = (n, l = 1_500) => Array.from({ length: n }, (_, i) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(Math.round(l / 7))}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(Math.round(l / 7))}` }]).flat();
/* il caso della CLI: sistema e attrezzi riempiono quasi la finestra, e la storia vecchia da riassumere è poca */
const conStoria = (n) => [sistema(18_000 - NOTA_NON_CONTATA), ...coppie(n), { role: 'user', content: 'Continua.' }];
/* la strada della sola coda: niente da riassumere, un esito d'attrezzo che si accorcia e una risposta lunga che resta */
const conCoda = (lungaCaratteri) => [sistema(12_000 - NOTA_NON_CONTATA), { role: 'user', content: 'Leggi il file grande.' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'g1', type: 'function', function: { name: 'read_file', arguments: '{"path":"grande.txt"}' } }] },
  { role: 'tool', tool_call_id: 'g1', content: 'contenuto del file grande, riga dopo riga. '.repeat(465) },
  { role: 'assistant', content: `Ecco il log: ${'x'.repeat(lungaCaratteri)}` }, { role: 'user', content: 'Ora rispondi OK.' }];

async function giro(t, { messaggiIniziali, rete, ...resto }) {
  const cartella = cartellaDiProva('talos-z-k3-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  let esito = null;
  let errore = null;
  try {
    esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali, finestraToken: FINESTRA,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access',
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine' || e?.tipo === 'compattazione-inizio') eventi.push(e); }, ...resto });
  } catch (e) { errore = e; }
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine');
  return { esito, errore, eventi, fini, scritte: fini.filter((e) => e.compattato === true), nonEntra: fini.filter((e) => e.motivo === 'non-entra') };
}
const racconta = (r) => JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo ?? null, e.compattato ?? null, e.ripiego ?? null, e.finestra ?? null, e.pavimento ?? null]));

test('ZK3-01 — il caso della CLI: coi numeri, il riassunto senza modello che non può entrare non si scrive e non riparte — UNA richiesta, niente pagato, il giro finisce al primo rifiuto; AL CONTRARIO uno che può entrare si scrive e il giro riparte', async (t) => {
  const rete = fornitoreOnesto();
  const r = await giro(t, { messaggiIniziali: conStoria(3), rete });
  assert.equal(rete.conti.richieste, 1, `una richiesta sola (prima: due, la seconda col riassunto senza modello) ${racconta(r)}`);
  assert.equal(rete.conti.riassunti, 0, 'niente pagato');
  assert.equal(r.scritte.length, 0, `niente scritto nella conversazione ${racconta(r)}`);
  assert.equal(r.errore?.classificazione, 'contesto-pieno');
  assert.equal(r.errore?.contestoPieno?.scalino, 0, `fermo al primo scalino (${JSON.stringify(r.errore?.contestoPieno)})`);
  assert.equal(r.errore?.contestoPieno?.numeri?.massimo, FINESTRA);
  assert.equal(r.nonEntra.length, 1, `«non entra» una volta ${racconta(r)}`);
  /* AL CONTRARIO: una coppia in meno, e il riassunto senza modello sta sotto la linea certa — si scrive, e il fornitore lo accetta */
  const reteBis = fornitoreOnesto();
  const bis = await giro(t, { messaggiIniziali: conStoria(2), rete: reteBis });
  assert.equal(bis.errore, null, `il giro finisce (${bis.errore?.message})`);
  assert.equal(bis.esito.comeFinita, 'concluso');
  assert.deepEqual([reteBis.conti.richieste, reteBis.conti.rifiutate, reteBis.conti.riassunti], [2, 1, 0], racconta(bis));
  assert.ok(bis.scritte.some((e) => e.ripiego === true && e.ragione === 'bersaglio'), `il riassunto senza modello si è scritto ${racconta(bis)}`);
});

test('ZK3-02 — finestra dichiarata più grande di quella vera: è il fermo a dire «non entra», con la finestra del fornitore e il pavimento nella sua scala, e la riga aperta si chiude; AL CONTRARIO già detto per quella finestra non si ripete, e la riga si chiude muta', async (t) => {
  const rete = fornitoreOnesto();
  const r = await giro(t, { messaggiIniziali: conStoria(3), rete, finestraToken: 16_384 });
  assert.equal(rete.conti.richieste, 1, racconta(r));
  assert.equal(r.scritte.length, 0, racconta(r));
  assert.equal(r.nonEntra.length, 1, racconta(r));
  assert.equal(r.nonEntra[0].finestra, FINESTRA, 'la finestra dei numeri, non quella dichiarata');
  assert.ok(r.nonEntra[0].pavimento > FINESTRA, `il pavimento nella scala del fornitore (${r.nonEntra[0].pavimento})`);
  const inizi = r.eventi.filter((e) => e.tipo === 'compattazione-inizio').length;
  assert.equal(r.fini.length, inizi, `ogni riga aperta si chiude ${racconta(r)}`);
  /* AL CONTRARIO: «non entra» già detto per 8.192 — non si ripete, e la riga del riassunto aperta si chiude con «nulla-da-ridurre» */
  const reteBis = fornitoreOnesto();
  const bis = await giro(t, { messaggiIniziali: conStoria(3), rete: reteBis, finestraToken: 16_384, nonEntraDetto: FINESTRA });
  assert.equal(reteBis.conti.richieste, 1, racconta(bis));
  assert.equal(bis.nonEntra.length, 0, racconta(bis));
  assert.equal(bis.scritte.length, 0, racconta(bis));
  assert.equal(bis.fini.length, bis.eventi.filter((e) => e.tipo === 'compattazione-inizio').length, `la riga aperta si chiude ${racconta(bis)}`);
  assert.ok(bis.fini.every((e) => e.motivo === 'nulla-da-ridurre'), racconta(bis));
});

test('ZK3-03 — la sola coda: niente da riassumere, l\'esito d\'attrezzo si accorcia ma una risposta lunga resta oltre la linea certa — non si scrive e non riparte; AL CONTRARIO con una risposta più corta si scrive e il giro riparte', async (t) => {
  const rete = fornitoreOnesto();
  const r = await giro(t, { messaggiIniziali: conCoda(12_000), rete, finestraToken: 100_000 });
  assert.equal(rete.conti.richieste, 1, racconta(r));
  assert.equal(r.scritte.length, 0, `la sola coda non si scrive ${racconta(r)}`);
  assert.equal(r.nonEntra.length, 1, racconta(r));
  assert.equal(r.nonEntra[0].finestra, FINESTRA);
  assert.equal(r.errore?.contestoPieno?.scalino, 0);
  const reteBis = fornitoreOnesto();
  const bis = await giro(t, { messaggiIniziali: conCoda(8_000), rete: reteBis, finestraToken: 100_000 });
  assert.equal(bis.errore, null, `il giro finisce (${bis.errore?.message})`);
  assert.deepEqual([reteBis.conti.richieste, reteBis.conti.rifiutate], [2, 1], racconta(bis));
  assert.ok(bis.scritte.some((e) => e.soloCoda === true), racconta(bis));
});

test('ZK3-05 — un fornitore che conta il 25% in più della stima: la linea certa e il pavimento detto seguono la SUA scala, sia dal fermo sul riassunto senza modello sia dalla cornice da sola (la regola N)', async (t) => {
  /* il fermo della linea certa: sistema piccolo, la storia è ciò che non entra */
  const rete = fornitoreOnesto({ scala: 1.25 });
  const r = await giro(t, { messaggiIniziali: [sistema(8_000), ...coppie(2, 3_000), { role: 'user', content: 'Continua.' }], rete, finestraToken: 16_384 });
  assert.equal(rete.conti.richieste, 1, racconta(r));
  assert.equal(r.scritte.length, 0, racconta(r));
  assert.equal(r.nonEntra.length, 1, racconta(r));
  assert.ok(r.nonEntra[0].pavimento > FINESTRA, `il pavimento nella scala del fornitore (${r.nonEntra[0].pavimento}), non in quella della stima`);
  /* la cornice da sola (regola N, coi numeri): stesso fornitore, sistema grande */
  const reteN = fornitoreOnesto({ scala: 1.25 });
  const n = await giro(t, { messaggiIniziali: conStoria(1), rete: reteN, finestraToken: 16_384 });
  assert.equal(reteN.conti.richieste, 1, racconta(n));
  assert.equal(n.nonEntra.length, 1, racconta(n));
  assert.ok(n.nonEntra[0].pavimento > FINESTRA, `anche la regola N lo dice nella scala del fornitore (${n.nonEntra[0].pavimento}; prima 6.857)`);
});

/* Revisione 10 della CLI, il pavimento di F6: il fornitore conta 6.000 token di schemi in più (lo scarto della sessione), la storia è poca */
function fornitoreConSchemi(extra) {
  const conti = { richieste: 0, riassunti: 0 };
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoOnesto(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.richieste += 1;
    const veri = stima(corpo.messages) + extra;
    if (veri > FINESTRA) return rifiuto(`This model's maximum context length is ${FINESTRA} tokens. However, you requested ${veri} tokens.`);
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: veri, completion_tokens: 1 } });
  };
  return { fetchDiRete, conti };
}
test('ZK3-06 — «non entra» si dice solo se nemmeno il riassunto senza modello entra: col solo pavimento PAGATO oltre la finestra niente si paga e niente si dice, e il riassunto senza modello fa entrare il giro; AL CONTRARIO quando nemmeno lui entra si dice una volta e il giro si ferma al primo rifiuto', async (t) => {
  const conSistema = (caratteri) => [sistema(caratteri), ...coppie(3), { role: 'user', content: 'Continua.' }];
  const rete = fornitoreConSchemi(6_000);
  const r = await giro(t, { messaggiIniziali: conSistema(400), rete, scartoMisurato: 6_000 });
  assert.equal(r.errore, null, `il giro riesce (${r.errore?.message})`);
  assert.equal(rete.conti.riassunti, 0, 'niente pagato: il pavimento pagato non entra');
  assert.equal(r.nonEntra.length, 0, `niente «non entra»: quello senza modello entra ${racconta(r)}`);
  assert.ok(r.scritte.some((e) => e.ripiego === true), racconta(r));
  /* ⛔ R12-1 (revisione 12 della CLI): «non entra» è certo solo oltre ciò che la storia può spiegare dello scarto (`scartoFissoCerto`).
     Qui la storia sono ~2.277 token di prosa: possono spiegare fino a 2.277 dei 6.000. Il sistema non è storia: con 12.000 caratteri il
     pavimento senza modello resta oltre la finestra anche togliendoli, e «non entra» è certo. (Con 2.000 caratteri era oltre di 530: al
     margine, che ora decide il fornitore — ZK3-07.) */
  const reteBis = fornitoreConSchemi(6_000);
  const bis = await giro(t, { messaggiIniziali: conSistema(12_000), rete: reteBis, scartoMisurato: 6_000 });
  assert.equal(bis.nonEntra.length, 1, racconta(bis));
  /* detto PRIMA dell'invio (pavimento senza modello + scarto oltre la finestra), e il fermo sul rifiuto chiude muto — non è il fermo a dirlo */
  assert.deepEqual(bis.fini.map((e) => e.motivo), ['non-entra', 'nulla-da-ridurre'], racconta(bis));
  assert.deepEqual([reteBis.conti.richieste, reteBis.conti.riassunti, bis.scritte.length], [1, 0, 0], racconta(bis));
});

test('ZK3-07 — R12-1, AL MARGINE: oltre la finestra di meno di quanto la storia può spiegare, «non entra» non è certo — non si dice prima di mandare, niente si paga, e decide il fornitore (il giro finisce coi SUOI numeri)', async (t) => {
  const rete = fornitoreConSchemi(6_000);
  const r = await giro(t, { messaggiIniziali: [sistema(2_000), ...coppie(3), { role: 'user', content: 'Continua.' }], rete, scartoMisurato: 6_000 });
  /* prima di mandare non si afferma niente; dopo che il fornitore ha rifiutato la stessa richiesta che si rimanderebbe, sì — coi suoi numeri */
  assert.notEqual(r.eventi[0]?.motivo, 'non-entra', `al margine non si afferma niente prima di mandare ${racconta(r)}`);
  assert.ok(rete.conti.richieste >= 2, `decide il fornitore ${racconta(r)}`);
  assert.equal(r.nonEntra.length, 1, `poi detto una volta ${racconta(r)}`);
  assert.equal(r.nonEntra[0].finestra, FINESTRA);
  assert.ok(r.nonEntra[0].pavimento > FINESTRA, 'col numero del fornitore');
  assert.equal(rete.conti.riassunti, 0, 'niente pagato');
  assert.equal(r.errore?.classificazione, 'contesto-pieno', `il fornitore rifiuta ${racconta(r)}`);
  assert.equal(r.errore?.contestoPieno?.numeri?.massimo, FINESTRA, 'e il giro finisce coi suoi numeri, che la carta d\'errore dice');
});

test('ZK3-04 — AL CONTRARIO senza numeri: la linea certa non c\'è, il riassunto senza modello si scrive e decide il fornitore (come prima)', async (t) => {
  const rete = fornitoreOnesto({ conNumeri: false });
  const r = await giro(t, { messaggiIniziali: conStoria(3), rete });
  assert.ok(rete.conti.richieste >= 2, `il ritentativo parte (${rete.conti.richieste}) ${racconta(r)}`);
  assert.ok(r.scritte.some((e) => e.ripiego === true), `il riassunto senza modello si scrive ${racconta(r)}`);
});
