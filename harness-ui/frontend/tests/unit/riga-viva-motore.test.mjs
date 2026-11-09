/*
 * FE-050, the live row of the local engine. Conditions of Performance and Desktop: never two reads in flight, it ends on every way out,
 * no read for a cloud model or with no turn waiting, no redraw if nothing changed. Owner: Stop cancels a first load, while a growing
 * window or a wake-up finishes opening.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaLetturaCaricamento, creaRigaVivaMotore, testoDellaRiga } from '../../src/components/riga-viva-motore.js';
import { aggiornaRigaRipiegoLocale, aggiornaRigaSchedaLenta, testiSchedaLenta } from '../../src/components/context-separator.js';
import { nomeModelloUmano, registraModelliLocali } from '../../src/components/chat-foot.js';

const INIZIO = '2026-11-01T10:00:00.000Z';
const risposta = (caricamento, secondi = 12) => ({ caricamento, observedAt: new Date(Date.parse(INIZIO) + secondi * 1000).toISOString() });
const apertura = (campi = {}) => ({ modelId: 'x', nome: 'Gemma 4', fase: 'text_model', percentuale: 40, iniziatoIl: INIZIO, motivo: 'apertura', altroMotore: false, ...campi });
const giro = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => setImmediate(r)); };

/** The little DOM the row needs: the project has no jsdom in the unit tests. */
class Nodo {
  constructor(tag) { this.tag = tag; this.figli = []; this.padre = null; this.dataset = {}; this.attributi = {}; this.className = ''; this.ascoltatori = {}; this._testo = ''; }
  append(...figli) { for (const f of figli) { f.remove(); f.padre = this; this.figli.push(f); } }
  after(nodo) { const i = this.padre.figli.indexOf(this); nodo.remove(); nodo.padre = this.padre; this.padre.figli.splice(i + 1, 0, nodo); }
  get nextElementSibling() { const f = this.padre?.figli ?? []; return f[f.indexOf(this) + 1] ?? null; }
  remove() { if (this.padre) this.padre.figli = this.padre.figli.filter((f) => f !== this); this.padre = null; }
  setAttribute(k, v) { this.attributi[k] = String(v); }
  removeAttribute(k) { delete this.attributi[k]; if (k === 'value') delete this.value; }
  hasAttribute(k) { return k in this.attributi || (k === 'value' && this.value !== undefined); }
  addEventListener(tipo, fn) { this.ascoltatori[tipo] = fn; }
  click() { this.ascoltatori.click?.(); }
  get textContent() { return this._testo; }
  set textContent(v) { this._testo = String(v); }
  corrisponde(s) {
    if (s === 'progress') return this.tag === 'progress';
    if (s.startsWith('.')) return this.className.split(/\s+/u).includes(s.slice(1));
    const coppia = /^\[data-([a-z-]+)(?:="([^"]+)")?\]$/u.exec(s);
    const chiave = coppia?.[1].replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
    return Boolean(coppia) && chiave in this.dataset && (coppia[2] === undefined || this.dataset[chiave] === coppia[2]);
  }
  querySelector(s) { for (const f of this.figli) { if (f.corrisponde(s)) return f; const dentro = f.querySelector(s); if (dentro) return dentro; } return null; }
}
const documentoFinto = () => ({ hidden: false, createElement: (tag) => new Nodo(tag), addEventListener() {}, removeEventListener() {} });

/** A clock by hand: reads leave only when the test moves it, and an answer arrives only when the test gives it. */
function banco() {
  const pianificati = [];
  const letture = [];
  const contenitore = new Nodo('div');
  const pianifica = (fn) => { pianificati.push(fn); return pianificati.length; };
  const annulla = (id) => { pianificati[id - 1] = null; };
  const leggi = () => new Promise((risolvi, rifiuta) => letture.push({ risolvi, rifiuta }));
  const fermate = [];
  let modelloChat = null;
  const riga = creaRigaVivaMotore({ leggi, modelloDellaChat: () => modelloChat, documento: documentoFinto(), inserisci: (r) => contenitore.append(r), onFerma: () => fermate.push(1),
    adesso: () => 1000, pianifica, annulla, ritmoSecondi: () => 1, fermaSecondi: () => {} });
  const avanza = async () => { const fn = pianificati.findLast((f) => f); pianificati.length = 0; fn?.(); await giro(); };
  return { riga, letture, contenitore, fermate, avanza, inAttesa: () => pianificati.filter(Boolean).length, chat: (m) => { modelloChat = m; } };
}

