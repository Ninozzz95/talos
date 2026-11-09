/*
 * Fase 8 «Impostazioni dalla chat» (owner 01/11/2026, D2) — il LATO FINESTRA della copia sul server delle preferenze
 * (`features/settings/copia-sul-server.js`): applica e risponde con ciò che ha applicato davvero; solo per le finestre del PC; all'avvio
 * vince la copia più nuova; nessun eco mentre applica; gli aggiornamenti automatici solo nell'app installata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaCopiaSulServer, CHIAVE_REVISIONE_VISTA } from '../../src/features/settings/copia-sul-server.js';

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
}
function finestraFinta({ aspetto = { themePreset: 'forge', uiDensity: 'compatta', motionSpeed: 100 }, server = { revisione: 0, valori: {} }, aggiornamenti = null } = {}) {
  const posts = [];
  const aperte = [];
  const patch = [];
  const stato = { aspetto: { ...aspetto } };
  let copia = null;
  copia = creaCopiaSulServer({
    apiGet: async () => structuredClone(server),
    apiPost: async (percorso, corpo) => { posts.push({ percorso, corpo }); return percorso.endsWith('/applied') ? { accettata: true } : { revisione: server.revisione + 1 }; },
    leggiAspetto: () => ({ ...stato.aspetto }),
    /* come `aggiornaAspettoDesktop`: normalizza (un tema sconosciuto non passa) e annuncia il salvataggio, che chiama `dopoCambioDellaPersona` */
    applicaPatch: (p) => { patch.push(p); for (const [k, v] of Object.entries(p)) if (!(k === 'themePreset' && v === 'neon')) stato.aspetto[k] = v; copia.dopoCambioDellaPersona(); },
    finestra: { __talosAggiornamenti: aggiornamenti, open: (u) => aperte.push(u) },
    memoria: memoria(),
    attesaInvioMs: 5,
  });
  return { copia, posts, aperte, patch, stato };
}

test('COPIA-F-01: l\'evento per le finestre del PC si applica e si risponde con ciò che è stato applicato davvero, senza eco', async () => {
  const f = finestraFinta();
  const r = await f.copia.suEvento({ type: 'talos.impostazioni-finestra', destinatario: 'finestre-pc', richiestaId: 'r1', revisione: 4, valori: { themePreset: 'paper' } });
  assert.deepEqual(r, { applicati: { themePreset: 'paper' }, nonApplicati: {} });
  assert.deepEqual(f.posts, [{ percorso: '/api/v1/app-settings/window/applied', corpo: { richiestaId: 'r1', applicati: { themePreset: 'paper' } } }]);
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(f.posts.length, 1, 'applicare non rimanda la copia (niente eco)');
  /* un valore che la finestra normalizza via: risponde con ciò che resta */
  const rifiutato = await f.copia.suEvento({ type: 'talos.impostazioni-finestra', destinatario: 'finestre-pc', richiestaId: 'r2', revisione: 5, valori: { themePreset: 'neon' } });
  assert.deepEqual(rifiutato.applicati, { themePreset: 'paper' })
});

test('COPIA-F-02 (Mobile 1): un evento senza il destinatario «finestre-pc» non si applica', async () => {
  const f = finestraFinta();
  assert.equal(await f.copia.suEvento({ type: 'talos.impostazioni-finestra', destinatario: 'telefono', richiestaId: 'r1', valori: { themePreset: 'paper' } }), null);
  assert.equal(await f.copia.suEvento({ type: 'talos.notifica', destinatario: 'finestre-pc', richiestaId: 'r1', valori: { themePreset: 'paper' } }), null);
  assert.equal(f.patch.length, 0);
  assert.equal(f.posts.length, 0);
});

test('COPIA-F-03: all\'avvio vince la copia più nuova; altrimenti la finestra manda la sua', async () => {
  const nuova = finestraFinta({ server: { revisione: 7, valori: { themePreset: 'calm', uiDensity: 'compatta', sconosciuto: 1 } } });
  assert.deepEqual(await nuova.copia.avvio(), { esito: 'applicata', campi: ['themePreset'] });
  assert.equal(nuova.stato.aspetto.themePreset, 'calm');
  const vecchia = finestraFinta({ server: { revisione: 0, valori: {} } });
  assert.deepEqual(await vecchia.copia.avvio(), { esito: 'mandata' });
  assert.deepEqual(vecchia.posts[0], { percorso: '/api/v1/app-settings/window', corpo: { valori: { themePreset: 'forge', uiDensity: 'compatta', motionSpeed: 100 } } });
  const giù = creaCopiaSulServer({ apiGet: async () => { throw new Error('rete'); }, apiPost: async () => ({}), leggiAspetto: () => ({}), applicaPatch: () => {}, memoria: memoria() });
  assert.deepEqual(await giù.avvio(), { esito: 'non-raggiunto' });
  assert.equal(CHIAVE_REVISIONE_VISTA, 'talos.harness.desktop.settings.copy.v1');
});

