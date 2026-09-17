import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLlamaBinaryProbe } from '../src/llama-binary-probe.mjs';

/*
 * La sonda asincrona del motore locale (PR #30 dell'owner, applicata il 17/09/2026) lanciava il binario SENZA `env`, cioè con
 * l'ambiente INTERO del server: `TALOS_HARNESS_UI_TOKEN` (il token che protegge tutta la API locale), la coppia delle ricevute,
 * la chiave della ricerca. È uno dei punti dell'elenco `.claude/ELENCO-SPAWN-AMBIENTE-2026-09-17.md` (CLI-REQ-04), lo stesso
 * difetto curato lo stesso giorno per il terminale e per il browser pilotato. Un `llama-server` scaricato è un binario di terzi:
 * non ha nessun motivo di vedere quei nomi.
 * ⛔ Il filtro è SOTTRATTIVO: toglie i soli nomi che esistono perché TALOS li ha messi, e lascia tutto il resto — al motore
 *   servono `PATH`, `SystemRoot`, `CUDA_VISIBLE_DEVICES`, `GGML_*`, `VK_*`, e una lista ammessa li perderebbe.
 * File a sé, così quello della PR resta byte per byte il suo.
 */
function figlioFinto() {
  const figlio = new EventEmitter();
  figlio.stdout = new EventEmitter();
  figlio.stderr = new EventEmitter();
  figlio.kill = () => true;
  queueMicrotask(() => { figlio.stdout.emit('data', Buffer.from('ok')); figlio.emit('close', 0, null); });
  return figlio;
}

test('SONDA-AMBIENTE-01 — la sonda NON passa al binario i segreti del server, e gli lascia tutto il resto', async () => {
  const salvati = {};
  const finti = {
    TALOS_HARNESS_UI_TOKEN: 'a'.repeat(64),
    TALOS_HARNESS_RECEIPT_KEY_ID: 'chiave-finta',
    TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64: 'segreto-finto',
    TALOS_HARNESS_SEARCH_API_KEY: 'ricerca-finta',
    ELECTRON_RUN_AS_NODE: '1',
    CUDA_VISIBLE_DEVICES: '0',
    GGML_VK_VISIBLE_DEVICES: '0',
  };
  for (const [k, v] of Object.entries(finti)) { salvati[k] = process.env[k]; process.env[k] = v; }
  let opzioni;
  try {
    const sonda = createLlamaBinaryProbe({ spawnImpl: (_eseguibile, _argomenti, o) => { opzioni = o; return figlioFinto(); } });
    assert.match(await sonda('llama-server', ['--help'], 1000), /ok/u);
  } finally {
    for (const [k, v] of Object.entries(salvati)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  assert.ok(opzioni.env && typeof opzioni.env === 'object', 'la sonda deve passare un ambiente ESPLICITO: senza `env` Node eredita tutto');
  // I nomi scritti a mano, non letti dall'elenco del prodotto: con un elenco svuotato questa prova deve cadere.
  for (const nome of ['TALOS_HARNESS_UI_TOKEN', 'TALOS_HARNESS_RECEIPT_KEY_ID', 'TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64', 'TALOS_HARNESS_SEARCH_API_KEY', 'ELECTRON_RUN_AS_NODE']) {
    assert.equal(opzioni.env[nome], undefined, `${nome} non deve arrivare a un binario di terzi`);
  }
  assert.equal(opzioni.env.CUDA_VISIBLE_DEVICES, '0', 'ciò che serve al motore resta');
  assert.equal(opzioni.env.GGML_VK_VISIBLE_DEVICES, '0');
  assert.ok(opzioni.env.PATH ?? opzioni.env.Path, 'e resta il PATH: senza, su Windows le DLL del motore non si trovano');
  assert.equal(opzioni.shell, false, 'la pulizia dell\'ambiente non allenta nient\'altro');
  assert.equal(opzioni.windowsHide, true);
});
