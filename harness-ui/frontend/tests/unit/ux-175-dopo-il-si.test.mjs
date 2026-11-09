import { test } from 'node:test';
import assert from 'node:assert/strict';

import { documento, orologio } from './aiuto-dom-blocchi.mjs';

/*
 * Decisione 175 dell'owner (04/11/2026), reperti N1 e N2: la testa del segmento attorno alla carta del consenso.
 * La carta chiude la coda del giro; dato il «sì» la chiamata approvata gira DENTRO quel segmento chiuso.
 * Sulla candidata c45b49fbb la testa diceva «in corso» con la card `concluso`, non occupata e l'orologio fermo (N1).
 *
 * Si guida la VISTA VERA (`creaVistaSegmento`, `aggiorna`): stato, `aria-busy`, punto vivo, secondi, ora di fine e annuncio
 * sono il codice del prodotto. Si sostituiscono solo le parti che leggono le righe del DOM (`vociNormalizzate` e i disegni
 * delle righe), che il DOM finto di `aiuto-dom-blocchi.mjs` non sa fare (`:scope >`). Le stesse scene, nel browser vero:
 * UX175-DOPO-IL-SI e UX175-NO di `tests/browser/ux-evidenti-1.spec.mjs`.
 */

const doc = documento();
doc.getElementById = (id) => { for (const n of doc.body.discendenti()) if (n.id === id) return n; return null; };
const finto = orologio();
let ora = 0;
globalThis.document = doc;
globalThis.window = { setInterval: finto.timer.setInterval, clearInterval: finto.timer.clearInterval };
const fotogrammi = [];
globalThis.requestAnimationFrame = (fn) => { fotogrammi.push(fn); return fotogrammi.length; };
const svuotaFotogrammi = () => { while (fotogrammi.length) fotogrammi.shift()(); };

const { creaVistaSegmento } = await import('../../src/components/attivita-segmento.js');
const { specieAttrezzo } = await import('../../src/components/nomi-attrezzi.js');
const { impostaLingua } = await import('../../src/components/lingua.js');
impostaLingua('it');

/* `dopoIlSi`: lo stato della chiamata che `normalizzaVoce` legge da `DATI_VOCE` (la carta l'ha fermata, il consenso è deciso, gira). */
const voce = (stato, inConsenso = false, dopoIlSi = false) => ({
  tipo: 'tool', id: 'riga-1', nome: 'shell', argomenti: { command: 'npm test' }, stato, annullata: false,
  specie: specieAttrezzo('shell'), esito: '', diff: null, inizio: null, comandoDellaPersona: false, inConsenso, dopoIlSi,
});

function scena() {
  svuotaFotogrammi();
  const regione = doc.getElementById('talosAnnunciAttivita');
  if (regione) regione.textContent = ''; // ogni scena parte senza l'annuncio della scena di prima
  const vista = creaVistaSegmento({ azioni: {}, orologio: () => ora });
  doc.body.append(vista.card);
  let attuale = null;
  vista.vociNormalizzate = () => (attuale ? [{ riga: {}, voce: attuale }] : []);
  for (const nome of ['aggiornaRiga', 'aggiornaFiltri', 'aggiornaFissate', 'normalizzaCorpi', 'programmaAdatta']) vista[nome] = () => {};
  const passo = (v, stato) => { attuale = v; vista.aggiorna(stato); };
  const avanza = (ms) => { ora += ms; finto.avanza(ms); };
  const leggi = () => ({
    stato: vista.card.dataset.stato,
    occupata: vista.card.getAttribute('aria-busy'),
    puntoVivo: Boolean(vista.statoEl.querySelector('.talos-dot--live')),
    tempo: vista.tempoEl.textContent,
  });
  const annuncio = () => { svuotaFotogrammi(); return doc.getElementById('talosAnnunciAttivita')?.textContent ?? ''; };
  return { vista, passo, avanza, leggi, annuncio };
}

const IN_CODA = { vivo: true, misurato: true };
const CHIUSO = { vivo: false, misurato: true };

