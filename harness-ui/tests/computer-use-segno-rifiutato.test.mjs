/*
 * Giudice v1793-v1794 (13/11/2026), seconda cura della bolla: il segno di TALOS (cursore e bordo) smette di vedersi (protezione dalle catture rifiutata, guscio
 * chiuso: `desktop/segno-finestra.mjs`, `quandoCambia(false)`) mentre l'aiutante GIRA già partito con `--no-overlay`. Prima della cura sullo schermo non restava
 * nessun cursore fino al prossimo avvio dell'aiutante (5 minuti fermo, o un riavvio). Ora il server chiude SOLO quell'aiutante al confine del passo (la
 * chiamata in volo finisce intera), la chiamata dopo lo riapre senza `--no-overlay` e il compito continua; se il riavvio non riesce il compito si ferma con
 * la sua frase, mai senza cursore. Hermes riavvia l'aiutante prima della chiamata dopo quando la sessione non è più attiva
 * (`tools/computer_use/cua_backend_session.py:476-479`, «(re)starting before call»). Nessuna prova tocca lo schermo: processo dell'aiutante in memoria.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { creaAiutanteMcp } from '../src/computer-use/aiutante-mcp.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { EVENTI } from '../src/computer-use/ciclo.mjs';
import { processoAiutanteInMemoria } from './fixtures/processo-aiutante-in-memoria.mjs';

const VARIABILE = 'TALOS_SEGNO_ACCESO';
const BYTE = Buffer.from('aiutante finto in memoria');
const IMPRONTA = createHash('sha256').update(BYTE).digest('hex');
const giro = () => new Promise((ok) => setImmediate(ok));
const giri = async (n = 5) => { for (let i = 0; i < n; i += 1) await giro(); };

/** Il cliente vero col processo in memoria: gli argomenti di ogni avvio, i processi, le righe di registro. `riavvioRotto` fa fallire gli avvii dopo il primo. */
function cliente({ segnoAcceso = true, trattieni = [], riavvioRotto = null, alRicevere = null } = {}) {
  const ambiente = segnoAcceso ? { [VARIABILE]: '1' } : {};
  const avvii = []; const processi = []; const righe = [];
  let byte = BYTE;
  const avvia = (_exe, args) => {
    avvii.push(args);
    if (riavvioRotto === 'avvio' && avvii.length > 1) throw new Error('avvio finto fallito');
    const f = processoAiutanteInMemoria({ trattieni, alRicevere }); processi.push(f); return f;
  };
  const a = creaAiutanteMcp({ exe: 'C:/finto/cua-driver.exe', improntaAttesa: IMPRONTA, leggi: async () => byte, avvia, ambiente, registro: (r) => righe.push(r) });
  return { a, ambiente, avvii, processi, righe, cambiaByte: () => { byte = Buffer.from('un altro binario'); } };
}
/** Il guscio dice «il segno non si vede più»: `child-bootstrap.mjs` toglie la variabile, poi il server lo dice all'aiutante. */
function segnoSpento(c) { delete c.ambiente[VARIABILE]; c.a.segnoCambiato?.(); }

test('SEGNO-RIF-01 (a) nessuna chiamata in volo: l\'aiutante partito con `--no-overlay` si chiude SUBITO, e la chiamata dopo lo riapre col suo cursore', async () => {
  const c = cliente();
  assert.deepEqual(await c.a.apri(), { ok: true });
  const fine = c.a.compito();
  assert.equal((await c.a.chiama('list_windows', {})).ok, true);
  segnoSpento(c);
  await giri();
  assert.equal(c.processi[0].chiuso, true, 'chiuso con la chiusura della specifica (ingresso chiuso), non lasciato acceso senza cursore');
  /* giro 6 della bolla (14/11): a compito in corso l'aiutante riparte SUBITO col suo cursore, senza aspettare la chiamata dopo (prima: `vivo` false fino ad allora) */
  for (let i = 0; i < 500 && !(c.avvii.length === 2 && c.a.stato().vivo); i += 1) await giro();
  assert.deepEqual([c.avvii, c.a.stato().vivo], [[['mcp', '--no-overlay'], ['mcp']], true], 'riaperto subito, col suo cursore');
  const dopo = await c.a.chiama('list_windows', {});
  assert.equal(dopo.ok, true, 'il passo dopo trova l\'aiutante riaperto');
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp']], 'riaperto SENZA `--no-overlay`: il cursore dell\'aiutante torna');
  assert.equal(c.righe.length, 1, 'una riga di registro del server');
  assert.match(c.righe[0], /computer-use/u);
  assert.doesNotMatch(c.righe[0], /[A-Z]:[\\/]|cua-driver\.exe/u, 'nessun percorso nella riga');
  fine(); c.a.chiudi();
});

