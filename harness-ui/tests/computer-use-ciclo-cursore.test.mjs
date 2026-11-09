/*
 * Il cursore che arriva PRIMA del clic (Desktop 05/11/2026 16:44 e 16:47, decisione 252): l'evento `annuncio` porta finestra, punto,
 * t0 e durata; il clic parte a t0+durata; l'attesa conta dentro msPerPasso e lo Stop la annulla. `guarda` dice dove il modello sta
 * guardando quando legge senza agire. La durata è UNA funzione pura (`durataDelVolo`). Nessuna prova tocca lo schermo vero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito, EVENTI, durataDelVolo } from '../src/computer-use/ciclo.mjs';
import { PIENO_PRIMA_159 } from './computer-use-pieno-prima-159.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';

const PIENO = PIENO_PRIMA_159;
const FINESTRA = { x: 100, y: 50, w: 800, h: 600 };
const el = (ref, nome, x, y, w = 20, h = 10) => ({ ref, ruolo: 'pulsante', nome, rettangolo: { x, y, w, h } });
const schermo = (over = {}) => ({ frenoArmato: true, finestra: FINESTRA, dominio: 'negozio.example',
  elementi: [el('b1', 'Avanti', 10, 10), el('b3', 'Indietro', 110, 10), { ref: 'b9', ruolo: 'pulsante', nome: 'Senza posto' }], ...over });

function porte({ risposte = [], guarda = () => schermo(), agisci = () => ({ esito: 'confermata', modo: 'sottofondo' }), ...altro } = {}) {
  let t = 0; let k = 0;
  const eventi = []; const eseguite = []; const fette = [];
  return { eventi, eseguite, fette, porte: {
    guarda: async () => guarda(),
    chiedi: async () => (k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }),
    agisci: async (azione, bersaglio) => { eseguite.push({ azione, bersaglio: bersaglio?.nome ?? null, quando: Date.now() }); eventi.push({ nome: 'AGISCI', dati: {} }); return agisci(azione, bersaglio); },
    bersaglio: (azione, s) => s.elementi.find((e) => e.ref === azione.ref) ?? null,
    chiediPersona: async () => 'si',
    emetti: (nome, dati) => eventi.push({ nome, dati, quando: Date.now() }),
    adesso: () => { t += 10; return t; },
    ...altro } };
}
const conFette = (extra = {}) => ({ attendi: async function (ms) { this.fette?.push?.(ms); }, ...extra });
const annunci = (p) => p.eventi.filter((e) => e.nome === EVENTI.annuncio).map((e) => e.dati);

test('CUR-01: durataDelVolo è pura: 850 senza un punto prima, 250 sul posto, cresce con la distanza fino a 850, 0 col moto ridotto', () => {
  assert.equal(durataDelVolo(null, { x: 10, y: 10 }), 850, 'prima azione: origine ignota');
  assert.equal(durataDelVolo({ x: 10, y: 10 }, { x: 10, y: 10 }), 250);
  assert.equal(durataDelVolo({ x: 0, y: 0 }, { x: 100, y: 0 }), 370, '250 + 12·√100');
  assert.equal(durataDelVolo({ x: 0, y: 0 }, { x: 0, y: 2500 }), 850, 'tetto');
  let prima = 0;
  for (const d of [0, 1, 4, 25, 100, 400, 900, 1600, 2500, 10_000]) {
    const v = durataDelVolo({ x: 0, y: 0 }, { x: d, y: 0 });
    assert.ok(v >= prima && v >= 250 && v <= 850, `monotona e dentro 250-850 a ${d}`); prima = v;
  }
  assert.equal(durataDelVolo({ x: 0, y: 0 }, { x: 900, y: 0 }, { ridotto: true }), 0);
  assert.equal(durataDelVolo(null, null, { ridotto: true }), 0);
  assert.equal(durataDelVolo({ x: Number.NaN, y: 0 }, { x: 1, y: 1 }), 850, 'origine rotta = ignota');
  assert.equal(durataDelVolo({ x: 0, y: 0 }, { x: 'a', y: 1 }), 850);
});

test('CUR-02: i nomi degli eventi nuovi', () => {
  assert.equal(EVENTI.annuncio, 'talos.computer-use-annuncio');
  assert.equal(EVENTI.guarda, 'talos.computer-use-guarda');
  assert.ok(Object.isFrozen(EVENTI));
});

test('CUR-03: l\'annuncio arriva dopo il passo «annuncio» e prima di agire, con finestra, punto, t0, durata, modo; le fette sommano la durata', async () => {
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }, { tipo: 'premi', ref: 'b3' }] }, { fine: { riuscito: true } }] });
  Object.assign(p.porte, conFette()); p.porte.fette = p.fette;
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte });
  assert.equal(r.esito, 'riuscito');
  const a = annunci(p);
  assert.equal(a.length, 2);
  assert.deepEqual(a[0].finestra, FINESTRA);
  assert.deepEqual(a[0].punto, { x: 20, y: 15 });
  assert.equal(a[0].durata, 850, 'la prima azione parte da un punto ignoto');
  assert.deepEqual(a[1].punto, { x: 120, y: 15 });
  assert.equal(a[1].durata, 370, '100 px dal punto prima');
  for (const x of a) { assert.equal(x.modo, 'sottofondo'); assert.ok(Number.isFinite(x.t0)); }
  assert.equal(p.fette.reduce((s, v) => s + v, 0), 850 + 370, 'l\'attesa è la durata annunciata');
  assert.ok(p.fette.every((v) => v > 0 && v <= 50), 'a fette corte: lo Stop si sente entro 50 ms');
  const nomi = p.eventi.map((e) => (e.nome === EVENTI.passo ? `passo-${e.dati.fase}` : e.nome));
  const i = nomi.indexOf(EVENTI.annuncio);
  assert.equal(nomi[i - 1], 'passo-annuncio');
  assert.equal(nomi[i + 1], 'AGISCI');
});

test('CUR-04: tempo vero: il clic parte non prima di t0+durata', async () => {
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true } }] });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte });
  assert.equal(r.esito, 'riuscito');
  const ann = p.eventi.find((e) => e.nome === EVENTI.annuncio);
  assert.ok(p.eseguite[0].quando - ann.quando >= 840, `attesa misurata ${p.eseguite[0].quando - ann.quando} ms`);
});

test('CUR-05: lo Stop durante il volo annulla il clic', async () => {
  let ferma = null;
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }, { tipo: 'premi', ref: 'b3' }] }],
    attendi: async () => { ferma = 'mano-della-persona'; }, fermato: () => ferma });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte });
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'mano-della-persona');
  assert.equal(p.eseguite.length, 0, 'nessun clic dopo lo Stop');
  assert.ok(r.storia.some((riga) => riga.includes('non-eseguita')), r.storia.join('\n'));
  // revisione 05/11 sera, difetto 7 (mutante M12): lo Stop nel volo resta «non partita», mai «rifiutata», e non conta un'azione
  assert.match(r.storia[0], /premi «Avanti» → non-eseguita \(mano-della-persona\)$/u, r.storia.join('\n'));
  assert.equal(r.storia.some((riga) => riga.includes('rifiutata')), false, r.storia.join('\n'));
  const esiti = p.eventi.filter((e) => e.nome === EVENTI.passo && e.dati.fase === 'esito').map((e) => e.dati.esito);
  assert.deepEqual(esiti, ['non-eseguita']);
  const fine = p.eventi.filter((e) => e.nome === EVENTI.fermato).map((e) => e.dati);
  assert.equal(fine.length, 1);
  assert.equal(fine[0].azioni, 0, 'misure: nessuna azione partita');
  assert.equal(fine[0].azioniFallite, 0, 'misure: nessuna azione fallita');
});

test('CUR-05c: il tempo del passo scade durante l\'ULTIMA fetta del volo ⇒ l\'aiutante non viene mai chiamato (mutante M8)', async () => {
  const fette = [];
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }],
    attendi: (ms, segnale) => { fette.push(ms);
      if (fette.length < 17 || segnale?.aborted) return undefined;
      return new Promise((ok) => segnale.addEventListener('abort', ok, { once: true })); } });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte, limiti: { msPerPasso: 100, msAnnullamento: 500 } });
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(fette.length, 17, 'il volo di 850 ms sono 17 fette: il tempo scade nell\'ultima');
  assert.equal(p.eseguite.length, 0, 'nessun clic fantasma dopo un passo chiuso «fermato»');
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'tempo');
});

test('CUR-05d: l\'attesa di serie toglie il suo ascoltatore di abort a ogni fetta finita: al clic il segnale non ne porta (difetto 5)', async () => {
  const vivi = new Map(); // segnale → ascoltatori di abort ancora attaccati, come coppie [funzione, cattura]
  // come il DOM: aggiunta e rimozione si accoppiano sulla stessa funzione E sullo stesso flag di cattura (revisione 05/11, difetto 1)
  const cattura = (o) => (typeof o === 'boolean' ? o : Boolean(o?.capture));
  const trova = (lista, f, o) => lista.findIndex(([g, c]) => g === f && c === cattura(o));
  const P = EventTarget.prototype; const add = P.addEventListener; const rem = P.removeEventListener;
  P.addEventListener = function (tipo, f, o) {
    if (tipo === 'abort') { if (!vivi.has(this)) vivi.set(this, []); const lista = vivi.get(this); if (trova(lista, f, o) < 0) lista.push([f, cattura(o)]); }
    return add.call(this, tipo, f, o);
  };
  P.removeEventListener = function (tipo, f, o) {
    const lista = tipo === 'abort' ? vivi.get(this) : undefined; const i = lista ? trova(lista, f, o) : -1;
    if (i >= 0) lista.splice(i, 1);
    return rem.call(this, tipo, f, o);
  };
  const alClic = [];
  try {
    const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true } }],
      agisci: () => ({ esito: 'confermata' }) });
    const vera = p.porte.agisci;
    p.porte.agisci = (azione, bersaglio, segnale) => { alClic.push(vivi.get(segnale)?.length ?? 0); return vera(azione, bersaglio, segnale); };
    const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte });
    assert.equal(r.esito, 'riuscito');
    assert.equal(annunci(p)[0].durata, 850, '17 fette di serie, senza la porta attendi');
  } finally { P.addEventListener = add; P.removeEventListener = rem; }
  assert.deepEqual(alClic, [0], `ascoltatori di abort rimasti sul segnale del passo al clic: ${alClic}`);
});

test('CUR-05b: lo Stop si sente entro UNA fetta: dopo lo Stop nessuna fetta in più, nessun clic', async () => {
  let ferma = null; const fette = [];
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }],
    attendi: async (ms) => { fette.push(ms); if (fette.length === 2) ferma = 'mano-della-persona'; }, fermato: () => ferma });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte });
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'mano-della-persona');
  assert.equal(fette.length, 2, `fette dopo lo Stop: ${fette.length - 2}`);
  assert.equal(p.eseguite.length, 0);
});

test('CUR-06b: il tetto del passo si sente entro UNA fetta: scaduto il tempo il volo non continua', async () => {
  const fette = [];
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }],
    attendi: (ms, segnale) => { fette.push(ms);
      if (fette.length < 3 || segnale?.aborted) return undefined;
      return new Promise((ok) => segnale.addEventListener('abort', ok, { once: true })); } });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte, limiti: { msPerPasso: 100, msAnnullamento: 500 } });
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'tempo');
  assert.equal(fette.length, 3, `fette dopo il tempo scaduto: ${fette.length - 3}`);
  assert.equal(p.eseguite.length, 0);
});

test('CUR-06: il volo conta dentro msPerPasso: a 100 ms il clic non parte e il compito si ferma per tempo', async () => {
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }] });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte, limiti: { msPerPasso: 100, msAnnullamento: 500 } });
  assert.equal(p.eseguite.length, 0);
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'tempo');
});

test('CUR-07: moto ridotto (vero o funzione vera) ⇒ durata 0 e nessuna attesa; una funzione che lancia vale «no»', async () => {
  for (const motoRidotto of [true, () => true]) {
    const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true } }], motoRidotto });
    Object.assign(p.porte, conFette()); p.porte.fette = p.fette;
    await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
    assert.equal(annunci(p)[0].durata, 0); assert.equal(p.fette.length, 0);
  }
  for (const motoRidotto of [() => { throw new Error('rotta'); }, 'si', 1]) {
    const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true } }], motoRidotto });
    Object.assign(p.porte, conFette()); p.porte.fette = p.fette;
    await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
    assert.equal(annunci(p)[0].durata, 850, String(motoRidotto));
  }
});

test('CUR-08: «guarda» solo quando il modello legge senza agire, e solo con una finestra valida', async () => {
  const leggi = porte({ risposte: [{ azioni: [{ tipo: 'aspetta', secondi: 1 }] }, { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: leggi.porte });
  const g = leggi.eventi.filter((e) => e.nome === EVENTI.guarda);
  assert.equal(g.length, 1); assert.deepEqual(g[0].dati, { finestra: FINESTRA });
  assert.equal(annunci(leggi).length, 0, 'aspettare non muove il cursore');
  const agisce = porte({ risposte: [{ azioni: [{ tipo: 'aspetta', secondi: 1 }, { tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true } }], motoRidotto: true });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: agisce.porte });
  assert.equal(agisce.eventi.filter((e) => e.nome === EVENTI.guarda).length, 0);
  for (const finestra of [undefined, { x: 0, y: 0, w: 0, h: 10 }, { x: 'a', y: 0, w: 5, h: 5 }]) {
    const senza = porte({ risposte: [{ azioni: [{ tipo: 'aspetta', secondi: 1 }] }, { fine: { riuscito: true } }], guarda: () => schermo({ finestra }) });
    await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: senza.porte });
    assert.equal(senza.eventi.filter((e) => e.nome === EVENTI.guarda).length, 0, JSON.stringify(finestra));
  }
});

test('CUR-09: nessun punto (elemento senza rettangolo, azione senza x,y) ⇒ nessun annuncio e nessuna attesa', async () => {
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b9' }] }, { fine: { riuscito: true } }] });
  Object.assign(p.porte, conFette()); p.porte.fette = p.fette;
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
  assert.equal(r.esito, 'riuscito'); assert.equal(p.eseguite.length, 1);
  assert.equal(annunci(p).length, 0); assert.equal(p.fette.length, 0);
});

test('CUR-10: i tasti vanno alla finestra col fuoco: nessun annuncio', async () => {
  const p = porte({ risposte: [{ azioni: [{ tipo: 'tasti', combinazione: 'ctrl+a' }] }, { fine: { riuscito: true } }] });
  Object.assign(p.porte, conFette()); p.porte.fette = p.fette;
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
  assert.equal(p.eseguite.length, 1); assert.equal(annunci(p).length, 0); assert.equal(p.fette.length, 0);
});

test('CUR-11: dall\'attrezzo: la finestra letta dall\'aiutante arriva nell\'annuncio; il moto ridotto della sessione toglie il volo', async () => {
  const FIN = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Senza titolo - Blocco note', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
  const stato = { window_title: FIN.title, app_name: FIN.app_name, window_bounds: FIN.bounds, screenshot_width: 1280, screenshot_height: 720,
    elements: [{ element_index: 1, element_token: 't1', role: 'Document', label: 'Editor di testo', frame: { x: 10, y: 60, w: 1200, h: 600 } }] };
  const aiutante = {
    azioni: [],
    async apri() { return { ok: true }; },
    compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [FIN] }, immagine: null, errore: null };
      if (nome === 'get_window_state') return { ok: true, dati: stato, immagine: null, errore: null };
      this.azioni.push({ nome, argomenti }); return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
  const giro = async (extra) => {
    const eventi = []; let n = 0;
    const risposte = [{ actions: [{ type: 'type', ref: 'e1', text: 'ciao' }] }, { done: { success: true, note: 'typed' } }];
    const valore = { testoDellaPersona: 'Apri il Blocco note e scrivi ciao',
      chiediModello: async () => ({ testo: JSON.stringify(risposte[Math.min(n++, 1)]), usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      chiediDomanda: async (qs) => ({ status: 'answered', answers: Object.fromEntries(qs.map((q) => [q.id, 'Allow'])) }),
      emetti: (nome, dati) => eventi.push({ nome, dati }), ...extra };
    const r = await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'type hello in Notepad' },
      { fase: 'esegui', toolCallId: 'call-1', segnale: new AbortController().signal, livelloAccesso: 'scrittura-progetto', sessione: valore });
    assert.equal(r.ok, true, r.testo);
    return eventi.filter((e) => e.nome === EVENTI.annuncio).map((e) => e.dati);
  };
  const lento = await giro({});
  assert.equal(lento.length, 1);
  assert.deepEqual(lento[0].finestra, { x: 0, y: 0, w: 1280, h: 720 });
  assert.deepEqual(lento[0].punto, { x: 610, y: 360 });
  assert.equal(lento[0].durata, 850); assert.equal(lento[0].modo, 'sottofondo'); assert.equal(lento[0].toolCallId, 'call-1');
  const ridotto = await giro({ motoRidotto: true });
  assert.equal(ridotto[0].durata, 0);
  for (const bordi of [{ x: 0, y: 0, width: 0, height: 720 }, { x: 0, y: 0, width: 1280, height: 0 }]) {
    stato.window_bounds = bordi;
    const vuota = await giro({});
    assert.equal(vuota[0].finestra, null, `area vuota ${JSON.stringify(bordi)}: nessun riquadro nell'annuncio`);
  }
});

/*
 * Il modo in ogni esito (Desktop 05/11/2026 18:34): la bolla (FE-074) disegna l'anello di ripiego solo quando il mouse è di TALOS
 * ('preso'); in 'sottofondo' il mouse è della persona. Un `modo` nullo la lasciava senza risposta. Fonti: Hermes
 * `hermes_cli/tools_config.py:362` («Background computer-use via cua-driver — does NOT steal your cursor or focus»: il modo è del
 * motore, non della singola azione); cua `verify-cua-driver/features/background-input.md:3` («background operations must not steal
 * focus, move the real pointer…»).
 */