test('UX175-N1 — dato il sì la testa torna viva: stato, aria-busy, punto vivo e secondi che scorrono, anche al battito dopo; finito il comando l’ora si ferma', () => {
  const s = scena();
  s.passo(voce('in-corso'), IN_CODA); // la chiamata nasce nella coda del giro
  s.avanza(1000);
  s.passo(voce('in-corso', true), CHIUSO); // la carta del consenso chiude la coda del giro
  s.avanza(3000);
  assert.equal(s.leggi().tempo, '4 s', 'durante l’attesa i secondi scorrono (reperto 4)');

  s.passo(voce('in-corso', false, true), CHIUSO); // il «sì»: la chiamata approvata gira nel segmento chiuso
  // rosso sulla c45b49fbb: «concluso», aria-busy false, nessun punto vivo
  assert.deepEqual(s.leggi(), { stato: 'vivo', occupata: 'true', puntoVivo: true, tempo: '4 s' });
  s.avanza(2000); // due secondi di battito dell'orologio della vista, senza eventi: la testa resta viva e conta
  assert.deepEqual(s.leggi(), { stato: 'vivo', occupata: 'true', puntoVivo: true, tempo: '6 s' });
  assert.equal(s.annuncio(), '', 'il «sì» non annuncia la fine');

  s.passo(voce('riuscito'), CHIUSO); // il comando finisce
  const finito = s.leggi();
  assert.equal(finito.stato, 'concluso');
  assert.equal(finito.occupata, 'false');
  assert.equal(finito.puntoVivo, false);
  assert.equal(finito.tempo, '6 s');
  assert.match(s.annuncio(), /^Attività conclusa: /u, 'la fine vera si annuncia');
  s.avanza(5000);
  s.passo(voce('riuscito'), CHIUSO); // un ridisegno più tardi: l'ora di fine resta quella
  assert.equal(s.leggi().tempo, '6 s');
  assert.equal(finto.attese(), 0, 'nessun orologio resta acceso');
});

test('UX175-N2 — negato il consenso, la chiamata finisce dall’attesa: l’ora di fine resta ferma', () => {
  const s = scena();
  s.passo(voce('in-corso'), IN_CODA);
  s.avanza(1000);
  s.passo(voce('in-corso', true), CHIUSO);
  s.avanza(2000);
  s.passo(voce('non-consentito'), CHIUSO); // il «no»
  const detto = s.leggi();
  assert.notEqual(detto.stato, 'vivo');
  assert.equal(detto.occupata, 'false');
  assert.equal(detto.tempo, '3 s');
  s.avanza(4000);
  s.passo(voce('non-consentito'), CHIUSO);
  assert.equal(s.leggi().tempo, '3 s', 'l’ora di fine è stata fissata quando la chiamata è finita dall’attesa');
  assert.equal(finto.attese(), 0);
});

test('UX175-N1b — AL CONTRARIO: un segmento chiuso senza carta (una rigiocata, o chiuso per altro) non si riaccende per una chiamata «in corso»', () => {
  const s = scena();
  s.passo(voce('in-corso'), CHIUSO);
  const visto = s.leggi();
  assert.equal(visto.stato, 'concluso');
  assert.equal(visto.occupata, 'false');
  assert.equal(visto.puntoVivo, false);
  assert.equal(finto.attese(), 0, 'nessun orologio acceso');
});

/*
 * Revisione del blocco interfaccia (05/11/2026, difetto MEDIA-BASSA di 607867474): «dopo il sì» viveva solo nella memoria della vista
 * (`eraInAttesa`/`eraDopoIlSi`). Ricarica, o cambio di sessione e ritorno, mentre il comando approvato gira: la rigiocata ricrea la vista,
 * che non ha visto la carta, e la testa tornava «concluso», senza orologio né punto vivo. Ora lo dice la voce (lo stato della chiamata,
 * rifatto dagli eventi rigiocati), e l'origine vera del tempo arriva da chi guida la vista (`app.js`, dall'ora d'avvio del server).
 * Rossa prima della cura: la vista nuova diceva «concluso».
 */
test('UX175-N1c — la vista si ricrea mentre il comando approvato gira (ricarica, cambio sessione): resta viva, coi secondi dall’origine vera, anche ai battiti dopo', () => {
  const s = scena();
  const origine = ora - 7000; // il segmento è partito 7 s fa, prima della ricarica
  s.passo(voce('in-corso', false, true), { vivo: false, misurato: true, inizio: origine });
  assert.deepEqual(s.leggi(), { stato: 'vivo', occupata: 'true', puntoVivo: true, tempo: '7 s' });
  s.avanza(2000); // il battito dell'orologio della vista, senza eventi (mutante b della revisione: la memoria persa al secondo giro)
  assert.deepEqual(s.leggi(), { stato: 'vivo', occupata: 'true', puntoVivo: true, tempo: '9 s' });
  s.passo(voce('in-corso', false, true), CHIUSO); // un altro evento della chiamata: resta viva, l'origine non si sposta
  assert.deepEqual(s.leggi(), { stato: 'vivo', occupata: 'true', puntoVivo: true, tempo: '9 s' });
  assert.equal(s.annuncio(), '', 'nessuna fine annunciata');
  s.avanza(1000);
  s.passo(voce('riuscito'), CHIUSO); // il comando finisce
  assert.deepEqual(s.leggi(), { stato: 'concluso', occupata: 'false', puntoVivo: false, tempo: '10 s' });
  assert.match(s.annuncio(), /^Attività conclusa: /u, 'la fine vera si annuncia anche dalla vista ricreata');
  assert.equal(finto.attese(), 0, 'nessun orologio resta acceso');
});

