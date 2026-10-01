import {mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {talosLavora} from '../../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProvaAttesa} from '../aiuto/rimuovi-cartella-di-prova.mjs';

const mode = process.argv[2];
if (!['capture', 'legacy', 'wsl', 'capture-stop', 'legacy-stop'].includes(mode) || !global.gc) throw new Error('isolated --expose-gc driver required');
const capture = mode !== 'legacy' && mode !== 'legacy-stop';
const stopping = mode.endsWith('-stop');
const abort = new AbortController();
const directory = mkdtempSync(join(tmpdir(), 'talos-prova-memory-'));
const producer = join(directory, 'producer.cjs');
writeFileSync(producer, stopping
  ? "require('node:fs').appendFileSync('executions.txt','x');process.stdout.write('# tests 0\\n');setTimeout(()=>{},2000);"
  : `const{once}=require('node:events');const{appendFileSync}=require('node:fs');
appendFileSync('executions.txt','x');
(async()=>{const b=Buffer.alloc(65536,97);for(let i=0;i<1024;i++){
if(!process.stdout.write(b))await once(process.stdout,'drain');
if(i%16===15)await new Promise(r=>setTimeout(r,5));
}process.stdout.write('\\n# tests 0\\n');})();`);
global.gc();
const baseline = process.memoryUsage().heapUsed;
const samples = [], events = [];
let calls = 0, deliveredBytes = 0, nextSample = 4 * 1024 * 1024, processResult;
const sample = () => {global.gc(); samples.push(process.memoryUsage().heapUsed);};
const interval = !capture ? setInterval(sample, 20) : null;
const stopTimer = stopping ? setInterval(() => {
  try {if (readFileSync(join(directory, 'executions.txt'), 'utf8') === 'x') abort.abort();} catch {}
}, 30) : null;
try {
  await talosLavora({
    cartella: directory, task: {consegna: 'Esegui la prova locale.'}, modello: 'fixture', chiave: 'fixture',
    comandoProva: mode === 'wsl' ? 'node producer.cjs' : `"${process.execPath}" "${producer}"`,
    segnaleStop: abort.signal, livelloAccesso: 'completo', _giriMassimiInterno: 3,
    messaggiIniziali: [{role: 'system', content: 'Misura locale.'}, {role: 'user', content: 'Esegui.'}],
    fetchDiRete: async () => {
      const message = calls++ === 0
        ? {role: 'assistant', content: '', tool_calls: [{id: 'memory', type: 'function', function: {name: 'prova', arguments: '{}'}}]}
        : {role: 'assistant', content: 'Fine.'};
      return Response.json({choices: [{message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop'}]});
    },
    onGiro: event => {if (event.tipo === 'tool-esito') events.push({isError: event.isError, content: event.content});},
    ...(capture ? {
      ambienteComandiFn: () => ({dove: mode === 'wsl' ? 'wsl2' : 'windows', revisione: 0}),
      captureProcessFn: async (_id, execute) => {
        processResult = await execute({onBytes: ({bytes}) => {
          deliveredBytes += bytes.length;
          if (deliveredBytes >= nextSample) {sample(); nextSample += 4 * 1024 * 1024;}
        }});
        return processResult;
      },
    } : {}),
  });
} finally {clearInterval(interval); clearInterval(stopTimer);}
const retainedGrowth = Math.max(baseline, ...samples) - baseline;
const executions = readFileSync(join(directory, 'executions.txt'), 'utf8');
const relativeTemporary = relative(resolve(tmpdir()), resolve(directory));
assert.ok(relativeTemporary && !relativeTemporary.startsWith('..') && !isAbsolute(relativeTemporary));
await rimuoviCartellaDiProvaAttesa(directory); // producer closed before cleanup
console.log(JSON.stringify({mode, baseline, retainedGrowth, samples: samples.length, deliveredBytes,
  executions, calls, events, exitCode: processResult?.codice, actualExitCode: processResult?.actualExitCode}));