const MODI = ['preso', 'sottofondo'];
const esitiDelPasso = (p) => p.eventi.filter((e) => e.nome === EVENTI.passo && e.dati.fase === 'esito').map((e) => e.dati);
const fine = (p) => p.eventi.filter((e) => e.nome === EVENTI.esito || e.nome === EVENTI.fermato).map((e) => e.dati);

test('CUR-12: ogni esito di passo e ogni esito finale portano il modo, anche senza modo dall\'aiutante, su aspetta, Stop e tempo', async () => {
  const casi = {
    riuscita: porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true } }] }),
    rifiutata: porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: false } }], agisci: () => ({ esito: 'rifiutata', motivo: 'altro' }) }),
    aspetta: porte({ risposte: [{ azioni: [{ tipo: 'aspetta', secondi: 1 }] }, { fine: { riuscito: true } }], agisci: () => ({ esito: 'non-verificabile', cambiato: true }) }),
    tasti: porte({ risposte: [{ azioni: [{ tipo: 'tasti', combinazione: 'ctrl+a' }] }, { fine: { riuscito: true } }], agisci: () => ({ esito: 'confermata' }) }),
  };
  let ferma = null;
  casi.stop = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }], attendi: async () => { ferma = 'mano-della-persona'; }, fermato: () => ferma });
  casi.tempo = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }] });
  for (const [nome, p] of Object.entries(casi)) {
    if (nome !== 'stop' && nome !== 'tempo') { Object.assign(p.porte, conFette()); p.porte.fette = p.fette; }
    await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, ...(nome === 'tempo' ? { limiti: { msPerPasso: 100, msAnnullamento: 500 } } : {}) });
    const esiti = esitiDelPasso(p);
    assert.ok(esiti.length >= 1, `${nome}: almeno un esito di passo`);
    for (const e of esiti) assert.equal(e.modo, 'sottofondo', `${nome}: esito ${e.esito} con modo ${e.modo}`);
    const f = fine(p);
    assert.equal(f.length, 1, `${nome}: un esito finale`);
    assert.equal(f[0].modo, 'sottofondo', `${nome}: esito finale con modo ${f[0].modo}`);
  }
});

