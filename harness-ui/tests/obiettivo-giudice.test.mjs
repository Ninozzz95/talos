/*
 * ⭐ /goal G5 — il giudice, la sola parte pura (`src/obiettivo/giudice.mjs`): le prove del giro, i messaggi, la lettura del verdetto.
 * Nei due versi: un «sì» con prove valide è verde, e ogni «sì» senza prove o con prove vecchie NON lo è (dsh-goalloop `judged`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SISTEMA_GIUDICE, giudizioDallaRisposta, impronta, promptPerIlGiudice, proveDelGiro } from '../src/obiettivo/giudice.mjs';

const CRITERI = [{ id: 'c1', testo: 'The README explains how to install' }, { id: 'c2', testo: 'The answer names the root cause' }];
const IMPRONTA_README = impronta('# Install\nnpm ci\n');
const RISPOSTA = 'The root cause was the stale cache.';
const contesto = () => ({ criteri: CRITERI, impronteAttuali: new Map([['README.md', IMPRONTA_README]]), improntaRisposta: impronta(RISPOSTA) });
const risposta = (verdicts) => JSON.stringify({ verdicts });

test('GIUDICE-01 — un «sì» con le prove di ADESSO è verde: un file, più la risposta se c è; la sola risposta no', () => {
  const r = giudizioDallaRisposta(risposta([
    { id: 'c1', verdict: 'yes', reason: 'install section present', evidence: [{ path: 'README.md', sha256: IMPRONTA_README }] },
    { id: 'c2', verdict: 'yes', reason: 'named', evidence: [{ path: 'README.md', sha256: IMPRONTA_README }, { reply: true, sha256: impronta(RISPOSTA) }] },
  ]), contesto());
  assert.equal(r.ok, true);
  assert.deepEqual(r.verdetti.map((v) => v.esito), ['verde', 'verde']);
  assert.deepEqual(r.verdetti[0].prove, [{ percorso: 'README.md', impronta: IMPRONTA_README }]);
  assert.deepEqual(r.verdetti[1].prove, [{ percorso: 'README.md', impronta: IMPRONTA_README }, { risposta: true, impronta: impronta(RISPOSTA) }]);
  // G5-REV-01: la sola risposta (l'affermazione dell'agente) non basta mai
  const solo = giudizioDallaRisposta(risposta([{ id: 'c2', verdict: 'yes', reason: 'named', evidence: [{ reply: true, sha256: impronta(RISPOSTA) }] }]), contesto());
  assert.deepEqual(solo.verdetti.find((v) => v.id === 'c2'), { id: 'c2', esito: 'non-giudicabile', motivo: 'no-evidence' });
});

test('GIUDICE-02 AL CONTRARIO — un «sì» senza prove, con un\'impronta vecchia o su un file che non c\'è NON è verde', () => {
  const casi = [
    [{ id: 'c1', verdict: 'yes', reason: 'ok' }, 'no-evidence'],
    [{ id: 'c1', verdict: 'yes', reason: 'ok', evidence: [] }, 'no-evidence'],
    [{ id: 'c1', verdict: 'yes', reason: 'ok', evidence: [{ path: 'README.md', sha256: impronta('vecchio') }] }, 'evidence-stale'],
    [{ id: 'c1', verdict: 'yes', reason: 'ok', evidence: [{ path: 'ALTRO.md', sha256: IMPRONTA_README }] }, 'evidence-stale'],
    [{ id: 'c1', verdict: 'yes', reason: 'ok', evidence: [{ path: 'README.md', sha256: IMPRONTA_README }, { reply: true, sha256: impronta('altro') }] }, 'evidence-stale'],
    [{ id: 'c1', verdict: 'done', reason: 'ok', evidence: [{ path: 'README.md', sha256: IMPRONTA_README }] }, 'judge-verdict-invalid'],
  ];
  for (const [voce, motivo] of casi) {
    const r = giudizioDallaRisposta(risposta([voce]), contesto());
    assert.equal(r.verdetti[0].esito, 'non-giudicabile', JSON.stringify(voce));
    assert.equal(r.verdetti[0].motivo, motivo, JSON.stringify(voce));
  }
});

test('GIUDICE-03 — «no» è rosso col motivo (guida il giro dopo); «unknown» e un criterio saltato non sono mai verdi', () => {
  const r = giudizioDallaRisposta(risposta([{ id: 'c1', verdict: 'no', reason: 'no install section' }, { id: 'c9', verdict: 'yes' }]), contesto());
  assert.deepEqual(r.verdetti, [
    { id: 'c1', esito: 'rosso', motivo: 'no install section' },
    { id: 'c2', esito: 'non-giudicabile', motivo: 'judge-skipped' },
  ]);
  const u = giudizioDallaRisposta(risposta([{ id: 'c1', verdict: 'unknown', reason: 'cannot see the file' }]), contesto());
  assert.deepEqual(u.verdetti[0], { id: 'c1', esito: 'non-giudicabile', motivo: 'cannot see the file' });
});

test('GIUDICE-04 AL CONTRARIO — una risposta illeggibile è un guasto di FORMA, mai un verdetto', () => {
  for (const testo of ['', 'Everything is done!', '{"verdicts": "yes"}', '{"verdict":"yes"}', '{not json}']) {
    assert.deepEqual(giudizioDallaRisposta(testo, contesto()), { ok: false, guasto: 'forma' }, testo);
  }
  // un recinto o una frase attorno all'oggetto si tollerano
  const avvolto = `Here you go:\n\`\`\`json\n${risposta([{ id: 'c1', verdict: 'no', reason: 'x' }])}\n\`\`\``;
  assert.equal(giudizioDallaRisposta(avvolto, contesto()).verdetti[0].esito, 'rosso');
});

test('GIUDICE-05 — le prove del giro: attrezzi con esito e codice, file scritti con successo, e la risposta finale', () => {
  const eventi = [
    { type: 'RunStarted' },
    { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'scrivi' },
    { type: 'ToolCallArgs', toolCallId: 'a', delta: '{"percorso":"README.md",' },
    { type: 'ToolCallArgs', toolCallId: 'a', delta: '"contenuto":"x"}' },
    { type: 'ToolCallResult', toolCallId: 'a', content: 'ok' },
    { type: 'ToolCallStart', toolCallId: 'b', toolCallName: 'file_edit' },
    { type: 'ToolCallArgs', toolCallId: 'b', delta: '{"percorso":"rotto.md"}' },
    { type: 'ToolCallResult', toolCallId: 'b', content: 'REFUSED', isError: true },
    { type: 'ToolCallStart', toolCallId: 'c', toolCallName: 'shell' },
    { type: 'ToolCallArgs', toolCallId: 'c', delta: '{"comando":"npm test"}' },
    { type: 'ToolCallResult', toolCallId: 'c', content: 'fail', exitCode: 1 },
    { type: 'TextMessageStart', messageId: 'm1' },
    { type: 'TextMessageContent', messageId: 'm1', delta: 'prima' },
    { type: 'TextMessageStart', messageId: 'm2' },
    { type: 'TextMessageContent', messageId: 'm2', delta: 'Fatto: ' },
    { type: 'TextMessageContent', messageId: 'm2', delta: 'tutto.' },
  ];
  const p = proveDelGiro(eventi);
  assert.deepEqual(p.scritti, ['README.md'], 'solo le scritture riuscite');
  assert.deepEqual(p.attrezzi.map((a) => [a.nome, a.esito, a.codice]), [['scrivi', 'ok', undefined], ['file_edit', 'errore', undefined], ['shell', 'ok', 1]]);
  assert.equal(p.risposta, 'Fatto: tutto.', 'la risposta finale è l\'ultimo messaggio di testo');
});

test('GIUDICE-06 — il prompt: prima la regola, poi tutto il resto in UN blocco JSON di dati, la risposta come affermazione con la sua impronta', () => {
  const m = promptPerIlGiudice({ obiettivo: 'Document the install', criteri: CRITERI, prove: { attrezzi: [{ nome: 'scrivi', argomenti: '{}', esito: 'ok' }] },
    file: [{ percorso: 'README.md', impronta: IMPRONTA_README, estratto: '# Install' }], risposta: RISPOSTA });
  assert.ok(m.startsWith(SISTEMA_GIUDICE));
  assert.match(SISTEMA_GIUDICE, /CLAIM by the agent, not evidence/u);
  const segno = 'UNTRUSTED JSON DATA:\n';
  const blocco = m.slice(m.indexOf(segno) + segno.length).split('\n');
  assert.match(blocco[0], /^<<<TALOS_DATA id=[0-9a-f]{12} from="goal evidence">>>$/u, 'i dati dentro il confine');
  const dati = JSON.parse(blocco.slice(1, -1).join('\n'));
  assert.deepEqual(dati.criteria, [{ id: 'c1', text: CRITERI[0].testo }, { id: 'c2', text: CRITERI[1].testo }]);
  assert.deepEqual(dati.final_reply, { claim: RISPOSTA, sha256: impronta(RISPOSTA) });
  assert.deepEqual(dati.files_written, [{ path: 'README.md', sha256: IMPRONTA_README, excerpt: '# Install' }]);
});
