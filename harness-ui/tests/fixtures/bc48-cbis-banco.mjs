// BC-48 C-bis: banco isolato; nessuna credenziale o rete di modello reale.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import { createSessionRegistry } from '../../src/session-registry.mjs';
import { avviaSessione } from '../../src/agent-service.mjs';
import { createHttpApp } from '../../src/http-app.mjs';
import { createOwnerRuntimeAdapter } from '../../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../../src/provider-credential-store.mjs';
import { guardaWorkspace } from '../../src/workspace-watcher.mjs';
import { registraRiga } from '../../src/session-store.mjs';
import * as contestoC from '../../src/contesto-del-progetto.mjs';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const PIN_PRE_C = '4cd01f803af46b70dff0f7445af9ca66962382c4';
const MODELLO = 'z-ai/glm-5.3-flash';
const CHIAVE_FINTA = 'bc48-credenziale-solo-banco';
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

export async function caricaContestoPreC() {
  const url = new URL('../../src/contesto-del-progetto.mjs?bc48-pre-c', import.meta.url).href;
  const source = git(['show', `${PIN_PRE_C}:harness-ui/src/contesto-del-progetto.mjs`], RADICE);
  const hook = registerHooks({ load(target, context, nextLoad) {
    return target === url ? { format: 'module', source, shortCircuit: true } : nextLoad(target, context);
  } });
  try { return await import(url); } finally { hook.deregister(); }
}

// Istantanea Git sintetica: oggetti di fixture, mai un commit dell'utente.
// Nessun comando add/commit/push, neppure nel banco. read-tree carica soltanto
// l'indice di questa istantanea isolata per poter misurare uno stato git reale.
function preparaProgetto(cartella, byteIstruzioni) {
  mkdirSync(cartella);
  git(['init', '--initial-branch=banco'], cartella);
  const testo = '# Regole del banco BC-48\n' + 'Leggi i file prima di rispondere. Mantieni le istruzioni di progetto e verifica i risultati.\n'.repeat(240);
  const file = { 'AGENTS.md': testo.slice(0, byteIstruzioni - 1) + '\n', 'altro.txt': 'Secondo documento.\n', 'nota.txt': 'Nota iniziale.\n' };
  function oggetto(tipo, contenuto) {
    const corpo = Buffer.from(contenuto);
    const intero = Buffer.concat([Buffer.from(`${tipo} ${corpo.length}\0`), corpo]);
    const id = createHash('sha1').update(intero).digest('hex');
    const percorso = join(cartella, '.git', 'objects', id.slice(0, 2), id.slice(2));
    mkdirSync(dirname(percorso), { recursive: true });
    writeFileSync(percorso, deflateSync(intero));
    return id;
  }
  const voci = Object.entries(file).map(([nome, testo]) => {
    writeFileSync(join(cartella, nome), testo);
    return Buffer.concat([Buffer.from(`100644 ${nome}\0`), Buffer.from(oggetto('blob', testo), 'hex')]);
  });
  const tree = oggetto('tree', Buffer.concat(voci));
  const commit = oggetto('commit', `tree ${tree}\nauthor Banco <banco@example.invalid> 1789214400 +0000\ncommitter Banco <banco@example.invalid> 1789214400 +0000\n\nIstantanea sintetica BC-48\n`);
  writeFileSync(join(cartella, '.git', 'refs', 'heads', 'banco'), commit + '\n');
  git(['read-tree', 'HEAD'], cartella);
  assert.equal(git(['status', '--porcelain'], cartella), '');
  return { byteIstruzioni: Buffer.byteLength(file['AGENTS.md']), commit };
}

async function ascolta(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  assert.notEqual(server.address().port, 4174);
  return `http://127.0.0.1:${server.address().port}`;
}