test('CUR-13: il modo è quello dell\'ospite (porte.modo); un valore fuori dai due vale «sottofondo»; il modo detto dall\'aiutante vince sul passo', async () => {
  const giro = async (extra, agisci) => {
    const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true } }], ...(agisci ? { agisci } : {}), ...extra });
    Object.assign(p.porte, conFette()); p.porte.fette = p.fette;
    await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
    return { annuncio: annunci(p)[0], esito: esitiDelPasso(p)[0], fine: fine(p)[0] };
  };
  const preso = await giro({ modo: 'preso' }, () => ({ esito: 'confermata' }));
  assert.equal(preso.annuncio.modo, 'preso'); assert.equal(preso.esito.modo, 'preso'); assert.equal(preso.fine.modo, 'preso');
  for (const strano of ['x', null, 1, 'PRESO']) {
    const g = await giro({ modo: strano }, () => ({ esito: 'confermata' }));
    assert.equal(g.annuncio.modo, 'sottofondo', `modo ${String(strano)}`); assert.equal(g.esito.modo, 'sottofondo'); assert.equal(g.fine.modo, 'sottofondo');
  }
  const detto = await giro({ modo: 'sottofondo' }, () => ({ esito: 'confermata', modo: 'preso' }));
  assert.equal(detto.esito.modo, 'preso', 'il passo dice come l\'aiutante ha agito davvero');
  const rotto = await giro({ modo: 'preso' }, () => ({ esito: 'confermata', modo: 'x' }));
  assert.equal(rotto.esito.modo, 'preso', 'un modo rotto dall\'aiutante non toglie quello dell\'ospite');
  assert.ok(MODI.includes(rotto.annuncio.modo));
});

