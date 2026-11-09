/*
 * FE-011, strada 1: la barra sopra il compositore. Da due richieste in su, mai in Accesso pieno. La lista mostra i dati interi prima del clic (condizione del Mobile: la pressione
 * conta solo se la persona ha davanti il dato); «Consenti tutte (N)» non conta `shell`, che resta su «Vedi» (tabella del 31/10: fuori R4, irreversibile, chi invia fuori).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { consentiTutte, creaBarraApprovazioni, datoDellaVoce, vociDellaBarra } from '../../src/components/barra-approvazioni.js';

const carta = (requestId, azione, extra = {}) => ({ requestId, azione, approvabileFuori: true, consenti: async () => true, ...extra });
const SCRIVI = carta('a', { tipo: 'scrivi', percorso: 'src/a.js' });
const MODIFICA = carta('b', { tipo: 'file_edit', percorso: 'src/b.js' });
const SHELL = carta('c', { tipo: 'shell', comando: 'git push origin main' });

test('BAR-01 da due richieste in su, con una sola niente barra', () => {
  assert.equal(vociDellaBarra([SCRIVI]).visibile, false);
  assert.equal(vociDellaBarra([]).visibile, false);
  assert.equal(vociDellaBarra([SCRIVI, MODIFICA]).visibile, true);
});

test('BAR-02 in Accesso pieno non c\'è', () => {
  assert.equal(vociDellaBarra([SCRIVI, MODIFICA], { accessoPieno: true }).visibile, false);
});

test('BAR-03 N conta solo ciò che si può consentire: `shell` resta fuori anche col campo vero', () => {
  const b = vociDellaBarra([SCRIVI, SHELL, MODIFICA]);
  assert.equal(b.n, 2);
  assert.deepEqual(b.voci.map((v) => [v.requestId, v.approvabile]), [['a', true], ['c', false], ['b', true]]);
});

test('BAR-04 chiuso di serie: senza campo, senza la porta della carta, o con un nega messo dopo, si va alla carta', () => {
  assert.equal(vociDellaBarra([carta('x', SCRIVI.azione, { approvabileFuori: false }), carta('y', SCRIVI.azione, { approvabileFuori: undefined }), SCRIVI]).n, 1);
  assert.equal(vociDellaBarra([carta('x', SCRIVI.azione, { consenti: null }), SCRIVI]).n, 1);
  assert.equal(vociDellaBarra([SCRIVI, MODIFICA], { perAttrezzo: { scrivi: 'nega' } }).n, 1);
  assert.equal(vociDellaBarra([SCRIVI, MODIFICA], { perAttrezzo: { scrivi: 'sempre' } }).n, 2);
});

test('BAR-05 il dato è intero', () => {
  const lungo = 'src/'.padEnd(230, 'x');
  assert.equal(datoDellaVoce({ percorso: lungo }), lungo);
  assert.equal(datoDellaVoce({ comando: 'npm test' }), 'npm test');
  assert.equal(datoDellaVoce({ tipo: 'library_delete' }), '');
});

test('BAR-06 consentire è una somma di «una volta», in ordine', async () => {
  const ordine = [];
  const voci = ['a', 'b', 'c'].map((id) => ({ requestId: id, approvabile: true, consenti: async () => { ordine.push(id); return true; } }));
  assert.deepEqual(await consentiTutte(voci), { fatte: 3, resta: 0, errore: false });
  assert.deepEqual(ordine, ['a', 'b', 'c']);
});

test('BAR-07 al primo errore ci si ferma: le altre restano da decidere', async () => {
  const ordine = [];
  const voci = ['a', 'b', 'c'].map((id) => ({ requestId: id, approvabile: true, consenti: async () => { ordine.push(id); return id !== 'b'; } }));
  assert.deepEqual(await consentiTutte(voci), { fatte: 1, resta: 2, errore: true });
  assert.deepEqual(ordine, ['a', 'b']);
});

test('BAR-08 una carta risolta altrove mentre si preme si salta; un nega messo a metà ferma quella', async () => {
  const ordine = [];
  const voce = (id) => ({ requestId: id, approvabile: true, azione: { tipo: id === 'c' ? 'scrivi' : 'file_edit' }, consenti: async () => { ordine.push(id); return true; } });
  const esito = await consentiTutte([voce('a'), voce('b'), voce('c')], { aperta: (id) => id !== 'b', vietata: (v) => v.azione.tipo === 'scrivi' });
  assert.deepEqual(ordine, ['a']);
  assert.deepEqual(esito, { fatte: 1, resta: 1, errore: false });
});

test('BAR-09 solo le approvabili partono', async () => {
  const ordine = [];
  await consentiTutte([{ requestId: 'a', approvabile: false, consenti: async () => { ordine.push('a'); return true; } }, { requestId: 'b', approvabile: true, consenti: async () => { ordine.push('b'); return true; } }]);
  assert.deepEqual(ordine, ['b']);
});

function barra(extra = {}) {
  const document = documento();
  const viste = [];
  const premuti = [];
  const b = creaBarraApprovazioni({ document, nomeAzione: (a) => a.tipo, alVedi: (id) => viste.push(id), alConsenti: (voci) => premuti.push(voci.map((v) => v.requestId)), ...extra });
  document.body.append(b.nodo);
  return { b, viste, premuti };
}
const bottone = (n, testo) => n.querySelectorAll('button').find((x) => x.textContent.startsWith(testo));

test('BAR-10 il disegno: nascosta di serie; i dati interi a vista prima del clic', () => {
  const { b } = barra();
  assert.equal(b.nodo.hidden, true);
  b.aggiorna(vociDellaBarra([SCRIVI, MODIFICA]));
  assert.equal(b.nodo.hidden, false);
  assert.match(b.nodo.textContent, /src\/a\.js/u);
  assert.match(b.nodo.textContent, /src\/b\.js/u);
  assert.match(b.nodo.textContent, /2 richieste in attesa/u);
  assert.ok(bottone(b.nodo, 'Consenti tutte (2)'));
  b.aggiorna(vociDellaBarra([]));
  assert.equal(b.nodo.hidden, true);
});

test('BAR-11 il comando si legge e ha il suo «Vedi»; chi chiede si dice', () => {
  const { b, viste } = barra();
  b.aggiorna(vociDellaBarra([SCRIVI, carta('c', SHELL.azione, { chi: 'Revisore' }), MODIFICA]));
  assert.match(b.nodo.textContent, /git push origin main/u);
  assert.match(b.nodo.textContent, /Revisore/u);
  assert.ok(bottone(b.nodo, 'Consenti tutte (2)'));
  clic(bottone(b.nodo, 'Vedi'));
  assert.deepEqual(viste, ['c']);
});

test('BAR-12 con N a zero non c\'è il pulsante: solo «Vedi»', () => {
  const { b } = barra();
  b.aggiorna(vociDellaBarra([SHELL, carta('d', { tipo: 'shell', comando: 'rm -rf build' })]));
  assert.equal(bottone(b.nodo, 'Consenti tutte'), undefined);
  assert.equal(b.nodo.querySelectorAll('button').length, 2);
});

test('BAR-13 il clic passa ciò che la persona ha letto, e un secondo clic in corsa non riparte', () => {
  const { b, premuti } = barra();
  b.aggiorna(vociDellaBarra([SCRIVI, SHELL, MODIFICA]));
  const p = bottone(b.nodo, 'Consenti tutte');
  clic(p);
  clic(p);
  assert.deepEqual(premuti, [['a', 'b']]);
  b.aggiorna(vociDellaBarra([SCRIVI, MODIFICA]));
  assert.equal(bottone(b.nodo, 'Consenti tutte').disabled, false, 'il ridisegno riapre');
});

test('BAR-14 la chat è cablata; gli stili ci sono; la frase dice quante e quante restano', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /card\._approvabileFuori = evento\.approvabileFuori === true/u);
  assert.match(app, /article\._consentiUnaVolta = \(\) => rispondi\(true\)/u);
  assert.match(app, /state\.realSession\.permessiDelGiro/u);
  assert.equal(app.split('aggiornaBarraApprovazioni();').length >= 4, true);
  const main = readFileSync(new URL('../../src/styles/main.css', import.meta.url), 'utf8');
  assert.match(main, /barra-approvazioni\.css/u);
  const chat = readFileSync(new URL('../../src/i18n/testi/chat.js', import.meta.url), 'utf8');
  for (const k of ['approval.bar.pending', 'approval.bar.allowAll', 'approval.bar.see', 'approval.bar.done', 'approval.bar.failed']) assert.equal(chat.split(`'${k}'`).length - 1, 2, k);
});