/* Treno 02/11 (Frontend): la copia mandata a ogni apertura era una scrittura non chiesta a ogni pagina (183 nella suite del browser). */
test('COPIA-F-11: già allineata, l\'apertura non scrive; un cambio rimasto indietro si manda alla prossima apertura, una volta sola', async () => {
  const mem = memoria();
  let rete = true;
  const posts = [];
  const crea = () => creaCopiaSulServer({
    apiGet: async () => ({ revisione: 3, valori: { themePreset: 'forge' } }),
    apiPost: async (p, corpo) => { if (!rete) throw new Error('rete'); posts.push(corpo); return { revisione: 3 }; },
    leggiAspetto: () => ({ themePreset: 'calm' }), applicaPatch: () => {}, finestra: {}, memoria: mem, attesaInvioMs: 1,
  });
  mem.setItem(CHIAVE_REVISIONE_VISTA, '3');
  // valori diversi dal server ma nessun cambio della persona: la finestra NON scrive
  assert.deepEqual(await crea().avvio(), { esito: 'allineata' });
  assert.equal(posts.length, 0);
  // la persona cambia offline: l'invio fallisce e il cambio resta indietro
  rete = false;
  crea().dopoCambioDellaPersona();
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(posts.length, 0);
  // alla riapertura, con la rete, si manda; alla successiva no
  rete = true;
  assert.deepEqual(await crea().avvio(), { esito: 'mandata' });
  assert.equal(posts.length, 1);
  assert.deepEqual(await crea().avvio(), { esito: 'allineata' });
  assert.equal(posts.length, 1);
});

/* Treno 02/11: l'evento «salvato» scatta anche per chat e spazi di lavoro. */
test('COPIA-F-12: un salvataggio che non cambia i valori non scrive; un cambio vero sì, e tornare al valore mandato non riscrive', async () => {
  const f = finestraFinta({ server: { revisione: 5, valori: { themePreset: 'forge' } } });
  await f.copia.avvio(); // revisione nuova: allineata
  f.copia.dopoCambioDellaPersona();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.posts.length, 0, 'niente è cambiato: niente scrittura');
  f.stato.aspetto.themePreset = 'calm';
  f.copia.dopoCambioDellaPersona();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].corpo.valori.themePreset, 'calm');
  f.copia.dopoCambioDellaPersona();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.posts.length, 1, 'già mandato: niente doppione');
});

test('COPIA-F-04: dopo i cambi della persona la copia parte una volta sola', async () => {
  const f = finestraFinta();
  for (let i = 0; i < 5; i++) f.copia.dopoCambioDellaPersona();
  await new Promise((ok) => setTimeout(ok, 30));
  assert.equal(f.posts.length, 1);
});

/*
 * Revisione avversaria della fase 8, REV8-05 (S3): all'avvio lo stato del guscio (`__talosAggiornamenti`) arriva DOPO (did-finish-load);
 *   prima il campo della copia si perdeva (la revisione si segnava lo stesso) e il primo invio della persona lo riscriveva col valore del
 *   guscio — il cambio approvato sulla carta (D7) non arrivava mai. Ora resta da parte, si chiede al guscio appena c'è, e finché il guscio
 *   non risponde la finestra manda il valore della copia, non quello vecchio.
 */
function finestraConGuscioInRitardo({ copiaServer = false, conEventi = false } = {}) {
  const posts = [];
  const aperte = [];
  const ascolti = new Map();
  const finestra = { open: (u) => aperte.push(u), ...(conEventi ? { addEventListener: (nome, fn) => ascolti.set(nome, fn) } : {}) };
  const mem = memoria();
  mem.setItem(CHIAVE_REVISIONE_VISTA, '3');
  const copia = creaCopiaSulServer({
    apiGet: async () => ({ revisione: 5, valori: { themePreset: 'paper', aggiornamentiAutomatici: copiaServer } }),
    apiPost: async (percorso, corpo) => { posts.push({ percorso, corpo }); return { revisione: 6 }; },
    leggiAspetto: () => ({ themePreset: 'forge' }), applicaPatch: () => {}, finestra, memoria: mem, attesaInvioMs: 0,
  });
  const arrivaIlGuscio = (stato) => { finestra.__talosAggiornamenti = stato; ascolti.get('talos:aggiornamenti')?.({ detail: stato }); };
  return { copia, posts, aperte, arrivaIlGuscio, mem };
}
const pausa = (ms = 20) => new Promise((ok) => setTimeout(ok, ms));