test('a cloud model never reads, and neither does a turn that is not waiting', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'glm-cloud' });
  await giro();
  assert.equal(b.letture.length, 0);
  b.riga.attesaFinita();
  b.chat('glm-cloud');
  b.riga.chatCambiata();
  await b.avanza();
  assert.equal(b.letture.length, 0);
  assert.equal(b.riga.leggendo(), false);
});

test('never two reads in flight: the next one leaves after the answer, and only then', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  b.riga.giroAvviato({ modello: 'local:x' }); // the wait row is shown again by the same turn
  await giro();
  assert.equal(b.letture.length, 1);
  assert.equal(b.inAttesa(), 0, 'no timer while the read is out');
  b.letture[0].risolvi(risposta(null));
  await giro();
  assert.equal(b.inAttesa(), 1, 'one timer after the answer');
  await b.avanza();
  assert.equal(b.letture.length, 2);
});

test('no redraw when nothing changed', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.letture[0].risolvi(risposta(apertura()));
  await giro();
  const riga = b.contenitore.querySelector('[data-riga-motore]');
  const stato = riga.querySelector('[data-context-chat-status]');
  stato.textContent = 'untouched';
  await b.avanza();
  b.letture[1].risolvi(risposta(apertura(), 13));
  await giro();
  assert.equal(stato.textContent, 'untouched');
});

test('the row says what the engine says: sentence, percent, a bar that climbs, seconds from the server clock', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.letture[0].risolvi(risposta(apertura({ percentuale: null, fase: 'starting' }), 3));
  await giro();
  const riga = b.contenitore.querySelector('[data-riga-motore]');
  assert.equal(riga.querySelector('progress').hasAttribute('value'), false, 'no percent, no value: the bar runs');
  assert.equal(riga.querySelector('[data-riga-viva-tempo]').textContent, '3s');
  await b.avanza();
  b.letture[1].risolvi(risposta(apertura({ percentuale: 62 }), 4));
  await giro();
  assert.equal(riga.querySelector('[data-context-chat-eta]').textContent, '62%');
  assert.equal(riga.querySelector('progress').value, 62);
});

test('a chat in line behind another opening has its own row: the sentence of the wait, the seconds, the Stop, no number', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:c' });
  await giro();
  b.letture[0].risolvi(risposta(apertura({ modelId: 'b', nome: 'Beta', fase: 'waiting', percentuale: null, motivo: 'cambio', inCoda: ['c'] }), 7));
  await giro();
  const riga = b.contenitore.querySelector('[data-riga-motore]');
  assert.ok(riga, 'its own row');
  assert.equal(riga.querySelector('[data-context-chat-status]').textContent, testoDellaRiga({ fase: 'waiting' }));
  assert.equal(riga.querySelector('[data-riga-viva-tempo]').textContent, '7s');
  assert.equal(riga.querySelector('progress').hasAttribute('value'), false);
  assert.equal(riga.querySelector('[data-context-chat-eta]').textContent, '');
});

test('a row for another model is not this chat, without the line', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:c' });
  await giro();
  b.letture[0].risolvi(risposta(apertura({ modelId: 'b', inCoda: ['d'] }), 7));
  await giro();
  assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null);
});

test('the first word ends the row and the reads', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.letture[0].risolvi(risposta(apertura()));
  await giro();
  b.riga.attesaFinita();
  assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null);
  assert.equal(b.riga.leggendo(), false);
  await b.avanza();
  assert.equal(b.letture.length, 1, 'zero reads after');
});

test('a turn in error before the first word: zero reads after it', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.riga.attesaFinita(); // the error closes the wait while the read is out
  b.letture[0].risolvi(risposta(apertura()));
  await giro();
  assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null, 'a late answer draws nothing');
  assert.equal(b.inAttesa(), 0);
  assert.equal(b.letture.length, 1);
});

test('a read that fails ends the watch and the row', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.letture[0].risolvi(risposta(apertura()));
  await giro();
  await b.avanza();
  b.letture[1].rifiuta(new Error('offline'));
  await giro();
  assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null);
  assert.equal(b.riga.leggendo(), false);
  assert.equal(b.inAttesa(), 0);
});

