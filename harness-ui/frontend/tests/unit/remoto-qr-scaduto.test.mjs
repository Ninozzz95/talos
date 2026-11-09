import assert from 'node:assert/strict';
import test from 'node:test';
import { modaleAperta, chiudiModale } from '../../src/components/modale-td.js';
import { t } from '../../src/components/lingua.js';

const { creaRemotoUi } = await import('../../src/components/remoto.js');

/*
 * 04/11/2026, difetto visto dall'owner sul 4174 alle 19:57: la finestra «Connect your device / The QR code expired: you need a new
 * one.» compare da sola e NON si chiude (X, «Close», fondo: si riapre al secondo dopo).
 *
 * Strumentato qui, prima della cura: quante finestre si aprono, quanti intervalli restano vivi, cosa chiude `chiudiModale`.
 * ⛔ Il `close` del `<dialog>` vero arriva DOPO (WHATWG HTML, «close the dialog»: si mette in coda un compito che lancia `close`):
 *   il documento finto lo mette in una coda che la prova svuota a mano, come farebbe il ciclo degli eventi del browser.
 */

function documentoFinto({ closeSincrono = false } = {}) {
  const doc = { activeElement: null, coda: [] };
  const nodoFinto = (tag) => {
    const nodo = {
      tagName: String(tag).toUpperCase(), figli: [], genitore: null, attributi: new Map(), dataset: {}, className: '',
      textContent: '', open: false, ascoltatori: new Map(), ownerDocument: doc, style: {}, classList: { add() {} },
      append(...nuovi) { for (const n of nuovi) { if (!n || typeof n !== 'object') continue; n.genitore = nodo; nodo.figli.push(n); } },
      remove() { if (nodo.genitore) nodo.genitore.figli = nodo.genitore.figli.filter((f) => f !== nodo); nodo.genitore = null; },
      setAttribute(k, v) { nodo.attributi.set(k, String(v)); },
      getAttribute(k) { return nodo.attributi.get(k) ?? null; },
      addEventListener(tipo, fn) { nodo.ascoltatori.set(tipo, [...(nodo.ascoltatori.get(tipo) || []), fn]); },
      focus() { doc.activeElement = nodo; },
      showModal() { nodo.open = true; },
      /* come il browser: il `close` è un compito in coda, non una chiamata sincrona */
      close() { nodo.open = false; if (closeSincrono) nodo.scatta('close', {}); else doc.coda.push(() => nodo.scatta('close', {})); },
      scatta(tipo, evento) { for (const fn of nodo.ascoltatori.get(tipo) || []) fn({ target: nodo, ...evento }); },
      discendenti() { return nodo.figli.flatMap((f) => [f, ...(f.discendenti?.() ?? [])]); },
      querySelector() { return nodo.discendenti().find((f) => f.tagName === 'BUTTON') || null; },
      querySelectorAll() { return []; },
    };
    return nodo;
  };
  doc.createElement = (tag) => nodoFinto(tag);
  doc.createElementNS = (_ns, tag) => nodoFinto(tag);
  doc.createTextNode = (s) => ({ textContent: s, discendenti: () => [] });
  doc.body = nodoFinto('body');
  doc.svuota = () => { while (doc.coda.length) doc.coda.shift()(); };
  return doc;
}

/** Orologio e intervalli finti: si contano quelli vivi e si avanza a mano. */
function tempoFinto(inizio = 1_000_000) {
  let ora = inizio; let prossimo = 1;
  const vivi = new Map();
  return {
    orologio: () => ora,
    timer: {
      setInterval(fn, ms) { const id = prossimo++; vivi.set(id, { fn, ms }); return id; },
      clearInterval(id) { vivi.delete(id); },
    },
    vivi: () => vivi.size,
    /** avanza di `ms` un secondo alla volta, facendo scattare ogni intervallo vivo */
    async avanza(ms, doc) {
      for (let fatto = 0; fatto < ms; fatto += 1000) {
        ora += 1000;
        for (const [id, { fn }] of [...vivi]) if (vivi.has(id)) await fn();
        doc.svuota();
        await new Promise((r) => setImmediate(r));
      }
    },
  };
}

