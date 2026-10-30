/*
 * R-21 (Performance 29/10/2026, E-segreti r1: 272 s dei 317 s di attrezzi erano attese con `sleep` dopo uno sfondo; owner 29/10
 *   notte, le tre consigliate; contratto con la CLI):
 *   D2 — un'attesa lunga (25 s o più, o 60 s in tutto nel turno) non parte, nelle forme dei tre interpreti, anche in Accesso pieno;
 *   D1 — l'esito di un comando in sottofondo dice al modello come ne saprà la fine (`svegliaDisponibile` per TURNO: sveglia a turno
 *        chiuso, oppure «col prossimo esito, finché il turno dura»);
 *   D3 — la fine di un comando in sottofondo arriva DENTRO il turno, col prossimo esito; l'ospite la riceve segnata «già detta».
 * Ricerca: `in-corso/RICERCA-R21-R26-ONE-UP-2026-10-29.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { attesaDelComando, decidiAttesa, messaggioAttesaFermata, SOGLIA_ATTESA_S } from '../src/kernel/guardie-attese-e-lavoro.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const secondi = (c) => attesaDelComando(c)?.secondi ?? null;

test('R21-D2-01 le forme dei tre interpreti, e dentro un\'altra shell', () => {
  const casi = [
    ['sleep 90', 90], ['sleep 1m', 60], ['sleep 1m 30s', 90], ['sleep 2.5', 2.5], ['/usr/bin/sleep 40', 40], ['sleep 90 && cat log.txt', 90], ['sleep 60; tail -n 20 x.log', 60],
    ['Start-Sleep -Seconds 30', 30], ['Start-Sleep 30', 30], ['start-sleep -s 45', 45], ['Start-Sleep -Milliseconds 30000', 30], ['sleep -Seconds 30', 30],
    ['timeout /t 60 /nobreak', 60], ['timeout /T 40 > nul', 40], ['ping -n 61 127.0.0.1 > nul', 60], ['ping 127.0.0.1 -n 31', 30],
    ['powershell -Command "Start-Sleep 40"', 40], ['pwsh -c "Start-Sleep -Seconds 50; Get-Content x"', 50], ['cmd /c "timeout /t 40"', 40],
    ['bash -c "sleep 40"', 40], ['wsl sleep 40', 40], ['wsl -e sleep 40', 40], ['nohup sleep 30', 30], ['( sleep 30 )', 30],
  ];
  for (const [comando, attesi] of casi) assert.equal(secondi(comando), attesi, comando);
});

test('R21-D2-02 AL CONTRARIO: non sono attese (o non al primo posto, come Claude Code)', () => {
  for (const c of ['timeout 60 npm test', 'ping -n 5 google.com', 'npm test; sleep 90', 'echo sleep 90', 'git log', 'until curl -s localhost:3000; do sleep 2; done', 'sleep', 'sleep abc']) {
    assert.equal(secondi(c), null, c);
  }
});

test('R21-D2-03 il verdetto: 25 s o più si ferma; le corte passano e si contano, finché il turno arriva a 60 s; in sottofondo mai', () => {
  assert.equal(SOGLIA_ATTESA_S, 25);
  assert.equal(decidiAttesa('sleep 24').ferma, false);
  assert.equal(decidiAttesa('sleep 25').ferma, true);
  assert.equal(decidiAttesa('sleep 20', { giaAttesiS: 30 }).ferma, false);
  assert.equal(decidiAttesa('sleep 20', { giaAttesiS: 40 }).ferma, true, 'la terza attesa corta in fila');
  assert.equal(decidiAttesa('sleep 90', { inSfondo: true }), null);
  assert.equal(decidiAttesa('npm test'), null);
  const v = decidiAttesa('sleep 20', { giaAttesiS: 44 });
  assert.match(messaggioAttesaFermata(v), /you already waited 44 s with sleep in this turn, and this would add 20 s more/u);
});

test('R21-D2-04 il messaggio dice la via giusta, e quale a seconda della sveglia', () => {
  const v = decidiAttesa('sleep 90 && cat log');
  const conSveglia = messaggioAttesaFermata(v, { svegliaDisponibile: true });
  assert.match(conSveglia, /^NOT RUN\. `sleep 90`: it would only wait 90 s before running: cat log, and waiting with sleep is blocked/u);
  assert.match(conSveglia, /you will be woken when it finishes/u);
  assert.match(conSveglia, /Do not chain shorter sleeps/u);
  const senza = messaggioAttesaFermata(v, { svegliaDisponibile: false });
  assert.match(senza, /reports its end with your next tool result while this turn lasts/u);
  assert.doesNotMatch(senza, /woken/u);
});

/* ── il giro vero ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-r21-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });
async function giro(c, passi, altro = {}) {
  let n = 0;
  const r = await talosLavora({
    ...altro,
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', livelloAccesso: 'accesso-pieno',
    chiediApprovazioneFn: async () => true,
    fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{ message: n < passi.length ? { role: 'assistant', content: null, tool_calls: passi[n++] } : { role: 'assistant', content: 'fatto' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }) }),
  });
  return (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '';
}
const nodo = (codice) => `node -e "${codice}"`;

test('R21-D2-05 nel giro: `sleep 30` non parte (subito, anche in Accesso pieno); una corta sì', async (t) => {
  const c = cartella(t);
  const prima = Date.now();
  const esito = await giro(c, [[chiama('l', 'shell', { comando: 'sleep 30' }), chiama('p', 'shell', { comando: 'Start-Sleep -Seconds 40' }), chiama('k', 'shell', { comando: nodo('setTimeout(function(){},200)') })]]);
  assert.ok(Date.now() - prima < 15_000, 'nessuna attesa vera');
  assert.match(esito('l'), /^NOT RUN\. `sleep 30`/u);
  assert.match(esito('p'), /^NOT RUN\. `Start-Sleep -Seconds 40`/u);
  assert.doesNotMatch(esito('k'), /NOT RUN/u);
});

test('R21-D1-01 l\'esito di un comando in sottofondo dice come ne saprai la fine: con la sveglia, «non aspettare, chiudi il turno»', async (t) => {
  const c = cartella(t);
  const esito = await giro(c, [[chiama('b', 'shell', { comando: nodo('setTimeout(function(){},400)'), background: true })]]);
  assert.match(esito('b'), /IN BACKGROUND/u);
  assert.match(esito('b'), /You will be told when it ends \(exit code and output file\): do not wait for it with sleep and do not re-read the output file to see whether it has finished\. Keep working on what does not depend on it, or end your turn if there is nothing else: you will be woken when it finishes\./u);
});

test('R21-D1-02 senza sveglia (CLI -p, automazioni): «finché dura il turno; la fine col prossimo esito»', async (t) => {
  const c = cartella(t);
  const esito = await giro(c, [[chiama('b', 'shell', { comando: nodo('setTimeout(function(){},400)'), background: true })]], { svegliaDisponibile: false });
  assert.match(esito('b'), /The command keeps running only while this turn does: check its output file \(or wait for its end, which arrives with your next tool result\) before you finish\./u);
  assert.doesNotMatch(esito('b'), /woken/u);
});

for (const sveglia of [true, false]) {
  test(`R21-D3-01 la fine arriva DENTRO il turno col prossimo esito, una volta sola (svegliaDisponibile ${sveglia})`, async (t) => {
    const c = cartella(t);
    const segnalati = [];
    const esito = await giro(c, [
      [chiama('b', 'shell', { comando: nodo('setTimeout(function(){process.exit(3)},300)'), background: true })],
      [chiama('w', 'shell', { comando: nodo('setTimeout(function(){},1500)') })],
      [chiama('x', 'shell', { comando: nodo('0') })],
    ], { svegliaDisponibile: sveglia, segnalaUscitaSfondo: (u) => segnalati.push(u) });
    assert.match(esito('w'), /\[TALOS: The background command `node -e "setTimeout\(function\(\)\{process\.exit\(3\)\},300\)"` failed \(exit code 3\)\. Its full output is in .+\.\]/u);
    assert.doesNotMatch(esito('x'), /The background command/u, 'una volta sola');
    assert.equal(segnalati.length, 1);
    assert.equal(segnalati[0].giaDettoAlModello, true, 'l\'ospite non la rimette in coda');
    assert.equal(segnalati[0].codice, 3);
  });
}

test('R21-D3-03 finito DURANTE il turno ma senza un esito dopo: a fine turno va all\'ospite (in coda), non si perde', async (t) => {
  const c = cartella(t);
  const segnalati = [];
  let n = 0;
  await talosLavora({
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', livelloAccesso: 'accesso-pieno', chiediApprovazioneFn: async () => true,
    segnalaUscitaSfondo: (u) => segnalati.push(u),
    fetchDiRete: async () => {
      if (n === 1) await new Promise((r) => setTimeout(r, 1200)); // il modello «pensa» mentre il comando finisce
      const m = n++ === 0 ? { role: 'assistant', content: null, tool_calls: [chiama('b', 'shell', { comando: nodo('setTimeout(function(){},200)'), background: true })] } : { role: 'assistant', content: 'fatto' };
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: m }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
    },
  });
  assert.equal(segnalati.length, 1, 'detta all\'ospite alla fine del turno');
  assert.notEqual(segnalati[0].giaDettoAlModello, true, 'il modello non l\'ha vista: va in coda');
  assert.equal(segnalati[0].codice, 0);
});

test('R21-D3-02 AL CONTRARIO: finito dopo la fine del turno, l\'ospite la riceve come sempre (da mettere in coda)', async (t) => {
  const c = cartella(t);
  const segnalati = [];
  await giro(c, [[chiama('b', 'shell', { comando: nodo('setTimeout(function(){},600)'), background: true })]], { segnalaUscitaSfondo: (u) => segnalati.push(u) });
  for (let i = 0; i < 50 && segnalati.length === 0; i += 1) await new Promise((r) => setTimeout(r, 100));
  assert.equal(segnalati.length, 1);
  assert.notEqual(segnalati[0].giaDettoAlModello, true);
});
