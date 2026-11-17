/*
 * ⛔ Decisione 374, giro 2, punto 9 (revisore C, C3; giudice 08/11 11:42): l'avviso dei file del computer use rimessi lo deve VEDERE la
 *   persona, nella chat del comando. La grammatica è quella della riga del controllo delle scritture spento (avviso-controllo-spento.js),
 *   sorella della finestra allargata: una riga, «Details» con le parole semplici, i nomi dei file solo sotto «Technical details».
 *   Una riga per avviso (`idAvviso`): un evento ripetuto o la rigiocata della storia la aggiornano, mai la raddoppiano.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leggiAvvisoFileComputerUse, testiAvvisoFileComputerUse, aggiornaRigaAvvisoFileComputerUse, EVENTO_FILE_COMPUTER_USE } from '../../src/components/avviso-file-computer-use.js';
import { trascriviEventoInterno } from '../../src/components/trascrizione-eventi-interni.js';
import { impostaLingua } from '../../src/components/lingua.js';

const QUI = dirname(fileURLToPath(import.meta.url));
const TESTO = 'TALOS put back the computer use settings (.computer-use-impostazione.json) after a command changed them outside Full access. The changed version is kept next to it (C:\\x\\.computer-use-impostazione.json.changed-1): if you changed it yourself, it is there.';
const evento = (valore = {}) => ({ type: 'CUSTOM', name: EVENTO_FILE_COMPUTER_USE, value: { idAvviso: 'a1', file: ['.computer-use-impostazione.json'], copie: ['C:\\x\\.computer-use-impostazione.json.changed-1'], nonRimessi: [], testo: TESTO, altreChiavi: [], at: '2026-11-08T10:00:00.000Z', ...valore } });

test('FCU-UI-01 lettura: solo l evento giusto, con un id; casi scelti dai campi, mai dal testo inglese', () => {
  assert.equal(EVENTO_FILE_COMPUTER_USE, 'talos.file-computer-use-ripristinati');
  const v = leggiAvvisoFileComputerUse(evento());
  assert.deepEqual({ ...v, testo: undefined }, { idAvviso: 'a1', rimessi: true, copie: true, nonRimessi: false, allAvvio: false, chiusi: false, copieTolte: false, testo: undefined });
  assert.equal(leggiAvvisoFileComputerUse(evento({ idAvviso: '' })), null);
  assert.equal(leggiAvvisoFileComputerUse({ type: 'CUSTOM', name: 'talos.controllo-spento', value: {} }), null);
  assert.equal(leggiAvvisoFileComputerUse({ type: 'CUSTOM', name: EVENTO_FILE_COMPUTER_USE, value: null }), null);
  const tutti = leggiAvvisoFileComputerUse(evento({ file: [], copie: [], nonRimessi: ['x'], altreChiavi: [{ chiave: 'server.computerUseFiles.setAsideAtStart' }, { chiave: 'server.computerUseFiles.fingerprintUnreadable' }, { chiave: 'server.computerUseFiles.oldCopiesRemoved' }] }));
  assert.deepEqual([tutti.rimessi, tutti.copie, tutti.nonRimessi, tutti.allAvvio, tutti.chiusi, tutti.copieTolte], [false, false, true, true, true, true]);
});

test('FCU-UI-02 le parole: inglese e italiano, niente nomi di file nella riga né nei dettagli semplici', () => {
  impostaLingua('en');
  const en = testiAvvisoFileComputerUse(leggiAvvisoFileComputerUse(evento()));
  assert.equal(en.riga, 'Computer use settings changed outside TALOS were set aside');
  assert.match(en.dettagli, /^TALOS put back the approved settings\. The changed version is kept next to the file: if you changed it yourself, it's there\.$/u);
  assert.doesNotMatch(`${en.riga} ${en.dettagli}`, /\.json|computer-use-/u, 'niente nomi tecnici a schermo');
  impostaLingua('it');
  const it = testiAvvisoFileComputerUse(leggiAvvisoFileComputerUse(evento()));
  assert.equal(it.riga, 'Impostazioni dell’uso del computer cambiate fuori da TALOS: messe da parte');
  const chiuso = testiAvvisoFileComputerUse(leggiAvvisoFileComputerUse(evento({ file: [], copie: [], altreChiavi: [{ chiave: 'server.computerUseFiles.fingerprintUnreadable' }] })));
  assert.equal(chiuso.riga, 'L’uso del computer resta spento: le impostazioni approvate non si possono verificare');
  impostaLingua('en');
  const soloErrore = testiAvvisoFileComputerUse(leggiAvvisoFileComputerUse(evento({ file: [], copie: [], nonRimessi: ['.computer-use-luoghi.json'] })));
  assert.equal(soloErrore.riga, "A change to the computer use settings couldn't be put back");
  const avvio = testiAvvisoFileComputerUse(leggiAvvisoFileComputerUse(evento({ file: [], copie: [], altreChiavi: [{ chiave: 'server.computerUseFiles.setAsideAtStart' }, { chiave: 'server.computerUseFiles.oldCopiesRemoved' }] })));
  assert.match(avvio.dettagli, /When TALOS started/u);
  assert.match(avvio.dettagli, /last 10/u);
});

function documentoFinto() {
  const crea = (tag) => ({
    tagName: tag.toUpperCase(), className: '', dataset: {}, children: [], attributi: {}, ascoltatori: {}, hidden: false, id: '', _testo: '',
    get textContent() { return this._testo || this.children.map((c) => c.testo ?? c.textContent ?? '').join(''); },
    set textContent(v) { this._testo = String(v); this.children = []; },
    setAttribute(k, v) { this.attributi[k] = String(v); }, getAttribute(k) { return this.attributi[k] ?? null; },
    addEventListener(tipo, f) { (this.ascoltatori[tipo] ??= []).push(f); }, click() { for (const f of this.ascoltatori.click ?? []) f(); },
    append(...figli) { this.children.push(...figli); },
    replaceChildren(...figli) { this._testo = ''; this.children = [...figli]; },
    tutti() { return this.children.filter((c) => c.tagName).flatMap((c) => [c, ...c.tutti()]); },
    querySelectorAll(sel) { return this.tutti().filter((n) => corrisponde(n, sel)); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
  });
  const corrisponde = (n, sel) => {
    if (['button', 'details', 'summary', 'pre', 'span'].includes(sel)) return n.tagName === sel.toUpperCase();
    if (sel === '[data-avviso-file-computer-use]') return n.dataset.avvisoFileComputerUse !== undefined;
    return sel.split('.').filter(Boolean).every((c) => n.className.split(' ').includes(c));
  };
  return { createElement: crea, createTextNode: (testo) => ({ testo }) };
}

test('FCU-UI-03 il DOM: la riga sorella della finestra allargata; una sola per avviso, aggiornata dall evento nuovo e non raddoppiata dalla rigiocata', () => {
  const doc = documentoFinto();
  impostaLingua('en');
  const colonna = doc.createElement('div');
  const gruppo = aggiornaRigaAvvisoFileComputerUse(colonna, leggiAvvisoFileComputerUse(evento()), { sessionId: 's1', document: doc });
  assert.ok(gruppo.className.split(' ').includes('talos-window-note'), 'lo stesso contenitore della riga sorella');
  assert.ok(gruppo.querySelector('.talos-context-separator.talos-context-separator--window'));
  const dettagli = gruppo.querySelector('.talos-window-note__details');
  const button = gruppo.querySelector('button');
  assert.equal(dettagli.hidden, true, 'semplice a primo sguardo');
  assert.equal(button.getAttribute('aria-controls'), dettagli.id);
  button.click();
  assert.equal(dettagli.hidden, false);
  assert.equal(dettagli.querySelector('summary').textContent, 'Technical details');
  assert.equal(dettagli.querySelector('pre').textContent, TESTO, 'i nomi dei file solo qui, come le parole del server');
  aggiornaRigaAvvisoFileComputerUse(colonna, leggiAvvisoFileComputerUse(evento()), { sessionId: 's1', document: doc });
  assert.equal(colonna.querySelectorAll('[data-avviso-file-computer-use]').length, 1, 'la rigiocata non la raddoppia');
  const nuovo = aggiornaRigaAvvisoFileComputerUse(colonna, leggiAvvisoFileComputerUse(evento({ file: [], copie: [], nonRimessi: ['x'], testo: 'TALOS could not put back x.' })), { sessionId: 's1', document: doc });
  assert.equal(nuovo, gruppo, 'lo stesso avviso, aggiornato');
  assert.equal(colonna.querySelectorAll('[data-avviso-file-computer-use]').length, 1);
  assert.equal(gruppo.querySelector('span').textContent, "A change to the computer use settings couldn't be put back");
  assert.equal(gruppo.querySelector('pre').textContent, 'TALOS could not put back x.');
  aggiornaRigaAvvisoFileComputerUse(colonna, leggiAvvisoFileComputerUse(evento({ idAvviso: 'a2' })), { sessionId: 's1', document: doc });
  aggiornaRigaAvvisoFileComputerUse(colonna, leggiAvvisoFileComputerUse(evento()), { sessionId: 's2', document: doc });
  assert.equal(colonna.querySelectorAll('[data-avviso-file-computer-use]').length, 3, 'un altro avviso o un altra chat: un altra riga');
});

test('FCU-UI-04 la trascrizione dice la stessa riga; la chat la disegna nella conversazione dell evento', () => {
  impostaLingua('en');
  assert.deepEqual(trascriviEventoInterno(evento(), {}), { testo: 'Computer use settings changed outside TALOS were set aside' });
  const app = readFileSync(join(QUI, '..', '..', 'src', 'legacy', 'app.js'), 'utf8');
  assert.match(app, /const avvisoFileComputerUse = leggiAvvisoFileComputerUse\(evento\);\n\s*if \(avvisoFileComputerUse\) \{\n\s*const colonna = colonnaConversazione\(ROOT\(\)\);\n\s*if \(colonna && state\.realSession\.id\) aggiornaRigaAvvisoFileComputerUse\(colonna, avvisoFileComputerUse, \{ sessionId: state\.realSession\.id, document, inserisci: inserisciRigaCompattazione \}\);\n\s*return;/u);
});

/* Giro 3 (decisione 387, B4): le prove che uccidono i mutanti del revisore B rimasti vivi (F01-F06, F08). */

