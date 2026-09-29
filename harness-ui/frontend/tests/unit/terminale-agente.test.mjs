/*
 * PO-10 (owner 28/09/2026) — le schede AGENTE del Terminale, in sola lettura: una per giro («Agente · giro N»), i comandi di
 * quel giro in fila ($ comando, uscita, esito). Fonte: gli stessi eventi del pannello Processi (`processiDagliEventi`), più il
 * TESTO dell'uscita: dal vivo da `ToolCallOutput` (effimero, D-10B) e alla fine da `ToolCallResult.content` (salvato: la
 * scheda si ricostruisce riaprendo la sessione). Memoria: decisione-owner-po-10-schede-agente-sola-lettura-28-09.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { schedeAgenteDagliEventi, idSchedaAgente, RIGHE_VIVE_AGENTE } from '../../src/components/terminale-agente.js';

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
