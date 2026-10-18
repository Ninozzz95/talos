import test from 'node:test';
import assert from 'node:assert/strict';

import { contaProcessiAttivi, datiProcesso, processiDagliEventi } from '../../src/components/inspector.js';

/*
 * ⛔ Owner 17/10/2026 («Adottarli come Hermes, con "Ferma"») — la scheda Processi e i comandi in sottofondo ripresi dopo un riavvio.
 *   `talos.sfondo-adottato` → `ProcessoAdottato` in `eventiAttrezzi` (`legacy/app.js`); un ripreso uscito da solo arriva con
 *   `esitoIgnoto` (nessun codice raccolto).
 */
const sfondato = (id, sequenza) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', _sequenza: sequenza - 2, ricevutoA: 1000, giro: 1, chi: 'agente' },
  { type: 'ToolCallArgs', toolCallId: id, delta: '{"comando":"sleep 600"}', _sequenza: sequenza - 1 },
  { type: 'ToolCallResult', toolCallId: id, inSfondo: true, ricevutoA: 2000, _sequenza: sequenza },
];
const adottato = (id, sequenza, pid = 4242) => ({ type: 'ProcessoAdottato', toolCallId: id, pid, _sequenza: sequenza });
const riga = (processi, id) => processi.find((p) => p.id === id);

test('ORF-UI-01: ripreso dal server di ADESSO ⇒ di nuovo «In sfondo» (fermabile), contato fra i vivi, col PID', () => {
  const processi = processiDagliEventi([...sfondato('a', 3), adottato('a', 20)], { adesso: 3000, sfondiNonSeguitiFinoA: 10 });
  assert.equal(riga(processi, 'a').stato, 'in-sfondo');
  assert.equal(riga(processi, 'a').adottato, true);
  assert.equal(riga(processi, 'a').pid, 4242);
  assert.equal(contaProcessiAttivi(processi), 1);
});

test('ORF-UI-02: AL CONTRARIO — senza adozione resta «Non più seguito»; un\'adozione di un server di PRIMA (anche lui morto) pure', () => {
  assert.equal(riga(processiDagliEventi(sfondato('a', 3), { adesso: 3000, sfondiNonSeguitiFinoA: 10 }), 'a').stato, 'perso');
  const adottatoPrima = processiDagliEventi([...sfondato('a', 3), adottato('a', 8)], { adesso: 3000, sfondiNonSeguitiFinoA: 10 });
  assert.equal(riga(adottatoPrima, 'a').stato, 'perso', 'adottato da un server che poi è morto: non lo segue più nessuno');
  assert.equal(contaProcessiAttivi(adottatoPrima), 0);
});

test('ORF-UI-03: il ripreso fermato dalla persona è «Annullato»; uscito da solo è «Finito (esito non noto)», senza un codice inventato', () => {
  const fermato = processiDagliEventi([...sfondato('a', 3), adottato('a', 20), { type: 'ProcessoSfondoFinito', toolCallId: 'a', esito: 'terminato', codice: null, fermatoDallaPersona: true, _sequenza: 21 }],
    { adesso: 3000, sfondiNonSeguitiFinoA: 10 });
  assert.equal(riga(fermato, 'a').stato, 'annullato');
  const daSolo = processiDagliEventi([...sfondato('a', 3), adottato('a', 20), { type: 'ProcessoSfondoFinito', toolCallId: 'a', esito: 'terminato', codice: null, esitoIgnoto: true, _sequenza: 21 }],
    { adesso: 3000, sfondiNonSeguitiFinoA: 10 });
  assert.equal(riga(daSolo, 'a').stato, 'finito-ignoto');
  assert.equal(riga(daSolo, 'a').uscita, null);
  assert.equal(contaProcessiAttivi(daSolo), 0);
});

test('ORF-UI-04: il dettaglio del ripreso dice che è ripreso e che cosa non fa più, e mostra il PID', () => {
  const p = riga(processiDagliEventi([...sfondato('a', 3), adottato('a', 20, 777)], { adesso: 3000, sfondiNonSeguitiFinoA: 10 }), 'a');
  const preparata = datiProcesso(p);
  const testo = JSON.stringify(preparata.dettaglio ?? preparata);
  assert.match(testo, /777/u);
  assert.match(testo, /Ripreso dopo un riavvio|Re-attached after a restart/u);
  const vivo = riga(processiDagliEventi(sfondato('b', 3), { adesso: 3000 }), 'b');
  const normale = JSON.stringify(datiProcesso(vivo).dettaglio ?? {});
  assert.doesNotMatch(normale, /Ripreso dopo un riavvio|Re-attached after a restart/u, 'AL CONTRARIO: uno sfondato di questo server non lo dice');
});