for (const motivo of ['allargamento', 'risveglio']) {
  test(`Stop during «${motivo}»: the row stays with no Stop, says it is finishing, and goes when the engine is ready`, async () => {
    const b = banco();
    b.riga.giroAvviato({ modello: 'local:x' });
    await giro();
    b.letture[0].risolvi(risposta(apertura({ motivo })));
    await giro();
    b.riga.fermata();
    b.riga.attesaFinita(); // the end of the stopped turn must not take it away
    const riga = b.contenitore.querySelector('[data-riga-motore]');
    assert.ok(riga, 'the row stays');
    assert.equal(riga.querySelector('[data-riga-viva="ferma"]'), null);
    assert.match(riga.querySelector('[data-context-chat-status]').textContent, /Gemma 4/u);
    assert.equal(b.riga.leggendo(), true);
    await b.avanza();
    b.letture[1].risolvi(risposta(null));
    await giro();
    assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null);
    assert.equal(b.riga.leggendo(), false, 'it stops at null');
  });
}

for (const motivo of ['apertura', 'cambio']) {
  test(`Stop during «${motivo}»: the row goes at once`, async () => {
    const b = banco();
    b.riga.giroAvviato({ modello: 'local:x' });
    await giro();
    b.letture[0].risolvi(risposta(apertura({ motivo })));
    await giro();
    b.riga.fermata();
    assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null);
    assert.equal(b.riga.leggendo(), false);
  });
}

test('the Stop on the row is the composer\'s Stop', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.letture[0].risolvi(risposta(apertura()));
  await giro();
  b.contenitore.querySelector('[data-riga-viva="ferma"]').click();
  assert.equal(b.fermate.length, 1);
});

test('a change of chat removes the row; a local chat looks once, a cloud one never', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.letture[0].risolvi(risposta(apertura()));
  await giro();
  b.chat('glm-cloud');
  b.riga.chatCambiata();
  assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null);
  await b.avanza();
  assert.equal(b.letture.length, 1);
  b.chat('local:x');
  b.riga.chatCambiata();
  await b.avanza();
  assert.equal(b.letture.length, 2);
  b.letture[1].risolvi(risposta(null));
  await giro();
  assert.equal(b.riga.leggendo(), false, 'nothing is opening: one look and no more');
  assert.equal(b.inAttesa(), 0);
});

test('with the page hidden nothing leaves, and the reads resume when it is seen again', async () => {
  let nascosta = true;
  const letture = [];
  const lettura = creaLetturaCaricamento({ leggi: async () => { letture.push(1); return risposta(apertura()); }, nascosta: () => nascosta, pianifica: () => 1, annulla: () => {} });
  lettura.avvia();
  await giro();
  assert.equal(letture.length, 0);
  nascosta = false;
  lettura.riprendi();
  await giro();
  assert.equal(letture.length, 1);
});

test('the sentences, as approved', () => {
  const traduci = (chiave, p) => `${chiave.split('.').pop()}${p?.modello ? `:${p.modello}` : ''}`;
  const frase = (c, o) => testoDellaRiga(c, { traduci, ...o });
  assert.equal(frase({ fase: 'freeing', nome: 'X' }), 'freeing');
  assert.equal(frase({ fase: 'waiting', nome: 'X', motivo: 'cambio' }), 'waiting');
  assert.equal(frase({ fase: 'freeing', nome: 'X' }, { finendo: true }), 'finishing:X', 'the model finishing for the next message says that');
  assert.equal(frase(apertura({ percentuale: null, fase: 'starting' })), 'opening:Gemma 4');
  assert.equal(frase(apertura()), 'loading:Gemma 4');
  assert.equal(frase(apertura({ fase: 'mmproj_model' })), 'loadingImages');
  assert.equal(frase(apertura({ motivo: 'allargamento' })), 'reopening:Gemma 4');
  assert.equal(frase(apertura({ motivo: 'risveglio' })), 'waking:Gemma 4');
  assert.equal(frase(apertura({ altroMotore: true })), 'otherEngine');
  assert.equal(frase(apertura({ motivo: 'risveglio' }), { finendo: true }), 'finishing:Gemma 4');
  assert.equal(frase(apertura({ nome: null, percentuale: null })), 'opening:modelGeneric');
});

