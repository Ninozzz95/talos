import test from 'node:test';
import assert from 'node:assert/strict';
import { statoOfferta, statoTroppoGrande, testiCartaInvioFile, vociInvio, vociSceltaDispositivo, datiDallEsitoInvio, datiDalTroppoGrande, chiaveDelRifiutoInvio } from '../../src/components/invio-file-chat.js';
import { fraseSpecie, nomeLeggibileAttrezzo } from '../../src/components/nomi-attrezzi.js';
import { impostaLingua } from '../../src/components/lingua.js';

/*
 * R5.13 corsa 2 (24/10/2026) — le parti pure di «manda un file a un dispositivo» nella finestra: le parole dello stato (bozzetti 4a/4b),
 * della carta (2b/3a), del menu (1a/2a) e la lettura dell'esito dell'attrezzo. Le parole sono quelle della tabella del rapporto dei
 * bozzetti, inglese e italiano. Le parti del DOM stanno nelle prove del browser (`remoto-invio-file.spec.mjs`).
 */
const PAD = { id: 'padnino0001aaaa', nome: 'Pad di Nino', inLinea: true };
const TAB = { id: 'galaxytab3ccc33', nome: 'Galaxy Tab', inLinea: false, ultimaVoltaAlle: Date.UTC(2026, 9, 23, 18, 0) };

test('INV-UI-01 lo stato dell\'offerta, en e it: inviato neutro, in scaricamento live con %, scaricato verde con l\'ora, non in linea giallo, cambiato rosso con «Invia di nuovo»', () => {
  impostaLingua('en');
  assert.deepEqual(statoOfferta({ stato: 'inviato' }, PAD), { tono: '', testo: 'Sent to Pad di Nino · not downloaded yet', rimanda: false });
  assert.deepEqual(statoOfferta({ stato: 'in-scaricamento', percentuale: 62 }, { nome: 'Pixel 9', inLinea: true }), { tono: 'live', testo: 'Downloading on Pixel 9 · 62%', rimanda: false });
  const scaricato = statoOfferta({ stato: 'scaricato', scaricatoAlle: new Date(2026, 9, 24, 20, 31).getTime() }, PAD, { lingua: 'en' });
  assert.deepEqual(scaricato, { tono: 'success', testo: 'Downloaded on Pad di Nino · 20:31', rimanda: false });
  assert.deepEqual(statoOfferta({ stato: 'inviato' }, TAB), { tono: 'warning', testo: 'Galaxy Tab is offline: it gets the file when it connects again', rimanda: false });
  assert.deepEqual(statoOfferta({ stato: 'cambiato' }, PAD), { tono: 'danger', testo: 'Pad di Nino could not download it: the file changed after it was sent', rimanda: true });
  assert.deepEqual(statoTroppoGrande('31.2 MB'), { tono: 'danger', testo: 'Not sent: 31.2 MB, and a device takes files up to 25 MB', rimanda: false });
  /* D6 al contrario: «Invia di nuovo» SOLO dopo il file cambiato */
  for (const stato of ['inviato', 'in-scaricamento', 'scaricato']) assert.equal(statoOfferta({ stato }, PAD).rimanda, false, stato);
  /* un dispositivo già scaricato non torna «non in linea» */
  assert.equal(statoOfferta({ stato: 'scaricato', scaricatoAlle: 0 }, TAB).tono, 'success');
  impostaLingua('it');
  assert.equal(statoOfferta({ stato: 'inviato' }, PAD).testo, 'Inviato a Pad di Nino · non ancora scaricato');
  assert.equal(statoOfferta({ stato: 'in-scaricamento', percentuale: 62 }, PAD).testo, 'In scaricamento su Pad di Nino · 62%');
  assert.equal(statoOfferta({ stato: 'cambiato' }, PAD).testo, 'Pad di Nino non è riuscito a scaricarlo: il file è cambiato dopo l’invio');
  assert.equal(statoOfferta({ stato: 'inviato' }, TAB).testo, 'Galaxy Tab non è in linea: riceve il file quando si collega di nuovo');
});

test('INV-UI-02 la carta: badge, file, perché e nota; con più dispositivi «uno dei tuoi N» e come cambiarlo (D3)', () => {
  impostaLingua('en');
  const uno = testiCartaInvioFile({ file: { nome: 'report-q3.pdf' }, telefono: { nome: 'Pad di Nino' }, dispositivi: 1 });
  assert.deepEqual(uno, { badge: 'Send a file to a device', bersaglio: 'report-q3.pdf', perche: 'TALOS wants to send this file to Pad di Nino. It appears in this conversation on the device, ready to download.', motivo: '', nota: 'Only this file, only to this device. Nothing opens by itself.' });
  const molti = testiCartaInvioFile({ file: { nome: 'report-q3.pdf' }, telefono: { nome: 'Pixel 9' }, dispositivi: 3 });
  assert.equal(molti.perche, 'TALOS wants to send this file to Pixel 9, one of your 3 paired devices. It appears in this conversation on the device, ready to download.');
  assert.equal(molti.nota, 'To send it to another device, choose Don’t send and tell TALOS which one.');
  impostaLingua('it');
  assert.equal(testiCartaInvioFile({ file: { nome: 'a' }, telefono: { nome: 'Pad' }, dispositivi: 1 }).badge, 'Invia un file a un dispositivo');
});

