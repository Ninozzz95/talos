/*
 * TONO-ESITO (R1 della revisione CLI sul «no neutro», 03/11/2026): il tono della riga d'esito della carta, senza browser.
 * Decisioni 89 e 96 dell'owner: ogni no detto dalla persona è neutro (anche «da un'altra finestra», l'«Annullata» di
 * un'automazione o dei fornitori, «Modificata da te»); ogni no che porta un motivo del server resta rosso (`--no`), anche su una
 * carta di automazione; lo Stop resta rosso. La lista dei motivi del server è `MOTIVI_APPROVAZIONE_RISOLTA` (agui-events.mjs).
 * Matrice scritta dalla CLI nella revisione (REVISIONE-NO-NEUTRO-FE-MOBILE-2026-11-03.md). La prova in Chromium
 * (famiglia-consenso-stile-browser) guarda il colore; questa guarda la classe, e gira anche dove il browser non c'è.
 * `TONO_RADICE` fa girare la stessa matrice su una copia (per i mutanti, mai sul file vero).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const doc = { createElement: (tag) => ({ tag, attributes: {}, className: '', textContent: '', setAttribute(k, v) { this.attributes[k] = v; } }) };
const scheda = (dataset = {}) => ({ dataset, figli: [], querySelector: () => null, append(n) { this.figli.push(n); } });
const tono = (riga) => /--(si|no|neutro)\b/u.exec(riga.className)?.[1];
const carica = () => (process.env.TONO_RADICE
  ? import(pathToFileURL(join(process.env.TONO_RADICE, 'harness-ui/frontend/src/components/conversazione.js')).href)
  : import('../../src/components/conversazione.js'));

const CASI = [
  ['no della persona', {}, { approvato: false }, 'neutro'],
  ['no della persona da un\'altra finestra', {}, { approvato: false, altrove: true }, 'neutro'],
  ['Annullata dopo il no (automazione)', { cartaAutomazione: '1' }, { approvato: false }, 'neutro'],
  ['Annullata dopo il no (fornitori)', { cartaFornitori: '1' }, { approvato: false }, 'neutro'],
  ['modificata dalla persona', { cartaAutomazione: '1' }, { approvato: false, motivo: 'modificata-dalla-persona' }, 'neutro'],
  ['no del server, nessuno poteva rispondere', {}, { approvato: false, motivo: 'nessuna-interfaccia' }, 'no'],
  ['no del server su una carta di automazione', { cartaAutomazione: '1' }, { approvato: false, motivo: 'nessuna-interfaccia' }, 'no'],
  ['no del confutatore in sola lettura', {}, { approvato: false, motivo: 'confutatore-sola-lettura' }, 'no'],
  ['no per regola', {}, { approvato: false, motivo: 'regola' }, 'no'],
  ['no per modalità', {}, { approvato: false, motivo: 'modalita' }, 'no'],
  ['no del classificatore', {}, { approvato: false, motivo: 'classificatore' }, 'no'],
  ['Stop', {}, { approvato: false, motivo: 'fermato' }, 'no'],
  ['sì', {}, { approvato: true }, 'si'],
];

for (const [nome, dataset, esito, atteso] of CASI) {
  test(`TONO-ESITO: ${nome} ⇒ ${atteso}`, async () => {
    const { segnaEsitoApprovazione } = await carica();
    const riga = segnaEsitoApprovazione(scheda(dataset), esito, { document: doc });
    assert.equal(tono(riga), atteso);
  });
}
