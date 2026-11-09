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
    `Questo comando girerebbe in ${nellaDistro} come root. Con i permessi di questa sessione i comandi partono senza chiedere, ma come root può cambiare tutto il sistema Linux e scrivere sui dischi di Windows. Un sì vale per questa chat, a meno che tu scelga solo questa volta.`],
  [fraseDiPermesso('server.approval.wslRoot.unverifiedUser', { linux: 'Linux (WSL)' }),
    'Questo comando girerebbe in Linux (WSL), e non è stato possibile verificare con che utente: potrebbe essere root, che può cambiare tutto il sistema Linux e scrivere sui dischi di Windows. Con i permessi di questa sessione i comandi partono senza chiedere. Un sì vale per questa chat, a meno che tu scelga solo questa volta.'],
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

/* Decisioni 57 e 144 (04/11/2026): la carta della ricerca coi dollari, nelle due lingue; senza prezzo la frase di prima. */
test('K4B-PERMESSO-DOLLARI: research card with a known price, in Italian and English; without a price the sentence of before', async () => {
  const { azioneCartaRicerca } = await import('../../../src/kernel/talosHarness.mjs');
  const conPrezzo = azioneCartaRicerca('c', { question: 'q', depth: 'quick' }, { in: 0.4, out: 1.6 });
  const senza = azioneCartaRicerca('c', { question: 'q', depth: 'quick' }, null);
  try {
    impostaLingua('it');
    assert.match(testoDelCampo(conPrezzo, 'frase'), /^Profondità: rapida\. Costo stimato: ~\$0\.\d{2,4} al prezzo pubblicato; ricerche ~2, pagine ~10, token ~\d+k, tempo ~\d+ min\.$/u);
    assert.match(testoDelCampo(senza, 'frase'), /^Profondità: rapida\. Costo stimato: ricerche ~2, pagine ~10, token ~\d+k, tempo ~\d+ min\.$/u);
    for (const depth of ['deep', 'exhaustive']) {
      const carta = azioneCartaRicerca('c', { question: 'q', depth }, { in: 1, out: 1 });
      assert.notEqual(testoDelCampo(carta, 'frase'), carta.frase, `${depth}: the dictionary has the Italian`);
      assert.ok(testoDelCampo(carta, 'frase').includes(carta.fraseParams.dollari), depth);
    }
    impostaLingua('en');
    assert.equal(testoDelCampo(conPrezzo, 'frase'), conPrezzo.frase);
  } finally { impostaLingua('it'); }
});

/* Prova dell'escape (Desktop 04/11/2026, dopo la prova CRC-11 del Mobile: con escapeParameter acceso «~$<0.0001» usciva «~$&lt;0.0001»
   sul telefono). Sul PC: la frase detta nella lingua dell'interfaccia (testoDelCampo, interpola) e la carta disegnata (creaApprovazione,
   il campo del perché) mostrano i dollari come erano; il DOM finto fa cadere ogni innerHTML. */
test('K4B-PERMESSO-DOLLARI-ESCAPE: «~$<0.0001» and a normal amount reach the card as text, in Italian and English, for every depth', async () => {
  const { azioneCartaRicerca } = await import('../../../src/kernel/talosHarness.mjs');
  const { creaApprovazione } = await import('../../src/components/conversazione.js');
  const { documento } = await import('./aiuto-dom-blocchi.mjs');
  const SEGNI_HTML = /&(?:lt|gt|amp|quot|#\d+);/u;
  try {
    for (const [prezzo, minuscolo] of [[{ in: 0.000001, out: 0.000001 }, true], [{ in: 0.4, out: 1.6 }, false]]) {
      for (const depth of ['quick', 'deep', 'exhaustive']) {
        const carta = azioneCartaRicerca('c', { question: 'q', depth }, prezzo);
        const dollari = carta.fraseParams.dollari;
        if (minuscolo) assert.equal(dollari, '~$<0.0001', depth);
        else assert.match(dollari, /^~\$\d+\.\d{2,4}$/u, depth);
        for (const lingua of ['it', 'en']) {
          impostaLingua(lingua);
          const testo = testoDelCampo(carta, 'frase');
          assert.ok(testo.includes(dollari), `${lingua} ${depth}: ${testo}`);
          assert.doesNotMatch(testo, SEGNI_HTML, `${lingua} ${depth}`);
          const scheda = creaApprovazione({ badge: 'b', motivo: testo, nota: 'n' }, { document: documento() });
          assert.equal(scheda.motivo.textContent, testo, `${lingua} ${depth}: la carta disegnata`);
        }
      }
    }
  } finally { impostaLingua('it'); }
});
