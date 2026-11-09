/*
 * FE-040, il cielo beta: i dati sono quelli veri, un pezzo senza dato non si disegna, un solo ciclo che si ferma a finestra chiusa. Il disegno gira su un
 * contesto finto: la prova guarda che non cada e che i bersagli stiano dove servono, non come appare.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { PIANETI_PER_STELLA, cercaNelCielo, costruisciCielo, esistevaAllora, statoInCielo, stellaDi } from '../../src/components/cielo-dati.js';
import { apriCielo, colpito, disegnaCielo } from '../../src/components/cielo.js';

const ADESSO = Date.parse('2026-11-03T12:00:00Z');
const prima = (giorni) => new Date(ADESSO - giorni * 86_400_000).toISOString();
const ses = (id, extra = {}) => ({ sessionId: id, nome: id, conclusa: true, ultimoEsito: 'successo', avviataAlle: prima(1), progetto: 'TALOS', modello: 'z-ai/glm-5.3-flash', ...extra });
const contestoFinto = () => {
  const gradiente = { addColorStop() {} };
  return new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'createRadialGradient' ? () => gradiente : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
};

test('CIELO-01 stella = progetto, poi cartella; senza né l\'uno né l\'altra, Chat libere', () => {
  assert.equal(stellaDi({ progetto: 'A', cartella: 'C:\\x\\B' }), 'A');
  assert.equal(stellaDi({ cartella: { cartellaId: 'x', nome: 'Sito' } }), 'Sito', '`cartella` dell\'elenco è un oggetto, senza percorso');
  assert.equal(stellaDi({ sessionId: 'a' }, { a: 'C:\\lavoro\\Note\\' }), 'Note');
  assert.equal(stellaDi({}), null);
  assert.equal(costruisciCielo({ sessioni: [ses('a')], cartelle: { a: 'C:\\TALOS' }, adesso: ADESSO }).stelle[0].p, 'C:\\TALOS');
  const { stelle } = costruisciCielo({ sessioni: [ses('a'), ses('b', { progetto: null })], adesso: ADESSO });
  assert.deepEqual(stelle.map((s) => s.n).sort(), [null, 'TALOS'].sort());
  assert.equal(stelle.find((s) => s.n === null).libere, true);
});

test('CIELO-02 stati veri, conti veri; uno stato senza riga resta visibile', () => {
  assert.equal(statoInCielo({ conclusa: false }), 'corso');
  assert.equal(statoInCielo({ conclusa: true, discendentiAlLavoro: 2 }), 'corso');
  assert.equal(statoInCielo({ conclusa: false, inAttesaApprovazione: true }), 'aspetta');
  assert.equal(statoInCielo({ conclusa: true, ultimoEsito: 'errore' }), 'riprendere');
  assert.equal(statoInCielo({ conclusa: true, interrotta: true }), 'riprendere');
  assert.equal(statoInCielo({ conclusa: true, ultimoEsito: 'successo' }), 'fine');
  const { conti } = costruisciCielo({ sessioni: [ses('a', { conclusa: false }), ses('b', { conclusa: false, inAttesaApprovazione: true }), ses('c', { ultimoEsito: 'errore' })], adesso: ADESSO });
  assert.deepEqual(conti, { corso: 1, aspetta: 1, riprendere: 1 });
});

test('CIELO-03 lune: i sotto-agenti stanno sulla radice, anche annidati, e non sono pianeti', () => {
  const { stelle } = costruisciCielo({ sessioni: [ses('padre'), ses('figlia', { padreId: 'padre', conclusa: false, taskDelega: 'Legge i file' }), ses('nipote', { padreId: 'figlia' })], adesso: ADESSO });
  assert.equal(stelle[0].tutte.length, 1);
  assert.deepEqual(stelle[0].s[0].ag.map((a) => [a.n, a.st]), [['Legge i file', 'corso'], ['nipote', 'fine']]);
});

test('CIELO-04 anelli solo se c\'è il conto; contesto dalla finestra vera; senza finestra un valore prudente', () => {
  const { stelle } = costruisciCielo({ sessioni: [ses('a', { compattazioni: 2, usage: { prompt_tokens: 50_000, completion_tokens: 1 } })], finestraDi: () => 100_000, adesso: ADESSO });
  assert.equal(stelle[0].s[0].ri, 2);
  assert.equal(stelle[0].s[0].ctx, 50);
  const senza = costruisciCielo({ sessioni: [ses('a')], adesso: ADESSO }).stelle[0].s[0];
  assert.equal(senza.ri, 0);
  assert.equal(senza.ctx, 12);
});

test('CIELO-05 oltre i pianeti in orbita la cintura; i vivi restano in orbita anche se vecchi', () => {
  const sessioni = Array.from({ length: PIANETI_PER_STELLA + 3 }, (_, i) => ses(`s${i}`, { avviataAlle: prima(i) }));
  sessioni.push(ses('viva', { conclusa: false, avviataAlle: prima(40) }));
  const [stella] = costruisciCielo({ sessioni, adesso: ADESSO }).stelle;
  assert.equal(stella.s.length, PIANETI_PER_STELLA);
  assert.equal(stella.vecchie, 4);
  assert.equal(stella.s[0].id, 'viva');
  assert.equal(stella.tutte.length, PIANETI_PER_STELLA + 4);
});

test('CIELO-06 una sessione nuova non sposta le stelle che ci sono già', () => {
  const base = [ses('a', { progetto: 'Uno', avviataAlle: prima(9) }), ses('b', { progetto: 'Due', avviataAlle: prima(5) })];
  const prima1 = costruisciCielo({ sessioni: base, adesso: ADESSO }).stelle;
  const dopo = costruisciCielo({ sessioni: [...base, ses('c', { progetto: 'Tre', avviataAlle: prima(0) })], adesso: ADESSO }).stelle;
  assert.deepEqual(dopo.slice(0, 2).map((s) => [s.n, s.x, s.y]), prima1.map((s) => [s.n, s.x, s.y]));
});

test('CIELO-07 comete: solo automazioni attive con una prossima esecuzione futura; senza stelle nessuna', () => {
  const automazioni = [{ nome: 'Mattino', prossimaEsecuzione: new Date(ADESSO + 3_600_000).toISOString() }, { nome: 'Passata', prossimaEsecuzione: prima(1) }, { nome: 'Spenta', attiva: false, prossimaEsecuzione: new Date(ADESSO + 1).toISOString() }, { nome: 'Senza' }];
  assert.deepEqual(costruisciCielo({ sessioni: [ses('a')], automazioni, adesso: ADESSO }).comete.map((c) => c.n), ['Mattino']);
  assert.deepEqual(costruisciCielo({ sessioni: [], automazioni, adesso: ADESSO }).comete, []);
});

test('CIELO-08 guarda indietro: solo le sessioni esistenti allora', () => {
  assert.equal(esistevaAllora({ eta: 5 }, 3), true);
  assert.equal(esistevaAllora({ eta: 1 }, 3), false);
  assert.equal(esistevaAllora({ eta: 0 }, 0), true);
});

test('CIELO-09 la ricerca trova progetti e sessioni, anche fuori dall\'orbita', () => {
  const { stelle } = costruisciCielo({ sessioni: [ses('Refactor', { nome: 'Refactor del selettore' })], adesso: ADESSO });
  assert.deepEqual(cercaNelCielo(stelle, 'talos').map((r) => r.tipo), ['stella']);
  assert.deepEqual(cercaNelCielo(stelle, 'SELETT').map((r) => r.tipo), ['pianeta']);
  assert.deepEqual(cercaNelCielo(stelle, '   '), []);
});

function scena(extra = {}) {
  const document = documento();
  const contenitore = document.createElement('div');
  document.body.append(contenitore);
  const fatti = { sessione: [], qui: [], finestra: 0, bacheca: 0, chiuso: 0 };
  const coda = [];
  const cielo = apriCielo({
    document, contenitore, dati: { sessioni: [ses('uno', { conclusa: false }), ses('due'), ses('tre', { progetto: 'Sito', avviataAlle: prima(4) })] }, scuro: () => true, contesto: contestoFinto(),
    pianifica: (f) => { coda.push(f); return coda.length; }, annulla: () => { coda.length = 0; },
    onApriSessione: (s) => fatti.sessione.push(s.sessionId), onNuovaQui: (s) => fatti.qui.push(s.n), onFinestra: () => { fatti.finestra += 1; }, onBacheca: () => { fatti.bacheca += 1; }, onChiudi: () => { fatti.chiuso += 1; },
    ...extra,
  });
  return { cielo, fatti, coda, document, contenitore, gira: (t = 16) => { const f = coda.shift(); f?.(t); } };
}
const bottoneCol = (nodo, testo) => nodo.querySelectorAll('button').find((b) => b.textContent.includes(testo));

test('CIELO-10 un solo ciclo, in tema scuro e chiaro, a calma e no; a finestra chiusa non si ripianifica', () => {
  const { cielo, coda, gira, fatti } = scena();
  gira(16); gira(32);
  assert.equal(coda.length, 1, 'un fotogramma alla volta');
  assert.ok(cielo.stato.colpi.length >= 4);
  const C = cielo.stato;
  for (const scuro of [true, false]) for (const calma of [true, false]) assert.doesNotThrow(() => disegnaCielo(contestoFinto(), C, 500, 1280, 800, { scuro, calma }));
  const inSospeso = coda[0];
  cielo.chiudi();
  assert.equal(fatti.chiuso, 1);
  assert.equal(coda.length, 0);
  inSospeso(48);
  assert.equal(coda.length, 0, 'un fotogramma già in fila non ne ripianifica un altro');
  cielo.chiudi();
  assert.equal(fatti.chiuso, 1);
});

test('CIELO-11 a pagina nascosta non si disegna, ma il ciclo resta', () => {
  const { document, gira, coda, cielo } = scena();
  document.hidden = true;
  cielo.stato.colpi = ['fermo'];
  gira(16);
  assert.deepEqual(cielo.stato.colpi, ['fermo']);
  assert.equal(coda.length, 1);
});

test('CIELO-12 il bersaglio: dentro il raggio sì; a pari distanza vince il pianeta, che è più piccolo', () => {
  const stella = { x: 10, y: 10, r: 26, stella: true }; const pianeta = { x: 20, y: 10, r: 13 };
  assert.equal(colpito([stella, pianeta], 11, 10), stella);
  assert.equal(colpito([stella, pianeta], 15, 10), pianeta);
  assert.equal(colpito([stella], 300, 300), null);
  assert.equal(colpito(undefined, 1, 1), null);
});

test('CIELO-13 Elenco è l\'alternativa completa: si apre una stella, poi una sessione, e si entra', () => {
  const { cielo, fatti } = scena();
  clic(bottoneCol(cielo.nodo, 'Elenco'));
  const voce = cielo.nodo.querySelectorAll('.c-elenco .c-ses').find((n) => /TALOS/u.test(n.textContent));
  assert.ok(voce);
  clic(voce);
  assert.ok(cielo.nodo.querySelector('.c-pan'));
  clic(cielo.nodo.querySelectorAll('.c-pan .c-ses')[0]);
  clic(cielo.nodo.querySelector('.c-pieno'));
  assert.deepEqual(fatti.sessione, ['uno']);
  assert.equal(fatti.chiuso, 1);
});

test('CIELO-14 dal progetto la finestra si apre con quella stella; c\'è sempre la via per la finestra', () => {
  const { cielo, fatti } = scena();
  clic(bottoneCol(cielo.nodo, 'Elenco'));
  clic(cielo.nodo.querySelectorAll('.c-elenco .c-ses').find((n) => /Sito/u.test(n.textContent)));
  clic(bottoneCol(cielo.nodo.querySelector('.c-pan'), 'Usa la finestra'));
  assert.deepEqual(fatti.qui, ['Sito']);
  const dopo = scena();
  clic(bottoneCol(dopo.cielo.nodo, 'Usa la finestra'));
  assert.equal(dopo.fatti.finestra, 1);
  assert.ok(dopo.cielo.nodo.querySelector('.talos-badge').textContent.includes('Beta'));
});

test('CIELO-15 nomi veri solo come testo; con nessuna sessione lo dice', () => {
  const male = '<img src=x onerror=alert(1)>';
  const { cielo } = scena({ dati: { sessioni: [ses('a', { nome: male })] } });
  clic(bottoneCol(cielo.nodo, 'Elenco'));
  clic(cielo.nodo.querySelector('.c-elenco .c-ses'));
  assert.equal(cielo.nodo.querySelector('.c-pan .c-ses b').textContent, male);
  assert.equal(cielo.nodo.querySelector('img'), null);
  const vuoto = scena({ dati: { sessioni: [] } });
  assert.match(vuoto.cielo.nodo.textContent, /Nessun progetto/u);
});

test('CIELO-17 la casella del lavoro avvia dal progetto coi tre controlli, a Invio; vuota non parte; un rifiuto si dice', async () => {
  const avvii = [];
  const scelte = { iniziale: { modello: 'm1', sforzo: 'alto', accesso: 'Workspace write' }, modelli: [{ valore: 'm1', nome: 'Uno' }, { valore: 'm2', nome: 'Due' }], sforzi: [{ valore: 'alto', nome: 'Alto' }], accessi: [{ valore: 'Workspace write', nome: 'Scrive nel progetto' }, { valore: 'Full access', nome: 'Accesso pieno' }] };
  const { cielo } = scena({ scelte, onAvvia: async (x) => { avvii.push(x); return avvii.length === 2 ? { ok: false, messaggio: 'Non so dove' } : { ok: true }; } });
  clic(bottoneCol(cielo.nodo, 'Elenco'));
  clic(cielo.nodo.querySelectorAll('.c-elenco .c-ses').find((n) => /TALOS/u.test(n.textContent)));
  const via = () => cielo.nodo.querySelector('.c-via');
  clic(via());
  assert.equal(avvii.length, 0, 'vuota non parte');
  clic(bottoneCol(cielo.nodo, 'Uno'));
  clic(bottoneCol(cielo.nodo, 'Due'));
  const area = cielo.nodo.querySelector('textarea');
  area.value = ' Sistema il selettore ';
  area.dispatchEvent(new Event('input'));
  area.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter', shiftKey: false }));
  await new Promise((f) => setTimeout(f, 5));
  assert.deepEqual({ ...avvii[0], stella: undefined }, { stella: undefined, testo: 'Sistema il selettore', modello: 'm2', sforzo: 'alto', accesso: 'Workspace write' });
  assert.equal(cielo.stato.bozza, '');
  assert.equal(cielo.stato.lampi.length, 1, 'il progetto fa un lampo');
  const altra = cielo.nodo.querySelector('textarea');
  altra.value = 'x'; altra.dispatchEvent(new Event('input'));
  clic(via());
  await new Promise((f) => setTimeout(f, 5));
  assert.match(cielo.nodo.querySelector('.c-avv').textContent, /Non so dove/u);
  assert.equal(cielo.stato.bozza, 'x', 'il testo resta');
});

test('CIELO-18 l\'accesso pieno si vede: rosso, con la cartella; le Chat libere non hanno casella, hanno la finestra', () => {
  const scelte = { iniziale: { modello: 'm1', accesso: 'Full access' }, modelli: [], sforzi: [], accessi: [{ valore: 'Full access', nome: 'Accesso pieno' }] };
  const { cielo, fatti } = scena({ scelte, dati: { sessioni: [ses('a'), ses('b', { progetto: null })], cartelle: { a: 'C:\\TALOS' } } });
  clic(bottoneCol(cielo.nodo, 'Elenco'));
  clic(cielo.nodo.querySelectorAll('.c-elenco .c-ses').find((n) => /TALOS/u.test(n.textContent)));
  assert.ok(cielo.nodo.querySelector('.c-par .alto'));
  assert.match(cielo.nodo.querySelector('.c-pan').textContent, /Cartella intera: C:\\TALOS/u);
  clic(bottoneCol(cielo.nodo.querySelector('.c-pan'), 'Usa la finestra'));
  assert.deepEqual(fatti.qui, ['TALOS'], 'la finestra riceve la stella, con la sua cartella');
  const dopo = scena({ dati: { sessioni: [ses('b', { progetto: null })] } });
  clic(bottoneCol(dopo.cielo.nodo, 'Elenco'));
  clic(dopo.cielo.nodo.querySelector('.c-elenco .c-ses'));
  assert.equal(dopo.cielo.nodo.querySelector('textarea'), null);
});

test('CIELO-19 suggerimento sul pezzo esatto; nel vuoto «Nuovo progetto» solo dopo l\'etichetta; la minimappa sposta la vista', () => {
  const { cielo, gira, fatti } = scena();
  const tela = cielo.nodo.querySelector('canvas');
  gira(16);
  const bersaglio = cielo.stato.colpi.find((h) => h.stella);
  const passa = (tipo, x, y) => tela.dispatchEvent(Object.assign(new Event(tipo), { clientX: x, clientY: y }));
  const sugg = cielo.nodo.querySelector('.c-sugg');
  passa('pointermove', bersaglio.x, bersaglio.y);
  assert.equal(sugg.hidden, false);
  assert.match(sugg.textContent, /sessioni|sessione/u);
  passa('pointermove', -500, -500);
  assert.equal(sugg.hidden, true);
  passa('pointerdown', -500, -500); passa('pointerup', -500, -500);
  const nuovo = cielo.nodo.querySelector('.nuovo-qui');
  assert.equal(nuovo.hidden, false);
  assert.equal(fatti.finestra, 0, 'il clic nel vuoto non apre niente');
  clic(nuovo);
  assert.equal(fatti.finestra, 1);
  const altro = scena();
  altro.cielo.stato.mini = { x: 0, y: 0, w: 100, h: 60, k: 0.1, ox: 0, oy: 0 };
  altro.cielo.nodo.querySelector('canvas').dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 10, clientY: 10 }));
  altro.cielo.nodo.querySelector('canvas').dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 10, clientY: 10 }));
  assert.equal(altro.cielo.stato.mira.x, 100);
});

test('CIELO-20 l\'elenco cambia a cielo aperto: le stelle restano, i pianeti tengono l\'orbita, chi nasce e chi finisce fa un lampo', () => {
  const { cielo, gira } = scena();
  gira(16);
  const stellaPrima = cielo.stato.st.find((s) => s.n === 'TALOS');
  const { x, y } = stellaPrima;
  const angolo = stellaPrima.s.find((l) => l.id === 'uno').a;
  cielo.aggiorna({ sessioni: [ses('uno'), ses('due'), ses('tre', { progetto: 'Sito', avviataAlle: prima(4) }), ses('quattro', { conclusa: false })] });
  const stella = cielo.stato.st.find((s) => s.n === 'TALOS');
  assert.deepEqual([stella.x, stella.y], [x, y]);
  assert.equal(stella.s.find((l) => l.id === 'uno').a, angolo);
  assert.equal(cielo.stato.lampi.length, 2, 'quattro è nata, uno è finita');
  gira(32);
  assert.doesNotThrow(() => cielo.aggiorna({ sessioni: [] }));
  cielo.chiudi();
  assert.doesNotThrow(() => cielo.aggiorna({ sessioni: [ses('uno')] }));
});

test('CIELO-21 disegno completo: scia, raggi, lampi e minimappa non cadono; il movimento ridotto ferma i raggi', () => {
  const { cielo } = scena();
  const C = cielo.stato;
  C.lampi.push({ x: 1000, y: 700, v: 0 }); C.cam.z = 3; C.mira.z = 3; C.fit = 0.5;
  const contati = { moveTo: 0 };
  const conMovimento = new Proxy(contestoFinto(), { get: (t, k) => (k === 'moveTo' ? () => { contati.moveTo += 1; } : t[k]) });
  disegnaCielo(conMovimento, C, 500, 1280, 800, { scuro: true, calma: false });
  const conRaggi = contati.moveTo;
  assert.ok(C.mini, 'da vicino c\'è la minimappa');
  contati.moveTo = 0;
  disegnaCielo(conMovimento, C, 500, 1280, 800, { scuro: true, calma: true });
  assert.ok(contati.moveTo < conRaggi);
  /* la scia: chi lavora disegna più punti di chi ha finito, a parità di tutto il resto */
  const puntiCon = (st) => {
    const prima = C.st.flatMap((s) => s.s).map((l) => l.st);
    C.st.forEach((s) => s.s.forEach((l) => { l.st = st; }));
    let n = 0;
    const conta = new Proxy(contestoFinto(), { get: (t, k) => (k === 'arc' ? () => { n += 1; } : t[k]) });
    disegnaCielo(conta, C, 500, 1280, 800, { scuro: true, calma: true });
    let i = 0;
    C.st.forEach((s) => s.s.forEach((l) => { l.st = prima[i]; i += 1; }));
    return n;
  };
  assert.ok(puntiCon('corso') > puntiCon('fine'));
  C.sel = C.st[0];
  disegnaCielo(contestoFinto(), C, 500, 1280, 800, { scuro: false, calma: false });
  assert.equal(C.mini, null, 'mai sotto il pannello');
});

