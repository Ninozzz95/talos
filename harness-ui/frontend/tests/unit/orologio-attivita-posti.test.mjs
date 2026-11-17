/*
 * P6 (11/11/2026), giro dei gialli (revisore dell'11/11, R4): l'orologio dell'attività tiene l'elenco dei suoi posti
 * (`postiOrologioAttivita`, legacy/app.js) invece di cercare `[data-attivita-da]` in tutto il documento. Un posto STACCATO dalla pagina
 * (una chat lasciata, un gruppo ridisegnato) deve uscire dall'elenco al battito dopo, anche se dentro ha ancora i suoi secondi: se
 * restasse, l'orologio continuerebbe a scrivere su nodi che nessuno vede e non si spegnerebbe mai. Un mutante che toglieva il controllo
 * `isConnected` restava vivo: questa prova lo ferma. La funzione vera si legge da app.js (niente copia), con un orologio finto.
 * Concorrenti: pi non ridisegna una riga uguale (`packages/tui/src/tui-alt-screen.ts:1752`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

function orologio() {
  const inizio = APP.indexOf('  let orologioAttivita = null;');
  const fine = APP.indexOf('  function segnaTempoBatch(', inizio);
  assert.ok(inizio > 0 && fine > inizio, 'il blocco dell orologio dell attività c è in app.js');
  const timer = new Map(); let prossimo = 1;
  const window = {
    setInterval: (fn) => { const id = prossimo++; timer.set(id, fn); return id; },
    clearInterval: (id) => { timer.delete(id); },
  };
  const segnati = [];
  const segnaDurataAttivita = (nodo) => { segnati.push(nodo.nome); };
  const crea = new Function('window', 'segnaDurataAttivita',
    `${APP.slice(inizio, fine)}\nreturn { accendiOrologioAttivita, postiOrologioAttivita, acceso: () => orologioAttivita !== null };`);
  const o = crea(window, segnaDurataAttivita);
  return { ...o, segnati, timer, battito: () => { for (const fn of [...timer.values()]) fn(); } };
}

/* un posto: un contenitore coi suoi nodi dei secondi; `attaccato` dice se sta ancora nella pagina */
const posto = (nome, nodi, attaccato = true) => ({
  nome, isConnected: attaccato,
  matches: () => false,
  querySelectorAll: () => nodi.map((n) => ({ nome: `${nome}/${n}` })),
});

test('OROLOGIO-POSTI-01 — un posto staccato dalla pagina esce dall elenco al battito dopo, anche coi secondi dentro; a elenco vuoto l orologio si spegne', () => {
  const o = orologio();
  const vivo = posto('vivo', ['t1']);
  const staccato = posto('staccato', ['t2']);
  o.accendiOrologioAttivita(vivo);
  o.accendiOrologioAttivita(staccato);
  assert.equal(o.postiOrologioAttivita.size, 2);
  assert.equal(o.timer.size, 1, 'un orologio solo per tutti i posti');
  o.battito();
  assert.deepEqual(o.segnati, ['vivo/t1', 'staccato/t2'], 'attaccati entrambi: si contano entrambi');
  staccato.isConnected = false; // la chat è stata lasciata: il nodo esce dalla pagina con i suoi secondi ancora dentro
  o.segnati.length = 0;
  o.battito();
  assert.deepEqual(o.segnati, ['vivo/t1'], 'un posto staccato non si conta più');
  assert.equal(o.postiOrologioAttivita.has(staccato), false, 'e esce dall elenco');
  assert.equal(o.acceso(), true, 'il posto vivo tiene acceso l orologio');
  vivo.isConnected = false;
  o.battito();
  assert.equal(o.postiOrologioAttivita.size, 0, 'staccato anche l ultimo: elenco vuoto');
  assert.equal(o.acceso(), false, 'a elenco vuoto l orologio si spegne');
  assert.equal(o.timer.size, 0);
});

test('OROLOGIO-POSTI-02 — un posto attaccato senza più secondi da contare esce anche lui; un nodo dei secondi passato da solo si conta', () => {
  const o = orologio();
  const vuoto = posto('vuoto', []);
  const nodo = { nome: 'nodo', isConnected: true, matches: (s) => s === '[data-attivita-da]', querySelectorAll: () => [] };
  o.accendiOrologioAttivita(vuoto);
  o.accendiOrologioAttivita(nodo);
  o.battito();
  assert.deepEqual(o.segnati, ['nodo']);
  assert.equal(o.postiOrologioAttivita.has(vuoto), false);
  assert.equal(o.acceso(), true);
});
