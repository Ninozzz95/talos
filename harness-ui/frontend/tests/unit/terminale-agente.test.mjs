/*
 * PO-10 (owner 28/09/2026) → BUG-23 (owner 05/10/2026): le schede AGENTE del Terminale, in sola lettura.
 * BUG-23 sostituisce la scheda per giro («Agente · giro N») con UNA scheda «agente» per sessione: i comandi di
 * tutti i giri in fila, un separatore attenuato «── giro N ──» prima del primo comando di ogni giro, il giro
 * CORRENTE sul record (lo mostra il piede, non la linguetta). Il pallino dice l'esito dell'ULTIMO giro.
 * Forma Cline/Hermes: comandi in fila ($ comando, uscita, esito), niente tastiera, si chiude a mano.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { schedeAgenteDagliEventi, idSchedaAgente, RIGHE_VIVE_AGENTE, testoSchedaAgente, rigaEsitoComandoAgente } from '../../src/components/terminale-agente.js';

const avvio = (id, giro, nome = 'shell') => ({ type: 'ToolCallStart', toolCallId: id, toolCallName: nome, giro });
const argomenti = (id, comando) => ({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando }) });
const pezzo = (id, delta) => ({ type: 'ToolCallOutput', toolCallId: id, delta });
const esito = (id, content, extra = {}) => ({ type: 'ToolCallResult', toolCallId: id, content, uscita: 0, durataMs: 1200, cwd: 'C:/progetto', ...extra });

test('BUG23-01 — UNA scheda «agente» per sessione attraverso più giri: comandi in fila, giro corrente sull\'ultimo', () => {
  const schede = schedeAgenteDagliEventi([
    avvio('a', 1), argomenti('a', 'npm test'), esito('a', 'tutti verdi\n'),
    avvio('b', 1), argomenti('b', 'git status'), esito('b', 'pulito'),
    avvio('c', 2), argomenti('c', 'ls'), esito('c', 'a.txt', { uscita: 2 }),
  ]);
  assert.deepEqual(schede.map((s) => s.terminalId), ['agente'], 'una sola scheda, non una per giro');
  const [sola] = schede;
  assert.equal(sola.origine, 'agente');
  assert.equal(sola.giro, 2, 'il giro CORRENTE (dell\'ultimo comando): lo mostra il piede');
  assert.deepEqual(sola.comandi.map((c) => c.comando), ['npm test', 'git status', 'ls']);
  assert.deepEqual(sola.comandi.map((c) => c.giro), [1, 1, 2], 'ogni comando sa il suo giro: serve al separatore');
  const [primo] = sola.comandi;
  assert.equal(primo.testo, 'tutti verdi\n');
  assert.equal(primo.uscita, 0);
  assert.equal(primo.cwd, 'C:/progetto');
  assert.equal(primo.durataMs, 1200);
  assert.equal(sola.comandi[2].uscita, 2);
  assert.equal(sola.stato, 'terminato', 'nessun comando in corso: la scheda è ferma');
  assert.equal(idSchedaAgente(), 'agente');
});

test('BUG23-ESITO — il pallino dice l\'esito dell\'ULTIMO giro, non di tutta la sessione', () => {
  const giro = (n, id, u) => [avvio(id, n), argomenti(id, `comando ${id}`), esito(id, `exit ${u}\n`, { uscita: u })];
  const [prima] = schedeAgenteDagliEventi([...giro(1, 'a', 0), ...giro(2, 'b', 1)]);
  assert.equal(prima.esito, 'con-errori', 'l\'ultimo giro è fallito: rosso');
  const [poi] = schedeAgenteDagliEventi([...giro(1, 'a', 1), ...giro(2, 'b', 0)]);
  assert.equal(poi.esito, 'concluso', 'un fallimento VECCHIO non tiene la scheda rossa per sempre');
});

test('BUG23-02 — dal vivo: i pezzi di ToolCallOutput si accumulano (solo la coda), e spariscono quando arriva l\'esito', () => {
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

test('BUG23-03 — solo i comandi: gli altri attrezzi non fanno comandi nella scheda, e un giro senza comandi non ha scheda', () => {
  const schede = schedeAgenteDagliEventi([
    avvio('x', 1, 'leggi'), { type: 'ToolCallArgs', toolCallId: 'x', delta: '{"percorso":"a.txt"}' }, esito('x', 'contenuto'),
    avvio('y', 2, 'prova'), esito('y', 'ok'),
  ]);
  assert.deepEqual(schede.map((s) => s.terminalId), ['agente'], 'la scheda c\'è (la prova lancia la suite)');
  /* ⛔ gen.1 (fissato 06/10): il contratto di `processiDagliEventi` è `comando: ''` finché non arrivano gli args
     (inspector.js:1719), non `null`; la vista lo sostituisce (`c.comando || c.descrizione || 'comando'`). */
  assert.deepEqual(schede[0].comandi.map((c) => c.comando), [''], '`leggi` non è un comando: resta solo la `prova`');
});