test('CIELO-16 collegato: l\'impostazione decide, il menu di Windows parte dalla finestra, lo stile è caricato, una sola libreria: nessuna', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(!launch && !finestra && leggiImpostazioniDesktop\(\)\.appearance\.newSessionView === 'sky'\)/u);
  assert.match(app, /creaWorkspaceChooser\(\{ launch, cartella \}\)/u);
  assert.match(app, /cieloAperto\?\.aggiorna\?\.\(datiDelCielo\(\)\)/u);
  assert.match(app, /avviaSessionePendente\(\{ cartellaLibera: percorso, nomeCartella: stella\.nomeVisto/u);
  assert.match(readFileSync(new URL('../../src/styles/main.css', import.meta.url), 'utf8'), /@import '\.\/cielo\.css'/u);
  assert.equal(/^import .* from '(?!\.)/mu.test(readFileSync(new URL('../../src/components/cielo.js', import.meta.url), 'utf8')), false);
  const catalogo = readFileSync(new URL('../../../src/impostazioni/catalogo-impostazioni.mjs', import.meta.url), 'utf8');
  assert.match(catalogo, /'appearance\.newSessionView'/u);
});

/* Revisione UX del 04/11, righe 28-31 (agente Z) */
test('CIELO-22 (UX 28) la testa dice il singolare con una sessione che aspetta, il plurale con due', () => {
  const uno = scena({ dati: { sessioni: [ses('a', { conclusa: false, inAttesaApprovazione: true })] } });
  assert.match(uno.cielo.nodo.querySelector('.c-tit small').textContent, /^0 al lavoro, 1 ti aspetta$/u);
  const due = scena({ dati: { sessioni: [ses('a', { conclusa: false, inAttesaApprovazione: true }), ses('b', { conclusa: false, inAttesaApprovazione: true })] } });
  assert.match(due.cielo.nodo.querySelector('.c-tit small').textContent, /^0 al lavoro, 2 ti aspettano$/u);
});

/* un contesto finto che ricorda le scritte: dove, con che carattere e allineamento; la larghezza è 6,5 px per lettera */
const contestoCheScrive = () => {
  const scritte = [];
  const base = contestoFinto();
  const c = new Proxy(base, { get: (t, k) => (k === 'fillText' ? (testo, x, y) => scritte.push({ testo, x, y, font: t.font, allinea: t.textAlign }) : k === 'measureText' ? (testo) => ({ width: String(testo).length * 6.5 }) : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  return { c, scritte };
};
const rettangolo = (s) => {
  const alto = Number(/(\d+(?:\.\d+)?)px/u.exec(s.font)[1]); const w = s.testo.length * 6.5;
  const x = s.allinea === 'center' ? s.x - w / 2 : s.allinea === 'right' ? s.x - w : s.x;
  return { x, y: s.y - alto, w, h: alto + 3 };
};
const tocca = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('CIELO-23 (UX 29) il nome di una sessione non copre il nome né il conto del progetto: si sposta', () => {
  const { cielo } = scena({ dati: { sessioni: [ses('lunga', { nome: 'Usa le impostazioni di TALOS: metti il tema chiaro', ultimoEsito: 'errore' })] } });
  const C = cielo.stato; const s = C.st[0]; const l = s.s[0];
  const z = 2.2; C.cam = { x: s.x, y: s.y, z }; C.mira = { ...C.cam }; C.sel = s; s.rot = 0; l.w = 0;
  const m = s.m * (1.9 + (z - 1.9) * 0.2);
  /* il pianeta proprio a sinistra del conto «1 sessione», come nella foto 62 */
  const dx = -60 / z; const dy = (m + 29) / z; l.a = Math.atan2(dy / 0.64, dx); l.r = Math.hypot(dx, dy / 0.64);
  const { c, scritte } = contestoCheScrive();
  disegnaCielo(c, C, 500, 1280, 800, { scuro: true, calma: true });
  const delProgetto = scritte.filter((x) => x.allinea === 'center').map(rettangolo);
  const delPianeta = scritte.filter((x) => x.testo === l.t).map(rettangolo);
  assert.equal(delProgetto.length, 2, 'nome e conto del progetto');
  assert.equal(delPianeta.length, 1);
  for (const p of delPianeta) for (const q of delProgetto) assert.equal(tocca(p, q), false, `«${l.t}» copre una scritta del progetto`);
});

test('CIELO-24 (UX 29) «Apri la Bacheca» è un collegamento su una riga, non una riga di sessione a tre colonne', () => {
  const sessioni = Array.from({ length: 9 }, (_, i) => ses(`s${i}`, { avviataAlle: prima(i) }));
  const { cielo, fatti } = scena({ dati: { sessioni } });
  clic(bottoneCol(cielo.nodo, 'Elenco'));
  clic(cielo.nodo.querySelector('.c-elenco .c-ses'));
  const tutte = bottoneCol(cielo.nodo.querySelector('.c-pan'), 'Apri la Bacheca');
  assert.ok(tutte);
  assert.equal(tutte.classList.contains('c-ses'), false, 'la griglia a tre colonne della riga mette ogni parola nella colonna da 12 px');
  assert.ok(tutte.classList.contains('c-tutte'));
  clic(tutte);
  assert.equal(fatti.bacheca, 1);
});

test('CIELO-25 (UX 29) il cartellino del passaggio sparisce al clic; senza modello il gettone dice di sceglierlo, mai vuoto', () => {
  const { cielo, gira } = scena({ scelte: { iniziale: { modello: null, sforzo: null, accesso: 'Workspace write' }, modelli: [{ valore: 'm1', nome: 'Uno' }], sforzi: [{ valore: null, nome: 'Automatico' }], accessi: [{ valore: 'Workspace write', nome: 'Scrive nel progetto' }] } });
  const tela = cielo.nodo.querySelector('canvas');
  gira(16);
  const bersaglio = cielo.stato.colpi.find((h) => h.stella);
  const passa = (tipo, x, y) => tela.dispatchEvent(Object.assign(new Event(tipo), { clientX: x, clientY: y }));
  passa('pointermove', bersaglio.x, bersaglio.y);
  const sugg = cielo.nodo.querySelector('.c-sugg');
  assert.equal(sugg.hidden, false);
  passa('pointerdown', bersaglio.x, bersaglio.y);
  assert.equal(sugg.hidden, true, 'alla pressione il cartellino sparisce subito: se si trascina la vista, non resta sul punto di prima (mutante M05)');
  passa('pointerup', bersaglio.x, bersaglio.y);
  assert.ok(cielo.nodo.querySelector('.c-pan'), 'il clic apre il progetto');
  assert.equal(sugg.hidden, true, 'la vista si sposta: il cartellino del punto di prima non resta a galla');
  const gettoni = cielo.nodo.querySelectorAll('.c-par button').filter((b) => !b.classList.contains('c-via'));
  assert.equal(gettoni.length, 3);
  for (const g of gettoni) assert.notEqual(g.textContent.trim(), '', 'nessun gettone vuoto');
  assert.match(gettoni[0].textContent, /Scegli un modello/u);
});

/* dove cade sullo schermo un punto del mondo con la vista a cui il cielo tende */
const schermo = (C, wx, wy, W = 1280, H = 800) => [W / 2 + (wx - C.mira.x) * C.mira.z, H / 2 + (wy - C.mira.y) * C.mira.z];
const molteStelle = () => Array.from({ length: 11 }, (_, i) => ses(`s${i}`, { progetto: `P${i}`, avviataAlle: prima(i) }));

test('CIELO-26 (UX 30) il cielo intero sta fra le due barre, orbite comprese; con Elenco o «Come si legge» aperti si sposta a destra', () => {
  const { cielo } = scena({ dati: { sessioni: molteStelle() } });
  const C = cielo.stato;
  const bordi = () => C.st.flatMap((s) => { const r = Math.max(s.m * 2, ...s.s.map((l) => l.r)); return [schermo(C, s.x - r, s.y - r), schermo(C, s.x + r, s.y + r)]; });
  for (const [x, y] of bordi()) { assert.ok(y >= 66, `orbita sotto la barra in alto (${y})`); assert.ok(y <= 800 - 64, `orbita sotto la barra in basso (${y})`); assert.ok(x >= 0 && x <= 1280); }
  for (const [nome, larghezza] of [['Elenco', 334], ['Come si legge', 296]]) {
    clic(bottoneCol(cielo.nodo, nome));
    for (const [x] of bordi()) assert.ok(x >= larghezza, `${nome}: il riquadro copre una parte del cielo (${x})`);
    clic(bottoneCol(cielo.nodo, nome));
  }
});

test('CIELO-27 (UX 31) Esc chiude prima il riquadro più in alto; il cielo solo quando non c\'è altro', () => {
  const { cielo, fatti } = scena();
  const esc = () => cielo.nodo.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  clic(bottoneCol(cielo.nodo, 'Come si legge'));
  assert.ok(cielo.nodo.querySelector('.c-leg'));
  esc();
  assert.ok(!cielo.nodo.querySelector('.c-leg'), 'Esc chiude «Come si legge»');
  assert.equal(fatti.chiuso, 0, 'e il cielo resta');
  clic(bottoneCol(cielo.nodo, 'Elenco'));
  esc();
  assert.ok(!cielo.nodo.querySelector('.c-elenco'));
  assert.equal(fatti.chiuso, 0);
  const campo = cielo.nodo.querySelector('input');
  campo.value = 'TALOS'; campo.dispatchEvent(new Event('input'));
  assert.ok(cielo.nodo.querySelector('.c-ris'));
  esc();
  assert.ok(!cielo.nodo.querySelector('.c-ris'), 'Esc chiude i risultati della ricerca');
  assert.equal(fatti.chiuso, 0);
  esc();
  assert.equal(fatti.chiuso, 1, 'senza riquadri Esc chiude il cielo');
});