function apiFinta(tempo, { durata = 300_000, giaScaduta = false } = {}) {
  const chiuse = []; let n = 0;
  return {
    chiuse,
    stato: async () => ({ sceltaFatta: true, attese: [] }),
    apri: async () => { n += 1; return { gettone: `g${n}`, scadeAlle: giaScaduta ? tempo.orologio() - 1 : tempo.orologio() + durata, qr: `talos://pair/g${n}`, moduli: { lato: 1, righe: ['1'] } }; },
    chiudi: async (g) => { chiuse.push(g); },
    imposta: async () => ({}), conferma: async () => ({}), rifiuta: async () => ({}),
  };
}

const titolo = (doc) => doc.body.figli[0]?.discendenti().find((f) => f.tagName === 'H2')?.textContent ?? null;
const bottone = (doc, testo) => doc.body.figli[0]?.discendenti().find((f) => f.tagName === 'BUTTON' && f.textContent === testo);
const aspetta = () => new Promise((r) => setImmediate(r));
const chiudiDalPiede = async (doc) => { bottone(doc, t('chat.common.close')).scatta('click', {}); doc.svuota(); await aspetta(); };

test('QR-DOPPIO-CLIC (owner 04/11 19:57): due «avvia» di fila non lasciano un orologio orfano che riapre «QR scaduto» ogni secondo', async () => {
  const doc = documentoFinto(); const tempo = tempoFinto(); const api = apiFinta(tempo);
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  /* due clic veloci sull'icona del telefono (o icona + «Collega un altro telefono»): partono insieme */
  await Promise.all([ui.avvia(), ui.avvia()]);
  doc.svuota(); await aspetta();
  assert.equal(doc.body.figli.length, 1, 'una sola finestra');
  assert.equal(tempo.vivi(), 2, 'vivi solo il conto e il giro della finestra in vista');
  /* il QR in vista conta davvero (prima: il «close» della prima finestra fermava anche il suo orologio) */
  const scade = () => doc.body.figli[0].discendenti().find((f) => f.dataset && 'remotoScade' in f.dataset)?.textContent;
  const primo = scade(); await tempo.avanza(2000, doc); assert.notEqual(scade(), primo, 'il conto alla rovescia del QR in vista scorre');
  /* passano i 5 minuti: compare «QR scaduto», e la persona lo chiude */
  await tempo.avanza(300_000, doc);
  assert.equal(titolo(doc), t('remoto.pair.title'));
  await chiudiDalPiede(doc);
  assert.equal(modaleAperta(), null, 'chiusa');
  await tempo.avanza(5000, doc);
  assert.equal(doc.body.figli.length, 0, 'e resta chiusa: niente si riapre da solo');
  assert.equal(tempo.vivi(), 0, 'nessun intervallo vivo');
  assert.deepEqual(api.chiuse, ['g1'], 'il QR scavalcato è stato chiuso sul server, quello in vista no (è scaduto da solo)');
});

for (const closeSincrono of [false, true]) test(`QR-GIA-SCADUTO (close ${closeSincrono ? 'sincrono' : 'in coda'}): un'offerta che arriva già scaduta apre «QR scaduto» UNA volta e non lascia intervalli`, async () => {
  const doc = documentoFinto({ closeSincrono }); const tempo = tempoFinto(); const api = apiFinta(tempo, { giaScaduta: true });
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  let aperture = 0;
  const append = doc.body.append; doc.body.append = (...n) => { aperture += n.filter((x) => x?.tagName === 'DIALOG').length; append(...n); };
  await ui.avvia(); doc.svuota(); await aspetta();
  assert.equal(titolo(doc), t('remoto.pair.title'));
  assert.equal(tempo.vivi(), 0, 'nessun orologio parte per un QR già scaduto');
  const dopoLaPrima = aperture;
  await chiudiDalPiede(doc);
  await tempo.avanza(5000, doc);
  assert.equal(aperture, dopoLaPrima, 'nessuna finestra in più dopo «Close»');
  assert.equal(modaleAperta(), null);
});