test('live review of Frontend (01/11): the row says the same name as the model chip', () => {
  const traduci = (chiave, p) => `${chiave.split('.').pop()}${p?.modello ? `:${p.modello}` : ''}`;
  registraModelliLocali([{ id: 'qwen-q4', files: [{ path: 'Qwen3.8-27B-UD-Q4_K_M.gguf' }] }]);
  const caricamento = apertura({ modelId: 'qwen-q4', nome: 'Qwen3.8-27B', percentuale: null, fase: 'starting' });
  assert.equal(testoDellaRiga(caricamento, { traduci }), `opening:${nomeModelloUmano('local:qwen-q4')}`, 'the chip knows the file: its name');
  assert.equal(testoDellaRiga(apertura({ modelId: 'sconosciuto', percentuale: null, fase: 'starting' }), { traduci }), 'opening:Gemma 4', 'not yet known: the server name');
  assert.equal(testoDellaRiga(caricamento, { traduci, nomeDi: () => { throw new Error('rotto'); } }), 'opening:Qwen3.8-27B', 'a broken name never breaks the row');
});

for (const motivo of ['allargamento', 'risveglio']) {
  test(`the first word during «${motivo}»: the row simply leaves, no «finishing» over the answer`, async () => {
    const b = banco();
    b.riga.giroAvviato({ modello: 'local:x' });
    await giro();
    b.letture[0].risolvi(risposta(apertura({ motivo })));
    await giro();
    b.riga.attesaFinita();
    assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null);
    assert.equal(b.riga.leggendo(), false);
  });
}

test('after a reload, with no turn here: the row of this chat, with no Stop, saying it is finishing; never the row of another model', async () => {
  const b = banco();
  b.chat('local:x');
  b.riga.chatCambiata();
  await b.avanza();
  b.letture[0].risolvi(risposta(apertura({ modelId: 'altro' })));
  await giro();
  assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null, 'the state is the engine\'s, not this chat\'s');
  assert.equal(b.riga.leggendo(), false);

  b.riga.chatCambiata();
  await b.avanza();
  b.letture[1].risolvi(risposta(apertura()));
  await giro();
  const riga = b.contenitore.querySelector('[data-riga-motore]');
  assert.ok(riga);
  assert.equal(riga.querySelector('[data-riga-viva="ferma"]'), null, 'nothing to stop here');
  assert.match(riga.querySelector('[data-context-chat-status]').textContent, /Gemma 4.*(next message|prossimo messaggio)/u, 'no turn here: it opens for the next message');
  await b.avanza();
  b.letture[2].risolvi(risposta(null));
  await giro();
  assert.equal(b.contenitore.querySelector('[data-riga-motore]'), null);
  assert.equal(b.riga.leggendo(), false);
});

test('never two reads, also when the page is seen again or the chat changes with a read out', async () => {
  let aperte = 0;
  let massimo = 0;
  const risolvi = [];
  let pianificate = 0;
  const lettura = creaLetturaCaricamento({ leggi: () => new Promise((r) => { aperte += 1; massimo = Math.max(massimo, aperte); risolvi.push(() => { aperte -= 1; r(risposta(null)); }); }), pianifica: () => { pianificate += 1; return pianificate; }, annulla: () => {} });
  lettura.avvia();
  await giro();
  lettura.riprendi();
  await giro();
  assert.equal(risolvi.length, 1, 'seen again with a read out: no second read');
  risolvi.shift()();
  await giro();
  assert.equal(risolvi.length, 0, 'and none right after that answer: the next one waits its 500 ms');
  assert.equal(pianificate, 1);
  lettura.ferma();
  lettura.avvia();
  await giro();
  assert.equal(risolvi.length, 1);
  risolvi.shift()();
  await giro();
  lettura.riprendi();
  await giro();
  risolvi.length = 0;
  aperte = 0;
  lettura.ferma();
  lettura.avvia();
  await giro();
  lettura.ferma();
  lettura.avvia();
  await giro();
  assert.equal(risolvi.length, 1, 'watched again with a read out: it waits for that answer');
  risolvi[0]();
  await giro();
  assert.equal(risolvi.length, 2);
  assert.equal(massimo, 1);
});

