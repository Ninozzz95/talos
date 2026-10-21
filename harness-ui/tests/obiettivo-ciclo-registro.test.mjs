/*
 * ⭐⭐⭐ /goal, fase G4 — IL CICLO NEL REGISTRO VERO (giornale su disco). Owner 14/10/2026 notte: dopo ogni giro le prove, poi
 * «fatto», «tetto», pausa «nessun progresso» o la ripartenza da solo col messaggio dei rossi; il sì al contratto approva i suoi
 * comandi. Il kernel è finto (ogni giro si chiude quando la prova lo dice) e così l'esecutore delle prove.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoApprovazione } from '../src/kernel/talosHarness.mjs';
import { conStore, conversazioneFerma, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const comando = (riga) => ({ testo: `runs ${riga}`, verifica: { tipo: 'comando', comando: riga } });
const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g4-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  /* il ciclo parte dopo un breve rinvio (setTimeout), non a un passo del ciclo degli eventi: si aspetta a tempo */
  /* G5D-REV-01 (20/10/2026): 5 s fissi sono caduti sul runner della release 0.1.31, sotto carico. Il tetto pesa solo quando la prova fallisce: la condizione si guarda ogni 5 ms e si esce appena è vera. */
  const fino = Date.now() + 60_000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
/** Un registro con l'esecutore delle prove finto: `risposte` è una funzione (riga, n) → esito; `permesso` il cancello del motore. */
function banco(cartellaStore, cartella, risposte, opzioni = {}) {
  const chiamate = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async (riga, dove, o) => { chiamate.push(riga); return risposte(riga, chiamate.length, o); },
    ...opzioni,
  });
  return { ...b, chiamate };
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;

test('G4-REG-01 — un giro, le prove rosse ⇒ il ciclo RIPARTE da solo con un messaggio del sistema; al verde ⇒ «fatto», e niente riparte più', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  let verde = false;
  const b = banco(cartellaStore, cartella, () => (verde ? { codice: 0, enforcement: 'none' } : { codice: 1, enforcement: 'none' }));
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'fix the tests', { criteri: [comando('npm test')] });
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === giriPrima + 1, 'il giro della persona parte');
  b.giri.at(-1).concludi(fine);
  // prove rosse ⇒ un giro nuovo, partito dal ciclo
  await aspetta(() => b.giri.length === giriPrima + 2, 'il ciclo riparte da solo');
  const ripresa = b.giri.at(-1).input;
  assert.equal(ripresa.task.origine, 'obiettivo');
  assert.equal(ripresa.task.obiettivoId, stato(b, sessionId).id);
  const ultimo = ripresa.messaggiIniziali.at(-1);
  assert.equal(ultimo.talosOrigin, 'goal-notice', 'un messaggio del sistema, mai della persona');
  assert.match(ultimo.content, /c1 FAILED/u);
  assert.deepEqual(stato(b, sessionId).ciclo, { giri: 1, token: 0, senzaProgresso: 0 });
  // al giro dopo le prove passano ⇒ fatto, e il ciclo si ferma
  verde = true;
  b.giri.at(-1).concludi(fine);
  await aspetta(() => stato(b, sessionId).stato === 'fatto', 'l\'obiettivo diventa fatto');
  assert.equal(stato(b, sessionId).daGuardare, 0);
  await passo(); await passo();
  assert.equal(b.giri.length, giriPrima + 2, 'fatto: niente riparte');
}));

