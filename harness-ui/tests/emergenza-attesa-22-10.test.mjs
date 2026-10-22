/*
 * 22/10/2026 — seconda revisione avversaria di bd2962b40.
 * B: all'EMERGENZA, con la compattazione istantanea accesa (il default del desktop), il giro aspettava il riassunto in volo senza tetto,
 *    senza «Salta», senza riga viva; e se era quello ereditato dal giro prima (`compattazioneInArrivo`) nemmeno lo Stop lo fermava.
 *    Riproduzione del revisore: con Stop e con «Salta» il giro era ancora appeso dopo 4 s, senza un evento.
 * A: una prima richiesta che CONTIENE la frase del marcatore (un log di TALOS incollato) non si accorciava mai.
 * Fornitore finto via `fetchDiRete`, cartelle temporanee proprie, nessuna porta.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };

function fornitore() {
  const conti = { modello: 0, riassunti: 0 };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.modello += 1;
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  return { conti, fetchDiRete };
}

/** Un giro sopra l'emergenza col riassunto del giro prima «in arrivo» che non arriva finché la prova non lo dice. */
async function giroInEmergenza(t, { azione, riassuntoTettoMs }) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-emergenza-attesa-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  let consegna;
  const inArrivo = new Promise((r) => { consegna = r; });
  t.after(() => consegna(null));
  const stop = new AbortController();
  const salta = new AbortController();
  const eventi = [];
  const { conti, fetchDiRete } = fornitore();
  const inizio = Date.now();
  const giro = talosLavora({
    cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
    messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }],
    compattazioneInArrivo: inArrivo, compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete,
    segnaleStop: stop.signal, segnaleSaltaRiassunto: salta.signal, ...(riassuntoTettoMs ? { riassuntoTettoMs } : {}),
    onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(e); },
  }).then((r) => ({ r, ms: Date.now() - inizio }), (e) => ({ e, ms: Date.now() - inizio }));
  if (azione) setTimeout(() => (azione === 'stop' ? stop.abort() : salta.abort()), 300);
  const esito = await Promise.race([giro, new Promise((r) => { setTimeout(() => r('APPESO'), 4_000); })]);
  return { esito, eventi, conti };
}

const conta = (eventi, tipo) => eventi.filter((e) => e.tipo === tipo).length;

test('EMERG-ATTESA-01 — Stop mentre il giro aspetta il riassunto ereditato: il giro finisce, e la riga aperta si chiude (inizio = fine)', async (t) => {
  const { esito, eventi } = await giroInEmergenza(t, { azione: 'stop' });
  assert.notEqual(esito, 'APPESO', `lo Stop non ha effetto (eventi ${JSON.stringify(eventi.map((e) => e.tipo))})`);
  assert.equal(conta(eventi, 'compattazione-inizio'), 1, 'la riga viva si apre PRIMA di aspettare');
  assert.equal(conta(eventi, 'compattazione-fine'), 1, 'e si chiude');
  assert.equal(eventi.find((e) => e.tipo === 'compattazione-fine').motivo, 'interrotta');
});

test('EMERG-ATTESA-02 — «Salta» mentre il giro aspetta: riassunto senza modello subito, ragione «saltato», nessun riassunto pagato', async (t) => {
  const { esito, eventi, conti } = await giroInEmergenza(t, { azione: 'salta' });
  assert.notEqual(esito, 'APPESO', `«Salta» non ha effetto (eventi ${JSON.stringify(eventi.map((e) => e.tipo))})`);
  assert.ok(esito.r, `il giro finisce bene: ${esito.e?.message ?? ''}`);
  assert.equal(conta(eventi, 'compattazione-inizio'), 1, 'una riga sola: la compattazione dopo l\'attesa non ne apre un\'altra');
  const fine = eventi.filter((e) => e.tipo === 'compattazione-fine');
  assert.equal(fine.length, 1);
  assert.equal(fine[0].compattato, true);
  assert.equal(fine[0].ripiego, true);
  assert.equal(fine[0].ragione, 'saltato');
  assert.equal(conti.riassunti, 0, 'il modello lento non si richiama');
});

test('EMERG-ATTESA-03 — tetto scaduto mentre il giro aspetta: riassunto senza modello, ragione «tempo»', async (t) => {
  const { esito, eventi, conti } = await giroInEmergenza(t, { riassuntoTettoMs: 250 });
  assert.notEqual(esito, 'APPESO', 'il tetto non vale per l\'attesa');
  const fine = eventi.filter((e) => e.tipo === 'compattazione-fine');
  assert.equal(conta(eventi, 'compattazione-inizio'), 1);
  assert.equal(fine.length, 1);
  assert.equal(fine[0].ragione, 'tempo');
  assert.equal(conti.riassunti, 0);
});

test('PRIMA-MARCATORE-01 — una prima richiesta che CONTIENE la frase del marcatore si accorcia lo stesso; la copia già accorciata no', () => {
  const incollato = `Guarda questo log: [… 12 ${compattazione.MARCATORE_ACCORCIATO} …] ${'riga del log '.repeat(10_000)}`;
  const storiaCol = (prima) => [{ role: 'system', content: 'sys' }, { role: 'user', content: prima },
    ...Array.from({ length: 12 }, (_, i) => [{ role: 'user', content: `r${i}` }, { role: 'assistant', content: `a${i}` }]).flat()];
  const tenuta = compattazione.dividiPerCompattazione(storiaCol(incollato)).richiesteLetterali[0].content;
  assert.ok(tenuta.length < compattazione.PRIMA_RICHIESTA_CARATTERI_MASSIMI + 1_000, `tenuti ${tenuta.length} caratteri su ${incollato.length}`);
  assert.ok(tenuta.startsWith(incollato.slice(0, compattazione.PRIMA_RICHIESTA_INIZIO)), 'l\'inizio resta alla lettera');
  /* AL CONTRARIO: la copia accorciata, ripassata, resta identica (il conto dei caratteri tolti resta quello vero) */
  const ancora = compattazione.dividiPerCompattazione(storiaCol(tenuta)).richiesteLetterali[0].content;
  assert.equal(ancora, tenuta);
  assert.match(ancora, new RegExp(`${(incollato.length - compattazione.PRIMA_RICHIESTA_INIZIO - compattazione.PRIMA_RICHIESTA_FINE).toLocaleString('en-US')} ${compattazione.MARCATORE_ACCORCIATO}`));
});
