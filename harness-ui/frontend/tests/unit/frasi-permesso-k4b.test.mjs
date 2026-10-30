/*
 * K4b (11/10/2026) — le frasi delle carte di permesso nate nel kernel (root in WSL, scrittura fuori dalla cartella della sessione,
 *   computer di rete) erano ITALIANE e arrivavano così anche con l'interfaccia in inglese (visto sul server di prova della 0.1.26:
 *   «Questo comando gira in Linux (WSL, Ubuntu) come root…» in una carta inglese). Ora il kernel manda inglese + chiave + valori.
 * ⛔ Le prove: in italiano la frase è QUELLA DI PRIMA, parola per parola (le frasi qui sotto sono copiate dal kernel prima della cura,
 *   talosHarness.mjs:9878/9882/11446-11447/11683-11689 a d146c0bff); in inglese è la riserva del kernel; e una chiave che il dizionario
 *   non ha mostra la riserva, mai la chiave.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRASI_DI_PERMESSO, fraseDiPermesso } from '../../../src/kernel/talosHarness.mjs';
import { testoDelCampo } from '../../src/components/testo-server.js';
import { impostaLingua } from '../../src/components/lingua.js';

const nellaDistro = 'Linux (WSL, Ubuntu)';
const cosa = (azione) => ({ cosa: FRASI_DI_PERMESSO[`server.approval.network.action.${azione}`], cosaChiave: `server.approval.network.action.${azione}` });
const CASI = [
  [fraseDiPermesso('server.approval.outsideProject.verified', { cartella: 'C:\\altro\\docs' }),
    'Vuole scrivere fuori dalla cartella della sessione, in C:\\altro\\docs. Con «Scrive nel progetto» qui serve il tuo sì.'],
  [fraseDiPermesso('server.approval.outsideProject.unverified', { percorso: 'D:\\x\\$&.txt' }),
    'Non è stato possibile verificare dove finisce «D:\\x\\$&.txt»: potrebbe essere fuori dalla cartella della sessione. Con «Scrive nel progetto» qui serve il tuo sì.'],
  [fraseDiPermesso('server.approval.wslRoot.user', { linux: nellaDistro, utente: 'root' }),
    `Questo comando girerebbe in ${nellaDistro} come root. Con i permessi di questa sessione i comandi partono senza chiedere, ma come root può cambiare tutto il sistema Linux e scrivere sui dischi di Windows. Se confermi, per il resto di questa sessione i comandi in ${nellaDistro} potranno girare come root senza chiederlo di nuovo.`],
  [fraseDiPermesso('server.approval.wslRoot.unverifiedUser', { linux: 'Linux (WSL)' }),
    'Questo comando girerebbe in Linux (WSL), e non è stato possibile verificare con che utente: potrebbe essere root, che può cambiare tutto il sistema Linux e scrivere sui dischi di Windows. Con i permessi di questa sessione i comandi partono senza chiedere. Se confermi, per il resto di questa sessione i comandi in Linux (WSL) potranno girare senza chiederlo di nuovo.'],
  [fraseDiPermesso('server.approval.network.sessionFolder', { ospite: 'nas01' }),
    'La cartella della sessione sta su un computer di rete (nas01): aprire i suoi file manda a quel computer le credenziali di Windows. Se lo consenti, vale per tutta la sessione.'],
  [fraseDiPermesso('server.approval.network.link', { ...cosa('read'), collegamento: 'C:\\dati', ospite: 'nas01' }),
    'Vuole leggere un file attraverso un collegamento (C:\\dati) che porta a un computer di rete (nas01): solo aprirlo manda a quel computer le credenziali di Windows. Serve il tuo sì.'],
  [fraseDiPermesso('server.approval.network.listFolder', { ospite: 'nas01' }),
    'Vuole vedere i file di una cartella su un computer di rete (nas01): solo aprirla manda a quel computer le credenziali di Windows. Serve il tuo sì.'],
  [fraseDiPermesso('server.approval.network.open', { ...cosa('edit'), ospite: 'nas01' }),
    'Vuole modificare un file su un computer di rete (nas01): solo aprirlo manda a quel computer le credenziali di Windows. Serve il tuo sì.'],
  [fraseDiPermesso('server.approval.network.open', { ...cosa('open'), ospite: 'nas01' }),
    'Vuole aprire un file su un computer di rete (nas01): solo aprirlo manda a quel computer le credenziali di Windows. Serve il tuo sì.'],
];

test('K4B-PERMESSO-01: in Italian every card sentence is the one the kernel sent before, word for word', () => {
  try {
    impostaLingua('it');
    for (const [campi, prima] of CASI) assert.equal(testoDelCampo(campi, 'frase'), prima, campi.fraseChiave);
  } finally { impostaLingua('it'); }
});

test('K4B-PERMESSO-02: in English it is the kernel\'s own sentence, and the kernel sends no Italian any more', () => {
  try {
    impostaLingua('en');
    for (const [campi] of CASI) {
      assert.equal(testoDelCampo(campi, 'frase'), campi.frase, campi.fraseChiave);
      assert.doesNotMatch(campi.frase, /\b(Vuole|Questo comando|computer di rete|cartella|serve il tuo sì)\b/u, campi.fraseChiave);
    }
    assert.match(CASI[5][0].frase, /^It wants to read a file through a link/u, 'the action inside the sentence is English too');
  } finally { impostaLingua('it'); }
});

test('K4B-PERMESSO-03: al contrario — a key the dictionary does not have shows the kernel\'s sentence, never the key; an old event without a key shows as it is', () => {
  impostaLingua('it');
  const ignota = { frase: 'It wants to do something new.', fraseChiave: 'server.approval.nonEsiste', fraseParams: {} };
  assert.equal(testoDelCampo(ignota, 'frase'), 'It wants to do something new.');
  const vecchio = { frase: 'Questo comando gira in Linux (WSL) come root, …' };
  assert.equal(testoDelCampo(vecchio, 'frase'), 'Questo comando gira in Linux (WSL) come root, …');
});
