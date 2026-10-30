// Revisione a blocco 5 (24/10/2026), voce 2-bis (carta istantanea): le sonde del revisore REV5-C1/C2, tenute nella suite dal Desktop 9.
// REV5-C1: l'asserzione sul dispositivo dice «mai scaduta, e alla fine lo stesso esito del PC» (durante l'avvio legge «attesa»).
import assert from 'node:assert/strict';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { ATTESA_CONSENSO_MS, creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

function banco({ programma, clock }) {
  const radice = cartellaDiProva('talos-rev5-consenso-');
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync(p); };
  const avm = crea('progetti', 'AVM');
  const dati = crea('dati');
  const sessionRegistry = {
    cartellePiuUsate: () => [{ percorso: avm, conteggio: 2, ultimaVolta: '2026-10-24T10:00:00.000Z' }],
    elenca: () => [], esiste: () => false,
  };
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry, cartelleEscluse: [dati], ...(programma ? { programma } : {}), clock });
  return { cartelle, avm };
}

test('REV5-C1 «Consenti» con l\'avvio in corso mentre scade: due chiusure contraddittorie?', async () => {
  let ora = Date.parse('2026-10-24T18:00:00.000Z');
  const programmati = [];
  const programma = (fn, ms) => { const v = { fn, ms, tolto: false }; programmati.push(v); return () => { v.tolto = true; }; };
  const b = banco({ programma, clock: () => ora });
  const eventi = [];
  if (typeof b.cartelle.ascolta === 'function') b.cartelle.ascolta((e) => eventi.push(e));
  const [riga] = await b.cartelle.elenco('D1');
  let finisciAvvio;
  const avviate = [];
  /* 30/10/2026: rossa a intermittenza sulla CI pubblica (run 41022417182 e 41029502490, «finisciAvvio is not a function»): `rispondi`
     carica e salva i consensi su disco, sotto il lucchetto fra processi, PRIMA di chiamare `avvio`, e su un runner lento 20 ms fissi
     non bastavano. Si aspetta la chiamata vera. */
  let avvioChiamato;
  const chiamato = new Promise((ok) => { avvioChiamato = ok; });
  const avvio = () => new Promise((ok) => { finisciAvvio = () => { avviate.push('s1'); ok('s1'); }; avvioChiamato(); });
  const r = await b.cartelle.chiedi({ dispositivoId: 'D1', nomeDispositivo: 'Pad', cartellaId: riga.cartellaId, avvio });
  ora += ATTESA_CONSENSO_MS - 500; // «Consenti» premuto a 1:59,5
  const risposta = b.cartelle.rispondi(r.richiestaId, 'consentita');
  await chiamato; // il PC sta avviando la sessione
  ora += 1000; // l'avvio della sessione dura più di mezzo secondo: la scadenza arriva mentre gira
  // la scadenza la nota chiunque legga: il timer (nuovo) o la lettura della finestra (di prima)
  const timer = programmati.find((p) => !p.tolto);
  if (timer) timer.fn(); else b.cartelle.inAttesa();
  const vistoDalDispositivo = await b.cartelle.attendi('D1', r.richiestaId, { ms: 10 });
  /* REV5-C1: oltre la scadenza, in risposta, l'attesa lunga del dispositivo aspetta l'esito invece di tornare subito «attesa» */
  const attesaLunga = b.cartelle.attendi('D1', r.richiestaId, { ms: 2000 });
  await new Promise((x) => setTimeout(x, 30));
  const carteDurante = b.cartelle.inAttesa(); // REV5-C1: in risposta, la carta non torna nell'istantanea della finestra
  finisciAvvio();
  const fine = await risposta;
  const dallAttesaLunga = await attesaLunga;
  const vistoDopo = await b.cartelle.attendi('D1', r.richiestaId, { ms: 10 });
  const chiuse = eventi.filter((e) => e.type === 'consent.closed');
  console.log('REV5-C1', JSON.stringify({ fine, vistoDalDispositivo, vistoDopo, chiuse, avviate, timer: Boolean(timer) }));
  assert.notEqual(vistoDalDispositivo.esito, 'scaduta', '⛔ il dispositivo legge «scaduta» mentre il PC avvia la sessione');
  assert.deepEqual(vistoDopo, fine, 'alla fine il dispositivo legge lo stesso esito del PC');
  assert.equal(vistoDopo.esito,  fine.esito, `⛔ il dispositivo ha letto «${vistoDalDispositivo.esito}», il PC risponde «${fine.esito}» e ha avviato ${avviate.length} sessione`);
  assert.deepEqual(dallAttesaLunga, fine, '⛔ l\'attesa lunga è tornata prima dell\'esito (il dispositivo ripeterebbe la domanda a vuoto)');
  assert.deepEqual(carteDurante, [], '⛔ la carta torna sulla finestra mentre il PC sta rispondendo');
  assert.ok(chiuse.length <= 1, `⛔ ${chiuse.length} consent.closed per la stessa richiesta: ${chiuse.map((e) => e.esito).join(' poi ')}`);
});

test('REV5-C2 timer di scadenza: 100 richieste chiuse per tre strade diverse — nessun timer resta acceso', { skip: !creaCartelleDeiDispositivi.toString().includes('programma') }, async () => {
  let ora = Date.parse('2026-10-24T18:00:00.000Z');
  const vivi = new Set();
  const programma = (fn, ms) => { const v = { fn, ms }; vivi.add(v); return () => { vivi.delete(v); }; };
  const b = banco({ programma, clock: () => ora });
  const ids = [];
  for (let i = 0; i < 99; i += 1) ids.push((await b.cartelle.chiedi({ dispositivoId: `D${i}`, cartellaId: (await b.cartelle.elenco(`D${i}`))[0].cartellaId })).richiestaId);
  assert.equal(vivi.size, 99);
  for (let i = 0; i < 33; i += 1) await b.cartelle.rispondi(ids[i], 'negata');
  for (let i = 33; i < 66; i += 1) await b.cartelle.dimentica(`D${i}`);
  ora += ATTESA_CONSENSO_MS + 1;
  b.cartelle.inAttesa(); // le ultime 33 scadono alla lettura, prima che il loro timer scatti
  console.log('REV5-C2 timer vivi dopo la chiusura di tutte:', vivi.size);
  assert.equal(vivi.size, 0);
});
