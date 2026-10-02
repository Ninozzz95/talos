/*
 * PO-10 (owner 28/09/2026) — le schede AGENTE del Terminale, in sola lettura: una per giro («Agente · giro N»), i comandi di
 * quel giro in fila ($ comando, uscita, esito). Fonte: gli stessi eventi del pannello Processi (`processiDagliEventi`), più il
 * TESTO dell'uscita: dal vivo da `ToolCallOutput` (effimero, D-10B) e alla fine da `ToolCallResult.content` (salvato: la
 * scheda si ricostruisce riaprendo la sessione). Memoria: decisione-owner-po-10-schede-agente-sola-lettura-28-09.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { schedeAgenteDagliEventi, idSchedaAgente, RIGHE_VIVE_AGENTE, testoSchedaAgente, rigaEsitoComandoAgente } from '../../src/components/terminale-agente.js';

const avvio = (id, giro, nome = 'shell') => ({ type: 'ToolCallStart', toolCallId: id, toolCallName: nome, giro });
const argomenti = (id, comando) => ({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando }) });
const pezzo = (id, delta) => ({ type: 'ToolCallOutput', toolCallId: id, delta });
const esito = (id, content, extra = {}) => ({ type: 'ToolCallResult', toolCallId: id, content, uscita: 0, durataMs: 1200, cwd: 'C:/progetto', ...extra });

test('TA-01 — una scheda per giro, in ordine di giro, coi comandi del giro in fila', () => {
  const schede = schedeAgenteDagliEventi([
    avvio('a', 1), argomenti('a', 'npm test'), esito('a', 'tutti verdi\n'),
    avvio('b', 1), argomenti('b', 'git status'), esito('b', 'pulito'),
    avvio('c', 2), argomenti('c', 'ls'), esito('c', 'a.txt', { uscita: 2 }),
  ]);
  assert.deepEqual(schede.map((s) => [s.terminalId, s.origine, s.giro, s.comandi.map((c) => c.comando)]), [
    ['agente-giro-1', 'agente', 1, ['npm test', 'git status']],
    ['agente-giro-2', 'agente', 2, ['ls']],
  ]);
  const [primo] = schede[0].comandi;
  assert.equal(primo.testo, 'tutti verdi\n');
  assert.equal(primo.uscita, 0);
  assert.equal(primo.cwd, 'C:/progetto');
  assert.equal(primo.durataMs, 1200);
  assert.equal(schede[1].comandi[0].uscita, 2);
  assert.equal(schede[0].stato, 'terminato', 'nessun comando in corso: la scheda è ferma');
  assert.equal(idSchedaAgente(3), 'agente-giro-3');
});

test('TA-02 — dal vivo: i pezzi di ToolCallOutput si accumulano (solo la coda), e spariscono quando arriva l\'esito', () => {
  const eventi = [avvio('a', 4), argomenti('a', 'npm run build'), pezzo('a', 'riga 1\n'), pezzo('a', 'riga 2\n')];
  let [scheda] = schedeAgenteDagliEventi(eventi);
  assert.equal(scheda.stato, 'live', 'un comando in corso accende la scheda');
  assert.equal(scheda.comandi[0].stato, 'in-corso');
  assert.equal(scheda.comandi[0].vivo, 'riga 1\nriga 2\n');
  assert.equal(scheda.comandi[0].testo, null, 'l\'esito non c\'è ancora');

  const tante = Array.from({ length: RIGHE_VIVE_AGENTE + 25 }, (_, i) => pezzo('a', `r${i}\n`));
  [scheda] = schedeAgenteDagliEventi([...eventi, ...tante]);
  const righe = scheda.comandi[0].vivo.split('\n').filter(Boolean);
  assert.equal(righe.length, RIGHE_VIVE_AGENTE, 'si tiene la coda, non tutto');
  assert.equal(righe.at(-1), `r${RIGHE_VIVE_AGENTE + 24}`);

  [scheda] = schedeAgenteDagliEventi([...eventi, esito('a', 'fatto')]);
  assert.equal(scheda.comandi[0].vivo, '', 'l\'uscita viva lascia il posto a quella vera');
  assert.equal(scheda.comandi[0].testo, 'fatto');
  assert.equal(scheda.stato, 'terminato');
});

test('TA-03 — solo i comandi: gli altri attrezzi non fanno schede, e un giro senza comandi non ha scheda', () => {
  const schede = schedeAgenteDagliEventi([
    avvio('x', 1, 'leggi'), { type: 'ToolCallArgs', toolCallId: 'x', delta: '{"percorso":"a.txt"}' }, esito('x', 'contenuto'),
    avvio('y', 2, 'prova'), esito('y', 'ok'),
  ]);
  assert.deepEqual(schede.map((s) => s.terminalId), ['agente-giro-2'], '`prova` lancia la suite: è un comando');
});

test('TA-04 — riaperta la sessione (niente ToolCallOutput, sono effimeri) la scheda si ricostruisce dall\'esito salvato', () => {
  const [scheda] = schedeAgenteDagliEventi([avvio('a', 1), argomenti('a', 'echo ciao'), esito('a', 'ciao')]);
  assert.equal(scheda.comandi[0].testo, 'ciao');
  assert.equal(scheda.comandi[0].vivo, '');
});

test('TA-05 — una scheda chiusa a mano non torna, finché il suo giro non lancia un comando nuovo', () => {
  const eventi = [avvio('a', 1), argomenti('a', 'ls'), esito('a', 'x'), avvio('b', 2), argomenti('b', 'pwd'), esito('b', '/')];
  const chiuse = new Map([['agente-giro-1', 1]]); // id → quanti comandi c'erano quando è stata chiusa
  assert.deepEqual(schedeAgenteDagliEventi(eventi, { chiuse }).map((s) => s.terminalId), ['agente-giro-2']);
  const conNuovo = [...eventi, avvio('c', 1), argomenti('c', 'whoami')];
  assert.deepEqual(schedeAgenteDagliEventi(conNuovo, { chiuse }).map((s) => s.terminalId), ['agente-giro-1', 'agente-giro-2'],
    'un comando nuovo nello stesso giro la riapre: nasconderlo sarebbe tacere');
});

test('TA-06 — un comando rifiutato all\'approvazione resta in fila e dice che non è partito', () => {
  const [scheda] = schedeAgenteDagliEventi([avvio('a', 1), argomenti('a', 'rm -rf build'), esito('a', 'REFUSED', { rifiutato: true, uscita: undefined })]);
  assert.equal(scheda.comandi[0].stato, 'non-eseguito');
  assert.equal(scheda.stato, 'terminato');
});

test('TA-07 — un comando senza giro dichiarato finisce nella scheda «agente» senza numero, non si perde', () => {
  const schede = schedeAgenteDagliEventi([avvio('a', null), argomenti('a', 'date'), esito('a', 'oggi')]);
  assert.deepEqual(schede.map((s) => [s.terminalId, s.giro]), [['agente', null]]);
});

test('TA-08 — un comando che tace da molto (in attesa) tiene la scheda accesa', () => {
  const eventi = [{ ...avvio('a', 1), ricevutoA: 1_000 }, argomenti('a', 'npm run dev')];
  const [scheda] = schedeAgenteDagliEventi(eventi, { adesso: 1_000 + 10 * 60_000 });
  assert.equal(scheda.comandi[0].stato, 'in-attesa');
  assert.equal(scheda.stato, 'live');
});

test('TA-CONSENSO — 02/10/2026: un comando che aspetta il consenso tiene VIVA la sua scheda (il giro non è finito)', () => {
  const [scheda] = schedeAgenteDagliEventi([
    avvio('a', 1), argomenti('a', 'ping -c 60 127.0.0.1'),
    { type: 'ApprovalRequested', requestId: 'r1', toolCallId: 'a' },
  ]);
  assert.equal(scheda.comandi[0].stato, 'in-consenso');
  assert.equal(scheda.stato, 'live', 'prima del 02/10 la riga diceva «in corso» e la scheda era viva: deve restarlo');
});

/* ── PO-10 passo 2 (02/10/2026): il cablaggio vuole tre cose in più dal modello ── */

