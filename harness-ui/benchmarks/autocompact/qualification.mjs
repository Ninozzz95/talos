import { mkdir, readFile, writeFile, appendFile, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostname, cpus, totalmem, freemem } from 'node:os';
import { createRecorder, startRuntime, createLoopbackBridge, countRequest, complete, runReadOnlyTurn } from './runtime.mjs';
import { createEngine } from './engines.mjs';
import { loadRecoveredHistory, scoreRecall, validateSummary, writeCheckpoint, readCheckpoint, makeMemoryHistory } from './cases.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const root = join(repo, 'scratchpad/prove/autocompact-qualification-20260908');
const ownerModule = resolve(repo, '../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs');
const args = process.argv.slice(2);
const option = (name, fallback) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const arms = option('arms', 'talos,pi,hermes,lcm').split(',');
const scenarios = option('scenarios', 'resume,memory,tools,continuity').split(',');
const repetitions = Number(option('repetitions', '3'));
if (!arms.every(x => ['talos','pi','hermes','lcm'].includes(x)) || !scenarios.every(x => ['resume','memory','tools','continuity'].includes(x)) || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3) throw new Error('INVALID_BENCH_SELECTION');
await mkdir(root, { recursive: true });
const sources = await readFile(join(root, 'sources.json'), 'utf8').then(JSON.parse, () => []);
const datasets = JSON.parse(await readFile(join(root, 'datasets.json'), 'utf8'));
const models = [];
for (const name of await readdir(join(repo, 'harness-ui/.local-models/manifests'))) {
  if (!name.endsWith('.json')) continue;
  const model = JSON.parse(await readFile(join(repo, 'harness-ui/.local-models/manifests', name), 'utf8'));
  if (/Nemotron-Cascade-2|gpt-oss-20b/u.test(model.id)) models.push(model);
}
models.sort((a,b) => a.id.localeCompare(b.id));
const selection = option('models', 'all');
const selected = models.filter(m => selection === 'all' || (selection === 'nemotron' && m.id.includes('Nemotron')) || (selection === 'gptoss' && m.id.includes('gpt-oss')));
if (!selected.length) throw new Error('NO_SELECTED_MODELS');
const hashFile = async path => { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); };
const recoveredPath = join(repo, 'scratchpad/prove/recupero-locale-20260908/sessions/8407d564-f7a0-4e4c-b737-ca5851046a50.jsonl');
const recovered = await loadRecoveredHistory(recoveredPath);
if (recovered.version !== 6 || recovered.messages.length !== 406 || recovered.sha256 !== datasets.ownerCopy.sha256) throw new Error('RECOVERED_HISTORY_CHANGED');
const checks = { at: new Date().toISOString(), scope: 'component qualification; full application gates separate', node: process.version, ownerModule, ownerModuleSha256: await hashFile(ownerModule), recovered: { version: recovered.version, messages: recovered.messages.length, sha256: recovered.sha256 }, models: [], sources, arms, scenarios, repetitions, window: 16384, responseReserve: 4096, run: args.includes('--run') };
for (const model of selected) {
  const path = join(repo, 'harness-ui/.local-models', model.path, model.files[0].path);
  const info = await stat(path);
  const entry = { id: model.id, path, bytes: info.size, expectedSha256: model.files[0].sha256, state: model.state, sha256: null, verified: false };
  if (args.includes('--run') || args.includes('--hash-models')) {
    console.log(`Verifico GGUF: ${model.id}`);
    entry.sha256 = await hashFile(path);
    entry.verified = entry.sha256 === entry.expectedSha256 && info.size === model.files[0].bytes;
    if (!entry.verified) throw new Error(`GGUF_MISMATCH: ${model.id}`);
  }
  checks.models.push(entry);
}
await writeFile(join(root, 'checks.json'), JSON.stringify(checks, null, 2));
if (!args.includes('--run')) { console.log(JSON.stringify(checks, null, 2)); process.exit(0); }

