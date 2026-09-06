import test from 'node:test';
import assert from 'node:assert/strict';
import { hostDaUrl, titoloDaLettura, urlApribile, formattaProvenienza, etichettaCronologia, prossimaDopoChiusura } from '../../src/components/browser.js';

// K-I (06/09) — il Browser a schede: indirizzi, titoli, provenienza nel formato del mockup.

test('BROWSER-HOST: host e percorso corto, senza barra finale', () => {
  assert.equal(hostDaUrl('https://example.org/documentazione/'), 'example.org/documentazione');
  assert.equal(hostDaUrl('https://example.org/'), 'example.org');
  assert.equal(hostDaUrl('http://localhost:5173/app'), 'localhost:5173/app');
  assert.equal(hostDaUrl('non url'), 'non url');
});

test('BROWSER-TITOLO: la prima riga del testo, troncata a 80; altrimenti l’host; il titolo dichiarato vince', () => {
  assert.equal(titoloDaLettura({ url: 'https://example.org/documentazione', testo: 'Registro dei processi\n\nIl registro…' }), 'Registro dei processi');
  assert.equal(titoloDaLettura({ url: 'https://example.org', testo: '' }), 'example.org');
  assert.equal(titoloDaLettura({ url: 'https://x.org', testo: 'a'.repeat(100) }).length, 80);
  assert.equal(titoloDaLettura({ url: 'https://x.org', testo: 'ignorato', titolo: 'Dev server' }), 'Dev server');
});

test('BROWSER-URL: localhost e 127.0.0.1 in http, il resto in https; una frase non è un indirizzo', () => {
  assert.equal(urlApribile('localhost:5173'), 'http://localhost:5173/');
  assert.equal(urlApribile('127.0.0.1:8000/app'), 'http://127.0.0.1:8000/app');
  assert.equal(urlApribile('example.org/docs'), 'https://example.org/docs');
  assert.equal(urlApribile('http://example.org'), 'http://example.org/');
  assert.equal(urlApribile('cerca qualcosa'), null);
  assert.equal(urlApribile('ftp://x.org'), null);
  assert.equal(urlApribile('pippo'), null);
  assert.equal(urlApribile(''), null);
});

test('BROWSER-PROVENIENZA: «Agente · 05/09, 10:42 (Roma) · 365 caratteri» e la riga della cronologia', () => {
  const pagina = { url: 'https://example.org/documentazione', testo: 'x'.repeat(365), quando: '2026-09-05T08:42:00.000Z' };
  assert.equal(formattaProvenienza(pagina), 'Agente · 05/09, 10:42 (Roma) · 365 caratteri');
  assert.equal(etichettaCronologia(pagina, 1), '02 · Agente · 10:42');
  assert.equal(formattaProvenienza({ url: 'http://localhost:5173/', tipo: 'viva', origine: 'tu', quando: '2026-09-05T08:42:00.000Z' }), 'Tu · 05/09, 10:42 (Roma)');
});

test('BROWSER-CHIUSURA: chi resta attiva', () => {
  assert.equal(prossimaDopoChiusura(['a', 'b', 'c'], 1), 'c');
  assert.equal(prossimaDopoChiusura(['a', 'b', 'c'], 2), 'b');
  assert.equal(prossimaDopoChiusura(['a'], 0), null);
});
