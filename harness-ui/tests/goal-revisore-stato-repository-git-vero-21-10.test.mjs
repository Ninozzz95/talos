/*
 * Revisione C-3 (184562021) e sue cure (21/10/2026 sera), con git VERO: lo stato del repository nella consegna del confutatore e la lettura della sua smentita.
 *   C3-DATA-01  un commit fatto DOPO l'inizio dell'obiettivo con una data d'autore vecchia (`--date`, anche `--amend`, rebase, cherry-pick)
 *   C3-VUOTO-02 un repository senza commit
 *   C3-SOTTO-03 la cartella della sessione dentro un repository più grande
 *   C3-PROVA-04 la smentita che cita `{"repository_state": …}` come dice la consegna diventa «smentito»
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaServizioGit } from '../src/git-service.mjs';

const CONTRATTO = 'echo ok';
const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
async function aspetta(condizione, cosa, ms = 20_000) {
  const fino = Date.now() + ms;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  assert.fail(`mai successo: ${cosa}`);
}

function repo(t, { commitIniziale = true, sotto = null } = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-c3-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  git(radice, 'init', '-q', '-b', 'main');
  const cartella = sotto ? join(radice, sotto) : radice;
  mkdirSync(join(cartella, 'src'), { recursive: true }); mkdirSync(join(cartella, 'test'), { recursive: true });
  writeFileSync(join(cartella, 'src/app.js'), 'export const a = 1;\n');
  writeFileSync(join(cartella, 'test/app.test.js'), 'test 1\n');
  if (commitIniziale) { git(radice, 'add', '-A'); git(radice, 'commit', '-q', '-m', 'init'); }
  return { radice, cartella };
}

/* Il banco: conversazione a giri finti; il confutatore finto registra la consegna e risponde `risposta(consegna)`. */
function banco(cartellaStore, cartella, risposta) {
  const giri = [];
  const consegne = [];
  const { registro } = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    confutaObiettivoFn: undefined,
    repositoryFn: () => creaServizioGit({ cartellaDiSessione: () => cartella }),
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: CONTRATTO, task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    avviaSessioneFn: (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length + consegne.length}` });
      if (String(input.task?.consegna ?? '').includes('You are the TALOS goal refuter')) {
        consegne.push(input.task.consegna);
        const detto = risposta(input.task.consegna);
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
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
const datiDellaConsegna = (consegna) => JSON.parse(consegna.slice(consegna.indexOf('```json') + 7, consegna.lastIndexOf('```')));

async function giro(b, durante) {
  const { sessionId } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi();
  await passo();
  await b.registro.impostaObiettivo(sessionId, 'fix src/app.js; no test file may change', { criteri: [{ testo: 'the command passes', verifica: { tipo: 'comando', comando: CONTRATTO } }] });
  await new Promise((r) => setTimeout(r, 1100)); // l'obiettivo nasce prima dei commit del giro (date a risoluzione di secondo)
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'il giro della persona');
  durante();
  b.giri.at(-1).concludi();
  await aspetta(() => b.consegne.length > 0, 'la consegna al revisore');
  await aspetta(() => stato(b, sessionId).stato !== 'attivo' || stato(b, sessionId).confutazione, 'un esito');
  return sessionId;
}
const regge = () => '{"refuted": false, "reason": "ok"}';

test('C3-DATA-01 : un commit fatto DOPO l\'inizio dell\'obiettivo con una data d\'autore vecchia arriva al revisore', async (t) => conStore(t, async (cartellaStore) => {
  const { radice, cartella } = repo(t);
  const b = banco(cartellaStore, cartella, regge);
  await giro(b, () => {
    writeFileSync(join(cartella, 'test/app.test.js'), 'test 2\n');
    git(radice, 'commit', '-q', '-am', 'tweak tests', '--date=2020-01-01T00:00:00Z');
  });
  const dati = datiDellaConsegna(b.consegne[0]);
  t.diagnostic(JSON.stringify(dati.repository_state));
  assert.ok(JSON.stringify(dati.repository_state ?? {}).includes('test/app.test.js'), 'il file di test cambiato da un commit di DOPO non è nella consegna: il filtro legge la data d\'AUTORE (%aI)');
}));

test('C3-VUOTO-02: un repository senza commit dà almeno le modifiche non committate', async (t) => conStore(t, async (cartellaStore) => {
  const { cartella } = repo(t, { commitIniziale: false });
  const b = banco(cartellaStore, cartella, regge);
  await giro(b, () => {});
  const dati = datiDellaConsegna(b.consegne[0]);
  t.diagnostic(JSON.stringify(dati.repository_state));
  assert.ok(Array.isArray(dati.repository_state?.uncommitted_changes) && dati.repository_state.uncommitted_changes.length > 0);
}));

test('C3-SOTTO-03: dentro un repository più grande, il commit di un\'ALTRA cartella non entra fra i commit dell\'obiettivo', async (t) => conStore(t, async (cartellaStore) => {
  const { radice, cartella } = repo(t, { sotto: 'progetto' });
  const b = banco(cartellaStore, cartella, regge);
  await giro(b, () => {
    mkdirSync(join(radice, 'altro'), { recursive: true });
    writeFileSync(join(radice, 'altro/x.txt'), 'x\n');
    git(radice, 'add', '-A'); git(radice, 'commit', '-q', '-m', 'unrelated work elsewhere');
  });
  const dati = datiDellaConsegna(b.consegne[0]);
  t.diagnostic(JSON.stringify(dati.repository_state));
  assert.ok(!JSON.stringify(dati.repository_state ?? {}).includes('unrelated work elsewhere'), 'il soggetto di un commit fuori dalla cartella entra nella consegna');
}));

test('C3-PROVA-04 : la smentita con la prova nella forma che la consegna chiede diventa «smentito», non «senza esito»', async (t) => conStore(t, async (cartellaStore) => {
  const { cartella } = repo(t);
  const b = banco(cartellaStore, cartella, () => '{"refuted": true, "reason": "a test file changed", "evidence": [{"repository_state": "test/app.test.js"}]}');
  const sessionId = await giro(b, () => { writeFileSync(join(cartella, 'test/app.test.js'), 'test 3\n'); });
  assert.match(b.consegne[0], /cite a path listed there as \{"repository_state": "path"\} evidence/u, 'la consegna chiede questa forma');
  const o = stato(b, sessionId);
  t.diagnostic(`stato ${o.stato}, motivo ${JSON.stringify(o.motivo)}, confutazione ${JSON.stringify(o.confutazione)}`);
  assert.equal(o.confutazione?.esito, 'smentito', 'la forma che la consegna chiede è scartata da esitoDelConfutatore: «refutation-without-evidence»');
}));

test('C3-AMEND-05: un --amend fatto dopo l’inizio (la data d’autore resta quella di prima) arriva al revisore', async (t) => conStore(t, async (cartellaStore) => {
  const { radice, cartella } = repo(t);
  const b = banco(cartellaStore, cartella, regge);
  await giro(b, () => {
    writeFileSync(join(cartella, 'test/app.test.js'), 'test amend\n');
    git(radice, 'commit', '-q', '-a', '--amend', '--no-edit');
  });
  const dati = datiDellaConsegna(b.consegne[0]);
  assert.ok(JSON.stringify(dati.repository_state ?? {}).includes('test/app.test.js'), JSON.stringify(dati.repository_state));
}));

test('C3-GS-06 commitDellaCartella: senza commit un elenco vuoto, senza una data valida un rifiuto; mai un commit di prima', async (t) => {
  const vuoto = repo(t, { commitIniziale: false });
  assert.deepEqual(await creaServizioGit({ cartellaDiSessione: () => vuoto.cartella }).commitDellaCartella({ sessionId: 's', dalle: new Date().toISOString() }), { commit: [], altri: false });
  const pieno = repo(t);
  const servizio = creaServizioGit({ cartellaDiSessione: () => pieno.cartella });
  const rifiuto = await servizio.commitDellaCartella({ sessionId: 's', dalle: 'non una data' });
  assert.equal(Array.isArray(rifiuto?.commit), false, JSON.stringify(rifiuto));
  const futuro = await servizio.commitDellaCartella({ sessionId: 's', dalle: new Date(Date.now() + 3_600_000).toISOString() });
  assert.deepEqual(futuro.commit, [], 'il commit iniziale è di prima');
  const passato = await servizio.commitDellaCartella({ sessionId: 's', dalle: '2000-01-01T00:00:00Z' });
  assert.equal(passato.commit.length, 1);
  assert.equal(passato.commit[0].soggetto, 'init');
});

test('C3-GS-07 il confine si rilegge al millisecondo: un commit nello stesso secondo ma PRIMA dell’inizio resta fuori', async (t) => {
  const pieno = repo(t);
  const quando = Date.parse(git(pieno.radice, 'log', '-1', '--format=%cI').trim());
  const servizio = creaServizioGit({ cartellaDiSessione: () => pieno.cartella });
  const dopo = await servizio.commitDellaCartella({ sessionId: 's', dalle: new Date(quando + 500).toISOString() });
  assert.deepEqual(dopo.commit, [], '`--since` di git è al secondo e lo includerebbe');
  assert.equal((await servizio.commitDellaCartella({ sessionId: 's', dalle: new Date(quando).toISOString() })).commit.length, 1, 'al secondo esatto c’è');
});
