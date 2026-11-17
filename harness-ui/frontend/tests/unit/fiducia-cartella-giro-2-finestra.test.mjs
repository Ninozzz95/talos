/*
 * Fiducia della cartella, giro 2 — i reperti del controllore unico (Desktop 14:05, rapporto RAPPORTO-CONTROLLORE-FALLA-FIDUCIA-CARTELLA):
 *   · VIVA-01 (a): due finestre sulla stessa conversazione; la risposta in una (o dal menu) chiude la carta nelle altre, senza pulsanti: un
 *     clic tardivo su «No» non rovescia il «Sì»;
 *   · UNA-02 (C3): due fotografie di fila non fanno due carte;
 *   · RIGIOCO-03 (C4): niente carta durante il rigioco della storia, nemmeno se il rigioco comincia mentre si legge la fiducia;
 *   · RIGA-04 (C7): lo stato dalla riga dell'elenco porta il segnale «da chiedere»;
 *   · FILO-05 (C8, C9): la fascia chiede la carta, e il «Sì» rimette la pillola;
 *   · DOPPIA-06 (c): con la carta aperta la riga fissa non fa la stessa domanda.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { creaDomandaFiducia, fiduciaDa, testiRigaFiducia } from '../../src/components/fiducia-cartella.js';

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const pausa = () => new Promise((r) => { setTimeout(r, 0); });
const DA_CHIEDERE = { sessionId: 's1', fiduciaDaChiedere: true, pienoTrattenuto: true };

/** Un server finto condiviso dalle finestre: la fiducia della cartella di `s1`, e le risposte salvate. */
function server() {
  const s = { fidata: null, salvate: [], opzioni: [] };
  s.leggi = async () => ({ cartella: 'C:\\progetti\\progetto', fidata: s.fidata });
  s.salva = async (_id, si, opzioni) => {
    s.opzioni.push(opzioni);
    if (opzioni?.soloSeMaiChiesta && s.fidata !== null) return { fidata: s.fidata };
    s.salvate.push(si); s.fidata = si; return { fidata: si };
  };
  return s;
}
function finestra(srv, extra = {}) {
  const doc = documento();
  const carte = [];
  const risposte = [];
  const domanda = creaDomandaFiducia({ document: doc, leggi: srv.leggi, salva: srv.salva, metti: (scheda) => { doc.body.append(scheda); carte.push(scheda); },
    dopoLaRisposta: (sessionId, si) => risposte.push([sessionId, si]), ...extra });
  return { domanda, carte, risposte };
}

test('VIVA-01 (a): risposto in una finestra, la carta dell\'altra si chiude senza pulsanti; un clic tardivo non cambia la decisione', async () => {
  impostaLingua('it');
  const srv = server();
  const a = finestra(srv);
  const b = finestra(srv);
  await Promise.all([a.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE }), b.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE }), pausa()]);
  assert.equal(a.carte.length, 1);
  assert.equal(b.carte.length, 1);
  assert.match(a.carte[0].textContent, /restano accesi/u, 'D6: a conversazione aperta le frasi di una chat già aperta, non quelle della nascita');
  const attesaA = a.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE }); // già aperta: niente
  clic(a.carte[0].querySelector('[data-fiducia-si]'));
  await pausa(); await attesaA;
  assert.deepEqual(a.risposte, [['s1', true]], 'C9: il «Sì» arriva a chi rimette la pillola');
  /* l'altra finestra riceve la fotografia nuova */
  b.domanda.aggiorna({ sessionId: 's1', fiduciaDaChiedere: false, cartellaNonFidata: false, pienoTrattenuto: false });
  assert.equal(b.carte[0].querySelector('[data-fiducia-no]'), null, 'nessun pulsante resta acceso');
  assert.ok(b.carte[0].querySelector('.talos-approval__esito'), 'la carta dice com\'è finita');
  assert.deepEqual(srv.salvate, [true], 'un solo salvataggio: niente «No» tardivo');
  assert.equal(b.domanda.apertaPer('s1'), false);
  assert.deepEqual(srv.opzioni, [{ soloSeMaiChiesta: true }], 'la carta chiede al server di non rovesciare una risposta già data');
});

test('VIVA-01 (a) la corsa: «No» nell\'altra finestra prima che arrivi la fotografia: la carta dice il «Sì» già dato e la pillola sale', async () => {
  impostaLingua('it');
  const srv = server();
  const a = finestra(srv);
  const b = finestra(srv);
  await Promise.all([a.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE }), b.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE }), pausa()]);
  clic(a.carte[0].querySelector('[data-fiducia-si]'));
  await pausa();
  clic(b.carte[0].querySelector('[data-fiducia-no]'));
  await pausa(); await pausa();
  assert.deepEqual(srv.salvate, [true]);
  assert.deepEqual(b.risposte, [['s1', true]], 'la finestra tardiva segue la decisione vera');
  assert.match(b.carte[0].querySelector('.talos-approval__esito')?.className ?? '', /--si/u);
});

