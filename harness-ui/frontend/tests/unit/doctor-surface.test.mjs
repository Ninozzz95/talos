import assert from 'node:assert/strict';
import test from 'node:test';

import { createDoctorSurface } from '../../src/app/surfaces/doctor.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const ETICHETTE = {
  regionLabel: 'Doctor',
  notChecked: 'Questo controllo non è stato eseguito.',
  missingRemedy: 'Questo problema non ha ancora un rimedio scritto: segnalalo.',
  severities: { ok: 'a posto', info: 'nota', warning: 'da guardare', danger: 'guasto' },
  order: ['chiaveApi', 'shell', 'git', 'naviga', 'sessioniPersistenza'],
  checks: {
    chiaveApi: { title: 'Chiave del fornitore', ok: 'Configurata.', fail: 'Nessuna chiave configurata.', failSeverity: 'danger', remedy: 'Aprire le impostazioni' },
    shell: { title: 'Shell', ok: 'Comandi eseguiti con enforcement {v}.' },
    git: { title: 'Git', ok: 'Disponibile.', fail: 'Non trovato nel PATH.', failSeverity: 'warning', remedy: 'Installare Git' },
    naviga: { title: 'Navigazione web', ok: 'Attiva.', fail: 'Non disponibile.', failSeverity: 'warning' },
    sessioniPersistenza: { title: 'Persistenza delle sessioni', ok: 'Nessun problema.', failSeverity: 'danger', remedy: 'Aprire la cartella dello store' },
  },
};

const monta = (extra = {}, onRemedy) => createDoctorSurface({
  documentObj: fakeDocument(), labels: { ...ETICHETTE, ...extra }, testId: 'doctor', onRemedy,
});
const carta = (el, chiave) => el.querySelector(`[data-controllo="${chiave}"]`);
const badgeDi = (c) => trova(c, (e) => String(e.className).includes('talos-badge'));

/* --- La regola: un controllo assente NON è verde --- */

test('DOC-01 ⭐⭐⭐ senza diagnosi NESSUN controllo è verde: sono tutti «non verificato»', () => {
  const d = monta();
  for (const chiave of ETICHETTE.order) {
    const c = carta(d.element, chiave);
    assert.equal(c.dataset.verificato, 'no', `${chiave} non è stato verificato`);
    assert.doesNotMatch(c.className, /--ok\b/, `${chiave} NON deve essere verde: nessuno l'ha guardato`);
    assert.match(testoDi(c), /non è stato eseguito/);
  }
});

test('DOC-02 ⭐⭐⭐ un controllo ASSENTE dalla risposta resta «non verificato» anche se gli altri ci sono', () => {
  const d = monta();
  // Il server manda solo i quattro fissi: `sessioniPersistenza` non c'è.
  d.update({ diagnosi: { chiaveApi: true, shell: 'desktop', git: true, naviga: true } });
  assert.equal(carta(d.element, 'chiaveApi').dataset.verificato, 'si');
  const assente = carta(d.element, 'sessioniPersistenza');
  assert.equal(assente.dataset.verificato, 'no');
  assert.doesNotMatch(assente.className, /--ok\b/);
  assert.equal(testoDi(badgeDi(assente)), 'nota', 'una nota, non un «a posto»');
});

test('DOC-03 un controllo passato è verde e lo dice a parole, non solo col colore', () => {
  const d = monta();
  d.update({ diagnosi: { chiaveApi: true, shell: 'desktop', git: true, naviga: true } });
  const c = carta(d.element, 'git');
  assert.match(c.className, /--ok\b/);
  assert.equal(testoDi(badgeDi(c)), 'a posto');
  assert.match(testoDi(c), /Disponibile/);
});

test('DOC-04 ⭐ un controllo fallito porta la sua severità dichiarata, non una a caso', () => {
  const d = monta();
  d.update({ diagnosi: { chiaveApi: false, shell: 'desktop', git: false, naviga: true } });
  assert.match(carta(d.element, 'chiaveApi').className, /--danger\b/);
  assert.match(carta(d.element, 'git').className, /--warning\b/);
  assert.equal(testoDi(badgeDi(carta(d.element, 'chiaveApi'))), 'guasto');
});

