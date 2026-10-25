import test from 'node:test';
import assert from 'node:assert/strict';

import { creaRitmo, RITMO_DI_SERIE } from '../../src/components/ritmo-streaming.js';
import { cadenzaAPacchetti, cadenzaRegolare } from '../browser/aiuto-scenari-fluido.mjs';

/*
 * 22/10/2026 — IL RITMO DELLA RISPOSTA, provato in Node sulla forma del filo vero (owner: «lo streaming è molto scattoso,
 * si ferma … voglio il massimo del massimo»).
 *
 * La cadenza viene dal giro vero sulla 4176 del 22/10/2026 (`cadenzaAPacchetti`): ~35 caratteri a pacchetto ogni ~145 ms,
 * con buchi fino a 480 ms. Il «prima» è ciò che faceva il monolite dal 29/09 (`0238eea02`): mostrare a ogni fotogramma tutto ciò
 * che era arrivato. Le prove dicono tre cose, e ognuna si prova anche al contrario (la forma «mostra tutto» deve FALLIRE la prova
 * di fluidità, o la prova non discrimina):
 *   · FLUIDO — il testo cresce a passi piccoli e regolari, e non si ferma MAI mentre c'è testo arrivato da mostrare;
 *   · LIMITE — nessun carattere resta indietro oltre `ritardoMaxMs`, con qualunque fornitore (anche uno più veloce del ritmo:
 *     l'arretrato senza limite del 14/09 e del 20/09);
 *   · FINE — a messaggio finito il resto esce entro `fineMs`.
 */

/** Fotogrammi a `hz`; ritorna, per ogni fotogramma, l'ora e quanti caratteri il ritmo mostra. */
function simula(passi, { hz = 60, ritmo = null, mostraTutto = false, fineDopoMs = 0 } = {}) {
  const r = ritmo ?? creaRitmo();
  const arrivi = [];
  let t = 1000;
  let totale = 0;
  for (const p of passi) { t += p.dopoMs; totale += p.n; arrivi.push({ t, fino: totale }); }
  const fine = arrivi.at(-1).t + fineDopoMs;
  const passo = 1000 / hz;
  const fotogrammi = [];
  let i = 0;
  let arrivato = 0;
  let concluso = false;
  for (let ora = arrivi[0].t - passo; ora < fine + 3000; ora += passo) {
    while (i < arrivi.length && arrivi[i].t <= ora) { arrivato = arrivi[i].fino; r.arrivo(arrivato, arrivi[i].t); i += 1; }
    if (!concluso && i >= arrivi.length && ora >= fine) { r.concludi(ora); concluso = true; }
    const mostrato = mostraTutto ? arrivato : r.avanza(ora);
    fotogrammi.push({ ora, arrivato, mostrato });
    if (concluso && mostrato >= totale) break;
  }
  return { fotogrammi, arrivi, totale, fine };
}

/** Le misure: crescita per fotogramma (fra il primo carattere e la fine del filo), fermate con arretrato, ritardo. */
function misura({ fotogrammi, arrivi, fine }) {
  const crescite = [];
  let fermoConArretrato = 0;
  let fermoMax = 0;
  for (let k = 1; k < fotogrammi.length; k += 1) {
    const f = fotogrammi[k];
    if (f.ora > fine || fotogrammi[k - 1].mostrato === 0) continue;
    const d = f.mostrato - fotogrammi[k - 1].mostrato;
    crescite.push(d);
    if (d === 0 && f.arrivato > f.mostrato) { fermoConArretrato += f.ora - fotogrammi[k - 1].ora; fermoMax = Math.max(fermoMax, fermoConArretrato); }
    else fermoConArretrato = 0;
  }
  let ritardoMax = 0;
  let j = 0;
  for (const a of arrivi) {
    while (j < fotogrammi.length && fotogrammi[j].mostrato < a.fino) j += 1;
    if (j < fotogrammi.length) ritardoMax = Math.max(ritardoMax, fotogrammi[j].ora - a.t);
  }
  const media = crescite.reduce((s, x) => s + x, 0) / crescite.length;
  const cv = Math.sqrt(crescite.reduce((s, x) => s + (x - media) ** 2, 0) / crescite.length) / media;
  return { cv, max: Math.max(...crescite), fermoMax, ritardoMax };
}

const PACCHETTI = cadenzaAPacchetti(6000);