const batchId = new Date().toISOString().replaceAll(':','-');
const batchRoot = join(root, 'runs', batchId);
await mkdir(batchRoot, { recursive: true });
await writeFile(join(batchRoot,'checks.json'), JSON.stringify(checks,null,2));
const hardware = { at: new Date().toISOString(), hostname: hostname(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), freeMemoryBytes: freemem() };
await writeFile(join(batchRoot,'hardware.json'), JSON.stringify(hardware,null,2));
let scope = {};
let caseEvents = [];
const recorder = createRecorder(batchRoot);
const record = async (kind, value) => { const event = await recorder(kind, { scope, ...value }); caseEvents.push(event); return event; };
const rows = [];
const emit = async row => { rows.push(row); await appendFile(join(batchRoot,'results.jsonl'), JSON.stringify(row)+'\n'); console.log(`${row.model} / ${row.arm} / ${row.scenario} / ${row.repetition}: ${row.status}${row.error ? ` (${row.error})` : ''}`); };
const expected = ['Livia', 'quercia-47', 'AQ-193', 'Aurora', 'giovedì'];
const recallPrompt = 'Quale decisione avevamo preso? Rispondi con cinque righe: Nome:, Ramo:, Ticket:, Progetto:, Consegna:. Per ciascuna scrivi solo il valore ricordato, senza inventare.';
let interrupted = false;
const cancel = new AbortController();
process.once('SIGINT', () => { interrupted = true; cancel.abort(); });
process.once('SIGTERM', () => { interrupted = true; cancel.abort(); });