test('FCU-UI-05 (F01) solo l avvio, senza file rimessi dal comando: la riga dice «messe da parte», non «non si è potuta annullare»', () => {
  const soloAvvio = leggiAvvisoFileComputerUse(evento({ file: [], copie: [], altreChiavi: [{ chiave: 'server.computerUseFiles.setAsideAtStart' }] }));
  impostaLingua('en');
  assert.equal(testiAvvisoFileComputerUse(soloAvvio).riga, 'Computer use settings changed outside TALOS were set aside');
  impostaLingua('it');
  assert.equal(testiAvvisoFileComputerUse(soloAvvio).riga, 'Impostazioni dell’uso del computer cambiate fuori da TALOS: messe da parte');
  impostaLingua('en');
});

test('FCU-UI-06 (F03, F04) i dettagli dicono il file non rimesso e il portachiavi chiuso, nell ordine, con le parole intere', () => {
  impostaLingua('en');
  const nonRimesso = testiAvvisoFileComputerUse(leggiAvvisoFileComputerUse(evento({ file: [], copie: [], nonRimessi: ['x'] })));
  assert.equal(nonRimesso.dettagli, "TALOS couldn't put back a changed file: computer use keeps using the approved version.");
  const chiuso = testiAvvisoFileComputerUse(leggiAvvisoFileComputerUse(evento({ file: [], copie: [], altreChiavi: [{ chiave: 'server.computerUseFiles.fingerprintUnreadable' }] })));
  assert.equal(chiuso.dettagli, "TALOS couldn't read or save the approved version in the system keychain, so computer use stays off and the files were left as they are until you turn it on again in Settings.");
  const insieme = testiAvvisoFileComputerUse(leggiAvvisoFileComputerUse(evento({ file: [], copie: [], nonRimessi: ['x'], altreChiavi: [{ chiave: 'server.computerUseFiles.fingerprintUnreadable' }] })));
  assert.equal(insieme.dettagli, `${nonRimesso.dettagli} ${chiuso.dettagli}`, 'prima il file non rimesso, poi il portachiavi');
  impostaLingua('it');
  assert.match(testiAvvisoFileComputerUse(leggiAvvisoFileComputerUse(evento({ file: [], copie: [], altreChiavi: [{ chiave: 'server.computerUseFiles.fingerprintUnreadable' }] }))).dettagli, /leggere o salvare la versione approvata nel portachiavi/u);
  impostaLingua('en');
});