test('BUG23-04 — riaperta la sessione (niente ToolCallOutput, sono effimeri) la scheda si ricostruisce dall\'esito salvato', () => {
  const [scheda] = schedeAgenteDagliEventi([avvio('a', 1), argomenti('a', 'echo ciao'), esito('a', 'ciao')]);
  assert.equal(scheda.comandi[0].testo, 'ciao');
  assert.equal(scheda.comandi[0].vivo, '');
});

test('BUG23-05 — la scheda chiusa a mano non torna, finché l\'agente non lancia un comando NUOVO (qualunque giro)', () => {
  const eventi = [avvio('a', 1), argomenti('a', 'ls'), esito('a', 'x'), avvio('b', 2), argomenti('b', 'pwd'), esito('b', '/')];
  const chiuse = new Map([['agente', 2]]); // l'unica scheda, chiusa quando aveva 2 comandi
  assert.deepEqual(schedeAgenteDagliEventi(eventi, { chiuse }), [], 'chiusa: nessuna scheda');
  const conNuovo = [...eventi, avvio('c', 3), argomenti('c', 'whoami')];
  const [riaperta] = schedeAgenteDagliEventi(conNuovo, { chiuse });
  assert.equal(riaperta.terminalId, 'agente', 'un comando nuovo, di qualunque giro, la riapre: nasconderlo sarebbe tacere');
  assert.deepEqual(riaperta.comandi.map((c) => c.comando), ['ls', 'pwd', 'whoami']);
});

test('BUG23-06 — un comando rifiutato all\'approvazione resta in fila e dice che non è partito', () => {
  const [scheda] = schedeAgenteDagliEventi([avvio('a', 1), argomenti('a', 'rm -rf build'), esito('a', 'REFUSED', { rifiutato: true, uscita: undefined })]);
  assert.equal(scheda.comandi[0].stato, 'non-eseguito');
  assert.equal(scheda.stato, 'terminato');
});

test('BUG23-07 — un comando senza giro dichiarato finisce nella stessa scheda «agente», non si perde', () => {
  const [scheda] = schedeAgenteDagliEventi([avvio('a', null), argomenti('a', 'date'), esito('a', 'oggi')]);
  assert.deepEqual(scheda.terminalId, 'agente');
  assert.equal(scheda.giro, null);
});

test('BUG23-08 — un comando che tace da molto (in attesa) tiene la scheda accesa', () => {
  const eventi = [{ ...avvio('a', 1), ricevutoA: 1_000 }, argomenti('a', 'npm run dev')];
  const [scheda] = schedeAgenteDagliEventi(eventi, { adesso: 1_000 + 10 * 60_000 });
  assert.equal(scheda.comandi[0].stato, 'in-attesa');
  assert.equal(scheda.stato, 'live');
});