/*
 * La catena intera, dai dati che `app.js` tiene per la chiamata (`toolCallNomi`, depositati in `DATI_VOCE`) alla testa: qui
 * `normalizzaVoce` è quella vera (si sostituiscono solo `righe` ed `eRagionamento`, che leggono il DOM con `:scope >`).
 */
const { DATI_VOCE } = await import('../../src/components/attivita-segmento.js');
function scenaDaiDati(info) {
  const s = scena();
  const riga = { querySelector: () => null };
  DATI_VOCE.set(riga, { tipo: 'tool', info });
  s.vista.vociNormalizzate = Object.getPrototypeOf(s.vista).vociNormalizzate;
  s.vista.righe = () => [riga];
  s.vista.eRagionamento = () => false;
  return s;
}

test('UX175-N1e — dai dati della chiamata: in attesa della carta, dato il sì viva, ricreata viva; senza carta chiesta, o finita, no', () => {
  const info = { nome: 'shell', argomentiParsati: { command: 'npm test' }, stato: 'running', richiestaConsenso: 'req-1', consensoChiesto: true };
  const s = scenaDaiDati(info);
  s.passo(null, CHIUSO);
  assert.notEqual(s.leggi().stato, 'vivo', 'la carta è aperta: attesa, non «vivo»');
  info.richiestaConsenso = null; // il «sì» (`liberaConsensoDellaRichiesta`)
  s.passo(null, CHIUSO);
  assert.equal(s.leggi().stato, 'vivo');
  const ricreata = scenaDaiDati(info); // ricarica: vista nuova, stessi dati rifatti dagli eventi
  ricreata.passo(null, { vivo: false, misurato: true, inizio: ora - 3000 });
  assert.deepEqual(ricreata.leggi(), { stato: 'vivo', occupata: 'true', puntoVivo: true, tempo: '3 s' });
  info.stato = 'done';
  ricreata.passo(null, CHIUSO);
  s.passo(null, CHIUSO);
  assert.equal(ricreata.leggi().stato, 'concluso');
  assert.equal(s.leggi().stato, 'concluso');
  const maiChiesta = scenaDaiDati({ nome: 'shell', argomentiParsati: {}, stato: 'running', richiestaConsenso: null });
  maiChiesta.passo(null, CHIUSO);
  assert.equal(maiChiesta.leggi().stato, 'concluso', 'una chiamata in corso che non ha mai visto la carta non riaccende un segmento chiuso');
  assert.equal(finto.attese(), 0);
});

/*
 * Le tre funzioni di `app.js` che fanno lo stato, eseguite davvero (estratte dal sorgente, con lo stato finto attorno): il monolite
 * non si carica in node. Se una manca o cambia forma, l'estrazione fallisce e la prova è rossa.
 */
const sorgenteApp = (await import('node:fs')).readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
function funzioneDiApp(nome) {
  const da = sorgenteApp.indexOf(`  function ${nome}(`);
  assert.ok(da >= 0, `app.js ha ${nome}`);
  const a = sorgenteApp.indexOf('\n  }\n', da);
  return sorgenteApp.slice(da, a + 4);
}