for (const hz of [60, 165]) {
  test(`RITMO-01 (${hz} Hz) — a pacchetti il testo scorre: passi piccoli, mai fermo con testo da mostrare, e il «mostra tutto» di prima NON passa`, () => {
    const dopo = misura(simula(PACCHETTI, { hz }));
    const prima = misura(simula(PACCHETTI, { hz, mostraTutto: true }));
    /* il verso contrario: la forma di prima è a scatti per questa stessa misura */
    assert.ok(prima.cv > 2, `la cadenza di prova deve essere a scatti col «mostra tutto» (CV ${prima.cv.toFixed(2)})`);
    assert.ok(dopo.cv < prima.cv / 2, `la crescita per fotogramma deve essere almeno due volte più regolare: CV ${dopo.cv.toFixed(2)} contro ${prima.cv.toFixed(2)}`);
    assert.ok(dopo.max <= prima.max / 2, `il passo più lungo deve dimezzarsi almeno: ${dopo.max} contro ${prima.max}`);
    assert.ok(dopo.fermoMax <= 50, `mai fermo oltre 50 ms con testo arrivato da mostrare: ${dopo.fermoMax.toFixed(1)} ms`);
  });
}

test('RITMO-02 — il ritardo massimo è un CONTRATTO: con pacchetti, con un fornitore veloce e con un dump enorme', () => {
  const limite = RITMO_DI_SERIE.ritardoMaxMs + 1000 / 60 + 1;
  for (const [nome, passi] of [['pacchetti', PACCHETTI], ['3.000 car/s', cadenzaRegolare(12000, 50, 16)], ['dump da 5.000', [{ dopoMs: 0, n: 20 }, { dopoMs: 40, n: 5000 }, { dopoMs: 40, n: 20 }]]]) {
    const { ritardoMax } = misura(simula(passi, { hz: 60 }));
    assert.ok(ritardoMax <= limite, `${nome}: un carattere è rimasto indietro ${ritardoMax.toFixed(1)} ms (limite ${limite.toFixed(1)})`);
  }
});

test('RITMO-03 — l\'arretrato non cresce con un fornitore più veloce del ritmo (il difetto del 14/09 e del 20/09)', () => {
  /* 240 delta da 11 caratteri ogni 12 ms (la prova STREAMING-LIVE-SMOOTH-03) e un fornitore da ~3.000 car/s: il ritardo resta
     sotto il limite dall'inizio alla fine, e NON cresce col tempo — ciò che il ritmo fisso del 14/09 e il tetto per flush del
     20/09 facevano (il recupero «voleva secondi»). Senza la fine del messaggio, l'ultimo carattere esce comunque entro il limite. */
  for (const passi of [cadenzaRegolare(2640, 11, 12), cadenzaRegolare(30000, 50, 16)]) {
    const { fotogrammi, arrivi } = simula(passi, { hz: 60, fineDopoMs: 5000 });
    const ritardoDi = (a) => { const f = fotogrammi.find((x) => x.mostrato >= a.fino); return f ? f.ora - a.t : Infinity; };
    const limite = RITMO_DI_SERIE.ritardoMaxMs + 1000 / 60 + 1;
    const ritardi = arrivi.map(ritardoDi);
    assert.ok(Math.max(...ritardi) <= limite, `un carattere oltre il limite: ${Math.max(...ritardi).toFixed(1)} ms`);
    const primaMeta = Math.max(...ritardi.slice(0, ritardi.length >> 1));
    const secondaMeta = Math.max(...ritardi.slice(ritardi.length >> 1));
    assert.ok(secondaMeta <= primaMeta + 1000 / 60 + 1, `il ritardo cresce col tempo: ${primaMeta.toFixed(1)} → ${secondaMeta.toFixed(1)} ms`);
  }
});

test('RITMO-04 — a messaggio finito il resto esce entro `fineMs`, e il primo carattere esce al primo fotogramma', () => {
  const sim = simula(PACCHETTI, { hz: 60 });
  const completo = sim.fotogrammi.find((f) => f.mostrato >= sim.totale);
  assert.ok(completo, 'il testo deve completarsi');
  assert.ok(completo.ora - sim.fine <= RITMO_DI_SERIE.fineMs + 1000 / 60 + 1, `coda dopo la fine: ${(completo.ora - sim.fine).toFixed(1)} ms`);
  const primo = sim.fotogrammi.find((f) => f.mostrato > 0);
  assert.ok(primo.ora - sim.arrivi[0].t <= 1000 / 60 + 1, `il primo carattere aspetta ${(primo.ora - sim.arrivi[0].t).toFixed(1)} ms`);
});

test('RITMO-05 — `raggiungi` mostra tutto e il ritmo riparte da lì; `allinea` non torna mai indietro', () => {
  const r = creaRitmo();
  r.arrivo(100, 0);
  r.avanza(16);
  r.raggiungi(20);
  assert.equal(r.mostrato, 100);
  r.arrivo(140, 30);
  const passo = r.avanza(46);
  assert.ok(passo > 100 && passo < 140, `riparte dal punto raggiunto, a ritmo: ${passo}`);
  r.allinea(120);
  assert.ok(r.mostrato >= 120);
  r.allinea(110);
  assert.ok(r.mostrato >= 120, 'allinea non arretra');
  r.allinea(10_000);
  assert.equal(r.mostrato, 140, 'e non va oltre il ricevuto');
});
