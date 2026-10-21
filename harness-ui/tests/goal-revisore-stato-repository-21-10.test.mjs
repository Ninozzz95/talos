/*
 * C-3 (owner 21/10/2026, «No, basta lo stato dal server»): il confutatore del /goal riceve nella consegna lo stato del repository raccolto
 * dal server — modifiche non committate e file cambiati dai commit nati dopo l'inizio dell'obiettivo — senza nessun permesso nuovo.
 * Nato dal giro vero della sessione video (0.1.34): «No test file was changed» non arrivava mai a un verdetto
 * (`bugfixer/INDAGINE-21-10-GOAL-REVISORE-SENZA-VERDETTO.md`). Registro VERO, revisore finto che decide dalla consegna; nessuna rete.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CONTRATTO = 'echo ok';
const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
async function aspetta(condizione, cosa, ms = 20_000) {
  const fino = Date.now() + ms;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  assert.fail(`mai successo: ${cosa}`);
}

/** Un git finto: le modifiche non committate e, se `commitDopo`, un commit nato dopo l'inizio dell'obiettivo che tocca `fileDelCommit`. */
function gitFinto({ voci = [{ percorso: 'src/app.js', x: ' ', y: 'M', tipo: 'modificato' }], commitDopo = false, fileDelCommit = [], guasto = false, vecchio = false, lentoStato = false } = {}) {
  const chiamate = [];
  return {
    chiamate,
    servizio: {
      async stato(a) { chiamate.push(['stato', a]); if (guasto) throw new Error('git rotto'); if (lentoStato) return new Promise(() => {}); return { voci }; },
      /* C-3, cura del 21/10 sera: i commit della cartella per data del committer. `vecchio` = un servizio git di prima, senza */
      ...(vecchio ? {} : { async commitDellaCartella(a) { chiamate.push(['commitDellaCartella', a]); return { commit: commitDopo ? [{ commit: 'b'.repeat(40), breve: 'bbbbbbb', soggetto: 'tweak tests', data: new Date(Date.now() + 60_000).toISOString(), padri: ['a'.repeat(40)] }] : [], altri: false }; } }),
      async storia(a) { chiamate.push(['storia', a]); return { commit: commitDopo ? [{ commit: 'b'.repeat(40), breve: 'bbbbbbb', soggetto: 'tweak tests', data: new Date(Date.now() + 60_000).toISOString(), padri: ['a'.repeat(40)] }, { commit: 'a'.repeat(40), breve: 'aaaaaaa', soggetto: 'base', data: '2020-01-01T00:00:00Z', padri: [] }] : [] }; },
      async modificheFra(a) { chiamate.push(['modificheFra', a]); return { file: fileDelCommit }; },
    },
  };
}