test('TA-09 — i comandi «!» della PERSONA non entrano nelle schede agente (owner 02/10/2026)', () => {
  const schede = schedeAgenteDagliEventi([
    { ...avvio('io', 1), chi: 'tu' }, argomenti('io', 'ping -n 3 127.0.0.1'), esito('io', 'exit 0\nok'),
    avvio('ag', 1), argomenti('ag', 'npm test'), esito('ag', 'exit 0\nverde'),
  ]);
  assert.deepEqual(schede.flatMap((s) => s.comandi.map((c) => c.comando)), ['npm test']);
});

test('TA-10 — l’uscita tenuta FUORI dagli eventi (app.js non conserva il content) vince, e dal vivo se ne tiene la coda', () => {
  const eventi = [avvio('a', 1), argomenti('a', 'npm run build'), { type: 'ToolCallResult', toolCallId: 'a', uscita: 0 }];
  const [finita] = schedeAgenteDagliEventi(eventi, { uscite: new Map([['a', { testo: 'exit 0\ncostruito' }]]) });
  assert.equal(finita.comandi[0].testo, 'exit 0\ncostruito');
  const lunga = Array.from({ length: RIGHE_VIVE_AGENTE + 5 }, (_, i) => `r${i}`).join('\n');
  const [viva] = schedeAgenteDagliEventi(eventi.slice(0, 2), { uscite: new Map([['a', { vivo: lunga }]]) });
  assert.equal(viva.comandi[0].testo, null);
  assert.equal(viva.comandi[0].vivo.split('\n').length, RIGHE_VIVE_AGENTE);
});

