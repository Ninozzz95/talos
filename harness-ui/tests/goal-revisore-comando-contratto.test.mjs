/*
 * ⛔ Owner 17/10/2026 sera («Adesso, al bugfixer») — /GOAL NON ARRIVAVA A «FATTO» SULLA 0.1.31: il revisore in sola lettura (il
 *   confutatore della G5) non riusciva a lanciare il comando del contratto. Visto dal vivo (Nino1, server 4177, commit `9f8b5fae5`,
 *   trascritto `%LOCALAPPDATA%\TALOS-demo-linkedin\s\8ec3c036-….jsonl`):
 *   - `prova` con `npm test` ⇒ `ApprovalResolved approvato:false, motivo confutatore-sola-lettura` (il cancello passava solo `shell`);
 *   - `shell {comando:"npm test"}` ⇒ `ApprovalResolved approvato:TRUE, motivo contratto-obiettivo`, e subito dopo
 *     «REFUSED. the owner did not approve this action.» — il registro rispondeva `{ approvato: true }` e il kernel approva SOLO `true`
 *     (`esitoApprovazione`, C-005: fail-closed). Il revisore ha chiuso con `refuted:null` ⇒ obiettivo in pausa «confutatore-guasto».
 *   Qui il confutatore VERO del registro fa girare il kernel VERO (`talosLavora`), con un modello finto che chiama il comando del
 *   contratto: il comando parte davvero (un file scritto nel progetto) o no. Nelle due case: Windows e Linux (WSL).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { SALTA_SENZA_WSL } from './aiuto/wsl-reale.mjs';

const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-goal-revisore-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  writeFileSync(join(radice, 'README.md'), '# demo\n');
  return radice;
}
async function aspetta(condizione, cosa, ms = 20_000) {
  const fino = Date.now() + ms;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  assert.fail(`mai successo: ${cosa}`);
}

/**
 * Il banco: la conversazione a giri finti (come `obiettivo-confutatore-registro`), il confutatore col kernel VERO. Il modello finto del
 * confutatore chiama `chiamata` (l'attrezzo e il comando), poi risponde: «regge» se l'esito del comando non è un rifiuto, se no `null`.
 */
function banco(cartellaStore, cartella, { contratto, chiamata, dove = 'windows' }) {
  const giri = [];
  const revisori = [];
  const { registro } = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    confutaObiettivoFn: undefined, // il confutatore VERO del registro
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: contratto, task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }), // i controlli del contratto (G4) sono verdi
    avviaSessioneFn: (input) => {
      const confutatore = String(input.task?.consegna ?? '').includes('You are the TALOS goal refuter');
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length + revisori.length}` });
      if (confutatore) {
        const revisore = { input, esiti: [] };
        revisori.push(revisore);
        let n = 0;
        const fetchDiRete = async (_url, init) => {
          n += 1;
          const corpo = JSON.parse(init.body);
          const esitoDelComando = corpo.messages.filter((m) => m.role === 'tool').map((m) => String(m.content)).join('\n');
          if (n > 1) revisore.esiti.push(esitoDelComando);
          const message = n === 1
            ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: chiamata.attrezzo, arguments: JSON.stringify(chiamata.argomenti) } }] }
            : { role: 'assistant', content: /REFUSED|NOT RUN/u.test(esitoDelComando) ? '{"refuted": null, "reason": "the contract command was refused"}' : '{"refuted": false, "reason": "the contract command passes"}' };
          return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
        };
        return talosLavora({
          cartella: input.cartella, task: input.task, modello: 'f', chiave: 'k', giriMassimi: 3, fetchDiRete,
          livelloAccesso: 'su-richiesta', comandoProva: contratto,
          chiediApprovazioneFn: input.chiediApprovazioneFn,
          ambienteComandiFn: () => ({ dove, revisione: 0 }),
          onEvento: input.onEvento,
        }).then((esito) => {
          input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'rc', result: { detto: esito.detto } });
          return { ok: true, esito: { comeFinita: 'concluso', detto: esito.detto, messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: esito.detto }] } };
        });
      }
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ input, concludi: () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: fine } }); } });
      return attesa;
    },
  });
  return { registro, giri, revisori };
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
async function obiettivoAvviato(b, contratto, { criteri = null, avvio = {} } = {}) {
  const { sessionId } = b.registro.avvia('task-vero', avvio);
  b.giri.at(-1).concludi();
  await passo();
  await b.registro.impostaObiettivo(sessionId, 'write the marker', { criteri: criteri ?? [{ testo: 'the command passes', verifica: { tipo: 'comando', comando: contratto } }] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'il giro della persona');
  b.giri.at(-1).concludi();
  return sessionId;
}

const CONTRATTO = 'echo ran> revisore-ha-lanciato.txt';
for (const [casa, dove, salta] of [['Windows', 'windows', process.platform !== 'win32'], ['Linux (WSL)', 'wsl2', process.platform !== 'win32' ? true : SALTA_SENZA_WSL]]) {
  for (const attrezzo of ['shell', 'prova']) {
    test(`GOAL-REV-01 ${casa} · ${attrezzo}: il revisore LANCIA il comando del contratto (parte davvero) e l'obiettivo arriva a «fatto»`, { skip: salta }, async (t) => conStore(t, async (cartellaStore) => {
      const cartella = progetto(t);
      const chiamata = attrezzo === 'shell' ? { attrezzo: 'shell', argomenti: { comando: CONTRATTO } } : { attrezzo: 'prova', argomenti: {} };
      const b = banco(cartellaStore, cartella, { contratto: CONTRATTO, chiamata, dove });
      const sessionId = await obiettivoAvviato(b, CONTRATTO);
      await aspetta(() => ['fatto', 'in-pausa'].includes(stato(b, sessionId).stato), 'un esito del ciclo');
      t.diagnostic(`esito del comando visto dal revisore: ${JSON.stringify(b.revisori[0]?.esiti)}`);
      assert.equal(existsSync(join(cartella, 'revisore-ha-lanciato.txt')), true, 'il comando del contratto è PARTITO nel revisore');
      assert.equal(stato(b, sessionId).stato, 'fatto', `l'obiettivo arriva a «fatto» (motivo: ${JSON.stringify(stato(b, sessionId).motivo)})`);
    }));
  }
}

