/*
 * BANCO — la riduzione della conversazione figlia PRIMA e DOPO. P0-E punto 10, 16/09/2026.
 *
 * ⛔ NON è un test: non finisce in `.test.mjs`, quindi `scripts/run-node-tests.mjs` non lo raccoglie.
 *   Si lancia a mano:  node tests/unit/conversazione-figlia-banco.mjs
 *
 * Il «PRIMA» è il comportamento vero del file al commit 4c58c961: `disegna()` girava a ogni evento
 * (`:580-581`) e chiamava `riduciEventiFiglia(eventi)` sull'INTERO array (`:486`). Qui si misura
 * esattamente quello, con la STESSA funzione pura che il file esporta ancora — così il confronto è
 * fra due cadenze, non fra due implementazioni diverse della riduzione.
 *
 * Tre scenari di figlia, presi dalle forme che si vedono davvero:
 *   · corta   — un giro, poche righe;
 *   · lunga   — 100 messaggi ricostruiti, come la figlia vera da 100 righe attrezzo del banco 11/09;
 *   · enorme  — 3.000 eventi, la taglia di una delega che ha lavorato per ore.
 * Tre giri per scenario, si riporta la MEDIANA.
 */

import { creaRiduttoreFiglia, digerisciEventoFiglia, istantaneaFiglia, riduciEventiFiglia } from '../../src/components/conversazione-figlia.js';

const START = (n) => ({ type: 'RunStarted', runId: `r${n}`, input: { consegnaCorta: `compito ${n}` }, contesto: { modello: 'z-ai/glm-5.3-flash' } });
const DELTA = (id, t) => ({ type: 'TextMessageContent', messageId: id, delta: t });
const TS = (id, nome) => ({ type: 'ToolCallStart', toolCallId: id, toolCallName: nome });
const TA = (id, d) => ({ type: 'ToolCallArgs', toolCallId: id, delta: d });
const TR = (id, c) => ({ type: 'ToolCallResult', toolCallId: id, content: c });

function storia(messaggi) {
  const eventi = [START(1)];
  for (let i = 0; i < messaggi; i += 1) {
    eventi.push(DELTA(`m${i}`, `Riga ${i} della conversazione della figlia, con un po' di testo. `));
    eventi.push(TS(`t${i}`, 'leggi'), TA(`t${i}`, `{"percorso":"src/file-${i}.mjs"}`), TR(`t${i}`, '42 righe'));
    if (i % 25 === 24) eventi.push(START(2 + Math.floor(i / 25)));
  }
  return eventi;
}

const SCENARI = {
  corta: storia(3),
  lunga: storia(100),
  enorme: storia(750), // ~3.000 eventi
};

const mediana = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/** PRIMA: a ogni evento si ri-riduceva TUTTO l'array accumulato fino a quel punto. */
function giroPrima(eventi) {
  const accumulati = [];
  const t0 = performance.now();
  let ultima = null;
  for (const e of eventi) { accumulati.push(e); ultima = riduciEventiFiglia(accumulati); }
  return { ms: performance.now() - t0, turni: ultima.turni.length, attrezzi: ultima.attrezzi };
}

/** DOPO: ogni evento si digerisce una volta, e l'istantanea è una lettura. */
function giroDopo(eventi) {
  const r = creaRiduttoreFiglia();
  const t0 = performance.now();
  let ultima = null;
  for (const e of eventi) { digerisciEventoFiglia(r, e); ultima = istantaneaFiglia(r); }
  return { ms: performance.now() - t0, turni: ultima.turni.length, attrezzi: ultima.attrezzi };
}

const esito = { scenario: {} };
for (const [nome, eventi] of Object.entries(SCENARI)) {
  const prima = [giroPrima(eventi), giroPrima(eventi), giroPrima(eventi)];
  const dopo = [giroDopo(eventi), giroDopo(eventi), giroDopo(eventi)];
  /* ⛔ Controllo di sanità: le due cadenze devono produrre LO STESSO risultato. Un banco che
     confronta due cose diverse misura la differenza fra loro, non la cura. */
  if (prima[0].turni !== dopo[0].turni || prima[0].attrezzi !== dopo[0].attrezzi) {
    throw new Error(`le due cadenze non danno lo stesso risultato su «${nome}»`);
  }
  const msPrima = Number(mediana(prima.map((g) => g.ms)).toFixed(2));
  const msDopo = Number(mediana(dopo.map((g) => g.ms)).toFixed(2));
  esito.scenario[nome] = {
    eventi: eventi.length,
    turni: dopo[0].turni,
    attrezzi: dopo[0].attrezzi,
    msPrima,
    msDopo,
    rapporto: Number((msPrima / Math.max(msDopo, 0.001)).toFixed(1)),
  };
}
console.log(JSON.stringify(esito, null, 2));
