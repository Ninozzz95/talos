/*
 * H-04 (red-team degli attrezzi, ZIP dell'owner del 02/10/2026): `prova` senza una suite usciva `exit 127`, ma 127 in POSIX
 *   vuol dire «comando non trovato»: chi legge il codice crede che manchi npm, non che i test non siano partiti. E sul
 *   desktop il 127 era FABBRICATO: si lanciava davvero `echo …&& exit 127`.
 * Owner, 02/10/2026 sera, «Voglio il +1», poi «Sì, tutti e due»: «NOT RUN», nessun codice d'uscita finto, e i comandi di test
 *   trovati nel progetto come mossa dopo; la scheda resta «Non eseguito».
 * ⛔ Corretto rispetto all'anteprima mostrata all'owner: `prova` NON prende argomenti (il comando lo fissa la sessione), quindi la
 *   mossa dopo è il runner trovato lanciato con `shell`, non «prova comandoProva:…».
 * Come fanno gli altri (17/09 e 02/10/2026): né Claude Code né Codex né Hermes hanno un attrezzo dedicato ai test; da loro «il
 *   comando di test non c'è» è l'errore del comando lanciato con la shell. La garanzia è nostra.
 * Ledger: AVM-harness-desktop/.claude/LEDGER-ZIP-OWNER-2026-10-02.md, sezione «+1».
 */
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {runnerDiTestNelProgetto, talosLavora} from '../src/kernel/talosHarness.mjs';
import {motivoProvaSenzaSuiteDesktop, talosLavora as talosLavoraDesktop} from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import {processiDaEventi} from '../src/session-registry.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartella(t, file = {}) {
  const c = mkdtempSync(join(tmpdir(), 'talos-h04-'));
  t.after(() => rimuoviCartellaDiProva(c));
  for (const [nome, contenuto] of Object.entries(file)) {
    mkdirSync(join(c, nome, '..'), {recursive: true});
    writeFileSync(join(c, nome), typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto));
  }
  return c;
}
const chiamaProva = () => ({id: 'p1', type: 'function', function: {name: 'prova', arguments: '{}'}});
async function giro(lavora, c, opzioni = {}) {
  let n = 0;
  const ricevute = [], eventi = [];
  const esito = await lavora({
    cartella: c, task: {consegna: 'verifica'}, modello: 'x', chiave: 'y', livelloAccesso: 'accesso-pieno',
    onGiro: (e) => { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta); },
    onEvento: (e) => eventi.push(e),
    fetchDiRete: async () => ({ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{message: n++ === 0 ? {role: 'assistant', content: null, tool_calls: [chiamaProva()]} : {role: 'assistant', content: 'fatto'}}],
      usage: {prompt_tokens: 10, completion_tokens: 5},
    })}),
    ...opzioni,
  });
  return {esito: esito.messaggiFinali.find((m) => m.role === 'tool')?.content ?? '', ricevuta: ricevute.find((r) => r.toolCallId === 'p1'), eventi};
}

test('H04-KERNEL: niente suite ⇒ NOT RUN, nessun codice d\'uscita, nessun «exit 127»', async (t) => {
  const c = cartella(t);
  const {esito, ricevuta} = await giro(talosLavora, c, {comandoProva: 'npm test'});
  assert.match(esito, /^NOT RUN: NO_TEST_SUITE_CONFIGURED — no test suite found in /u);
  assert.match(esito, /No command was run, so there is no exit code; this is not a pass\./u);
  assert.doesNotMatch(esito, /^exit /mu, 'nessuna testata «exit N»: niente è girato');
  assert.doesNotMatch(esito, /127/u);
  assert.equal(ricevuta.evidence.exitCode, null, 'la ricevuta non inventa un codice');
  assert.equal(ricevuta.status, 'failed', 'non è un successo');
});

test('H04-RUNNER: i runner trovati nel progetto diventano la mossa dopo, con shell', async (t) => {
  const c = cartella(t, {'package.json': {name: 'x', devDependencies: {vitest: '^3.2.0'}}});
  const {esito} = await giro(talosLavora, c, {comandoProva: 'npm test'});
  assert.match(esito, /^NOT RUN: NO_TEST_SUITE_CONFIGURED/u);
  assert.match(esito, /Test runners found in this folder: vitest \(package\.json devDependencies\)/u);
  assert.match(esito, /To run one, use shell, e\.g\. `npx vitest run`\./u);
});

