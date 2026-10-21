/*
 * L1-c del motore locale (owner 20/10/2026): la compattazione legacy di una conversazione col motore del PC usava la soglia
 * di 200.000 token (finestra «ignota») contro una finestra vera di 16.384, quindi non compattava mai in anticipo: overflow,
 * riassunto d'emergenza, LOCAL_CONTEXT_EXCEEDED (sessione e00ae242, «soglia 200000», «tokenPrima 16423»).
 * ⇒ Il supervisore legge `n_ctx` da `/props` quando il motore è pronto e lo dice in `status().windowTokens`; chi calcola la
 *   finestra di un modello `local:` la prende da lì, SOLO se il modello caricato è proprio quello.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { finestraDelMotoreLocale, FINESTRA_PRUDENTE } from '../src/llama-server-supervisor.mjs';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* Un percorso ASSOLUTO su ogni sistema (il supervisore rifiuta gli altri): `C:\\m.gguf` su Linux non lo è, e sul Pad (Linux/arm64
   dentro l'app) le prove cadevano con RUNTIME_INVALID (Mobile, K4-A del 20/10). Il file non serve: il processo è finto. */
const MODELLO = join(tmpdir(), 'm.gguf');

function childProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.emit('close', 0); return true; };
  return child;
}

function supervisore(props, { okProps = true, finestreFile = null } = {}) {
  return createLlamaServerSupervisor({
    binaryPath: 'llama-server.exe', finestreFile,
    spawnImpl: () => childProcess(),
    fetchImpl: async (url) => {
      if (String(url).endsWith('/props')) {
        if (props instanceof Error) throw props;
        return { ok: okProps, status: okProps ? 200 : 500, json: async () => props };
      }
      return { ok: true, status: 200 };
    },
    portAllocator: async () => 18081,
    pollIntervalMs: 1,
  });
}

test('L1C-01 a motore pronto lo stato dice la finestra VERA letta da /props', async () => {
  const s = supervisore({ default_generation_settings: { n_ctx: 16384 } });
  const stato = await s.start({ modelId: 'LFM2.5', modelPath: MODELLO });
  assert.equal(stato.state, 'ready');
  assert.equal(stato.windowTokens, 16384);
  assert.equal(s.status().windowTokens, 16384);
});

test('L1C-02 al contrario: /props che fallisce o dice un numero non valido non inventa una finestra, e il motore resta pronto', async () => {
  for (const props of [new Error('ECONNRESET'), {}, { default_generation_settings: { n_ctx: 0 } }, { default_generation_settings: { n_ctx: '16384' } }]) {
    const s = supervisore(props);
    const stato = await s.start({ modelId: 'LFM2.5', modelPath: MODELLO });
    assert.equal(stato.state, 'ready', JSON.stringify(String(props)));
    assert.equal(Object.hasOwn(stato, 'windowTokens'), false, JSON.stringify(props));
  }
  // un /props che risponde con un errore non vale, anche se il corpo sembra giusto
  const errore = await supervisore({ default_generation_settings: { n_ctx: 16384 } }, { okProps: false }).start({ modelId: 'LFM2.5', modelPath: MODELLO });
  assert.equal(errore.state, 'ready');
  assert.equal(Object.hasOwn(errore, 'windowTokens'), false);
});

test('L1C-03 la finestra di un modello `local:`: il motore pronto con quel modello, poi quella vista l\'ultima volta, poi la prudente; mai la «ignota»', () => {
  const pronto = { state: 'ready', modelId: 'LFM2.5', windowTokens: 65536 };
  const nota = { notaFn: (id) => (id === 'LFM2.5' ? 65536 : undefined) };
  assert.equal(finestraDelMotoreLocale(() => pronto, 'local:LFM2.5'), 65536);
  // revisione T3: il motore non è ancora partito (primo giro dopo un riavvio, o un altro modello acceso)
  assert.equal(finestraDelMotoreLocale(() => ({ state: 'unavailable' }), 'local:LFM2.5', nota), 65536, 'la finestra vista');
  assert.equal(finestraDelMotoreLocale(() => ({ ...pronto, modelId: 'Altro', windowTokens: 4096 }), 'local:LFM2.5', nota), 65536, 'la finestra di un ALTRO modello acceso non vale');
  assert.equal(finestraDelMotoreLocale(() => ({ state: 'unavailable' }), 'local:Mai-acceso', nota), FINESTRA_PRUDENTE, 'mai visto: prudente');
  assert.equal(finestraDelMotoreLocale(null, 'local:LFM2.5'), FINESTRA_PRUDENTE, 'senza supervisore');
  assert.equal(finestraDelMotoreLocale(() => { throw new Error('x'); }, 'local:LFM2.5', { notaFn: () => { throw new Error('y'); } }), FINESTRA_PRUDENTE);
  assert.equal(finestraDelMotoreLocale(() => ({ state: 'ready', modelId: 'LFM2.5' }), 'local:LFM2.5'), FINESTRA_PRUDENTE, 'pronto ma finestra non letta');
  // al contrario: un altro motore non è nostro, e la fonte si legge dal prefisso
  assert.equal(finestraDelMotoreLocale(() => pronto, 'ollama:LFM2.5', nota), undefined, 'Ollama non è il nostro motore');
  assert.equal(finestraDelMotoreLocale(() => pronto, 'openrouter:liquid/local:LFM2.5', nota), undefined);
});

