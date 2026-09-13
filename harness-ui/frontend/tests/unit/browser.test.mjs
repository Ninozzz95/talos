import test from 'node:test';
import assert from 'node:assert/strict';
import { hostDaUrl, titoloDaLettura, urlApribile, formattaProvenienza, prossimaDopoChiusura, statoHttpDiLettura, titoloDaHtml, titoloScheda } from '../../src/components/browser.js';

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

test('BROWSER-PROVENIENZA: «Agente · 05/09, 10:42 (Roma) · 365 caratteri»', () => {
  const pagina = { url: 'https://example.org/documentazione', testo: 'x'.repeat(365), quando: '2026-09-05T08:42:00.000Z' };
  assert.equal(formattaProvenienza(pagina), 'Agente · 05/09, 10:42 (Roma) · 365 caratteri');
  assert.equal(formattaProvenienza({ url: 'http://localhost:5173/', tipo: 'viva', origine: 'tu', quando: '2026-09-05T08:42:00.000Z' }), 'Tu · 05/09, 10:42 (Roma)');
});

test('BROWSER-CHIUSURA: chi resta attiva', () => {
  assert.equal(prossimaDopoChiusura(['a', 'b', 'c'], 1), 'c');
  assert.equal(prossimaDopoChiusura(['a', 'b', 'c'], 2), 'b');
  assert.equal(prossimaDopoChiusura(['a'], 0), null);
});

/*
 * ⛔ 07/09/2026, owner (screenshot): la striscia in alto ripeteva «HTTP 200 · https://…» su ogni
 *   linguetta, e sotto c'era la STESSA lista in forma di cronologia. Le schede ora si comportano
 *   come quelle di un browser: nome vero della pagina, e lo stato scritto solo quando non è 2xx.
 */
const LETTURA_GITHUB = {
  url: 'https://github.com/Ninozzz95/talos',
  testo: 'HTTP 200 · https://github.com/Ninozzz95/talos\n<html><head><title>Ninozzz95/talos: A local-first agent</title></head>',
};
const LETTURA_API = {
  url: 'https://api.github.com/repos/x/y',
  testo: 'HTTP 415 · https://api.github.com/repos/x/y\n{"message":"Unsupported"}',
};

test('SCHEDA-NOME: il `<title>` della pagina batte il rigo «HTTP 200 · url»', () => {
  assert.equal(titoloScheda(LETTURA_GITHUB), 'Ninozzz95/talos: A local-first agent');
  assert.equal(statoHttpDiLettura(LETTURA_GITHUB), 200);
});

test('SCHEDA-NOME, al contrario: senza `<title>` resta l’host, mai il rigo di stato', () => {
  assert.equal(titoloScheda(LETTURA_API), 'api.github.com/repos/x/y');
  assert.equal(statoHttpDiLettura(LETTURA_API), 415, 'il 415 va mostrato: è l’unico caso che merita la pillola');
  assert.equal(titoloDaHtml('niente html qui'), '');
  assert.equal(statoHttpDiLettura({ testo: 'una pagina qualunque' }), null);
});

test('SCHEDA-NOME: entità e spazi del `<title>` si leggono come li legge una persona', () => {
  assert.equal(titoloDaHtml('<title>\n  Cose &amp; cose  \n</title>'), 'Cose & cose');
  assert.equal(titoloDaHtml(`<title>${'x'.repeat(200)}</title>`).length, 80);
});

test('SCHEDA-NOME: il titolo dichiarato dal server vince su tutto', () => {
  assert.equal(titoloScheda({ titolo: 'Quello vero', url: 'https://x.dev', testo: '<title>altro</title>' }), 'Quello vero');
});

/*
 * ⛔ 08/09/2026 — le due regole del nome di una scheda sono DIVERSE, e vanno provate come tali.
 *   Fino a oggi `titoloScheda` faceva `hostDaUrl(url) || titoloDaLettura(pagina)`: su un URL valido
 *   l'host vince sempre, quindi `titoloDaLettura` non veniva MAI raggiunta — codice morto, e le
 *   schede di un testo acquisito si chiamavano tutte come il sito invece che come il loro contenuto.
 *   Trovato dal cancello di parità appena è tornato a girare (era rotto dal commit `d706c8fe`).
 *   ⛔ La prova sopra («senza `<title>` resta l'host») resta valida e non si tocca: parla di una
 *     pagina SCARICATA, che porta il rigo «HTTP … · url». È l'altro caso.
 */
test('SCHEDA-NOME: un testo ACQUISITO dall’agente si chiama con la sua prima riga, non col sito', () => {
  const lettura = { url: 'https://example.org/documentazione', testo: 'Registro dei processi\n\nIl registro raccoglie i processi avviati.' };
  assert.equal(titoloScheda(lettura), 'Registro dei processi');
  assert.equal(statoHttpDiLettura(lettura), null, 'un testo acquisito non ha rigo di stato: è ciò che distingue i due casi');
});

test('SCHEDA-NOME, al contrario: due letture dello stesso sito NON si chiamano più uguali', () => {
  const uno = { url: 'https://example.org', testo: 'Pagina iniziale del progetto\n\nBenvenuto.' };
  const due = { url: 'https://example.org/documentazione', testo: 'Registro dei processi\n\nAltro.' };
  assert.notEqual(titoloScheda(uno), titoloScheda(due),
    'due schede indistinguibili costringono ad aprirle per sapere quale è quale');
});

test('SCHEDA-NOME: un testo VUOTO non inventa un nome — ripiega sull’host', () => {
  assert.equal(titoloScheda({ url: 'https://example.org/x', testo: '' }), 'example.org/x');
});