test('H04-RILEVAMENTO: pytest, cargo, go, dotnet, make, node --test — e niente quando non c\'è niente', async (t) => {
  const python = cartella(t, {'pyproject.toml': '[project]\nname = "x"\n\n[tool.pytest.ini_options]\naddopts = "-q"\n'});
  assert.deepEqual((await runnerDiTestNelProgetto(python)).map((r) => r.comando), ['python -m pytest']);
  const rust = cartella(t, {'Cargo.toml': '[package]\nname = "x"\n'});
  assert.deepEqual((await runnerDiTestNelProgetto(rust)).map((r) => r.comando), ['cargo test']);
  const go = cartella(t, {'go.mod': 'module x\n'});
  assert.deepEqual((await runnerDiTestNelProgetto(go)).map((r) => r.comando), ['go test ./...']);
  const net = cartella(t, {'App.csproj': '<Project />'});
  assert.deepEqual((await runnerDiTestNelProgetto(net)).map((r) => r.comando), ['dotnet test']);
  const make = cartella(t, {'Makefile': 'build:\n\techo b\ntest:\n\techo t\n'});
  assert.deepEqual((await runnerDiTestNelProgetto(make)).map((r) => r.comando), ['make test']);
  const node = cartella(t, {'tests/somma.test.mjs': 'import test from "node:test"\n'});
  assert.deepEqual((await runnerDiTestNelProgetto(node)).map((r) => r.comando), ['node --test']);
  const vuota = cartella(t, {'note.txt': 'niente'});
  assert.deepEqual(await runnerDiTestNelProgetto(vuota), []);
  const {esito} = await giro(talosLavora, vuota, {comandoProva: 'npm test'});
  assert.match(esito, /No test runner was found in this folder either/u);
});

test('H04-DESKTOP: il desktop non lancia più un `exit 127` finto — è lo stesso NOT RUN, col motivo del desktop', async (t) => {
  const senzaScript = cartella(t, {'package.json': {name: 'x', scripts: {}}});
  const {esito} = await giro(talosLavoraDesktop, senzaScript);
  assert.match(esito, /^NOT RUN: NO_TEST_SUITE_CONFIGURED — no test suite found in .*: package\.json has no scripts\.test\./u);
  assert.doesNotMatch(esito, /\[sandbox|^exit /mu, 'nessun processo è partito');
  const segnaposto = cartella(t, {'package.json': {name: 'x', scripts: {test: 'echo "Error: no test specified" && exit 1'}}});
  assert.match((await giro(talosLavoraDesktop, segnaposto)).esito, /npm init placeholder/u);
});

test('H04-DESKTOP-CONTRARIO: una suite vera, un comando esplicito o un package.json rotto non sono «senza suite»', async (t) => {
  const vera = cartella(t, {'package.json': {name: 'x', scripts: {test: 'node --test'}}});
  assert.equal(await motivoProvaSenzaSuiteDesktop({cartella: vera, comandoProva: 'npm test'}), null);
  const rotto = cartella(t, {'package.json': '{ rotto'});
  assert.equal(await motivoProvaSenzaSuiteDesktop({cartella: rotto, comandoProva: 'npm test'}), null);
  const vuota = cartella(t);
  assert.equal(await motivoProvaSenzaSuiteDesktop({cartella: vuota, comandoProva: 'npm test -- --runInBand'}), null, 'un comando non di serie si lancia com\'è');
  assert.equal(await motivoProvaSenzaSuiteDesktop({cartella: vuota, comandoProva: 'npm test', esplicito: true}), null);
  assert.equal(await motivoProvaSenzaSuiteDesktop({cartella: vuota, comandoProva: 'npm test'}), 'there is no package.json in this folder');
});

test('H04-PROCESSI: il registro dei processi legge NOT RUN come «non eseguito», senza codice', () => {
  const eventi = [
    {type: 'ToolCallStart', toolCallId: 'p1', toolCallName: 'prova', _sequenza: 1},
    {type: 'ToolCallArgs', toolCallId: 'p1', delta: '{}', _sequenza: 2},
    {type: 'ToolCallResult', toolCallId: 'p1', content: 'NOT RUN: NO_TEST_SUITE_CONFIGURED — no test suite found in C:\\x: there is no package.json in this folder. No command was run, so there is no exit code; this is not a pass.', _sequenza: 3},
  ];
  const [p] = processiDaEventi(eventi).processi;
  assert.equal(p.esito, 'non-eseguito');
  assert.equal(p.codiceUscita, null);
});