test('QR-ANNULLA (al contrario): un solo «avvia», «Cancel» chiude, ferma tutto e chiude l\'offerta sul server', async () => {
  const doc = documentoFinto(); const tempo = tempoFinto(); const api = apiFinta(tempo);
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  await ui.avvia(); doc.svuota();
  assert.equal(tempo.vivi(), 2);
  bottone(doc, t('chat.common.cancel')).scatta('click', {}); doc.svuota(); await aspetta();
  assert.equal(tempo.vivi(), 0);
  assert.deepEqual(api.chiuse, ['g1']);
  await tempo.avanza(400_000, doc);
  assert.equal(doc.body.figli.length, 0, 'a QR annullato, «scaduto» non arriva mai');
  chiudiModale();
});

test('QR-SCADE-DA-SOLO (al contrario): un solo «avvia» lasciato aperto diventa «scaduto» una volta, e «Close» lo chiude per sempre', async () => {
  const doc = documentoFinto(); const tempo = tempoFinto(); const api = apiFinta(tempo);
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  await ui.avvia(); doc.svuota();
  await tempo.avanza(301_000, doc);
  assert.equal(titolo(doc), t('remoto.pair.title'));
  assert.ok(bottone(doc, t('remoto.pair.newCode')), 'la finestra «scaduto» ha «New QR code»');
  assert.equal(tempo.vivi(), 0);
  await chiudiDalPiede(doc);
  await tempo.avanza(5000, doc);
  assert.equal(doc.body.figli.length, 0);
  assert.deepEqual(api.chiuse, [], 'un QR scaduto non si richiude sul server');
});

test('QR-ANNULLA-DURANTE-LETTURA: «Cancel» mentre il giro legge lo stato non apre poi «Collegare questo telefono?»', async () => {
  const doc = documentoFinto(); const tempo = tempoFinto(); const api = apiFinta(tempo);
  let rispondi = null; let giri = 0;
  api.stato = () => { giri += 1; if (giri === 1) return Promise.resolve({ sceltaFatta: true, attese: [] }); if (giri === 2) return Promise.resolve({ attese: [] }); return new Promise((r) => { rispondi = r; }); };
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  await ui.avvia(); doc.svuota();
  const giroInVolo = tempo.avanza(1000, doc); // il giro parte e aspetta il server
  await aspetta();
  bottone(doc, t('chat.common.cancel')).scatta('click', {}); doc.svuota();
  rispondi({ attese: [{ id: 'a1', nome: 'Pad', codice: '123456' }] });
  await giroInVolo; doc.svuota(); await aspetta();
  assert.equal(doc.body.figli.length, 0, 'annullato resta annullato');
  assert.equal(tempo.vivi(), 0);
});

/* Le altre intrecciature dei due «avvia»: il server risponde in ordine diverso, o il secondo arriva a finestra già aperta. */
function apiAComando(tempo) {
  const chiuse = []; const apri = []; const stati = []; let n = 0;
  const differita = (lista) => { let ok; let ko; const p = new Promise((r, e) => { ok = r; ko = e; }); lista.push({ ok, ko }); return p; };
  return {
    chiuse, apriInVolo: apri, statiInVolo: stati, trattieniStato: new Set(), chiamateStato: 0,
    stato() { this.chiamateStato += 1; return this.trattieniStato.has(this.chiamateStato) ? differita(stati) : Promise.resolve({ sceltaFatta: true, attese: [] }); },
    apri: () => differita(apri),
    offerta: () => { n += 1; return { gettone: `g${n}`, scadeAlle: tempo.orologio() + 300_000, qr: `talos://pair/g${n}`, moduli: { lato: 1, righe: ['1'] } }; },
    chiudi: async (g) => { chiuse.push(g); },
    imposta: async () => ({}), conferma: async () => ({}), rifiuta: async () => ({}),
  };
}
const contoInVista = (doc) => doc.body.figli[0]?.discendenti().find((f) => f.dataset && 'remotoScade' in f.dataset)?.textContent;
async function vistaViva(doc, tempo, api, { chiuse }) {
  assert.equal(doc.body.figli.length, 1, 'una finestra sola');
  assert.equal(titolo(doc), t('remoto.pair.title'));
  assert.ok(bottone(doc, t('chat.common.cancel')), 'è il QR, non un errore');
  assert.equal(tempo.vivi(), 2, 'solo gli orologi del QR in vista');
  const prima = contoInVista(doc); await tempo.avanza(2000, doc);
  assert.notEqual(contoInVista(doc), prima, 'il QR in vista conta');
  assert.deepEqual(api.chiuse, chiuse);
}