/* AL CONTRARIO, col kernel vero: un comando che NON è del contratto non parte; e la regola sulla forma è dichiarata — spazi in testa
   e in coda tolti, dentro identico (due spazi in mezzo sono un altro comando). Il no dice al modello quali comandi può lanciare. */
for (const [nome, comandoChiesto] of [['un altro comando', 'echo altro> revisore-ha-lanciato.txt'], ['due spazi in mezzo', 'echo  ran> revisore-ha-lanciato.txt']]) {
  test(`GOAL-REV-02 Windows · ${nome}: il revisore NON lo lancia, il modello legge quali comandi può lanciare, e non c'è «fatto»`, { skip: process.platform !== 'win32' }, async (t) => conStore(t, async (cartellaStore) => {
    const cartella = progetto(t);
    const b = banco(cartellaStore, cartella, { contratto: CONTRATTO, chiamata: { attrezzo: 'shell', argomenti: { comando: comandoChiesto } } });
    const sessionId = await obiettivoAvviato(b, CONTRATTO);
    await aspetta(() => ['fatto', 'in-pausa'].includes(stato(b, sessionId).stato), 'un esito del ciclo');
    assert.equal(existsSync(join(cartella, 'revisore-ha-lanciato.txt')), false, 'niente è partito');
    assert.match(b.revisori[0].esiti[0], /REFUSED\. you are the TALOS goal refuter and work READ-ONLY: you may only run the goal contract commands, exactly as written \("echo ran> revisore-ha-lanciato\.txt"\)/u);
    assert.notEqual(stato(b, sessionId).stato, 'fatto');
  }));
}
test('GOAL-REV-02b Windows · spazi in testa e in coda: lo stesso comando, e parte', { skip: process.platform !== 'win32' }, async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { contratto: CONTRATTO, chiamata: { attrezzo: 'shell', argomenti: { comando: `  ${CONTRATTO}  ` } } });
  const sessionId = await obiettivoAvviato(b, CONTRATTO);
  await aspetta(() => ['fatto', 'in-pausa'].includes(stato(b, sessionId).stato), 'un esito del ciclo');
  assert.equal(existsSync(join(cartella, 'revisore-ha-lanciato.txt')), true);
  assert.equal(stato(b, sessionId).stato, 'fatto');
}));

/* Un contratto SENZA comandi: il revisore resta com'era — sola lettura, nessun comando parte, e il no lo dice. */
test('GOAL-REV-03 Windows · contratto senza comandi: nessun comando parte nel revisore', { skip: process.platform !== 'win32' }, async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { contratto: CONTRATTO, chiamata: { attrezzo: 'shell', argomenti: { comando: CONTRATTO } } });
  const sessionId = await obiettivoAvviato(b, CONTRATTO, { criteri: [{ testo: 'the readme exists', verifica: { tipo: 'file', percorso: 'README.md', fatto: 'esiste' } }] });
  await aspetta(() => ['fatto', 'in-pausa'].includes(stato(b, sessionId).stato), 'un esito del ciclo');
  assert.equal(existsSync(join(cartella, 'revisore-ha-lanciato.txt')), false);
  assert.match(b.revisori[0].esiti[0], /exactly as written \(this contract has none\)/u);
}));

/* G4 nella conversazione stessa, col cancello VERO: in una sessione «On request» i controlli col comando del contratto non partivano
   (stesso `{ approvato: true }` letto come un no) ⇒ «permission-denied» invece di eseguire. */
test('GOAL-REV-04 · G4 in una sessione «On request»: il controllo col comando del contratto PARTE, col cancello vero', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const lanciati = [];
  const giri = [];
  const { registro } = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: CONTRATTO, task: { id: 'task-vero', consegna: 'c' } }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async (comando) => { lanciati.push(comando); return { codice: 0, enforcement: 'none' }; },
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ concludi: () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: fine } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
      return attesa;
    },
  });
  const b = { registro, giri };
  const sessionId = await obiettivoAvviato(b, CONTRATTO, { avvio: { permessiScelto: 'On request' } });
  await aspetta(() => ['fatto', 'in-pausa'].includes(stato(b, sessionId).stato) || lanciati.length > 0, 'il controllo o un esito');
  await aspetta(() => ['fatto', 'in-pausa'].includes(stato(b, sessionId).stato), 'un esito del ciclo');
  assert.deepEqual(lanciati, [CONTRATTO], 'il comando del contratto è partito');
  assert.equal(stato(b, sessionId).stato, 'fatto', `motivo: ${JSON.stringify(stato(b, sessionId).motivo)}`);
}));