for (const manifest of selected) {
  if (interrupted) break;
  let runtime, bridge;
  try {
    scope = { model: manifest.id, phase: 'runtime' };
    runtime = await startRuntime({ repo, root: batchRoot, manifest, record });
    bridge = await createLoopbackBridge(runtime);
    // Verify the installed binary before the first inference; no assumption from docs.
    const probeBody = { model: runtime.model, messages: [{ role: 'user', content: 'Ciao.' }], max_tokens: 4096, stream: false };
    const probe = await countRequest(runtime, probeBody);
    await record('count-endpoint-gate', { body: probeBody, result: probe });
    for (const arm of arms) for (const scenario of scenarios) for (let repetition = 1; repetition <= repetitions; repetition++) {
      if (interrupted) break;
      scope = { model: manifest.id, arm, scenario, repetition };
      caseEvents = [];
      const started = performance.now();
      const caseDir = join(batchRoot, `${manifest.id}-${arm}-${scenario}-${repetition}`);
      await mkdir(caseDir, { recursive: true });
      const row = { ...scope, status: 'failed', boundary: 'real-compactor + common-readonly-bench-loop', checkpointKind: 'benchmark-json', at: new Date().toISOString(), fullApplicationQualified: false };
      let engine;
      try {
        if (['hermes','lcm'].includes(arm) && sources.find(s => s.name === 'hermes')?.status !== 'ready') throw new Error('PINNED_HERMES_NOT_READY');
        if (arm === 'lcm' && sources.find(s => s.name === 'lcm')?.status !== 'ready') throw new Error('PINNED_LCM_NOT_READY');
        engine = await createEngine(arm, { runtime, sources, home: caseDir, bridge, sessionId: `${arm}-${scenario}-${repetition}`, ownerModule });
        let messages = structuredClone(scenario === 'resume' ? datasets.ownerCopy.messages : datasets.memory);
        await writeFile(join(caseDir,'original.json'), JSON.stringify(messages,null,2), { flag: 'wx' });
        const originalHash = await hashFile(join(caseDir,'original.json'));
        await writeCheckpoint(join(caseDir,'checkpoint.json'), { generation: 0, messages, originalHash });
        const rounds = scenario === 'memory' ? 5 : 1;
        row.compactions = [];
        for (let round = 1; round <= rounds; round++) {
          if (interrupted) throw new Error('BENCH_CANCELLED');
          if (round > 1) {
            // Identical declared filler, no repeated facts that could re-teach recall.
            messages.push(...makeMemoryHistory().slice(3,-1).slice(0,24));
            messages.push({ role: 'user', content: `Proseguiamo con il controllo ${round}. Mantieni le decisioni già prese.` });
          }
          const before = await countRequest(runtime, { model: runtime.model, messages, max_tokens: 4096, stream: false });
          const result = await engine.compact(messages, before.tokens);
          cancel.signal.throwIfAborted();
          await writeFile(join(caseDir,`native-summary-${round}.json`), JSON.stringify(result,null,2));
          const after = await countRequest(runtime, { model: runtime.model, messages: result.messages, max_tokens: 4096, stream: false });
          if (!before.exact || !after.exact) throw new Error('EXACT_COUNT_REQUIRED_FOR_QUALIFICATION');
          validateSummary(result, { before: before.tokens, after: after.tokens, limit: 12288 });
          await writeCheckpoint(join(caseDir,'checkpoint.json'), { generation: round, messages: result.messages, originalHash }, { signal: cancel.signal });
          row.compactions.push({ round, before, after });
          messages = result.messages;
        }
        if (scenario === 'continuity') {
          // A fresh Node process reads the persisted file. This proves the bank's
          // checkpoint, not native application restart/session-store semantics.
          const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module','-e','import{readFileSync}from"node:fs";process.stdout.write(readFileSync(process.argv[1],"utf8"));',join(caseDir,'checkpoint.json')], { windowsHide: true, maxBuffer: 8_000_000 });
          const persisted = JSON.parse(stdout);
          if (persisted.originalHash !== originalHash || persisted.generation !== 1) throw new Error('CHECKPOINT_RESTART_MISMATCH');
          await engine.restart?.();
          messages = persisted.messages;
          row.freshCheckpointReaderProcess = true;
          row.nativeApplicationRestart = 'not-tested';
        }
        const question = scenario === 'resume' ? 'Riprendiamo da dove eravamo. Qual era il lavoro in corso? Non eseguire nuove azioni.' : scenario === 'tools' ? 'Leggi il file README.md e controlla il codice. Rispondi con una sola riga «Codice:» seguita dal valore letto. Non indovinarlo e non modificare file.' : recallPrompt;
        cancel.signal.throwIfAborted();
        await record('human-question', { question });
        messages.push({ role: 'user', content: question });
        const answer = scenario === 'tools' ? await runReadOnlyTurn(runtime, messages, join(root,'fixture'), cancel.signal) : await complete(runtime, messages);
        cancel.signal.throwIfAborted();
        row.answer = answer.text;
        row.finishReason = answer.finishReason;
        row.executed = answer.executed ?? [];
        if (scenario === 'memory' || scenario === 'continuity') row.recall = scoreRecall(answer.text, expected);
        const answered = typeof answer.text === 'string' && answer.text.trim().length > 0 && answer.finishReason === 'stop';
        if (scenario === 'tools') row.success = answered && row.executed.some(e => e.name === 'leggi' && e.content.includes('sole-47')) && scoreRecall(answer.text, ['sole-47']).correct === 1;
        else if (row.recall) row.success = answered && row.recall.correct === row.recall.total;
        else { row.success = null; row.responseAvailable = answered; row.manualReferenceReview = 'required'; }
        row.originalPreserved = await hashFile(join(caseDir,'original.json')) === originalHash;
        if (!row.originalPreserved) throw new Error('ORIGINAL_CHANGED');
        row.status = row.success === true ? 'passed-component-case' : row.success === null && row.responseAvailable ? 'needs-reference-review' : 'failed';
        row.constraintCheck = { writesExposed: false, writesExecuted: 0, limitation: 'readonly tool allowlist enforces policy; this does not grade model refusal of write tools' };
      } catch (error) { row.error = error.message; row.status = 'failed'; }
      finally { await engine?.close().catch(error => { row.cleanupError = error.message; row.status = 'failed'; }); }
      row.elapsedMs = performance.now() - started;
      const responses = caseEvents.filter(e => e.kind === 'response' && e.path === '/v1/chat/completions');
      row.requestCount = caseEvents.filter(e => e.kind === 'request' && e.path === '/v1/chat/completions').length;
      row.refusedRequests = responses.filter(e => e.status >= 400).length;
      row.tokens = responses.reduce((sum,e) => ({ input: sum.input + (e.payload.usage?.prompt_tokens ?? 0), output: sum.output + (e.payload.usage?.completion_tokens ?? 0) }), { input: 0, output: 0 });
      row.nodeRssPeakObserved = Math.max(0,...responses.map(e => e.processMemory.rss));
      row.serverAndGpuPeakMemory = 'not-measured';
      await emit(row);
    }
  } catch (error) { await emit({ model: manifest.id, phase: 'runtime', status: 'failed', error: error.message }); }
  finally { await bridge?.close(); await runtime?.stop(); }
}
const finalHistory = await loadRecoveredHistory(recoveredPath);
const summary = { batchId, root: batchRoot, completedAt: new Date().toISOString(), interrupted, originalHistoryUnchanged: finalHistory.sha256 === recovered.sha256, expectedCases: selected.length * arms.length * scenarios.length * repetitions, recordedCases: rows.filter(r => r.scenario).length, passedComponentCases: rows.filter(r => r.status === 'passed-component-case').length, failed: rows.filter(r => r.status === 'failed').length, needsReferenceReview: rows.filter(r => r.status === 'needs-reference-review').length, fullQualificationComplete: false, remainingGates: ['full application composer/tool/restart paths', 'server/GPU peak memory', 'human review of recovered-history references', 'fault matrix through each native upstream'] };
await writeFile(join(batchRoot,'summary.json'), JSON.stringify(summary,null,2));
await writeFile(join(root,'summary.json'), JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
if (summary.failed || interrupted) process.exitCode = 2;