for (const insieme of [false, true]) test(`QR-DOPPIO-ORDINE-INVERSO (${insieme ? 'clic nello stesso istante' : 'secondo clic dopo'}): il server risponde prima al secondo clic; il primo, arrivato dopo, chiude la sua offerta e non scavalca`, async () => {
  const doc = documentoFinto(); const tempo = tempoFinto(); const api = apiAComando(tempo);
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  const a = ui.avvia(); if (!insieme) await aspetta(); const b = ui.avvia(); await aspetta();
  const o1 = api.offerta(); const o2 = api.offerta();
  api.apriInVolo[1].ok(o2); await b; doc.svuota();
  api.apriInVolo[0].ok(o1); await a; doc.svuota(); await aspetta();
  await vistaViva(doc, tempo, api, { chiuse: ['g1'] });
});

test('QR-DOPPIO-DURANTE-LO-STATO: il primo è scavalcato mentre legge lo stato; non apre niente e chiude la sua offerta', async () => {
  const doc = documentoFinto(); const tempo = tempoFinto(); const api = apiAComando(tempo);
  api.trattieniStato.add(2); // la lettura dentro qr() del primo «avvia»
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  const a = ui.avvia(); await aspetta();
  api.apriInVolo[0].ok(api.offerta()); await aspetta(); await aspetta();
  const b = ui.avvia(); await aspetta();
  api.apriInVolo[1].ok(api.offerta()); await b; doc.svuota();
  api.statiInVolo[0].ok({ attese: [] }); await a; doc.svuota(); await aspetta();
  await vistaViva(doc, tempo, api, { chiuse: ['g1'] });
});

test('QR-DOPPIO-ERRORE-TARDIVO: l\'errore del primo, arrivato dopo il secondo QR, non lo copre', async () => {
  const doc = documentoFinto(); const tempo = tempoFinto(); const api = apiAComando(tempo);
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  const a = ui.avvia(); await aspetta(); const b = ui.avvia(); await aspetta();
  api.apriInVolo[1].ok(api.offerta()); await b; doc.svuota();
  api.apriInVolo[0].ko(Object.assign(new Error('rete giù'), { messaggio: 'rete giù' })); await a; doc.svuota(); await aspetta();
  await vistaViva(doc, tempo, api, { chiuse: [] });
});

test('QR-SECONDO-A-FINESTRA-APERTA: un nuovo QR sopra quello aperto; il «close» in coda del vecchio non ferma il nuovo', async () => {
  const doc = documentoFinto(); const tempo = tempoFinto(); const api = apiFinta(tempo);
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  await ui.avvia(); doc.svuota();
  await ui.avvia(); doc.svuota(); await aspetta();
  await vistaViva(doc, tempo, api, { chiuse: ['g1'] });
});

test('QR-FERMA: `ferma()` di chi ospita spegne gli orologi del QR in vista', async () => {
  const doc = documentoFinto(); const tempo = tempoFinto(); const api = apiFinta(tempo);
  const ui = creaRemotoUi({ api, document: doc, orologio: tempo.orologio, timer: tempo.timer });
  await ui.avvia(); doc.svuota();
  assert.equal(tempo.vivi(), 2);
  ui.ferma();
  assert.equal(tempo.vivi(), 0);
  await tempo.avanza(400_000, doc);
  assert.equal(titolo(doc), t('remoto.pair.title'), 'la finestra resta, ma non diventa «scaduto» da sola');
  assert.ok(bottone(doc, t('chat.common.cancel')));
  chiudiModale(); doc.svuota();
});