async function attendi(condizione, descrizione) {
  const scadenza = Date.now() + 12_000;
  while (!condizione()) {
    assert.ok(Date.now() < scadenza, `Tempo esaurito: ${descrizione}`);
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

export function confrontaCorpi(primo, secondo) {
  let carattere = 0;
  while (carattere < Math.min(primo.length, secondo.length) && primo[carattere] === secondo[carattere]) carattere++;
  const a = Buffer.from(primo), b = Buffer.from(secondo);
  let byte = 0;
  while (byte < Math.min(a.length, b.length) && a[byte] === b[byte]) byte++;
  return { carattereUtf16: carattere, carattereUnicode: [...primo.slice(0, carattere)].length, byteUtf8: byte,
    tokenStimati4Byte: byte / 4, blocchiIpotetici256: Math.floor(byte / 4 / 256),
    prima: primo[carattere] ?? null, dopo: secondo[carattere] ?? null,
    estrattoPrima: primo.slice(Math.max(0, carattere - 70), carattere + 70),
    estrattoDopo: secondo.slice(Math.max(0, carattere - 70), carattere + 70) };
}

export async function eseguiBanco({ ordine = 'C', ricostruisci = false, osservaWorkspace = false, byteIstruzioni = 11_776, mutaRichiesta = null } = {}) {
  const temporanea = mkdtempSync(join(tmpdir(), 'bc48-cbis-'));
  const cartella = join(temporanea, 'progetto-bc48');
  const contesto = ordine === 'pre-C' ? await caricaContestoPreC() : contestoC;
  const corpi = [], corpiTrasporto = [], preamboli = [], esiti = [], fermaWatcher = [], invalidazioni = [], scritture = [];
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/chat/completions');
      assert.equal(req.headers.authorization, `Bearer ${CHIAVE_FINTA}`);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const grezzo = Buffer.concat(chunks).toString('utf8');
      corpi.push(grezzo);
      const body = JSON.parse(grezzo);
      const risposta = corpi.length === 1 ? 'uno' : 'due';
      assert.equal(body.stream, true);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: risposta }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    } catch (errore) { res.writeHead(500); res.end(String(errore)); }
  });
  let serverApp;
  try {
    const progetto = preparaProgetto(cartella, byteIstruzioni);
    const base = await ascolta(server);
    const valori = new Map();
    const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: CHIAVE_FINTA }, keyring: {
      get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p),
    } });
    store.setRuntime('openrouter', { endpoint: base });
    const adapter = createOwnerRuntimeAdapter({
      modulePath: fileURLToPath(new URL('../../src/kernel/talosHarness.mjs', import.meta.url)),
      providerStore: store,
      destinazioneModelloDeps: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
    });
    const registro = createSessionRegistry({
      modello: MODELLO, chiave: CHIAVE_FINTA, cartellaStore: join(temporanea, 'sessioni'),
      registraRigaFn: (...args) => { const scrittura = registraRiga(...args); scritture.push(scrittura); return scrittura; },
      cartelleProgetto: [{ id: 'banco', nome: 'Banco', percorso: cartella }],
      cartellaTrustMcp: null, cartellaTrustPlugin: null,
      cartellaNote: join(temporanea, 'note'), cartellaAttivita: join(temporanea, 'attivita'),
      cartellaMemoria: join(temporanea, 'memoria'), cartellaForge: join(temporanea, 'forge'),
      segnalaFileCambiatiFn: path => { invalidazioni.push(path); return contesto.segnalaFileCambiati(path); },
      guardaWorkspaceFn: (...args) => { const chiudi = guardaWorkspace(...args); fermaWatcher.push(chiudi); return chiudi; },
      avviaSessioneFn: async input => {
        const esito = await avviaSessione({ ...input,
          contestoDelProgettoFn: async opzioni => { const p = await contesto.contestoDelProgetto(opzioni); preamboli.push(p); return p; },
          aggiornamentoInCodaFn: contesto.aggiornamentoInCoda,
          talosLavoraFn: opzioni => adapter.talosLavora({ ...opzioni, fetchDiRete: async (url, init) => {
            // Blocco finale della rete: anche retry/fallback possono raggiungere solo il banco.
            assert.equal(new URL(url).origin, base);
            if (mutaRichiesta) init = { ...init, body: mutaRichiesta(init.body, corpi.length) };
            corpiTrasporto.push(init.body);
            return fetch(url, init);
          } }),
        });
        esiti.push(esito);
        return esito;
      },
    });
    serverApp = createServer(createHttpApp({ staticHandler: (_req, res) => { res.writeHead(404); res.end(); }, sessionRegistry: registro }));
    const app = await ascolta(serverApp);
    const post = async (path, body) => {
      const res = await fetch(app + '/api/v1/sessions/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const risultato = await res.json();
      assert.ok(res.ok, JSON.stringify(risultato));
      return risultato.data;
    };
    const { sessionId } = await post('custom', { cartellaId: 'banco', consegna: 'Rispondi solo: uno.', permessi: 'Read only' });
    if (osservaWorkspace) fermaWatcher.push(registro.iscriviti(sessionId, () => {}));
    await attendi(() => esiti.length === 1 && registro.elenca().find(s => s.sessionId === sessionId)?.conclusa, 'fine primo turno');
    assert.equal(esiti[0].ok, true, JSON.stringify(esiti[0].erroreInterno));
    writeFileSync(join(cartella, 'nota.txt'), 'Nota modificata dopo il primo turno.\n');
    const gitDopo = git(['status', '--porcelain'], cartella);
    assert.match(gitDopo, / M nota\.txt/);
    // Il watcher vero può essere sospeso a fine giro: questo scenario forza solo
    // l'invalidazione tramite la API pubblica, senza riscrivere alcun messaggio.
    if (ricostruisci) contesto.segnalaFileCambiati(cartella);
    if (osservaWorkspace) await attendi(() => invalidazioni.length > 0, 'WorkspaceChanged dal watcher reale');
    await post(sessionId + '/resume', { messaggio: 'Rispondi solo: due.' });
    await attendi(() => esiti.length === 2 && registro.elenca().find(s => s.sessionId === sessionId)?.conclusa, 'fine secondo turno');
    assert.equal(esiti[1].ok, true, JSON.stringify(esiti[1].erroreInterno));
    assert.equal(corpi.length, 2);
    assert.deepEqual(corpi, corpiTrasporto, 'i byte ricevuti coincidono con il trasporto finale');
    for (const raw of corpi) { assert.equal(JSON.stringify(JSON.parse(raw)), raw); assert.equal(raw.includes(CHIAVE_FINTA), false); }
    const storia = esiti[1].esito.messaggiFinali;
    assert.equal(storia.filter(m => m.role === 'assistant').at(-1).content, 'due');
    await Promise.all(scritture);
    const persistiti = readFileSync(join(temporanea, 'sessioni', sessionId + '.jsonl'), 'utf8');
    assert.ok(persistiti.includes('Rispondi solo: due.'));
    return { ordine, ricostruisci, osservaWorkspace, progetto, gitDopo, corpi, preamboli: preamboli.map(p => p?.testo),
      confronto: confrontaCorpi(...corpi), invalidazioni: invalidazioni.length,
      messaggiFinali: storia, authorization: 'Bearer [OSCURATA]', portaFornitore: server.address().port, portaApp: serverApp.address().port };
  } finally {
    for (const chiudi of fermaWatcher) chiudi();
    await Promise.allSettled(scritture);
    contesto.segnalaFileCambiati(cartella);
    for (const s of [serverApp, server].filter(Boolean)) {
      s.closeAllConnections();
      if (s.listening) await new Promise(resolve => s.close(resolve));
    }
    const destinazione = resolve(temporanea), radiceTemp = resolve(tmpdir()) + sep;
    assert.ok(destinazione.startsWith(radiceTemp) && dirname(destinazione) === resolve(tmpdir()));
    rmSync(destinazione, { recursive: true, force: true });
  }
}