test('UX175-N1f — app.js: la carta lascia `consensoChiesto` sulla chiamata; dopo una ricarica il segmento chiuso si misura dall’avvio vero', () => {
  /* `deferHistoricalRendering: true` è lo stato VERO di una ricarica o di un cambio verso una chat non pronta (app.js, `= !pronta`):
     la revisione del 05/11 sera ha trovato che con `false` questa prova passava per la ragione sbagliata. Ciò che dice «storia» è
     `inRigiocata`; il rinvio da solo non deve spegnere la misura. */
  const state = { realSession: { toolCallNomi: new Map(), inRigiocata: false, chiusaDalServer: false, deferHistoricalRendering: true } };
  const segnaConsenso = new Function('state', 'aggiornaRiassuntoBatch', `${funzioneDiApp('segnaConsensoDellaChiamata')}; return segnaConsensoDellaChiamata;`)(state, () => {});
  const avvio = new Function('state', `${funzioneDiApp('avvioDopoIlSi')}; return avvioDopoIlSi;`)(state);
  const ricevuti = [];
  const finti = { now: () => 50_000 };
  const aggiornaSegmento = new Function('state', 'assicuraInvolucroSegmento', 'segmentiRinviati', 'segmentoVivo', 'avvioDopoIlSi', 'performance', 'Date',
    `${funzioneDiApp('aggiornaRiassuntoSegmento')}; return aggiornaRiassuntoSegmento;`)(
    state, () => {}, new Set(), () => false, avvio, { now: () => 1_000 }, finti);

  const segmento = { voci: [], wrapper: { aggiorna: (x) => ricevuti.push(x) }, inizio: null };
  const altro = { voci: [], wrapper: null, inizio: null };
  const batch = { segmento };
  const info = { batch, stato: 'running', avviatoAlle: 46_000, richiestaConsenso: null };
  state.realSession.toolCallNomi.set('c-1', info);
  state.realSession.toolCallNomi.set('c-0', { batch, stato: 'done', avviatoAlle: 44_000 });
  state.realSession.toolCallNomi.set('c-x', { batch: { segmento: altro }, stato: 'running', avviatoAlle: 1, consensoChiesto: true });

  assert.equal(avvio(segmento), null, 'nessuna carta chiesta: niente «dopo il sì»');
  segnaConsenso('c-1', 'req-1');
  assert.equal(info.richiestaConsenso, 'req-1');
  assert.equal(info.consensoChiesto, true);
  assert.equal(avvio(segmento), null, 'la carta è ancora aperta: è attesa, non «dopo il sì»');
  info.richiestaConsenso = null; // il «sì»
  assert.equal(avvio(segmento), 44_000, 'l’avvio più vecchio del SUO segmento (non quello di un altro segmento)');
  state.realSession.inRigiocata = true;
  assert.equal(avvio(segmento), null, 'durante la rigiocata non si misura niente');
  state.realSession.inRigiocata = false;
  state.realSession.chiusaDalServer = true;
  assert.equal(avvio(segmento), null, 'una sessione chiusa dal server non ha niente in corso');
  state.realSession.chiusaDalServer = false;

  aggiornaSegmento(segmento);
  assert.equal(segmento.inizio, 1_000 - 6_000, 'sull’orologio della vista: adesso meno i 6 s passati dall’avvio vero');
  assert.deepEqual(ricevuti.at(-1), { vivo: false, misurato: true, inizio: -5_000 });
  info.stato = 'done';
  const fermo = { voci: [], wrapper: { aggiorna: (x) => ricevuti.push(x) }, inizio: null };
  info.batch = { segmento: fermo };
  aggiornaSegmento(fermo);
  assert.deepEqual(ricevuti.at(-1), { vivo: false, misurato: false, inizio: null }, 'finito il comando, una rigiocata resta non misurata');
});

/*
 * Revisione del blocco interfaccia (05/11/2026 sera, difetto MEDIA del pezzo 3): al confine `talos.fine-rigiocata` app.js spegne
 * `inRigiocata`, riassume i segmenti rinviati e SOLO DOPO spegne `deferHistoricalRendering`. Con il rinvio fra i divieti di
 * `avvioDopoIlSi`, il riassunto del confine non misurava il segmento chiuso dalla carta, e la testa restava «concluso» fino al
 * risultato del comando. Qui i tre passi si rigiocano NELL'ORDINE in cui stanno nel sorgente del confine (letto da app.js, non
 * scritto a mano): se qualcuno li riordina, la prova segue. Rossa su 24a70233a: `{misurato:false, inizio:null}`.
 * Revisione del 05/11/2026 sera (BASSO): `segmentoVivo` era finto e rispondeva sempre `false`, quindi il ramo `vivo` subito dopo il
 * confine non era mai provato. Ora è quello VERO di app.js, col segmento attivo del flusso: al confine il rinvio è ancora acceso
 * (non vivo, misurato dall'avvio vero), e al primo aggiornamento dopo la riga è viva e TIENE quell'avvio invece di ripartire da adesso.
 */
