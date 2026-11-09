import { test } from 'node:test';
import assert from 'node:assert/strict';

import { impostaLingua } from '../../src/components/lingua.js';
import * as bacheca from '../../src/components/board.js';
import { documento } from './aiuto-dom-blocchi.mjs';

/*
 * Decisione 175 dell'owner (04/11/2026): le prove che la revisione UX 1-27 ha trovato mancanti (reperti N3c, N4, N5) e i mutanti vivi
 * che le dimostrano (E2/BR9, BR9b, A1). N1 e N2 (il segmento dopo il sì) si provano nel browser, dove c'è l'orologio:
 * `ux-evidenti-1.spec.mjs`, UX175-DOPO-IL-SI e UX175-NO; N3a in `cure-ux-21-27.spec.mjs`, UX26-CONTO.
 * Scritta rossa sulla candidata c45b49fbb dove c'è una cura (N3c); N4 e N5 provano codice che c'era già: sono rosse coi mutanti.
 */
const sessione = (sessionId, extra = {}) => ({ sessionId, padreId: null, profonditaDelega: 0, ...extra });
const tutte = [
  sessione('r1'), sessione('r2'), sessione('r3'), sessione('r4'), sessione('r5'),
  sessione('f1', { padreId: 'r1', profonditaDelega: 1 }), sessione('f2', { padreId: 'r1', profonditaDelega: 1 }), sessione('o1', { profonditaDelega: 1 }),
];

test('UX175-N3c — con un filtro acceso i sotto-agenti si contano fra le mostrate, e la frase lo dice', () => {
  const mostrate = [tutte[0], tutte[5], tutte[6]]; // 3 mostrate, 2 di sotto-agenti; nel totale sono 3 su 8
  assert.equal(bacheca.contoFiltratoDellaBacheca(mostrate, tutte), '3 sessioni mostrate (di cui 2 di sotto-agenti) su 8');
  assert.equal(bacheca.contoFiltratoDellaBacheca([tutte[5]], tutte), '1 sessione mostrata (di cui 1 di un sotto-agente) su 8');
  // senza sotto-agenti fra le mostrate: la forma breve, e nessun numero del totale che si possa leggere come loro
  assert.equal(bacheca.contoFiltratoDellaBacheca(tutte.slice(0, 2), tutte), '2 di 8 sessioni');
  assert.doesNotMatch(bacheca.contoFiltratoDellaBacheca(mostrate, tutte), /\b3 di sotto-agenti/u, 'mai i sotto-agenti del totale');
  impostaLingua('en');
  try {
    assert.equal(bacheca.contoFiltratoDellaBacheca(mostrate, tutte), '3 sessions shown (2 of them from sub-agents) out of 8');
    assert.equal(bacheca.contoFiltratoDellaBacheca(tutte.slice(0, 2), tutte), '2 of 8 sessions');
  } finally { impostaLingua('it'); }
  // senza filtro la testa resta quella di sempre
  assert.equal(bacheca.contoDellaBacheca(tutte), '8 sessioni, di cui 3 di sotto-agenti');
});

/* La sezione elenco+dettaglio montata in un DOM finto (lo stesso di UX177-C), con i filtri a pastiglie o a tendina. */
async function monta({ voci = [], tendina = false } = {}) {
  const { montaSezione, statoSezione } = await import(`../../src/components/sezione-elenco-dettaglio.js?ux175=${Math.random()}`);
  const doc = documento();
  for (const crea of ['createElement', 'createElementNS']) {
    const originale = doc[crea];
    doc[crea] = (...a) => {
      const n = originale(...a);
      n.style.setProperty = (k, v) => { n.style[k] = v; };
      n.style.removeProperty = (k) => { delete n.style[k]; };
      return n;
    };
  }
  const schermo = doc.createElement('section');
  montaSezione(schermo, {
    chiave: 'ux175', nome: 'Note', sostantivo: 'nota', voci, stato: {}, filtriATendina: tendina,
    filtri: [{ id: 'tutte', etichetta: 'Tutte' }, { id: 'mie', etichetta: 'Mie', quando: () => true }],
    titoloDi: (v) => v.titolo, quandoDi: () => null, cercaIn: (v) => v.titolo, idDi: (v) => v.id,
    vuoto: { titolo: 'Niente', testo: 'Niente da mostrare.' }, scheda: () => ({}),
  });
  const nodi = statoSezione(schermo).nodi;
  return { pastiglie: nodi.filtri, tendina: nodi.tendinaFiltri };
}

test('UX175-N4 — con l’elenco vuoto niente filtri a zero: né la riga delle pastiglie né la tendina (mutanti E2/BR9 e BR9b)', async () => {
  const vuota = await monta();
  assert.equal(vuota.pastiglie.hidden, true, 'la riga dei filtri, che conterebbe tutto zero, non c’è');
  const piena = await monta({ voci: [{ id: 'a', titolo: 'A' }] });
  assert.equal(piena.pastiglie.hidden, false, 'verso contrario: con le voci le pastiglie ci sono');

  const vuotaTendina = await monta({ tendina: true });
  assert.ok(vuotaTendina.tendina, 'la tendina dei filtri esiste nella sezione a tendina');
  assert.equal(vuotaTendina.tendina.hidden, true, 'la tendina, che direbbe «Tutte (0)», non c’è');
  assert.equal(vuotaTendina.pastiglie.hidden, true, 'e con la tendina le pastiglie non ci sono mai');
  const pienaTendina = await monta({ tendina: true, voci: [{ id: 'a', titolo: 'A' }] });
  assert.equal(pienaTendina.tendina.hidden, false, 'verso contrario: con le voci la tendina c’è');
});

const RIFIUTO = { ok: false, error: { code: 'AUTH_REQUIRED', message: 'This server only accepts the TALOS window that started it' } };
const risposta = (status, corpo) => ({ status, ok: status < 400, clone() { return { json: async () => corpo }; } });
const attesa = () => new Promise((f) => setTimeout(f, 5));

test('UX175-N5 — un 401 AUTH_REQUIRED dalla STESSA origine ma fuori da /api/v1/ non accende la fascia (mutante A1)', async () => {
  const { sorvegliaAccesso } = await import(`../../src/components/accesso-perso.js?ux175=${Math.random()}`);
  const finestra = { document: documento(), location: { href: 'http://127.0.0.1:4391/', origin: 'http://127.0.0.1:4391', reload() {} } };
  finestra.fetch = async () => risposta(401, RIFIUTO);
  const sorveglianza = sorvegliaAccesso({ finestra });
  for (const fuori of ['/assets/app.js', '/api/v2/sessions', 'http://127.0.0.1:4391/apix/v1/sessions', '/v1/api/sessions', new URL('http://127.0.0.1:4391/api/v1')]) {
    await finestra.fetch(fuori);
  }
  await attesa();
  assert.equal(sorveglianza.fascia, null, 'il filtro sul percorso tiene fuori ciò che non è l’API della finestra');
  // verso contrario: lo stesso rifiuto su /api/v1/ la accende (con una Request, non solo una stringa)
  await finestra.fetch({ url: 'http://127.0.0.1:4391/api/v1/sessions' });
  await attesa();
  assert.ok(sorveglianza.fascia?.isConnected);
});