test('SEGNO-RIF-02 (b) una chiamata in volo finisce INTERA: niente chiusura a metà clic, poi chiusura e riavvio col cursore dell\'aiutante', async () => {
  const c = cliente({ trattieni: ['click'] });
  await c.a.apri();
  const fine = c.a.compito();
  const inVolo = c.a.chiama('click', { x: 10, y: 20 });
  await giri();
  assert.ok(c.processi[0].inSospeso.has('click'), 'il clic è in volo');
  segnoSpento(c);
  await giri();
  assert.equal(c.processi[0].chiuso, false, 'mai chiuso a metà chiamata');
  assert.equal(c.processi[0].ucciso, false);
  assert.equal(c.a.stato().vivo, true);
  c.processi[0].rilascia('click');
  const r = await inVolo;
  assert.equal(r.ok, true, 'il clic in volo finisce intero, con la sua risposta');
  assert.deepEqual(r.dati, { fatto: 'click' });
  await giri();
  assert.equal(c.processi[0].chiuso, true, 'finita la chiamata, l\'aiutante si chiude');
  assert.equal((await c.a.chiama('list_windows', {})).ok, true);
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp']]);
  assert.equal(c.righe.length, 1);
  fine(); c.a.chiudi();
});

test('SEGNO-RIF-03 (c) riavvio che fallisce (avvio, impronta, app chiusa): ogni chiamata dopo è rifiutata, nessuna azione parte senza cursore', async () => {
  for (const caso of ['avvio', 'impronta', 'chiuso']) {
    const c = cliente({ riavvioRotto: caso === 'avvio' ? 'avvio' : null });
    await c.a.apri();
    const fine = c.a.compito();
    if (caso === 'impronta') c.cambiaByte();
    segnoSpento(c);
    if (caso === 'chiuso') c.a.chiudiPerSempre();
    await giri();
    const r = await c.a.chiama('click', { x: 1, y: 1 });
    assert.equal(r.ok, false, caso);
    assert.equal(r.errore, 'cursor-not-restored', `${caso}: il compito sa che il cursore non si poteva rimettere`);
    const ancora = await c.a.chiama('list_windows', {});
    assert.equal(ancora.errore, 'cursor-not-restored', `${caso}: anche la chiamata dopo, mai un «non partito» qualsiasi`);
    assert.equal(c.processi.flatMap((p) => p.ricevute).filter((x) => x.nome === 'click').length, 0, `${caso}: nessun clic`);
    fine(); c.a.chiudi();
  }
});

test('SEGNO-RIF-04 (d) aiutante partito già col suo cursore (senza `--no-overlay`): il segno che si spegne non lo chiude, nessun riavvio inutile', async () => {
  const c = cliente({ segnoAcceso: false });
  await c.a.apri();
  const fine = c.a.compito();
  segnoSpento(c);
  await giri();
  assert.equal(c.processi[0].chiuso, false);
  assert.equal(c.a.stato().vivo, true);
  assert.equal((await c.a.chiama('list_windows', {})).ok, true);
  assert.deepEqual(c.avvii, [['mcp']]);
  assert.deepEqual(c.righe, []);
  fine(); c.a.chiudi();
});

test('SEGNO-RIF-05 (e) il segno ancora acceso, detto più volte: nulla si chiude e nulla riparte; un aiutante fermo non si accende', async () => {
  const c = cliente();
  c.a.segnoCambiato?.();
  assert.deepEqual(c.avvii, [], 'nessun aiutante acceso: il segno non lo fa partire');
  await c.a.apri();
  for (let i = 0; i < 3; i += 1) c.a.segnoCambiato?.();
  await giri();
  assert.equal(c.processi[0].chiuso, false);
  assert.equal((await c.a.chiama('list_windows', {})).ok, true);
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay']]);
  assert.deepEqual(c.righe, []);
  c.a.chiudi();
});