test('FCU-UI-07 (F02, F05, F06, F08) l aggiornamento cambia anche l etichetta; «Details» apre e richiude, il bottone e aria-expanded seguono', () => {
  const doc = documentoFinto();
  impostaLingua('en');
  const colonna = doc.createElement('div');
  const gruppo = aggiornaRigaAvvisoFileComputerUse(colonna, leggiAvvisoFileComputerUse(evento()), { sessionId: 's1', document: doc });
  const row = gruppo.querySelector('.talos-context-separator');
  assert.equal(row.getAttribute('aria-label'), 'Computer use settings changed outside TALOS were set aside');
  aggiornaRigaAvvisoFileComputerUse(colonna, leggiAvvisoFileComputerUse(evento({ file: [], copie: [], nonRimessi: ['x'] })), { sessionId: 's1', document: doc });
  assert.equal(row.getAttribute('aria-label'), "A change to the computer use settings couldn't be put back", 'l etichetta letta dagli screen reader segue la riga');
  const dettagli = gruppo.querySelector('.talos-window-note__details');
  const button = gruppo.querySelector('button');
  assert.deepEqual([dettagli.hidden, button.textContent, button.getAttribute('aria-expanded')], [true, 'Details', 'false']);
  button.click();
  assert.deepEqual([dettagli.hidden, button.textContent, button.getAttribute('aria-expanded')], [false, 'Hide', 'true']);
  button.click();
  assert.deepEqual([dettagli.hidden, button.textContent, button.getAttribute('aria-expanded')], [true, 'Details', 'false'], 'si richiude');
});