test('INV-UI-03 il menu: nessun dispositivo ⇒ nessuna voce (D4); uno ⇒ «Send to <nome>»; più ⇒ «Send to device…» e la scelta col pallino', () => {
  impostaLingua('en');
  const fatti = [];
  assert.deepEqual(vociInvio([], { onInvia: () => {}, onScegli: () => {} }), []);
  assert.deepEqual(vociInvio([{ ...PAD, revocatoAlle: 1 }], { onInvia: () => {}, onScegli: () => {} }), [], 'un revocato non conta');
  const [uno] = vociInvio([PAD], { onInvia: (v) => fatti.push(v.id), onScegli: () => fatti.push('scegli') });
  assert.equal(uno[0], 'Send to Pad di Nino');
  assert.deepEqual(uno[4], { icona: 'i-phone' });
  uno[1]();
  const [molti] = vociInvio([PAD, TAB], { onInvia: () => fatti.push('no'), onScegli: () => fatti.push('scegli') });
  assert.equal(molti[0], 'Send to device…');
  molti[1]();
  assert.deepEqual(fatti, [PAD.id, 'scegli']);
  const scelta = vociSceltaDispositivo([PAD, TAB], { nomeFile: 'report-q3.pdf', onInvia: (v) => fatti.push(v.id), lingua: 'en', adesso: Date.UTC(2026, 9, 24, 18, 0) });
  assert.equal(scelta.titolo, 'Send report-q3.pdf to');
  assert.deepEqual(scelta.voci.map((v) => [v[0], v[3], v[4].tono]), [['Pad di Nino', 'online', 'success'], ['Galaxy Tab', 'offline · gets it when it connects · seen yesterday', 'warning']]);
  impostaLingua('it');
  assert.equal(vociInvio([PAD], { onInvia: () => {}, onScegli: () => {} })[0][0], 'Invia a Pad di Nino');
  assert.equal(vociInvio([PAD, TAB], { onInvia: () => {}, onScegli: () => {} })[0][0], 'Invia a un dispositivo…');
});

test('INV-UI-04 l\'esito dell\'attrezzo si legge (nome, dispositivo, offerta), anche in Accesso pieno; il troppo grande coi byte; il resto no', () => {
  assert.deepEqual(datiDallEsitoInvio('Sent "report-q3.pdf" (2.4 MB) to "Pad di Nino" (id padnino0): it appears in this conversation on the device, ready to download (offer AbC_12-x).'),
    { nome: 'report-q3.pdf', dispositivo: 'Pad di Nino', offertaId: 'AbC_12-x', relativo: null });
  assert.deepEqual(datiDallEsitoInvio('Sent "a \\"b\\".md" (1 byte) to "Tab" (id t): it is offline now and gets the file in this conversation when it connects again (offer o1). Full access: done without asking the person.'),
    { nome: 'a "b".md', dispositivo: 'Tab', offertaId: 'o1', relativo: null });
  for (const testo of ['REFUSED. There are 3 paired devices', 'Disconnected "Pad"', '', null]) assert.equal(datiDallEsitoInvio(testo), null, String(testo));
  assert.deepEqual(datiDalTroppoGrande('REFUSED. FILE_TOO_LARGE: "demo-video.mp4" is 31.2 MB (32715571 bytes) and a device takes files up to 25 MB. Nothing was sent.'), { nome: 'demo-video.mp4', byte: 32715571, relativo: null });
  assert.equal(datiDalTroppoGrande('REFUSED. That file is not in this conversation\'s folder.'), null);
});

test('INV-UI-05 il nome umano dell\'attrezzo e il gruppo al plurale (punto 9 del rapporto dei bozzetti), mai la sigla', () => {
  impostaLingua('en');
  assert.equal(nomeLeggibileAttrezzo('remote_device_send_file'), 'Sending a file to a device');
  assert.equal(fraseSpecie('altro:remote_device_send_file', 1), 'Sending a file to a device');
  assert.equal(fraseSpecie('altro:remote_device_send_file', 3), 'Sending files to devices ×3');
  assert.equal(fraseSpecie('altro:remote_phone_revoke', 2), `${nomeLeggibileAttrezzo('remote_phone_revoke')} ×2`, 'gli altri attrezzi restano come prima');
  impostaLingua('it');
  assert.equal(fraseSpecie('altro:remote_device_send_file', 3), 'Invio di file ai dispositivi ×3');
  assert.equal(nomeLeggibileAttrezzo('remote_device_send_file'), 'Invio di un file a un dispositivo');
});