test('after a Stop the row goes under the note of the stopped turn', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.letture[0].risolvi(risposta(apertura({ motivo: 'risveglio' })));
  await giro();
  b.riga.fermata();
  const riga = b.contenitore.querySelector('[data-riga-motore]');
  const nota = { remove() {}, padre: null };
  b.contenitore.append(Object.assign(new Nodo('div'), nota));
  await b.avanza();
  b.letture[1].risolvi(risposta(apertura({ motivo: 'risveglio', percentuale: 50 })));
  await giro();
  assert.equal(riga.nextElementSibling, null, 'the row is last');
});

test('a new message while a model finishes opening: one row, with its Stop back, and the sentence of the load', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.letture[0].risolvi(risposta(apertura({ motivo: 'risveglio' })));
  await giro();
  b.riga.fermata();
  b.riga.giroAvviato({ modello: 'local:x' });
  const righe = b.contenitore.figli.filter((f) => f.corrisponde('[data-riga-motore]'));
  assert.equal(righe.length, 1);
  assert.ok(righe[0].querySelector('[data-riga-viva="ferma"]'));
  assert.doesNotMatch(righe[0].querySelector('[data-context-chat-status]').textContent, /next message|prossimo messaggio/u);
});

test('a turn with a cloud model opens no row even if a local model is opening for somebody else', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'glm-cloud' });
  await b.avanza();
  assert.equal(b.letture.length, 0);
});

test('a language change redraws the sentence and the Stop', async () => {
  const b = banco();
  b.riga.giroAvviato({ modello: 'local:x' });
  await giro();
  b.letture[0].risolvi(risposta(apertura()));
  await giro();
  const stato = b.contenitore.querySelector('[data-context-chat-status]');
  const ferma = b.contenitore.querySelector('[data-riga-viva="ferma"]');
  stato.textContent = 'old';
  ferma.textContent = 'old';
  b.riga.ridisegnaLingua();
  assert.notEqual(stato.textContent, 'old');
  assert.notEqual(ferma.textContent, 'old');
});

test('the slow card (01/11): the same separator, the Frontend sentence with whole numbers in tokens, details in the title, one per event', () => {
  const doc = documentoFinto();
  const contenitore = Object.assign(new Nodo('div'), { querySelectorAll: () => contenitore.figli });
  const valore = { dalle: '2026-11-02T10:00:00.000Z', migliore: 41.6, adesso: 31.2, unita: 'token/s', modello: 'Qwen3.8', scheda: 'RX 9070 XT', versione: 'b11669' };
  const uno = aggiornaRigaSchedaLenta(contenitore, valore, { sessionId: 's', document: doc });
  assert.equal(aggiornaRigaSchedaLenta(contenitore, valore, { sessionId: 's', document: doc }), uno, 'the replay does not double it');
  assert.equal(contenitore.figli.length, 1);
  const riga = uno.figli[0];
  assert.equal(riga.className, 'talos-context-separator talos-context-separator--window', 'the separator of «Window enlarged»');
  assert.match(riga.figli[0].textContent, /\b31\b.*\b42\b/u, 'whole numbers, now then best');
  assert.equal(/parole|words/iu.test(riga.figli[0].textContent), false, 'tokens, never words (Frontend, Mobile)');
  assert.match(riga.title, /Qwen3\.8.*RX 9070 XT.*b11669.*\b42\b/u);
  assert.deepEqual(testiSchedaLenta(valore), { riga: riga.figli[0].textContent, dettagli: riga.title });
  assert.equal(aggiornaRigaSchedaLenta(contenitore, { dalle: 'x' }, { sessionId: 's', document: doc }), null, 'no numbers, no row');
});

test('«Opened with the other engine» is a separator that stays, one per event, also after a replay', () => {
  const doc = documentoFinto();
  const contenitore = Object.assign(new Nodo('div'), { querySelectorAll: () => contenitore.figli });
  const valore = { modello: 'x', at: '2026-11-01T10:00:00.000Z' };
  const uno = aggiornaRigaRipiegoLocale(contenitore, valore, { sessionId: 's', document: doc });
  const due = aggiornaRigaRipiegoLocale(contenitore, valore, { sessionId: 's', document: doc });
  assert.equal(uno, due, 'the replay of the history does not double it');
  assert.equal(contenitore.figli.length, 1);
  assert.notEqual(uno.figli[0].figli[0].textContent, '');
});