test('G4-REG-02 — i tetti: al numero di giri l\'obiettivo va a «tetto» e niente riparte; tre giri senza progresso ⇒ pausa «nessun progresso»', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, () => ({ codice: 1, enforcement: 'none' }), { tettiCicloObiettivo: { giri: 2 } });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'giro 1');
  b.giri.at(-1).concludi(fine);
  await aspetta(() => b.giri.length === 3, 'il ciclo riparte');
  b.giri.at(-1).concludi(fine);
  await aspetta(() => stato(b, sessionId).stato === 'tetto', 'tetto dei giri');
  assert.deepEqual(stato(b, sessionId).motivo, { tipo: 'giri' });
  await passo(); await passo();
  assert.equal(b.giri.length, 3);
  // un criterio ROSSO: la pausa della G3 («3 tentativi come Hermes») arriva al terzo giro, prima del conto senza progresso
  const r = banco(cartellaStore, cartella, () => ({ codice: 1, enforcement: 'none' }), { tettiCicloObiettivo: { giri: 50 } });
  const s1 = await conversazioneFerma(r);
  await r.registro.impostaObiettivo(s1, 'goal', { criteri: [comando('npm test')] });
  r.registro.resume(s1, 'lavora');
  for (let i = 0; i < 3; i += 1) {
    await aspetta(() => r.giri.length === 2 + i, `rosso, giro ${i + 1}`);
    r.giri.at(-1).concludi(fine);
  }
  // la pausa la scrive la verifica, il conto del ciclo arriva subito dopo: si aspettano tutti e due
  await aspetta(() => stato(r, s1).stato === 'in-pausa' && stato(r, s1).ciclo?.giri === 3, 'pausa dei tentativi');
  assert.deepEqual(stato(r, s1).motivo, { tipo: 'prove-rosse', dettaglio: 'c1' });
  assert.deepEqual(stato(r, s1).ciclo, { giri: 3, token: 0, senzaProgresso: 2 });
  // nessun progresso: un programma che non c'è («non verificabile», non consuma tentativi), nessun file scritto ⇒ dopo tre giri
  // uguali, pausa. ⛔ L'ambiente lo decide il REGISTRO dalla piattaforma (`process.platform`), non l'esecutore finto: su Windows
  // «non c'è» è cmd che esce 1 + `programmaTrovato` falso, su Linux/Android è il 127 della shell (segnalato dalla sessione mobile,
  // 14/10: col solo 1 la prova era rossa sul Pad, e lo sarebbe in una CI Linux)
  const nonCe = process.platform === 'win32' ? 1 : 127;
  const n = banco(cartellaStore, cartella, () => ({ codice: nonCe, enforcement: 'none' }), { tettiCicloObiettivo: { giri: 50 }, programmaTrovatoFn: async () => false });
  const s2 = await conversazioneFerma(n);
  await n.registro.impostaObiettivo(s2, 'goal', { criteri: [comando('npm test')] });
  n.registro.resume(s2, 'lavora');
  for (let i = 0; i < 4; i += 1) {
    await aspetta(() => n.giri.length === 2 + i, `non verificabile, giro ${i + 1}`);
    n.giri.at(-1).concludi(fine);
  }
  await aspetta(() => stato(n, s2).stato === 'in-pausa', 'pausa');
  assert.deepEqual(stato(n, s2).motivo, { tipo: 'nessun-progresso' });
  assert.deepEqual(stato(n, s2).ciclo, { giri: 4, token: 0, senzaProgresso: 3 });
  assert.equal(stato(n, s2).verifica.verdetti[0].motivo.tipo, 'command-not-found');
  await new Promise((fine2) => setTimeout(fine2, 100));
  assert.equal(n.giri.length, 5, 'in pausa: niente riparte');
}));

test('G4-REG-03 — un giro FERMATO dalla persona mette in pausa; un giro fallito mette in pausa col codice; niente riparte', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, () => ({ codice: 1, enforcement: 'none' }));
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'giro');
  b.registro.ferma(sessionId);
  b.giri.at(-1).concludi(fine);
  await aspetta(() => stato(b, sessionId).stato === 'in-pausa', 'pausa della persona');
  assert.deepEqual(stato(b, sessionId).motivo, { tipo: 'persona' });
  assert.equal(b.chiamate.length, 0, 'fermato: nessuna prova');
  assert.equal(b.giri.length, 2);
  /* «Riprendi» a sessione ferma fa ripartire il ciclo DA SOLO (G4-REV-05): prove (rosse) e un giro col messaggio dei rossi, senza
     contare un giro che non c'è stato */
  await b.registro.riprendiObiettivo(sessionId);
  await aspetta(() => b.giri.length === 3, 'il ciclo riparte dopo la ripresa');
  assert.equal(b.chiamate.length, 1, 'la ripresa ha eseguito le prove una volta');
  assert.equal(b.giri.at(-1).input.messaggiIniziali.at(-1).talosOrigin, 'goal-notice');
  assert.equal(stato(b, sessionId).ciclo?.giri ?? 0, 0, 'la ripresa non conta un giro');
  // un giro FALLITO (il fornitore): pausa «errore» col codice, nessuna prova in più, niente riparte — mai un ciclo che ritenta un guasto
  b.giri.at(-1).fallisci('provider-error', fine);
  await aspetta(() => stato(b, sessionId).stato === 'in-pausa', 'pausa per errore');
  assert.deepEqual(stato(b, sessionId).motivo, { tipo: 'errore', dettaglio: 'provider-error' });
  assert.equal(b.chiamate.length, 1, 'fallito: nessuna prova');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(b.giri.length, 3);
}));

