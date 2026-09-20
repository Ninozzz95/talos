import test from 'node:test';
import assert from 'node:assert/strict';
import { tonoDaTitolo, messaggioUmano, TONI, MASSIMO_IN_PILA } from '../../src/components/toast.js';

// 05/9 T-16 — il toast del mockup: tono dal titolo, testo umano (H22), durate.

test('TOAST-TONO: il titolo del monolite decide il badge', () => {
  assert.equal(tonoDaTitolo('Invio non riuscito'), 'guasto');
  assert.equal(tonoDaTitolo('Comando non eseguito'), 'guasto');
  assert.equal(tonoDaTitolo('Memoria non liberata'), 'guasto');
  assert.equal(tonoDaTitolo('Copiato'), 'riuscito');
  assert.equal(tonoDaTitolo('Sessione esportata'), 'riuscito');
  assert.equal(tonoDaTitolo('Ripresa della sessione'), 'nota');
  assert.equal(tonoDaTitolo(''), 'nota');
});

test('TOAST-H22: le stringhe grezze del browser diventano una frase che dice cosa fare', () => {
  assert.equal(messaggioUmano('Failed to fetch'), 'Il server non risponde. Controlla che TALOS sia avviato e riprova.');
  assert.equal(messaggioUmano(new TypeError('Failed to fetch')), 'Il server non risponde. Controlla che TALOS sia avviato e riprova.');
  assert.equal(messaggioUmano('NetworkError when attempting to fetch resource.'), 'Il server non risponde. Controlla che TALOS sia avviato e riprova.');
  assert.equal(messaggioUmano('TypeError: x is not a function'), 'x is not a function');
  assert.equal(messaggioUmano('503'), "Il server ha risposto con l'errore 503.");
  assert.equal(messaggioUmano('Il file esiste già.'), 'Il file esiste già.'); // il verso contrario: una frase umana passa intatta
  assert.equal(messaggioUmano(null), '');
});

test('TOAST-DURATE: ricerca 05/09 — minimo 5 s, i guasti restano, al più tre', () => {
  for (const [tono, t] of Object.entries(TONI)) {
    if (tono === 'guasto') assert.equal(t.durata, 0, 'il guasto resta finché non lo chiudi');
    else assert.ok(t.durata >= 5000, `${tono} dura almeno 5 s`);
  }
  assert.equal(TONI.guasto.ruolo, 'alert');
  assert.equal(TONI.nota.ruolo, 'status');
  assert.equal(MASSIMO_IN_PILA, 3);
});

/*
 * BC-77 (a) — il pavimento della pila: l'ingombro VERO della zona dei comandi.
 * Qui si provano i due rami che la prova nel browser non puo' mettere in scena a comando: la vista
 * chiusa (il piede c'e' nel DOM ma non si vede) e l'assenza del piede.
 */
function finestraFinta(altezza) {
  return { innerHeight: altezza, addEventListener() {}, removeEventListener() {} };
}
function radiceFinta() {
  const scritte = {};
  return { scritte, style: { setProperty(k, v) { scritte[k] = v; } } };
}

/*
 * 18/09/2026 - QUI C'ERANO LE DUE PROVE DI `ancoraToastSopraIComandi` (BC-77: il fondo della pila
 * dei toast era l'ingombro del piede, misurato; e il suo verso contrario, piede piatto o assente).
 * L'owner ha revocato quella cura - «un toast si comporta come un toast, sempre in fondo allo
 * schermo, e se sono piu di uno si stackano uno sopra l'altro» - e la funzione e uscita con l'ordine
 * (nessun chiamante). Le prove escono con lei: non si riscrivono per far numero. La prova della
 * REGOLA NUOVA sta dove si vede: `tests/browser/toast-non-copre-i-comandi.spec.mjs`, che ora misura
 * che la pila sta in fondo e impila.
 */