test('UX175-N1g — ricarica vera: il confine della rigiocata riassume col rinvio ancora acceso, e il segmento approvato si misura dall’avvio vero', () => {
  const inizioConfine = sorgenteApp.indexOf("if (evento.type === 'CUSTOM' && evento.name === 'talos.fine-rigiocata') {");
  assert.ok(inizioConfine >= 0, 'app.js ha il blocco del confine');
  const confine = sorgenteApp.slice(inizioConfine, sorgenteApp.indexOf('\n    }\n', inizioConfine));
  const passi = [
    ['inRigiocata', confine.indexOf('state.realSession.inRigiocata = false;')],
    ['riassunto', confine.indexOf('aggiornaSegmentiRinviati(')],
    ['rinvio', confine.indexOf('state.realSession.deferHistoricalRendering = false;')],
  ];
  for (const [nome, dove] of passi) assert.ok(dove >= 0, `il confine ha il passo ${nome}`);
  passi.sort((a, b) => a[1] - b[1]);

  const state = { realSession: { toolCallNomi: new Map(), inRigiocata: true, chiusaDalServer: false, deferHistoricalRendering: true } };
  const rinviati = new Set();
  const avvio = new Function('state', `${funzioneDiApp('avvioDopoIlSi')}; return avvioDopoIlSi;`)(state);
  const vivo = new Function('state', `${funzioneDiApp('segmentoVivo')}; return segmentoVivo;`)(state);
  const aggiornaSegmento = new Function('state', 'assicuraInvolucroSegmento', 'segmentiRinviati', 'segmentoVivo', 'avvioDopoIlSi', 'performance', 'Date',
    `${funzioneDiApp('aggiornaRiassuntoSegmento')}; return aggiornaRiassuntoSegmento;`)(
    state, () => {}, rinviati, vivo, avvio, { now: () => 2_000 }, { now: () => 60_000 });
  const aggiornaRinviati = new Function('segmentiRinviati', 'aggiornaRiassuntoSegmento', `${funzioneDiApp('aggiornaSegmentiRinviati')}; return aggiornaSegmentiRinviati;`)(
    rinviati, aggiornaSegmento);

  const ricevuti = [];
  const segmento = { voci: [], wrapper: { card: { isConnected: true }, aggiorna: (x) => ricevuti.push(x) }, inizio: null };
  state.realSession.segmentoAttivo = segmento; // il giro è ancora aperto: la rigiocata lascia attivo il suo ultimo segmento
  // gli eventi rigiocati rifanno la chiamata: la carta è stata chiesta, il «sì» l'ha liberata, gira dal secondo 57
  state.realSession.toolCallNomi.set('c-1', { batch: { segmento }, stato: 'running', avviatoAlle: 57_000, richiestaConsenso: null, consensoChiesto: true });
  aggiornaSegmento(segmento); // durante la storia: rinviato, non riassunto
  assert.equal(rinviati.has(segmento), true);
  assert.equal(ricevuti.length, 0);

  const esegui = { inRigiocata: () => { state.realSession.inRigiocata = false; }, riassunto: () => aggiornaRinviati(null), rinvio: () => { state.realSession.deferHistoricalRendering = false; } };
  for (const [nome] of passi) esegui[nome]();

  assert.equal(passi.findIndex(([n]) => n === 'riassunto') < passi.findIndex(([n]) => n === 'rinvio'), true,
    'nel sorgente il riassunto viene prima dello spegnimento del rinvio (se cambia, questa prova va riletta)');
  assert.deepEqual(ricevuti.at(-1), { vivo: false, misurato: true, inizio: 2_000 - 3_000 }, 'misurato dai 3 s passati dall’avvio vero, non «concluso»');
  assert.equal(rinviati.has(segmento), false);
  aggiornaSegmento(segmento); // il primo evento dal vivo dopo il confine
  assert.deepEqual(ricevuti.at(-1), { vivo: true, misurato: true, inizio: 2_000 - 3_000 }, 'subito dopo il confine la riga è viva e tiene l’avvio vero, non riparte da adesso');
  const precedente = { voci: [], wrapper: { card: { isConnected: true }, aggiorna: (x) => ricevuti.push(x) }, inizio: null };
  aggiornaSegmento(precedente); // AL CONTRARIO: un segmento già chiuso del giro, senza chiamate dopo la carta, non è vivo
  assert.deepEqual(ricevuti.at(-1), { vivo: false, misurato: false, inizio: null });
});

test('UX175-N1d — AL CONTRARIO: dopo una carta, solo la chiamata che l’ha aspettata e gira riaccende il segmento; un ragionamento in corso no', () => {
  const s = scena();
  s.passo({ tipo: 'reasoning', id: 'r-1', stato: 'in-corso', testo: '', durataMs: null, dopoIlSi: true }, CHIUSO);
  assert.equal(s.leggi().stato, 'concluso', 'un ragionamento non è la chiamata approvata (mutante a della revisione)');
  s.passo(voce('in-corso', true, false), CHIUSO);
  assert.notEqual(s.leggi().stato, 'vivo', 'mentre aspetta la carta la testa dice l’attesa, non «vivo»');
  s.passo(voce('fallito', false, false), CHIUSO);
  assert.equal(s.leggi().occupata, 'false');
  assert.equal(finto.attese(), 0);
});