function banco(t, cartellaStore, { git = null, citato = 'test/app.test.js' } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-goal-rsr-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const giri = [];
  const consegne = [];
  const { registro } = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    confutaObiettivoFn: undefined,
    ...(git ? { repositoryFn: () => git } : {}),
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: CONTRATTO, task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    avviaSessioneFn: (input) => {
      const consegna = String(input.task?.consegna ?? '');
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length + consegne.length}` });
      if (consegna.includes('You are the TALOS goal refuter')) {
        consegne.push(consegna);
        /* il revisore decide come farebbe un modello attento: senza lo stato del repository non può dire «nessun test cambiato» */
        const dati = JSON.parse(consegna.slice(consegna.indexOf('```json') + 7, consegna.lastIndexOf('```')));
        const stato = dati.repository_state;
        const toccaTest = (lista) => (lista ?? []).some((f) => /(^|\/)test\//u.test(f.path ?? f.percorso ?? ''));
        const detto = !stato ? '{"refuted": null, "reason": "I could not run git to check that no test file changed"}'
          : toccaTest(stato.uncommitted_changes) || toccaTest(stato.committed_since_goal_start?.files)
            ? JSON.stringify({ refuted: true, reason: 'a test file changed', evidence: [{ repository_state: citato }] })
            : '{"refuted": false, "reason": "repository_state shows only src changes"}';
        input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'rc', result: { detto } });
        return Promise.resolve({ ok: true, esito: { comeFinita: 'concluso', detto, messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: detto }] } });
      }
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ input, concludi: () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: fine } }); } });
      return attesa;
    },
  });
  return { registro, giri, consegne };
}

async function obiettivoConcluso(b) {
  const { sessionId } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi();
  await passo();
  await b.registro.impostaObiettivo(sessionId, 'fix src/app.js; no test file may change', { criteri: [{ testo: 'npm test passes', verifica: { tipo: 'comando', comando: CONTRATTO } }] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'il giro della persona');
  b.giri.at(-1).concludi();
  await aspetta(() => stato(b, sessionId).stato !== 'attivo' || b.consegne.length > 0 && stato(b, sessionId).confutazione, 'un esito del ciclo');
  await aspetta(() => stato(b, sessionId).stato !== 'attivo' || (stato(b, sessionId).confutazione?.esito ?? null) !== null, 'un esito del revisore');
  return sessionId;
}

test('RSR-01 con lo stato del repository il revisore arriva a un verdetto: solo src cambiato ⇒ «fatto»', async (t) => conStore(t, async (cartellaStore) => {
  const git = gitFinto();
  const b = banco(t, cartellaStore, { git: git.servizio });
  const sessionId = await obiettivoConcluso(b);
  assert.equal(b.consegne.length, 1);
  assert.match(b.consegne[0], /"repository_state"/u);
  assert.match(b.consegne[0], /collected by TALOS itself/u);
  assert.equal(stato(b, sessionId).stato, 'fatto');
}));

test('RSR-02 un file di test cambiato da un commit nato DOPO l\'inizio dell\'obiettivo arriva al revisore (non solo git status)', async (t) => conStore(t, async (cartellaStore) => {
  const git = gitFinto({ voci: [], commitDopo: true, fileDelCommit: [{ percorso: 'test/app.test.js', stato: 'M' }] });
  const b = banco(t, cartellaStore, { git: git.servizio });
  const sessionId = await obiettivoConcluso(b);
  assert.match(b.consegne[0], /"committed_since_goal_start"/u);
  assert.match(b.consegne[0], /test\/app\.test\.js/u);
  assert.deepEqual(git.chiamate.find(([n]) => n === 'modificheFra')[1].da, 'a'.repeat(40), 'dal commit che precede il più vecchio dell\'obiettivo');
  assert.notEqual(stato(b, sessionId).stato, 'fatto', 'smentito: il «fatto» non si dice');
  /* C3-PROVA-04 (revisione del 21/10 sera): la smentita che cita lo stato consegnato è una SMENTITA, non «senza esito» */
  assert.equal(stato(b, sessionId).confutazione?.esito, 'smentito', JSON.stringify(stato(b, sessionId).confutazione));
  assert.deepEqual(stato(b, sessionId).confutazione.prove, [{ percorso: 'test/app.test.js', dalRepository: true }]);
}));

test('RSR-03 verso contrario: senza servizio git, o con git rotto, la consegna è quella di prima e il ciclo non si blocca', async (t) => conStore(t, async (cartellaStore) => {
  for (const git of [null, gitFinto({ guasto: true }).servizio]) {
    const b = banco(t, cartellaStore, { git });
    const sessionId = await obiettivoConcluso(b);
    assert.equal(b.consegne.length, 1);
    assert.doesNotMatch(b.consegne[0], /repository_state/u);
    assert.notEqual(stato(b, sessionId).stato, 'fatto', 'senza prove il revisore non può confermare: mai un «fatto»');
  }
}));

test('RSR-04 verso contrario: un percorso INVENTATO, non nello stato consegnato, non è una prova ⇒ «senza esito», mai «smentito»', async (t) => conStore(t, async (cartellaStore) => {
  const git = gitFinto({ voci: [{ percorso: 'test/app.test.js', x: ' ', y: 'M', tipo: 'modificato' }] });
  const b = banco(t, cartellaStore, { git: git.servizio, citato: 'test/inventato.test.js' });
  const sessionId = await obiettivoConcluso(b);
  assert.equal(stato(b, sessionId).confutazione?.esito, 'senza-esito');
  assert.equal(stato(b, sessionId).confutazione?.motivo, 'refutation-without-evidence');
}));

test('RSR-05 i percorsi si confrontano senza ./ e con le barre di Windows; una cartella non tracciata copre ciò che sta sotto', async (t) => conStore(t, async (cartellaStore) => {
  for (const [voci, citato] of [[[{ percorso: 'test/app.test.js', x: ' ', y: 'M' }], './test\\app.test.js'], [[{ percorso: 'test/', x: '?', y: '?' }], 'test/nuovo.test.js']]) {
    const b = banco(t, cartellaStore, { git: gitFinto({ voci }).servizio, citato });
    const sessionId = await obiettivoConcluso(b);
    assert.equal(stato(b, sessionId).confutazione?.esito, 'smentito', citato);
  }
}));

test('RSR-06 il tetto di 5 s fa mancare SOLO la parte scaduta: lo stato non committato appeso, i commit dell’obiettivo arrivano, e la consegna lo dice', async (t) => conStore(t, async (cartellaStore) => {
  const git = gitFinto({ lentoStato: true, commitDopo: true, fileDelCommit: [{ percorso: 'test/app.test.js', stato: 'M' }] });
  const b = banco(t, cartellaStore, { git: git.servizio });
  const sessionId = await obiettivoConcluso(b);
  const dati = JSON.parse(b.consegne[0].slice(b.consegne[0].indexOf('```json') + 7, b.consegne[0].lastIndexOf('```')));
  assert.deepEqual(dati.repository_state.incomplete, ['uncommitted_changes']);
  assert.ok(dati.repository_state.committed_since_goal_start.files.length > 0);
  assert.equal(stato(b, sessionId).confutazione?.esito, 'smentito');
}));

test('RSR-07 un servizio git senza commitDellaCartella: i commit mancano e lo si dice, mai la data d’autore di storia', async (t) => conStore(t, async (cartellaStore) => {
  const git = gitFinto({ vecchio: true, commitDopo: true });
  const b = banco(t, cartellaStore, { git: git.servizio });
  await obiettivoConcluso(b);
  assert.ok(!git.chiamate.some(([n]) => n === 'storia'), 'storia (data d’autore) non si usa più');
  assert.match(b.consegne[0], /"incomplete": \[\s*"committed_since_goal_start"/u);
}));