test('G4-REG-04 — il sì al contratto RISPONDE alla domanda del cancello per i SUOI comandi; i divieti del cancello restano sovrani', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const domande = [];
  let divieto = false;
  // un cancello finto che CHIEDE (come «chiedi» per la shell), oppure nega da sé (una regola «nega» della persona)
  const permessoDelMotoreFn = async ({ comando: riga }, { chiediApprovazioneFn }) => {
    if (divieto) return { consentito: false, via: 'regola' };
    const risposta = await chiediApprovazioneFn({ tipo: 'shell', comando: riga });
    domande.push(riga);
    /* owner 17/10 sera: la risposta si legge COME LA LEGGE IL KERNEL (`esitoApprovazione`: approva solo `true`). Il cancello finto
       leggeva `risposta?.approvato === true`, cioè la forma del registro: era verde mentre il cancello vero diceva no. */
    return { consentito: esitoApprovazione(risposta).approvato };
  };
  const b = banco(cartellaStore, cartella, () => ({ codice: 0, enforcement: 'none' }), { permessoDelMotoreFn });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  const esito = await b.registro.verificaObiettivo(sessionId);
  assert.equal(esito.verifica.verdetti[0].esito, 'verde', 'approvato col contratto: la domanda ha già il sì');
  assert.deepEqual(domande, ['npm test'], 'il cancello è stato interpellato');
  // AL CONTRARIO 1: il cancello nega da sé ⇒ negato anche se approvato, e niente parte
  divieto = true;
  const negato = await b.registro.verificaObiettivo(sessionId);
  assert.deepEqual(negato.verifica.verdetti[0].motivo, { tipo: 'permission-denied' });
  assert.equal(b.chiamate.length, 1);
}));

test('G4-REG-06 — niente si può verificare (il cancello nega): pausa subito «non verificabile» col motivo, nessun giro pagato (G4-REV-04)', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, () => ({ codice: 0, enforcement: 'none' }), { permessoDelMotoreFn: async () => ({ consentito: false, via: 'livello-lettura' }) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'giro');
  b.giri.at(-1).concludi(fine);
  await aspetta(() => stato(b, sessionId).stato === 'in-pausa', 'pausa');
  assert.deepEqual(stato(b, sessionId).motivo, { tipo: 'non-verificabile', dettaglio: 'permission-denied' });
  assert.equal(b.chiamate.length, 0);
  assert.equal(b.giri.length, 2);
}));

test('G4-REG-05 — la verifica del ciclo RIFIUTATA (un `!` della persona in corso) non ferma il ciclo in silenzio: riprova e, finito il `!`, riparte; finiti i tentativi, pausa col motivo (G4-REV-03)', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const diretti = [];
  const opzioni = {
    eseguiComandoDirettoFn: () => new Promise((fine2) => { diretti.push(fine2); }),
    ritentativiCicloObiettivo: { tentativi: 3, primaMs: 20 },
  };
  const b = banco(cartellaStore, cartella, () => ({ codice: 1, enforcement: 'none' }), opzioni);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'giro');
  assert.deepEqual(b.registro.shell(sessionId, 'npm run build'), { ok: true }); // un `!` che resta in corso a fine giro
  b.giri.at(-1).concludi(fine);
  await new Promise((r) => setTimeout(r, 60)); // il ciclo prova, trova il `!`, aspetta
  assert.equal(b.chiamate.length, 0, 'nessuna prova mentre il `!` lavora');
  assert.equal(stato(b, sessionId).stato, 'attivo');
  diretti.shift()({ codice: 0, testo: '' }); // il `!` finisce: al prossimo tentativo le prove partono e il ciclo riparte
  await aspetta(() => b.giri.length === 3, 'il ciclo riparte dopo il `!`');
  assert.equal(b.chiamate.length, 1);
  // AL CONTRARIO: un `!` che non finisce mai ⇒ finiti i tentativi, pausa «errore» col motivo, mai un obiettivo attivo che nessuno porta
  assert.deepEqual(b.registro.shell(sessionId, 'npm run watch'), { ok: true });
  b.giri.at(-1).concludi(fine);
  await aspetta(() => stato(b, sessionId).stato === 'in-pausa', 'pausa dopo i tentativi');
  assert.deepEqual(stato(b, sessionId).motivo, { tipo: 'cartella-occupata' });
  assert.equal(b.chiamate.length, 1);
  assert.equal(b.giri.length, 3);
}));