/* --- Il rimedio --- */

test('DOC-05 ⭐⭐ un guasto SENZA rimedio dichiarato resta un guasto: non si declassa a nota', () => {
  const d = monta();
  // `naviga` fallisce e le sue etichette non hanno `remedy`.
  d.update({ diagnosi: { chiaveApi: true, shell: 'desktop', git: true, naviga: false } });
  const c = carta(d.element, 'naviga');
  // ⛔ Abbassare la severità per far contento il componente nasconderebbe
  // esattamente il guasto che il Doctor esiste per mostrare.
  assert.match(c.className, /--warning\b/);
  assert.match(testoDi(c), /non ha ancora un rimedio scritto/);
});

test('DOC-06 il rimedio è un pulsante vero e dice QUALE controllo riguarda', () => {
  const premuti = [];
  const d = monta({}, (chiave) => premuti.push(chiave));
  d.update({ diagnosi: { chiaveApi: false, shell: 'desktop', git: true, naviga: true } });
  const bottone = d.element.querySelector('[data-testid="doctor-chiaveApi-rimedio"]');
  assert.equal(bottone.tagName, 'BUTTON');
  bottone.lancia('click', { target: bottone });
  assert.deepEqual(premuti, ['chiaveApi']);
});

test('DOC-07 un controllo a posto non mostra un pulsante di rimedio', () => {
  const d = monta();
  d.update({ diagnosi: { chiaveApi: true, shell: 'desktop', git: true, naviga: true } });
  // `git` ha un `remedy` nelle etichette, ma è a posto: non c'è niente da fare.
  const azioni = trova(carta(d.element, 'git'), (e) => e.className === 'talos-check-card__actions');
  assert.equal(azioni.hidden, true);
});

/* --- Le sezioni ricche --- */

test('DOC-08 ⭐ il dettaglio del server si MOSTRA, non si riassume', () => {
  const d = monta();
  d.update({
    diagnosi: {
      chiaveApi: true, shell: 'desktop', git: true, naviga: true,
      sessioniPersistenza: { problema: false, dettaglio: '69 sessioni sul disco, 0 scartate.' },
    },
  });
  // ⛔ Riscriverlo qui perderebbe il soggetto: il numero è la cosa utile.
  assert.match(testoDi(carta(d.element, 'sessioniPersistenza')), /69 sessioni sul disco, 0 scartate/);
});

test('DOC-09 ⭐ una sezione che dichiara un problema diventa un guasto, non una nota', () => {
  const d = monta();
  d.update({
    diagnosi: {
      chiaveApi: true, shell: 'desktop', git: true, naviga: true,
      sessioniPersistenza: { problema: true, dettaglio: '1 file di sessione illeggibile.' },
    },
  });
  const c = carta(d.element, 'sessioniPersistenza');
  assert.match(c.className, /--danger\b/);
  assert.match(testoDi(c), /1 file di sessione illeggibile/);
});

test('DOC-10 la shell dichiara il suo enforcement invece di un giudizio', () => {
  const d = monta();
  d.update({ diagnosi: { chiaveApi: true, shell: 'desktop', git: true, naviga: true } });
  assert.match(testoDi(carta(d.element, 'shell')), /enforcement desktop/);
});

test('DOC-11 AL CONTRARIO dopo destroy un aggiornamento non ridisegna più', () => {
  const d = monta();
  d.update({ diagnosi: { chiaveApi: true, shell: 'desktop', git: true, naviga: true } });
  assert.equal(d.destroy(), true);
  assert.equal(d.destroy(), false);
  assert.equal(d.element.querySelector('[data-controllo="git"]'), null, 'le carte sono smontate');
});

test('DOC-12 AL CONTRARIO senza documento o etichette non si monta', () => {
  assert.throws(() => createDoctorSurface({ labels: ETICHETTE }), /dipendenze doctor mancanti/);
  assert.throws(() => createDoctorSurface({ documentObj: fakeDocument(), labels: { checks: {} } }), /richiede le sue etichette/);
});