test('TA-CONSENSO — 02/10/2026: un comando che aspetta il consenso tiene VIVA la scheda (il giro non è finito)', () => {
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

test('BUG23-SEP — un separatore per giro, prima del primo comando del giro; senza giro: «── agente ──»', () => {
  const testo = testoSchedaAgente({ comandi: [
    { comando: 'npm test', stato: 'riuscito', testo: 'exit 0\nverde', giro: 1 },
    { comando: 'git status', stato: 'riuscito', testo: 'exit 0\npulito', giro: 1 },
    { comando: 'ls', stato: 'riuscito', testo: 'exit 0\na.txt', giro: 2 },
    { comando: 'date', stato: 'riuscito', testo: 'exit 0\noggi', giro: null },
  ] });
  const pulito = testo.replace(/\x1b\[[0-9;]*m/gu, '');
  assert.equal(pulito.split('── giro 1 ──').length - 1, 1, 'il giro 1 ha il separato UNA volta, non per comando');
  assert.equal(pulito.split('── giro 2 ──').length - 1, 1);
  assert.equal(pulito.split('── agente ──').length - 1, 1, 'il giro nullo ha il separatore «agente»');
  const ordine = [...pulito.matchAll(/── (?:giro \d+|agente) ──\r?\n\$ (\S+)/gu)].map((m) => m[1]);
  assert.deepEqual(ordine, ['npm', 'ls', 'date'], 'il separatore sta solo in testa al suo giro');
});

test('BUG23-CAP — l\'uscita finale enorme entra nella vista come testa+coda+nota, non integrale (niente scatti da centinaia di KB)', () => {
  const corpo = Array.from({ length: 2_000 }, (_, i) => `riga ${i} di uscita`).join('\n');
  const pulito = (s) => s.replace(/\x1b\[[0-9;]*m/gu, '');
  const testo = testoSchedaAgente({ comandi: [{ comando: 'npm test', stato: 'riuscito', durataMs: 5_000, giro: 1, testo: `exit 0 [sandbox: none]\n${corpo}` }] });
  assert.ok(testo.length < 20_000, `la vista resta piccola: ${testo.length} caratteri`);
  assert.match(pulito(testo), /riga 0 di uscita/u, 'la testa c\'è');
  assert.match(pulito(testo), /riga 1999 di uscita/u, 'la coda c\'è');
  assert.doesNotMatch(pulito(testo), /riga 1000 di uscita/u, 'il mezzo non sta nella vista');
  assert.match(pulito(testo), /caratteri tagliati/u, 'si dice quanto se ne è andato, mai in silenzio');
});

test('TA-12 — il testo per la xterm: separatore, $ comando, l’uscita senza le righe per il modello, la riga d’esito; righe CRLF', () => {
  const testo = testoSchedaAgente({ comandi: [
    { comando: 'npm test', stato: 'riuscito', durataMs: 1200, giro: 1, testo: 'exit 0 [sandbox: none]\n[TALOS output reference: 849de2b1-d1cf-4099-ab0c-146b601c58f0; retained 5 of 5 bytes.]\nverde\n\n\n' },
    { comando: 'rm -rf build', stato: 'non-eseguito', giro: 1, testo: 'REFUSED. The person denied it.' },
    { comando: 'npm run dev', stato: 'in-corso', testo: null, giro: 2, vivo: 'in ascolto su 5173' },
    { comando: 'ping', stato: 'in-consenso', testo: null, giro: 2, vivo: '' },
  ] });
  const righe = testo.split('\r\n');
  assert.equal(testo.includes('\n') && !/[^\r]\n/u.test(testo), true, 'ogni a capo è \r\n: la xterm non converte da sola');
  assert.equal(testo.startsWith('\x1b[?25l'), true, 'in sola lettura il cursore si nasconde (DECTCEM), anche dopo un reset');
  /* le righe vuote in coda all'uscita («verde\n\n\n») non staccano l'esito dal suo comando */
  assert.deepEqual(righe.map((r) => r.replace(/\x1b\[[?0-9;]*[A-Za-z]/gu, '')), [
    '── giro 1 ──', '$ npm test', 'verde', '— Riuscito · su Windows, senza isolamento · 1.2 s', '',
    '$ rm -rf build', '— Non eseguito: il comando non è partito', '',
    '── giro 2 ──', '$ npm run dev', 'in ascolto su 5173', '',
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