/* Giro 5 (decisione 396, C2 del revisore C): «resta spento» solo se il server lo dice (setAsideAtStart); con movedAsideAtStart
   (era cambiato solo l'elenco dei luoghi, o il computer use è già riacceso) i dettagli dicono «messa da parte» e basta. */
test('FCU-UI-08 (C2) all avvio messo da parte ma non spento: niente «stays off» né «resta spento»; con setAsideAtStart sì', () => {
  const spostati = leggiAvvisoFileComputerUse(evento({ file: [], copie: [], altreChiavi: [{ chiave: 'server.computerUseFiles.movedAsideAtStart' }] }));
  assert.equal(spostati.allAvvio, true);
  assert.equal(spostati.restaSpento, false);
  const spento = leggiAvvisoFileComputerUse(evento({ file: [], copie: [], altreChiavi: [{ chiave: 'server.computerUseFiles.setAsideAtStart' }] }));
  assert.equal(spento.restaSpento, true);
  impostaLingua('en');
  assert.equal(testiAvvisoFileComputerUse(spostati).riga, 'Computer use settings changed outside TALOS were set aside');
  assert.equal(testiAvvisoFileComputerUse(spostati).dettagli, "When TALOS started, the settings didn't match the approved version: the changed version is kept next to the file.");
  assert.doesNotMatch(testiAvvisoFileComputerUse(spostati).dettagli, /stays off/u);
  assert.match(testiAvvisoFileComputerUse(spento).dettagli, /computer use stays off until you turn it on again in Settings/u);
  impostaLingua('it');
  assert.equal(testiAvvisoFileComputerUse(spostati).dettagli, 'All’avvio di TALOS le impostazioni non corrispondevano a quelle approvate: la versione cambiata resta accanto al file.');
  assert.match(testiAvvisoFileComputerUse(spento).dettagli, /resta spento/u);
  impostaLingua('en');
});