test('TA-11 — l’esito della scheda: in corso, conclusa, con errori; un annullato non è un errore (come i Processi)', () => {
  const tre = (u) => [avvio('a', 1), argomenti('a', 'x'), esito('a', `exit ${u}\n`, { uscita: u })];
  assert.equal(schedeAgenteDagliEventi(tre(0))[0].esito, 'concluso');
  assert.equal(schedeAgenteDagliEventi(tre(1))[0].esito, 'con-errori');
  assert.equal(schedeAgenteDagliEventi(tre(130))[0].esito, 'concluso', 'fermato apposta: non è un guasto');
  assert.equal(schedeAgenteDagliEventi([avvio('a', 1), argomenti('a', 'x')])[0].esito, 'in-corso');
});

test('TA-12 — il testo per la xterm: $ comando, l’uscita senza le righe per il modello, la riga d’esito; righe CRLF', () => {
  const testo = testoSchedaAgente({ comandi: [
    { comando: 'npm test', stato: 'riuscito', durataMs: 1200, testo: 'exit 0 [sandbox: none]\n[TALOS output reference: 849de2b1-d1cf-4099-ab0c-146b601c58f0; retained 5 of 5 bytes.]\nverde\n\n\n' },
    { comando: 'rm -rf build', stato: 'non-eseguito', testo: 'REFUSED. The person denied it.' },
    { comando: 'npm run dev', stato: 'in-corso', testo: null, vivo: 'in ascolto su 5173' },
    { comando: 'ping', stato: 'in-consenso', testo: null, vivo: '' },
  ] });
  const righe = testo.split('\r\n');
  assert.equal(testo.includes('\n') && !/[^\r]\n/u.test(testo), true, 'ogni a capo è \r\n: la xterm non converte da sola');
  assert.equal(testo.startsWith('\x1b[?25l'), true, 'in sola lettura il cursore si nasconde (DECTCEM), anche dopo un reset');
  /* le righe vuote in coda all'uscita («verde\n\n\n») non staccano l'esito dal suo comando */
  assert.deepEqual(righe.map((r) => r.replace(/\x1b\[[?0-9;]*[A-Za-z]/gu, '')), [
    '$ npm test', 'verde', '— Riuscito · su Windows, senza isolamento · 1.2 s', '',
    '$ rm -rf build', '— Non eseguito: il comando non è partito', '',
    '$ npm run dev', 'in ascolto su 5173', '',
    '$ ping', '— Aspetta il tuo consenso', '',
  ]);
  assert.doesNotMatch(testo, /TALOS output reference|REFUSED|exit 0/u, 'niente testo per il modello a schermo');
  assert.equal(rigaEsitoComandoAgente({ stato: 'in-corso', testo: null }), null, 'mentre gira la riga d’esito non c’è');
  assert.equal(testoSchedaAgente({ comandi: [] }), '');
});

test('TA-13 — un’uscita tolta dalla memoria (tetti di app.js) lo dice, e la riga d’esito resta dalla testata', () => {
  const eventi = [avvio('a', 1), argomenti('a', 'npm test'), { type: 'ToolCallResult', toolCallId: 'a', uscita: 0 }];
  const [scheda] = schedeAgenteDagliEventi(eventi, { uscite: new Map([['a', { vivo: '', testo: 'exit 0 [sandbox: none]', sfrattato: true }]]) });
  const testo = testoSchedaAgente(scheda).replace(/\x1b\[[0-9;]*m/gu, '');
  assert.match(testo, /uscita non più tenuta in questa pagina/u);
  assert.match(testo, /— Riuscito/u);
});