test('COPIA-F-06 (REV8-05) il guscio arriva dopo l\'avvio: il cambio della copia gli si chiede una volta, e il primo invio della persona non lo riscrive', async () => {
  const f = finestraConGuscioInRitardo({ copiaServer: false });
  await f.copia.avvio();
  assert.equal(f.aperte.length, 0, 'senza guscio non si chiede niente');
  f.arrivaIlGuscio({ automatici: true, gettone: 'g' });
  f.copia.dopoCambioDellaPersona(); await pausa();
  assert.deepEqual(f.aperte, ['talos-desktop://aggiornamenti?azione=automatici&acceso=0&gettone=g'], 'il guscio riceve la richiesta approvata sulla carta');
  assert.equal(f.posts.at(-1).corpo.valori.aggiornamentiAutomatici, false, 'la finestra manda il valore della copia, non quello vecchio del guscio');
  f.copia.dopoCambioDellaPersona(); await pausa();
  assert.equal(f.aperte.length, 1, 'una richiesta sola');
});

test('COPIA-F-07 (REV8-05) con l\'evento del guscio: la richiesta parte all\'arrivo dello stato; dopo la sua risposta vale di nuovo il guscio', async () => {
  const f = finestraConGuscioInRitardo({ copiaServer: false, conEventi: true });
  await f.copia.avvio();
  f.arrivaIlGuscio({ automatici: true, gettone: 'g' });
  assert.deepEqual(f.aperte, ['talos-desktop://aggiornamenti?azione=automatici&acceso=0&gettone=g'], 'chiesto all\'arrivo, senza aspettare un cambio della persona');
  f.arrivaIlGuscio({ automatici: false, gettone: 'g' }); // il guscio conferma
  f.copia.dopoCambioDellaPersona(); await pausa();
  assert.equal(f.posts.length, 0, 'il guscio ha confermato il valore della copia: niente è cambiato, niente scrittura (treno 02/11)');
  f.arrivaIlGuscio({ automatici: true, gettone: 'g' }); // la persona riaccende dal pannello: il guscio è la verità
  f.copia.dopoCambioDellaPersona(); await pausa();
  assert.equal(f.posts.at(-1).corpo.valori.aggiornamentiAutomatici, true);
  assert.equal(f.aperte.length, 1);
});

test('COPIA-F-08 (REV8-05) già uguale, o nel browser: niente richiesta; nel browser la copia resta quella approvata', async () => {
  const uguale = finestraConGuscioInRitardo({ copiaServer: true, conEventi: true });
  await uguale.copia.avvio();
  uguale.arrivaIlGuscio({ automatici: true, gettone: 'g' });
  assert.equal(uguale.aperte.length, 0, 'il guscio ha già il valore');
  const browser = finestraConGuscioInRitardo({ copiaServer: false });
  await browser.copia.avvio();
  browser.copia.dopoCambioDellaPersona(); await pausa();
  assert.equal(browser.aperte.length, 0);
  assert.equal(browser.posts.at(-1).corpo.valori.aggiornamentiAutomatici, false, 'il 4174 non riscrive il valore approvato');
});

test('COPIA-F-09 (REV8-05) un cambio più nuovo dal flusso prende il posto di quello da parte: il guscio non riceve il valore vecchio', async () => {
  const f = finestraConGuscioInRitardo({ copiaServer: false, conEventi: true });
  await f.copia.avvio();
  await f.copia.suEvento({ type: 'talos.impostazioni-finestra', destinatario: 'finestre-pc', richiestaId: 'r9', valori: { aggiornamentiAutomatici: true } });
  f.arrivaIlGuscio({ automatici: true, gettone: 'g' });
  assert.deepEqual(f.aperte, [], 'niente «spegni» vecchio dopo un «accendi» più nuovo');
});

test('COPIA-F-10 (REV8-05, controllo positivo) col guscio già pronto all\'avvio: si chiede una volta sola, come prima', async () => {
  const f = finestraConGuscioInRitardo({ copiaServer: false });
  f.arrivaIlGuscio({ automatici: true, gettone: 'g' })
  await f.copia.avvio();
  f.copia.dopoCambioDellaPersona(); await pausa();
  assert.deepEqual(f.aperte, ['talos-desktop://aggiornamenti?azione=automatici&acceso=0&gettone=g']);
});

test('COPIA-F-05: gli aggiornamenti automatici si chiedono al guscio col suo gettone; nel browser la risposta dice che non ci sono', async () => {
  const app = finestraFinta({ aggiornamenti: { automatici: true, gettone: 'g1' } });
  const r = await app.copia.suEvento({ type: 'talos.impostazioni-finestra', destinatario: 'finestre-pc', richiestaId: 'r1', valori: { aggiornamentiAutomatici: false } });
  assert.deepEqual(app.aperte, ['talos-desktop://aggiornamenti?azione=automatici&acceso=0&gettone=g1']);
  assert.deepEqual(r.applicati, { aggiornamentiAutomatici: false });
  const browser = finestraFinta();
  const nel4174 = await browser.copia.suEvento({ type: 'talos.impostazioni-finestra', destinatario: 'finestre-pc', richiestaId: 'r2', valori: { aggiornamentiAutomatici: false } });
  assert.match(nel4174.nonApplicati.aggiornamentiAutomatici, /only in the installed TALOS app/u);
  assert.equal(browser.aperte.length, 0);
});