// ---------- il compito intero: regge il riavvio, o si ferma con la sua frase ----------
function sessione(risposte, quandoPensa) {
  const eventi = []; let n = 0;
  return {
    eventi,
    valore: {
      testoDellaPersona: 'Apri il Blocco note e scrivi ciao', sessionId: 's-segno',
      chiediModello: async () => { quandoPensa?.(n); const r = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(r), usage: { prompt_tokens: 10, completion_tokens: 5 } }; },
      emetti: (nome, dati) => eventi.push({ nome, dati }),
    },
  };
}
const esegui = (ospite, s) => ospite(NOME_COMPUTER_USE, { task: 'type hello in Notepad' },
  { fase: 'esegui', toolCallId: 'call-segno', segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno', sessione: s.valore });
const SCRIVI = { actions: [{ type: 'type', ref: 'e1', text: 'ciao' }] };

test('SEGNO-RIF-06 il compito regge il riavvio: lo stato sta nel server, il passo dopo rilegge lo schermo, il gettone vecchio è rifiutato e il compito finisce', async () => {
  const c = cliente();
  // il segno smette di vedersi mentre il modello pensa: nessuna chiamata all'aiutante in volo, quindi si chiude subito
  const s = sessione([SCRIVI, SCRIVI, { done: { success: true, note: 'typed' } }], (n) => { if (n === 0) segnoSpento(c); });
  const r = await esegui(creaOspiteComputerUse({ aiutante: c.a, ridimensiona: null }), s);
  assert.equal(r.ok, true, r.testo);
  assert.match(r.testo, /^Computer use finished: succeeded/u);
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp']], 'riaperto una volta, col cursore dell\'aiutante');
  assert.equal(c.processi[0].ricevute.filter((x) => x.nome === 'type_text').length, 0, 'nessuna azione dopo il segno spento sul vecchio aiutante');
  const scritte = c.processi[1].ricevute.filter((x) => x.nome === 'type_text');
  assert.ok(scritte.length >= 1, 'il compito continua sul nuovo aiutante');
  assert.ok(c.processi[1].ricevute.some((x) => x.nome === 'get_window_state'), 'il passo dopo rifà la foto dello schermo');
  assert.equal(c.processi[0].chiuso, true);
  c.a.chiudi();
});

test('SEGNO-RIF-07 il riavvio fallisce a metà compito: il compito si FERMA con la frase del cursore, nessuna azione dopo, e lo schermo della persona lo dice', async () => {
  const c = cliente({ riavvioRotto: 'avvio' });
  const s = sessione([SCRIVI, SCRIVI, { done: { success: true, note: 'typed' } }], (n) => { if (n === 0) segnoSpento(c); });
  const r = await esegui(creaOspiteComputerUse({ aiutante: c.a, ridimensiona: null }), s);
  assert.equal(r.ok, false, r.testo);
  assert.match(r.testo, /^Computer use stopped: the helper's cursor could not be put back on the screen/u, r.testo);
  assert.equal(c.processi.flatMap((p) => p.ricevute).filter((x) => x.nome === 'type_text').length, 0, 'nessuna azione senza cursore');
  const fine = s.eventi.find((e) => e.nome === EVENTI.esito || e.nome === EVENTI.fermato);
  assert.ok(fine, 'il compito chiude con un esito');
  assert.equal(fine.dati.motivo, 'aiutante-assente');
  assert.equal(fine.dati.assenza, 'cursore', 'lo schermo della persona riceve il perché: il cursore');
  c.a.chiudi();
});

/** Le risposte che l'attrezzo riceve dall'aiutante, in fila: l'attrezzo chiama `aiutante.chiama` a ogni passo, quindi l'involucro le vede tutte. */
function contaRisposte(a) {
  const risposte = []; const vera = a.chiama;
  a.chiama = async (nome, ...resto) => { const r = await vera(nome, ...resto); risposte.push({ nome, ok: r.ok, errore: r.errore }); return r; };
  return risposte;
}

test('SEGNO-RIF-08 compito intero, il segno si spegne MENTRE la scrittura è in volo: la scrittura finisce intera sul vecchio aiutante, poi si riapre col cursore', async () => {
  const gancio = {};
  const c = cliente({ alRicevere: (nome) => gancio.quando?.(nome) });
  gancio.quando = (nome) => { if (nome === 'type_text' && c.processi.length === 1) segnoSpento(c); };
  const risposte = contaRisposte(c.a);
  const s = sessione([SCRIVI, { done: { success: true, note: 'typed' } }]);
  const r = await esegui(creaOspiteComputerUse({ aiutante: c.a, ridimensiona: null }), s);
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(risposte.filter((x) => x.nome === 'type_text'), [{ nome: 'type_text', ok: true, errore: null }], 'la scrittura in volo ha la sua risposta, non «closed»');
  assert.equal(c.processi[0].ricevute.filter((x) => x.nome === 'type_text').length, 1);
  assert.equal(c.processi[0].chiuso, true, 'finita la scrittura, il vecchio aiutante si chiude');
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay'], ['mcp']], 'il passo dopo lo riapre col suo cursore');
  c.a.chiudi();
});

/** Il compito che si ferma per il cursore: frase al modello, esito con `assenza: 'cursore'` allo schermo della persona, nessuna scrittura. */
function fermoPerIlCursore(c, s, r) {
  assert.equal(r.ok, false, r.testo);
  assert.match(r.testo, /^Computer use stopped: the helper's cursor could not be put back on the screen/u, r.testo);
  assert.doesNotMatch(r.testo, /turn it on|Settings/u);
  assert.equal(c.processi.flatMap((p) => p.ricevute).filter((x) => x.nome === 'type_text').length, 0, 'nessuna azione senza cursore');
  const fine = s.eventi.filter((e) => e.nome === EVENTI.esito || e.nome === EVENTI.fermato);
  assert.equal(fine.length, 1);
  assert.equal(fine[0].dati.assenza, 'cursore');
}

test('SEGNO-RIF-11 il riavvio trova un altro binario (impronta): il compito si ferma con la frase del cursore, mai con «accendilo in Impostazioni»', async () => {
  const c = cliente();
  const s = sessione([SCRIVI, SCRIVI, { done: { success: true, note: 'typed' } }], (n) => { if (n === 0) { c.cambiaByte(); segnoSpento(c); } });
  fermoPerIlCursore(c, s, await esegui(creaOspiteComputerUse({ aiutante: c.a, ridimensiona: null }), s));
  c.a.chiudi();
});

test('SEGNO-RIF-12 il segno si spegne fra le due letture dello schermo e il riavvio fallisce alla seconda: il compito si ferma lo stesso con la frase del cursore', async () => {
  const gancio = {};
  const c = cliente({ riavvioRotto: 'avvio', alRicevere: (nome) => gancio.quando?.(nome) });
  let liste = 0;
  gancio.quando = (nome) => { if (nome === 'list_windows' && (liste += 1) === 2) segnoSpento(c); };
  const s = sessione([{ actions: [{ type: 'wait', seconds: 0 }] }, SCRIVI, { done: { success: true, note: 'typed' } }]);
  fermoPerIlCursore(c, s, await esegui(creaOspiteComputerUse({ aiutante: c.a, ridimensiona: null }), s));
  assert.ok(c.processi[0].ricevute.filter((x) => x.nome === 'list_windows').length >= 2, 'la seconda lettura è partita sul vecchio aiutante');
  c.a.chiudi();
});

test('SEGNO-RIF-10 compito intero col segno che resta acceso, detto di nuovo a metà: nessun riavvio, il compito finisce col solo cursore di TALOS', async () => {
  const c = cliente();
  const s = sessione([SCRIVI, { done: { success: true, note: 'typed' } }], () => { c.a.segnoCambiato?.(); });
  const r = await esegui(creaOspiteComputerUse({ aiutante: c.a, ridimensiona: null }), s);
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(c.avvii, [['mcp', '--no-overlay']]);
  assert.equal(c.processi[0].chiuso, false);
  c.a.chiudi();
});

test('SEGNO-RIF-09 compito intero con l\'aiutante partito già col suo cursore: il segno che si spegne a metà non lo riavvia, il compito finisce sullo stesso processo', async () => {
  const c = cliente({ segnoAcceso: false });
  const s = sessione([SCRIVI, { done: { success: true, note: 'typed' } }], (n) => { if (n === 0) segnoSpento(c); });
  const r = await esegui(creaOspiteComputerUse({ aiutante: c.a, ridimensiona: null }), s);
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(c.avvii, [['mcp']], 'un solo avvio: nessun riavvio inutile');
  assert.equal(c.processi[0].chiuso, false);
  assert.deepEqual(c.righe, []);
  c.a.chiudi();
});
