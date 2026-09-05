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