test('REV6-F3 l\'esito porta il percorso DENTRO la cartella (`path "…"`), anche nel troppo grande; gli esiti di prima restano leggibili', () => {
  assert.deepEqual(datiDallEsitoInvio('Sent "q3.md" (1 byte) to "Pad" (id p): it appears in this conversation on the device, ready to download (offer o2, path "notes/q3.md").'),
    { nome: 'q3.md', dispositivo: 'Pad', offertaId: 'o2', relativo: 'notes/q3.md' });
  assert.deepEqual(datiDallEsitoInvio('Sent "q3.md" (1 byte) to "Pad" (id p): it is offline now and gets the file in this conversation when it connects again (offer o3, path "a \\"x\\"/q3.md"). Full access: done without asking the person.'),
    { nome: 'q3.md', dispositivo: 'Pad', offertaId: 'o3', relativo: 'a "x"/q3.md' });
  assert.deepEqual(datiDalTroppoGrande('FILE_TOO_LARGE: "v.mp4" is 31.2 MB (32715571 bytes) at "media/v.mp4" and a device takes files up to 25 MB. Nothing was sent.'),
    { nome: 'v.mp4', byte: 32715571, relativo: 'media/v.mp4' });
});

test('REV6-F6 (owner 25/10) ogni rifiuto noto dell\'attrezzo ha la SUA frase, il resto la frase generica; tutte in inglese e in italiano', async () => {
  const casi = [
    ['Sending files to devices is not available on this computer.', 'unavailable'],
    ['This conversation has no folder to send from. Nothing was sent.', 'noFolder'],
    ['No device is paired with this computer: the person pairs one first (remote_phone_pair). Nothing was sent.', 'noDevice'],
    ['There are 2 paired devices: say which one in "device" — … Nothing was sent.', 'whichDevice'],
    ['No paired device has the id "zz": call remote_phones first. Nothing was sent.', 'whichDevice'],
    ['"device" must be the short id from remote_phones. Nothing was sent.', 'whichDevice'],
    ['"path" must be the path of a file in this conversation\'s folder. Nothing was sent.', 'missing'],
    ['REFUSED. That file is not in this conversation\'s folder. Nothing was sent.', 'outside'],
    ['"docs" is a folder, not a file. Nothing was sent.', 'folder'],
    ['There is no file at "x.md" in this conversation\'s folder. Nothing was sent.', 'missing'],
    ['FILE_TOO_LARGE: "v.mp4" grew over 25 MB after the card was shown. Nothing was sent.', 'grew'],
    ['"q3.md" changed after the card was shown: call remote_device_send_file again to send the new version. Nothing was sent.', 'changed'],
    ['The file or the device is not the one shown on the card: call remote_device_send_file again. Nothing was sent.', 'changed'],
    ['No card was shown to the person for this call: call remote_device_send_file again. Nothing was sent.', 'cardLost'],
    /* A9-3 (blocco 9): una chiamata senza id è un guasto della chiamata, non «chiedi di nuovo» */
    ['This call has no id, so it cannot be tied to the person\'s card. Nothing was sent.', 'generic'],
    /* B-6 (blocco 7): il nome del file non decide la frase */
    ['There is no file at "not in this conversation\'s folder.md" in this conversation\'s folder. Nothing was sent.', 'missing'],
    ['something nobody planned', 'generic'],
  ];
  for (const [testo, chiave] of casi) assert.equal(chiaveDelRifiutoInvio(testo), chiave, testo);
  for (const lingua of ['en', 'it']) {
    impostaLingua(lingua);
    const { t } = await import('../../src/components/lingua.js');
    for (const chiave of new Set(casi.map(([, k]) => k))) {
      const frase = t(`remoto.sendFile.error.${chiave}`);
      assert.ok(frase && !frase.startsWith('remoto.'), `${lingua}: manca remoto.sendFile.error.${chiave}`);
      assert.doesNotMatch(frase, /REFUSED|remote_device_send_file|_/u, `${lingua}: parole tecniche in ${chiave}`);
      /* B8-6 (A9-2, blocco 9): ogni rifiuto noto dice anche che non è partito niente, come gli altri — `cardLost` compreso */
      if (chiave !== 'generic') assert.match(frase, lingua === 'en' ? /Nothing was sent/u : /Non è partito niente/u, `${lingua}: ${chiave}`);
    }
  }
  impostaLingua('en');
});

test('B-5 (revisione a blocco 7) un nome di file con «(offer X).» dentro non sposta l\'id dell\'offerta', () => {
  const testo = 'Sent "nota (offer ZZZZ). Nothing was sent..txt" (3 bytes) to "Pad" (id p): it appears in this conversation on the device, ready to download (offer vero1, path "nota (offer ZZZZ). Nothing was sent..txt").';
  assert.deepEqual(datiDallEsitoInvio(testo), { nome: 'nota (offer ZZZZ). Nothing was sent..txt', dispositivo: 'Pad', offertaId: 'vero1', relativo: 'nota (offer ZZZZ). Nothing was sent..txt' });
});
