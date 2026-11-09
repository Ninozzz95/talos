/*
 * Decisione 215 dell'owner (04/11/2026), parte 2 — un file che il server rifiuta si annuncia con una frase di TALOS, mai con l'errore
 * del browser («Il sito non era disponibile») né con l'inglese della busta («Il file non si è aperto: File not found»); e un allegato
 * mandato con «Accoda» a giro acceso si apre come un allegato, non come un file della cartella.
 *
 *   RF-01 (g) ogni codice ha la sua frase in italiano e in inglese; un codice ignoto ha la generica; un allegato ha la sua generica
 *   RF-02 (d) «Scarica» rifiutato: avviso con la frase di TALOS, nessun link, il corpo grande non si legge mai
 *   RF-03 (d) «Scarica» accettato: il link parte, la richiesta di controllo si interrompe senza leggere i byte
 *   RF-04 (d) rete giù: avviso generico, nessun link
 *   RF-10 con un codice vince la frase di TALOS; senza codice resta la frase del server (la Libreria la usa da sempre)
 *   RF-05 (e) il riferimento `attachments/<id>/<nome>` è un allegato (anche in una chat ad «Accesso pieno»), mai un file della cartella
 *   RF-06 (f) «Accoda» manda la bolla con gli allegati (la funzione vera di app.js, eseguita con dei finti)
 *   RF-07 (e) il clic sul chip di un allegato non usa più un nome che non esiste (ReferenceError del 04/11)
 *   RF-08 il lettore mostra la frase di TALOS da sola; la fonte di un allegato ha la generica dell'allegato
 *   RF-09 le due porte di «Scarica» (menu del file e scheda in chat) passano dal controllo
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { impostaLingua } from '../../src/components/lingua.js';
import { chiaveDelRifiuto, fraseDelRifiuto, erroreDalRifiuto, scaricaControllando, FRASE_GENERICA } from '../../src/components/rifiuti-dei-file.js';
import { chipAllegato, chipDegliAllegati } from '../../src/components/allegati.js';
import { fonteDaAllegato, fonteDaCartella } from '../../src/components/lettore/fonti.js';

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const LETTORE = readFileSync(new URL('../../src/components/lettore/lettore.js', import.meta.url), 'utf8');

const ATTESE = [
  [{ code: 'FILE_NOT_FOUND' }, 'Questo file non c’è più: forse è stato spostato o cancellato.', 'This file is no longer there: it may have been moved or deleted.'],
  [{ code: 'QUERY_INVALID', reason: 'path-outside-session' }, 'Questo file sta fuori dalla cartella della chat e questa chat non l’ha creato né scritto, quindi TALOS non lo apre.', 'This file is outside the chat folder and this chat did not create or write it, so TALOS won’t open it.'],
  [{ code: 'QUERY_INVALID', reason: 'path-invalid' }, 'Questo file sta fuori dalla cartella della chat e questa chat non l’ha creato né scritto, quindi TALOS non lo apre.', 'This file is outside the chat folder and this chat did not create or write it, so TALOS won’t open it.'],
  [{ code: 'QUERY_INVALID' }, 'TALOS non riconosce il percorso di questo file.', 'TALOS does not recognise the path of this file.'],
  [{ code: 'NOT_A_FILE' }, 'Questa è una cartella, non un file.', 'This is a folder, not a file.'],
  [{ code: 'FILE_TOO_LARGE' }, 'Questo file è troppo grande per aprirlo qui.', 'This file is too large to open here.'],
  [{ code: 'PREVIEW_FILE_SECRET' }, 'Questo file può contenere chiavi o password, quindi TALOS non lo mostra in anteprima.', 'This file may hold keys or passwords, so TALOS does not show it in a preview.'],
  [{ code: 'ATTACHMENT_NOT_AVAILABLE', reason: 'attachment-unknown' }, 'Questo file allegato non è più disponibile. Allegalo di nuovo.', 'This attached file is no longer available. Attach it again.'],
  [{ code: 'ATTACHMENT_NOT_AVAILABLE', reason: 'attachment-of-another-chat' }, 'Questo file allegato è di un’altra chat. Allegalo di nuovo.', 'This attached file belongs to another chat. Attach it again.'],
  [{ code: 'NOT_FOUND' }, 'Questa chat non c’è più su questo computer.', 'This chat is no longer on this computer.'],
  [{ code: 'LIBRARY_NOT_FOUND' }, 'Questa voce della Libreria non c’è più.', 'This Library item is no longer there.'],
  [{ code: 'SESSION_NOT_READY' }, 'La cartella di questa chat non è ancora pronta. Riprova fra poco.', 'This chat’s folder is not ready yet. Try again in a moment.'],
  [{ code: 'PLATFORM_UNSUPPORTED' }, 'Questo computer non permette di aprire questo file da qui.', 'This computer does not allow opening this file from here.'],
  [{ code: 'CODICE_MAI_VISTO' }, 'TALOS non è riuscito ad aprire questo file. Riprova fra poco.', 'TALOS could not open this file. Try again in a moment.'],
  [{}, 'TALOS non è riuscito ad aprire questo file. Riprova fra poco.', 'TALOS could not open this file. Try again in a moment.'],
];

function risposta({ status, corpo }) {
  const letto = { json: 0, arrayBuffer: 0, annullato: 0 };
  return {
    letto,
    r: {
      ok: status >= 200 && status < 300,
      status,
      body: { cancel: async () => { letto.annullato += 1; } },
      json: async () => { letto.json += 1; if (typeof corpo === 'string') throw new SyntaxError('non json'); return corpo; },
      arrayBuffer: async () => { letto.arrayBuffer += 1; return new ArrayBuffer(50 * 1024 * 1024); },
    },
  };
}

function documentoFinto() {
  const link = [];
  return {
    link,
    body: { append: (el) => { el.attaccato = true; } },
    createElement: (tag) => {
      const el = { tag, href: '', download: '', cliccato: 0, rimosso: 0, click() { this.cliccato += 1; }, remove() { this.rimosso += 1; } };
      link.push(el);
      return el;
    },
  };
}

test('RF-01 (g) ogni codice del server ha la sua frase di TALOS, in italiano e in inglese; il resto la generica', () => {
  try {
    for (const [rifiuto, it, en] of ATTESE) {
      impostaLingua('it');
      assert.equal(fraseDelRifiuto(rifiuto), it, `it ${JSON.stringify(rifiuto)}`);
      impostaLingua('en');
      assert.equal(fraseDelRifiuto(rifiuto), en, `en ${JSON.stringify(rifiuto)}`);
    }
    assert.equal(chiaveDelRifiuto({ code: 'QUERY_INVALID', reason: 'motivo-ignoto' }), 'varie.fileRefusal.badPath', 'un motivo ignoto ripiega sul codice');
    assert.equal(chiaveDelRifiuto({ code: 'NIENTE' }), FRASE_GENERICA);
    impostaLingua('en');
    assert.equal(fraseDelRifiuto({ code: 'NIENTE' }, 'errori.ATTACHMENT_NOT_AVAILABLE.attachment_unknown'), 'This attached file is no longer available. Attach it again.', 'la generica di un allegato');
  } finally { impostaLingua('it'); }
});

test('RF-02 (d) «Scarica» rifiutato: un avviso di TALOS, nessun link, il corpo non si scarica in memoria', async () => {
  impostaLingua('it');
  const { r, letto } = risposta({ status: 400, corpo: { error: { code: 'QUERY_INVALID', message: 'Path is outside the session folder', reason: 'path-outside-session' } } });
  const avvisi = [];
  const documento = documentoFinto();
  const esito = await scaricaControllando({ indirizzo: '/api/v1/sessions/s1/file?percorso=C%3A%2Fx.txt', nome: 'x.txt', avvisa: (...a) => avvisi.push(a), documento, fetchFn: async () => r });
  assert.equal(esito, false);
  assert.deepEqual(avvisi, [['Download non partito', 'Questo file sta fuori dalla cartella della chat e questa chat non l’ha creato né scritto, quindi TALOS non lo apre.']]);
  assert.equal(documento.link.length, 0, 'nessun <a download>: il browser non mostra il suo «Il sito non era disponibile»');
  assert.equal(letto.arrayBuffer, 0);
  assert.doesNotMatch(avvisi[0][1], /outside the session|QUERY_INVALID/u, 'mai le parole del server');
});

test('RF-03 (d) «Scarica» accettato: parte il link del browser, la richiesta di controllo si ferma alle intestazioni', async () => {
  const { r, letto } = risposta({ status: 200, corpo: null });
  let segnale = null;
  const documento = documentoFinto();
  const avvisi = [];
  const esito = await scaricaControllando({
    indirizzo: '/api/v1/sessions/s1/file?percorso=a.md', nome: 'a.md', avvisa: (...a) => avvisi.push(a), documento,
    fetchFn: async (_indirizzo, opzioni) => { segnale = opzioni.signal; return r; },
  });
  assert.equal(esito, true);
  assert.equal(avvisi.length, 0);
  assert.equal(segnale?.aborted, true, 'la richiesta di controllo si interrompe');
  assert.equal(letto.arrayBuffer, 0, 'i byte non passano per la pagina');
  assert.equal(letto.json, 0);
  assert.equal(documento.link.length, 1);
  assert.deepEqual([documento.link[0].href, documento.link[0].download, documento.link[0].cliccato, documento.link[0].rimosso], ['/api/v1/sessions/s1/file?percorso=a.md', 'a.md', 1, 1]);
});

test('RF-04 (d) rete giù: avviso generico, nessun link', async () => {
  impostaLingua('it');
  const documento = documentoFinto();
  const avvisi = [];
  const esito = await scaricaControllando({ indirizzo: '/x', nome: 'x', avvisa: (...a) => avvisi.push(a), documento, fetchFn: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(esito, false);
  assert.deepEqual(avvisi, [['Download non partito', 'TALOS non è riuscito ad aprire questo file. Riprova fra poco.']]);
  assert.equal(documento.link.length, 0);
});

test('RF-05 (e) il riferimento di un allegato (`attachments/<id>/<nome>`) apre l\'allegato, anche ad «Accesso pieno»', () => {
  const id = '0123456789abcdef01234567';
  const rifatto = { tipo: 'file', nome: 'note.txt', percorso: `attachments/${id}/note.txt` };
  for (const [radice, base] of [['', ''], ['C:/', ''], ['C:/Users/owner', 'C:/Users/owner'], ['/', '/']]) {
    const chip = chipAllegato(rifatto, '', { radice, base });
    assert.equal(chip.allegatoId, id, `radice ${radice}`);
    assert.equal(chip.apribile, '', `radice ${radice}: mai il lettore della cartella`);
  }
  assert.equal(chipDegliAllegati([rifatto], '', { radice: 'C:/' })[0].allegatoId, id);
  // un percorso che somiglia ma non è un riferimento resta quello di prima
  assert.equal(chipAllegato({ tipo: 'file', nome: 'x', percorso: 'attachments/xyz/x' }).allegatoId, undefined);
  assert.equal(chipAllegato({ tipo: 'file', nome: 'x', percorso: `attachments/${id}/x`, daBrowser: true }).allegatoId, undefined, 'un file del browser non ha allegato sul server');
});

function estraiFunzione(sorgente, nome) {
  const inizio = sorgente.indexOf(`  function ${nome}(`);
  assert.ok(inizio >= 0, `${nome} in app.js`);
  const fine = sorgente.indexOf('\n  }\n', inizio);
  return sorgente.slice(inizio, fine + 4);
}

test('RF-06 (f) «Accoda» a giro acceso manda la bolla con l\'allegato, come l\'invio normale', () => {
  const codice = estraiFunzione(APP, 'accodaDalComposer');
  const accodati = [];
  const allegatiComposer = [{ tipo: 'file', nome: 'note.txt', allegatoId: '0123456789abcdef01234567', percorso: 'attachments/0123456789abcdef01234567/note.txt' }];
  const finti = {
    attendiUploadAllegati: () => false,
    ricordaTestoInviato: () => {},
    testoConAllegati: (t) => `${t}\n\n[allegato: attachments/0123456789abcdef01234567/note.txt]`,
    bollaDaInviare: (testo, completo, allegati) => ({ testo, allegati: allegati.map((a) => ({ nome: a.nome, allegatoId: a.allegatoId })) }),
    svuotaComposerDopoScelta: () => {},
    svuotaAllegati: () => { allegatiComposer.length = 0; },
    salvaBozze: () => {},
    accodaMessaggioReale: (...a) => accodati.push(a),
  };
  const nomi = Object.keys(finti);
  // eslint-disable-next-line no-new-func
  const crea = new Function('allegatiComposer', ...nomi, `${codice}\nreturn accodaDalComposer;`);
  const accoda = crea(allegatiComposer, ...nomi.map((n) => finti[n]));
  accoda('leggi il file');
  assert.equal(accodati.length, 1);
  const [, , bolla] = accodati[0];
  assert.deepEqual(bolla?.allegati, [{ nome: 'note.txt', allegatoId: '0123456789abcdef01234567' }], 'la bolla porta l\'allegato: il server lo lega alla chat');
});

test('RF-07 (e) il clic sul chip di un allegato usa un nome che esiste', () => {
  const codice = estraiFunzione(APP, 'disegnaChipAllegati');
  assert.doesNotMatch(codice, /apriAllegatoDellaChat\(c\.allegatoId, allegato\?\.nome/u, '`allegato` non esiste in questa funzione: ReferenceError al clic');
  assert.match(codice, /apriAllegatoDellaChat\(c\.allegatoId, daMostrare\[indice\]\?\.nome \|\| c\.nome\)/u);
});

test('RF-08 il lettore mostra la frase di TALOS da sola, e la fonte di un allegato ha la sua generica', async () => {
  impostaLingua('it');
  const errore = await erroreDalRifiuto(risposta({ status: 404, corpo: { error: { code: 'FILE_NOT_FOUND', message: 'File not found' } } }).r);
  assert.equal(errore.message, 'Questo file non c’è più: forse è stato spostato o cancellato.');
  assert.equal(errore.frase, true);
  assert.match(LETTORE, /stato\.erroreFrase \? stato\.errore : traduci\('varie\.reader\.error\.notOpened'/u, 'senza «Il file non si è aperto:» davanti');
  assert.match(LETTORE, /stato\.erroreFrase = errore\?\.frase === true/u);
  const allegato = fonteDaAllegato({ sessionId: 's1', allegatoId: 'a'.repeat(24), nome: 'x', fetchFn: async () => risposta({ status: 500, corpo: 'non json' }).r });
  await assert.rejects(allegato.leggiByte(), (e) => e.message === 'Questo file allegato non è più disponibile. Allegalo di nuovo.' && e.status === 500);
  const cartella = fonteDaCartella({ sessionId: 's1', percorso: 'a.md', fetchFn: async () => risposta({ status: 500, corpo: 'non json' }).r });
  await assert.rejects(cartella.leggiByte(), (e) => e.message === 'TALOS non è riuscito ad aprire questo file. Riprova fra poco.');
});

test('RF-09 le due porte di «Scarica» passano dal controllo', () => {
  const scarica = estraiFunzione(APP, 'scaricaFileDellaCartella');
  assert.match(scarica, /scaricaControllando\(/u, 'il menu del file');
  const scheda = estraiFunzione(APP, 'schedaFileDellaChat');
  assert.match(scheda, /talos-file-scaricabile__scarica[\s\S]*preventDefault\(\)[\s\S]*scaricaFileDellaCartella\(percorso, nome\)/u, 'la scheda del file in chat');
});

test('RF-10 con un codice vince la frase di TALOS (mai l’inglese della busta); senza codice resta la frase del server (Libreria)', async () => {
  const conCodice = await erroreDalRifiuto({ status: 404, json: async () => ({ error: { code: 'FILE_NOT_FOUND', message: 'File not found' } }) });
  assert.equal(conCodice.message, 'Questo file non c’è più: forse è stato spostato o cancellato.');
  const senzaCodice = await erroreDalRifiuto({ status: 404, json: async () => ({ error: { message: 'Questa voce non esiste più' } }) });
  assert.equal(senzaCodice.message, 'Questa voce non esiste più');
  assert.equal(senzaCodice.frase, true);
  const vuoto = await erroreDalRifiuto({ status: 500, json: async () => { throw new Error('non è JSON'); } });
  assert.equal(vuoto.message, 'TALOS non è riuscito ad aprire questo file. Riprova fra poco.');
});
