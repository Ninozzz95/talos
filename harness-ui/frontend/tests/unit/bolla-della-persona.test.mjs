/*
 * C09 (owner 10/10/2026, «Come Hermes, completo») — la bolla della persona dopo una ricarica: quella conservata se c'è, altrimenti
 *   ricostruita dal testo per il modello delle sessioni salvate prima (intestazioni IT ed EN che l'interfaccia ha scritto).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { TESTI } from '../../src/i18n/testi/index.js';
import { allegatiPerBolla, bollaDaConsegna, bollaDaInviare, bollaPerLaRigiocata } from '../../src/components/bolla-della-persona.js';

const LINGUE = {
  intestazioni: [TESTI.en['app.attachments.promptHeader'], TESTI.it['app.attachments.promptHeader']],
  prefissiFile: [TESTI.en['app.attachments.promptFileLine'], TESTI.it['app.attachments.promptFileLine']].map((t) => t.replace('{percorso}', '')),
};
const VECCHIA_IT = 'guarda questo\n\nAllegati di questo messaggio:\n- nota.txt (C:\\p\\allegati\\nota.txt)\n- file allegato: C:\\p\\src\\app.js\n\n--- nota.txt (C:\\p\\allegati\\nota.txt) ---\nRIGA-DEL-FILE';
const NUOVA_EN = 'look at this\n\nAttachments of this message:\n- attached file: C:\\p\\README.md';

test('BOLLA-FE-01 an old session (Italian header) loses the model block and gets its chips back', () => {
  assert.deepEqual(bollaDaConsegna(VECCHIA_IT, LINGUE), { testo: 'guarda questo', allegati: [
    { tipo: 'file', nome: 'nota.txt', percorso: 'C:\\p\\allegati\\nota.txt' },
    { tipo: 'file', nome: 'app.js', percorso: 'C:\\p\\src\\app.js' },
  ] });
  assert.deepEqual(bollaDaConsegna(NUOVA_EN, LINGUE), { testo: 'look at this', allegati: [{ tipo: 'file', nome: 'README.md', percorso: 'C:\\p\\README.md' }] });
});

test('BOLLA-FE-02 AL CONTRARIO: plain text, a header without «- » lines, or the header word inside a sentence stay whole (null)', () => {
  for (const testo of ['ciao', '', 'parlo di Allegati di questo messaggio: niente', 'nota: Allegati di questo messaggio:\n- una mia lista\n- seconda voce','x\n\nAllegati di questo messaggio:\nniente', `x\n\n${TESTI.en['app.attachments.promptHeader']}`]) {
    assert.equal(bollaDaConsegna(testo, LINGUE), null, JSON.stringify(testo));
  }
  assert.equal(bollaDaConsegna(VECCHIA_IT, { intestazioni: [], prefissiFile: [] }), null, 'no known header, nothing to strip');
});

test('BOLLA-FE-02b (review N2) the FIRST header is the real one: an attached file that contains the same header comes after it', () => {
  const fileCheLoContiene = 'riassumi\n\nAttachments of this message:\n- vecchia-chat.md (C:\\p\\vecchia-chat.md)\n\n--- vecchia-chat.md (C:\\p\\vecchia-chat.md) ---\nciao\n\nAttachments of this message:\n- dentro-il-file.txt (C:\\x\\dentro.txt)';
  assert.deepEqual(bollaDaConsegna(fileCheLoContiene, LINGUE), { testo: 'riassumi', allegati: [{ tipo: 'file', nome: 'vecchia-chat.md', percorso: 'C:\\p\\vecchia-chat.md' }] });
});

test('BOLLA-FE-03 the kept display copy wins over the model text, and the turn images join the chips', () => {
  const bolla = { testo: 'la mia frase', allegati: [{ tipo: 'testo', nome: 'a.txt', percorso: 'C:\\a.txt' }] };
  const immagine = { tipo: 'immagine', id: 'img1', url: '/x' };
  assert.deepEqual(bollaPerLaRigiocata({ bolla, consegna: VECCHIA_IT, immagini: [immagine], lingue: LINGUE }), { testo: 'la mia frase', allegati: [...bolla.allegati, immagine] });
  assert.equal(bollaPerLaRigiocata({ consegna: 'solo testo', lingue: LINGUE }), null, 'no copy and nothing to strip: the text as it is');
  assert.equal(bollaPerLaRigiocata({ consegna: VECCHIA_IT, lingue: LINGUE }).testo, 'guarda questo');
});

test('BOLLA-FE-04 what is sent: only when the person sees something else; images and file bytes never travel in it', () => {
  const allegati = [{ tipo: 'testo', nome: 'a.txt', assoluto: 'C:\\a.txt', contenuto: 'BYTE', caratteri: 4 }, { tipo: 'immagine', id: 'i', url: '/i' }];
  assert.deepEqual(bollaDaInviare('ciao', 'ciao\n\nAttachments…', allegati), { testo: 'ciao', allegati: [{ tipo: 'testo', nome: 'a.txt', percorso: 'C:\\a.txt', caratteri: 4 }] });
  assert.equal(bollaDaInviare(null, 'ciao', allegati), null);
  assert.equal(bollaDaInviare('ciao', 'ciao', allegati), null, 'same text: nothing to keep');
  assert.deepEqual(allegatiPerBolla([{ tipo: 'immagine' }, null, { tipo: 'file' }]), [], 'nothing to name, nothing to show');
});

test('BOLLA-FE-05 the queue banner shows the person\'s sentence, never the files pasted for the model; a plain message as before', async () => {
  const { descriviCoda } = await import('../../src/components/coda-messaggi.js');
  const conBolla = descriviCoda({ voci: [{ id: 'a', testo: VECCHIA_IT, immagini: 0, bolla: { testo: 'guarda questo', allegati: [] } }] });
  assert.match(conBolla.testo, /guarda questo/u);
  assert.doesNotMatch(conBolla.titoloTesto, /RIGA-DEL-FILE|Allegati di questo messaggio/u);
  const senza = descriviCoda({ voci: [{ id: 'b', testo: 'solo testo', immagini: 0 }] });
  assert.match(senza.testo, /solo testo/u);
});