test('VIVA-01 (a) dal menu: «Fidati di questa cartella» chiude la carta della stessa finestra', async () => {
  const srv = server();
  const a = finestra(srv);
  await a.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE });
  assert.equal(a.domanda.apertaPer('s1'), true);
  a.domanda.aggiorna({ sessionId: 's1', fiduciaDaChiedere: false, cartellaNonFidata: false });
  assert.equal(a.carte[0].querySelector('[data-fiducia-si]'), null);
  assert.equal(a.domanda.apertaPer('s1'), false);
  a.domanda.aggiorna({ sessionId: 's2', fiduciaDaChiedere: false }); // un'altra conversazione non tocca niente
});

test('UNA-02 (C3): due fotografie di fila, una carta sola', async () => {
  const srv = server();
  const a = finestra(srv);
  await Promise.all([a.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE }), a.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE })]);
  assert.equal(a.carte.length, 1);
  assert.equal(await a.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE }), false, 'con la carta già sullo schermo, una fotografia dopo non ne fa un\'altra');
  assert.equal(a.carte.length, 1);
});

test('RIGIOCO-03 (C4): niente carta durante il rigioco, nemmeno se comincia mentre si legge la fiducia', async () => {
  const srv = server();
  let lette = 0;
  const a = finestra({ ...srv, leggi: async (id) => { lette += 1; return srv.leggi(id); } });
  assert.equal(await a.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE, inRigiocata: () => true }), false);
  assert.equal(a.carte.length, 0);
  assert.equal(lette, 0, 'durante il rigioco non si chiede nemmeno al server');
  let rigioco = false;
  let letture = 0;
  const lenta = finestra({ ...srv, leggi: async () => { letture += 1; if (letture === 1) rigioco = true; return srv.leggi(); } });
  await lenta.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE, inRigiocata: () => rigioco });
  assert.equal(lenta.carte.length, 0);
  rigioco = false;
  await lenta.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE, inRigiocata: () => rigioco });
  assert.equal(lenta.carte.length, 1, 'finito il rigioco, la carta arriva');
});

test('RIGA-04 (C7): lo stato letto dalla riga dell\'elenco tiene il segnale «da chiedere»', () => {
  assert.deepEqual(fiduciaDa('s1', { fiduciaDaChiedere: true, pienoTrattenuto: true }), { sessionId: 's1', cartellaNonFidata: false, pienoTrattenuto: true, fiduciaDaChiedere: true });
  assert.deepEqual(fiduciaDa('s1', null), { sessionId: 's1', cartellaNonFidata: false, pienoTrattenuto: false, fiduciaDaChiedere: false });
  assert.match(APP, /state\.fiduciaDellaSessione = fiduciaDa\(sessionId, sessione\)/u, 'l\'istantanea passa da qui');
  assert.match(APP, /const ora = fiduciaDa\(rigaAperta\.sessionId, rigaAperta\)/u, 'la riga dell\'elenco passa da qui');
});

test('FILO-05 (C8, C9): la fascia chiede la carta; il «Sì» rimette la pillola in Accesso pieno', () => {
  assert.match(APP, /function disegnaFasciaFiducia\(\) \{\r?\n\s+void chiediFiduciaDellaConversazione\(\);/u);
  assert.match(APP, /domandaFiducia\(\)\.aggiorna\(fiducia\);/u, '(a): ogni fotografia nuova passa dalla carta aperta');
  assert.match(APP, /testiRigaFiducia\(fiducia, \{ cartaAperta \}\)/u, '(c): la riga sa della carta');
  assert.match(APP, /salva: \(sessionId, si, opzioni\) => apiPost\('\/api\/v1\/folder-trust', \{ sessionId, fidata: si, \.\.\.opzioni \}\)/u, '(a): la carta manda la bandiera al server');
  const dopo = /dopoLaRisposta: \(sessionId, si\) => \{[\s\S]{0,600}?\n\s{4}\}/u.exec(APP)?.[0] ?? '';
  assert.match(dopo, /if \(si && state\.realSession\.id === sessionId\) \{ state\.permissions = 'Full access'; aggiornaPillolaPermessi\(\); \}/u);
});

test('DOPPIA-06 (c): con la carta aperta la riga fissa non ripete la domanda; il «No» la riga lo dice sempre', () => {
  impostaLingua('it');
  assert.equal(testiRigaFiducia({ fiduciaDaChiedere: true, pienoTrattenuto: true }, { cartaAperta: true }), null);
  assert.ok(testiRigaFiducia({ fiduciaDaChiedere: true, pienoTrattenuto: true }, { cartaAperta: false }));
  assert.ok(testiRigaFiducia({ cartellaNonFidata: true, pienoTrattenuto: true }, { cartaAperta: true }));
});