test('L1C-04 (revisione T2) un motore che muore durante la lettura di /props NON è pronto, e un nuovo avvio non è bloccato', async () => {
  let vivo;
  const s = createLlamaServerSupervisor({
    binaryPath: 'llama-server.exe', spawnImpl: () => (vivo = childProcess()),
    fetchImpl: async (url) => {
      if (String(url).endsWith('/props')) { vivo.emit('close', 1); return { ok: false, status: 0 }; }
      return { ok: true, status: 200 };
    },
    portAllocator: async () => 18082, pollIntervalMs: 1,
  });
  await assert.rejects(s.start({ modelId: 'X', modelPath: MODELLO, contextLength: 8192 }), { code: 'RUNTIME_PROCESS_FAILED' });
  assert.notEqual(s.status().state, 'ready');
});

test('L1C-05 (revisione T3) il supervisore ricorda la finestra vera di un modello acceso, anche dopo lo stop', async () => {
  const s = supervisore({ default_generation_settings: { n_ctx: 65536 } });
  assert.equal(s.finestraNota('LFM2.5'), undefined);
  await s.start({ modelId: 'LFM2.5', modelPath: MODELLO });
  await s.stop();
  assert.equal(s.finestraNota('LFM2.5'), 65536);
  assert.equal(s.finestraNota('Altro'), undefined);
  // al contrario: una finestra non letta non si ricorda
  const muto = supervisore(new Error('giù'));
  await muto.start({ modelId: 'LFM2.5', modelPath: MODELLO });
  assert.equal(muto.finestraNota('LFM2.5'), undefined);
});

test('L1C-06 (quarta revisione D3) la finestra vista sopravvive al riavvio dell\'app; un file rotto non ferma niente', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-l1c-'));
  try {
    const file = join(cartella, 'modelli', 'finestre-viste.json');
    const primo = supervisore({ default_generation_settings: { n_ctx: 65536 } }, { finestreFile: file });
    await primo.start({ modelId: 'LFM2.5', modelPath: MODELLO });
    await primo.stop();
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { 'LFM2.5': 65536 });
    // «riavvio dell'app»: un supervisore nuovo, motore spento, sa già la finestra
    const dopo = supervisore(new Error('spento'), { finestreFile: file });
    assert.equal(dopo.finestraNota('LFM2.5'), 65536);
    assert.equal(finestraDelMotoreLocale(() => dopo.status(), 'local:LFM2.5', { notaFn: (id) => dopo.finestraNota(id) }), 65536);
    // al contrario: un file rotto o con valori non validi vale «non lo so», mai un errore
    writeFileSync(file, '{rotto');
    assert.equal(supervisore(new Error('x'), { finestreFile: file }).finestraNota('LFM2.5'), undefined);
    writeFileSync(file, JSON.stringify({ 'LFM2.5': -1, Altro: '65536' }));
    const strano = supervisore(new Error('x'), { finestreFile: file });
    assert.equal(strano.finestraNota('LFM2.5'), undefined);
    assert.equal(strano.finestraNota('Altro'), undefined);
  } finally { rimuoviCartellaDiProva(cartella); }
});

test('L1C-07 (quinta revisione V4) due processi sulla stessa cartella dati: ognuno aggiunge la sua finestra, nessuno cancella l\'altra', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-l1c-'));
  try {
    const file = join(cartella, 'finestre-viste.json');
    const app = supervisore({ default_generation_settings: { n_ctx: 65536 } }, { finestreFile: file });
    const banco = supervisore({ default_generation_settings: { n_ctx: 32768 } }, { finestreFile: file }); // nato PRIMA che l'app scriva
    await app.start({ modelId: 'LFM2.5', modelPath: MODELLO });
    await app.stop();
    await banco.start({ modelId: 'Qwen3', modelPath: MODELLO });
    await banco.stop();
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { 'LFM2.5': 65536, Qwen3: 32768 });
  } finally { rimuoviCartellaDiProva(cartella); }
});
