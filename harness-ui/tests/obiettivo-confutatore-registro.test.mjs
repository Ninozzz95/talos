/*
 * ⭐⭐⭐ /goal G5b — IL CONFUTATORE NEL CICLO, sul registro vero. Owner 15/10/2026: sola lettura (solo i comandi del contratto),
 * prima di OGNI «fatto», 8 giri. Il kernel è finto: i giri della conversazione si chiudono quando la prova lo dice; la figlia del
 * confutatore risponde col testo che la prova le dà. Nei due versi: regge ⇒ «fatto»; smentito ⇒ il ciclo riparte con la smentita,
 * e alla seconda si ferma; senza esito ⇒ mai «fatto».
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
const CONTRATTO = { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] };
const REGGE = '{"refuted": false, "reason": "the tests cover the goal"}';
const SMENTITO = 'I read the code.\n{"refuted": true, "reason": "login accepts empty passwords", "evidence": [{"path": "src/auth.js", "line": 40}]}';

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g5b-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 5000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
/** Il banco: i giri della conversazione in `giri`, quelli del confutatore in `confutatori`, che rispondono con `risposte[n]`. */
function banco(cartellaStore, cartella, risposte, altre = {}) {
  const giri = [];
  const confutatori = [];
  const { registro } = registroAGiri(cartellaStore, {
    ...altre,
    modello: 'z-ai/glm-5.3-flash',
    confutaObiettivoFn: undefined, // il confutatore VERO del registro
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    avviaSessioneFn: (input) => {
      const confutatore = String(input.task?.consegna ?? '').includes('You are the TALOS goal refuter');
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length + confutatori.length}` });
      if (confutatore) {
        confutatori.push(input);
        if (risposte[confutatori.length - 1] === null) {
          /* un confutatore che non finisce mai da solo: si ferma SOLO se il registro lo ferma (come un kernel vero, dal segnale) */
          return new Promise((risolvi) => input.segnaleStop?.addEventListener('abort', () => {
            input.fermatoDalSegnale = true;
            risolvi({ ok: true, esito: { comeFinita: 'interrotto', detto: '', messaggiFinali: [{ role: 'user', content: 'c' }] } });
          }));
        }
        const detto = risposte[confutatori.length - 1] ?? '';
        input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'rc', result: { detto } });
        return Promise.resolve({ ok: true, esito: { comeFinita: 'concluso', detto, messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: detto }] } });
      }
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ input, concludi: () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: fine } }); } });
      return attesa;
    },
  });
  return { registro, giri, confutatori };
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
async function obiettivoAvviato(b) {
  const { sessionId } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi();
  await passo();
  await b.registro.impostaObiettivo(sessionId, 'add login', CONTRATTO);
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'il giro della persona');
  b.giri.at(-1).concludi();
  return sessionId;
}

test('CONFUTA-REG-01 — prima del «fatto» parte UNA figlia confutatrice: sola lettura, nessuna interfaccia, 8 giri, il modello della sessione; regge ⇒ «fatto»', async (t) => conStore(t, async (cartellaStore) => {
  const b = banco(cartellaStore, progetto(t), [REGGE]);
  const sessionId = await obiettivoAvviato(b);
  await aspetta(() => stato(b, sessionId).stato === 'fatto', 'fatto');
  assert.equal(b.confutatori.length, 1);
  const figlia = b.confutatori[0];
  assert.equal(figlia.giriMassimi, 8);
  assert.match(figlia.task.consegna, /READ-ONLY/u);
  assert.match(figlia.task.consegna, /"npm test"/u, 'la consegna porta il contratto');
  assert.equal(stato(b, sessionId).confutazione.esito, 'regge');
  const voceFiglia = b.registro.elenca().find((s) => s.padreId === sessionId);
  assert.ok(voceFiglia, 'il confutatore è una figlia della conversazione (si vede nel diagramma)');
  assert.equal(b.giri.length, 2, 'nessun giro in più per la conversazione');
}));

test('CONFUTA-REG-02 — le domande del confutatore: SOLO i comandi del contratto passano, tutto il resto è un no subito', async (t) => conStore(t, async (cartellaStore) => {
  const b = banco(cartellaStore, progetto(t), [REGGE]);
  const sessionId = await obiettivoAvviato(b);
  await aspetta(() => stato(b, sessionId).stato === 'fatto', 'fatto');
  const chiedi = b.confutatori[0].chiediApprovazioneFn;
  assert.equal(typeof chiedi, 'function', 'premessa: il confutatore ha il suo canale di approvazione');
  assert.deepEqual(await chiedi({ tipo: 'shell', comando: 'npm test' }), { approvato: true });
  for (const azione of [{ tipo: 'shell', comando: 'npm test && rm -rf .' }, { tipo: 'shell', comando: 'git push' }, { tipo: 'scrivi', percorso: 'a.txt' }, { tipo: 'delega' }]) {
    const no = await chiedi(azione);
    assert.equal(no.approvato, false, JSON.stringify(azione));
    assert.match(no.motivo, /READ-ONLY/u);
  }
}));

test('CONFUTA-REG-03 AL CONTRARIO — smentito ⇒ niente «fatto»: il ciclo riparte con la smentita DENTRO il confine; alla seconda, pausa «fatto smentito»', async (t) => conStore(t, async (cartellaStore) => {
  const b = banco(cartellaStore, progetto(t), [SMENTITO, SMENTITO]);
  const sessionId = await obiettivoAvviato(b);
  await aspetta(() => b.giri.length === 3, 'il ciclo riparte dopo la smentita');
  assert.equal(stato(b, sessionId).stato, 'attivo');
  assert.equal(stato(b, sessionId).smentite, 1);
  const avviso = b.giri.at(-1).input.messaggiIniziali.at(-1);
  assert.equal(avviso.talosOrigin, 'goal-notice');
  assert.match(avviso.content, /<<<TALOS_DATA id=[0-9a-f]{12} from="goal refuter">>>\nlogin accepts empty passwords\n- file src\/auth\.js, line 40\n<<<END_TALOS_DATA/u);
  b.giri.at(-1).concludi();
  await aspetta(() => stato(b, sessionId).stato === 'in-pausa', 'seconda smentita: pausa');
  assert.deepEqual(stato(b, sessionId).motivo, { tipo: 'fatto-smentito', dettaglio: '2' });
  await passo(); await passo();
  assert.equal(b.giri.length, 3, 'niente riparte');
}));

test('CONFUTA-REG-04 AL CONTRARIO — un confutatore senza esito (niente JSON, o una smentita senza prove) non dice MAI «fatto»: pausa col motivo', async (t) => {
  for (const [nome, risposta] of [['niente JSON', 'I looked around, all fine.'], ['smentita senza prove', '{"refuted": true, "reason": "feels incomplete"}']]) {
    await conStore(t, async (cartellaStore) => {
      const b = banco(cartellaStore, progetto(t), [risposta]);
      const sessionId = await obiettivoAvviato(b);
      await aspetta(() => stato(b, sessionId).stato === 'in-pausa', `${nome}: pausa`);
      assert.equal(stato(b, sessionId).motivo.tipo, 'confutatore-guasto', nome);
      assert.equal(b.giri.length, 2, `${nome}: niente riparte`);
    }, `talos-g5b-${nome.replace(/\s/gu, '-')}-`);
  }
});

test('CONFUTA-REG-05 AL CONTRARIO — un confutatore che non finisce mai: alla scadenza «senza esito» (pausa, mai «fatto»), la figlia si ferma e il ciclo non resta bloccato', async (t) => conStore(t, async (cartellaStore) => {
  const b = banco(cartellaStore, progetto(t), [null], { scadenzaConfutatoreMs: 80 });
  const sessionId = await obiettivoAvviato(b);
  await aspetta(() => stato(b, sessionId).stato === 'in-pausa', 'pausa alla scadenza');
  assert.equal(stato(b, sessionId).motivo.tipo, 'confutatore-guasto');
  assert.equal(stato(b, sessionId).confutazione.motivo, 'refuter-timeout');
  await aspetta(() => b.confutatori[0].fermatoDalSegnale === true, 'il registro ferma la figlia alla scadenza');
}));