test('CUR-14: l\'annuncio porta n; per ogni azione spaziale partita col suo punto, l\'annuncio dello stesso n arriva prima dell\'esito', async () => {
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }, { tipo: 'premi', ref: 'b9' }, { tipo: 'premi', ref: 'b3' }] }, { fine: { riuscito: true } }] });
  Object.assign(p.porte, conFette()); p.porte.fette = p.fette;
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
  const curve = p.eventi.map((e, i) => ({ ...e, i })).filter((e) => e.nome === EVENTI.annuncio);
  assert.equal(curve.length, 2, 'b9 non ha un punto: nessuna curva');
  const esiti = p.eventi.map((e, i) => ({ ...e, i })).filter((e) => e.nome === EVENTI.passo && e.dati.fase === 'esito');
  assert.equal(esiti.length, 3);
  for (const c of curve) {
    assert.equal(typeof c.dati.n, 'number', 'la curva porta n');
    const e = esiti.find((x) => x.dati.n === c.dati.n);
    assert.ok(e && c.i < e.i, `curva di n=${c.dati.n} prima del suo esito`);
    const passoAnnuncio = p.eventi.findIndex((x) => x.nome === EVENTI.passo && x.dati.fase === 'annuncio' && x.dati.n === c.dati.n);
    assert.ok(passoAnnuncio >= 0 && passoAnnuncio < c.i, 'il passo «annuncio» dello stesso n viene prima della curva');
  }
  const senzaCurva = esiti.filter((e) => !curve.some((c) => c.dati.n === e.dati.n));
  assert.equal(senzaCurva.length, 1, 'solo b9 ha un esito senza curva');
});
