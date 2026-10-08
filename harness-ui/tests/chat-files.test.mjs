import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { saveChatFile, MAX_CHAT_FILE_BYTES } from '../src/chat-file-upload.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const withWorkspace = async (run) => {
  const rootDir = mkdtempSync(join(tmpdir(), 'talos-chat-files-'));
  try { await run(rootDir); } finally { rimuoviCartellaDiProva(rootDir); }
};
const upload = (rootDir, name, bytes) => saveChatFile({ rootDir, name, source: Readable.from([bytes]) });

/* ⭐ BUG-20 (06/10/2026): bersagli reali della cura — l'exe, il suo lock SHA256 e lo script di build
 * che li tiene allineati. I casi M1–M4 li manomettono e li rimettono a posto in try/finally. */
const RADICE = dirname(dirname(fileURLToPath(import.meta.url)));
const ESEGUIBILE = join(RADICE, 'native', 'talos-chat-upload.exe');
const LOCK = `${ESEGUIBILE}.sha256`;
const COSTRUISCI = join(RADICE, 'scripts', 'build-chat-upload-helper.mjs');

const toolchain = (() => {
  if (process.platform !== 'win32') return null;
  const esito = spawnSync(process.env.TALOS_GO_BINARY || 'go', ['version'], { encoding: 'utf8' });
  const versione = `${esito.stdout ?? ''}${esito.stderr ?? ''}`.trim();
  return /^go version go1\.27\.1 windows\/amd64$/u.test(versione) ? versione : null;
})();

const costruisci = () => {
  const esito = spawnSync(process.execPath, [COSTRUISCI], { encoding: 'utf8' });
  assert.equal(esito.status, 0, `build del helper upload fallita:\n${esito.stdout || ''}\n${esito.stderr || ''}`);
};

const sha256Di = (percorso) => createHash('sha256').update(readFileSync(percorso)).digest('hex');
const digestNelLock = () => readFileSync(LOCK, 'utf8').trim().split(/\s+/u)[0];

test('CHAT-FILES-BYTES: copied binary bytes survive without UTF-8 decoding', async () => withWorkspace(async (rootDir) => {
  const bytes = Buffer.from([0, 0xff, 0x80, 0x50, 0x4b, 0, 10]);
  const result = await upload(rootDir, 'dati.zip', bytes);
  assert.deepEqual(result, { tipo: 'file', nome: 'dati.zip', percorso: 'allegati/dati.zip', bytes: bytes.length,
    assoluto: join(rootDir, 'allegati', 'dati.zip') });
  assert.deepEqual(readFileSync(join(rootDir, result.percorso)), bytes);
}));

test('CHAT-FILES-ASSOLUTO: BUG-20 — the receipt carries the ABSOLUTE path, resolvable from any session root', async () => withWorkspace(async (rootDir) => {
  const bytes = Buffer.from('contenuto vero');
  const result = await upload(rootDir, 'nota.md', bytes);
  assert.equal(result.percorso, 'allegati/nota.md');
  assert.equal(typeof result.assoluto, 'string', 'senza assoluto il modello riceve un percorso relativo slegato dalla sua radice');
  assert.equal(realpathSync(result.assoluto).toLowerCase(), realpathSync(join(rootDir, result.percorso)).toLowerCase());
  assert.deepEqual(readFileSync(result.assoluto), bytes, 'l\'assoluto deve APRIRE davvero il file, non essere una stringa decorativa');
}));

test('CHAT-FILES-COLLISION: concurrent uploads get distinct paths and never overwrite', async () => withWorkspace(async (rootDir) => {
  const results = await Promise.all([upload(rootDir, 'report.pdf', Buffer.from('one')), upload(rootDir, 'report.pdf', Buffer.from('two'))]);
  assert.deepEqual(new Set(results.map((value) => value.percorso)), new Set(['allegati/report.pdf', 'allegati/report-2.pdf']));
  assert.deepEqual(new Set(results.map((value) => readFileSync(join(rootDir, value.percorso), 'utf8'))), new Set(['one', 'two']));
}));

test('CHAT-FILES-LIMIT: count bytes while streaming and remove incomplete file', async () => withWorkspace(async (rootDir) => {
  const source = Readable.from([Buffer.alloc(MAX_CHAT_FILE_BYTES, 1), Buffer.from([2])]);
  await assert.rejects(saveChatFile({ rootDir, name: 'big.bin', source }), (error) => error.code === 'PAYLOAD_LIMIT');
  assert.equal(existsSync(join(rootDir, 'allegati/big.bin')), false);
  assert.deepEqual(readdirSync(join(rootDir, 'allegati')).filter((name) => name.endsWith('.part')), []);
}));

test('CHAT-FILES-NAME: paths, device names and invalid Windows names are refused', async () => withWorkspace(async (rootDir) => {
  for (const name of ['../outside', 'a/b', 'a\\b', 'CON.txt', 'tail.', 'bad:name', '']) {
    await assert.rejects(upload(rootDir, name, Buffer.from('x')), (error) => error.code === 'QUERY_INVALID', name);
  }
  assert.equal(existsSync(join(rootDir, 'allegati')), false);
}));

test('CHAT-FILES-SYMLINK: an attachments link outside the workspace is refused', async (t) => {
  await withWorkspace(async (rootDir) => withWorkspace(async (outside) => {
    try { symlinkSync(outside, join(rootDir, 'allegati'), 'junction'); }
    catch (error) { if (error.code === 'EPERM') return t.skip('junction creation unavailable'); throw error; }
    await assert.rejects(upload(rootDir, 'safe.bin', Buffer.from('x')), (error) => error.code === 'FOLDER_INVALID');
    assert.deepEqual(readdirSync(outside), []);
  }));
});

test('CHAT-FILES-DIRECTORY-SWAP: replacing the checked attachments directory cannot publish outside', async () => {
  await withWorkspace(async (rootDir) => withWorkspace(async (outside) => {
    const attachments = join(rootDir, 'allegati');
    let attempted = false;
    async function* racingSource() {
      attempted = true;
      try {
        renameSync(attachments, join(rootDir, 'allegati-before-swap'));
        symlinkSync(outside, attachments, 'junction');
      } catch (error) {
        if (!['EACCES', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      }
      yield Buffer.from('x');
    }
    const receipt = await saveChatFile({ rootDir, name: 'safe.bin', source: racingSource() });
    assert.equal(attempted, true);
    assert.deepEqual(readdirSync(outside), []);
    assert.equal(readFileSync(join(rootDir, receipt.percorso), 'utf8'), 'x');
  }));
});

test('CHAT-FILES-ABORT: a failed stream leaves no published file', async () => withWorkspace(async (rootDir) => {
  async function* interrupted() { yield Buffer.from('partial'); throw new Error('client disconnected'); }
  await assert.rejects(saveChatFile({ rootDir, name: 'partial.bin', source: interrupted() }), /client disconnected/u);
  assert.equal(existsSync(join(rootDir, 'allegati/partial.bin')), false);
  assert.deepEqual(readdirSync(join(rootDir, 'allegati')).filter((name) => name.endsWith('.part')), []);
}));

test('CHAT-FILES-HELPER-MISSING: no path-based fallback is used', async () => withWorkspace(async (rootDir) => {
  await assert.rejects(saveChatFile({ rootDir, name: 'safe.bin', source: Readable.from([Buffer.from('x')]),
    helperPath: join(rootDir, 'missing-upload-helper.exe') }), (error) => error.code === 'FILE_WRITE_FAILED');
  assert.equal(existsSync(join(rootDir, 'allegati')), false);
}));

test('CHAT-FILES-HTTP: authenticated same-origin request copies bytes to the selected session only', async () => withWorkspace(async (rootDir) => {
  const app = createHttpApp({ staticHandler: () => {}, token: 'test-chat-file-token',
    sessionRegistry: { cartellaPerChatFile: (id) => id === 's1'
      ? { ok: true, cartella: rootDir } : { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' } } });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const bytes = Buffer.from([0, 255, 80, 75, 0]);
  const request = (id, headers = {}) => fetch(`${base}/api/v1/sessions/${id}/chat-files`, {
    method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream',
      'X-Talos-File-Name': encodeURIComponent('dati € .zip'), Origin: base,
      'Sec-Fetch-Site': 'same-origin', Cookie: 'talos_token=test-chat-file-token', ...headers },
  });
  try {
    assert.equal((await request('s1', { Cookie: '' })).status, 401);
    assert.equal((await request('s1', { Origin: 'https://other.example' })).status, 403);
    assert.equal((await request('missing')).status, 404);
    const response = await request('s1');
    assert.equal(response.status, 201);
    const { data } = await response.json();
    assert.deepEqual(data, { tipo: 'file', nome: 'dati € .zip', percorso: 'allegati/dati € .zip', bytes: bytes.length,
      assoluto: join(rootDir, 'allegati', 'dati € .zip') });
    assert.deepEqual(readFileSync(join(rootDir, data.percorso)), bytes);
  } finally { await new Promise((resolve) => server.close(resolve)); }
}));

test('CHAT-FILES-REAL-SESSION: HTTP receipt resolves to bytes in the actual registry workspace', async () => withWorkspace(async (rootDir) => {
  const workspace = join(rootDir, 'progetto');
  const cartellaStore = join(rootDir, 'sessioni');
  mkdirSync(workspace);
  mkdirSync(cartellaStore);
  const registry = createSessionRegistry({ cartellaStore, modello: 'test/model', chiave: 'test',
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: workspace, comandoProva: 'node --test', task: { id: 'test', consegna: 'prova' } }),
    avviaSessioneFn: async (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' });
      return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } };
    },
  });
  const { sessionId } = registry.avvia('test');
  assert.ok(sessionId);
  const server = createServer(createHttpApp({ staticHandler: () => {}, sessionRegistry: registry }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (name, body) => fetch(`${base}/api/v1/sessions/${sessionId}/chat-files`, {
    method: 'POST', body, signal: AbortSignal.timeout(15000), headers: { Origin: base, 'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/octet-stream', 'X-Talos-File-Name': encodeURIComponent(name) },
  });
  try {
    const bytes = Buffer.from([0, 255, 80, 75]);
    const response = await post('allegato.zip', bytes);
    assert.equal(response.status, 201);
    const receipt = (await response.json()).data;
    const recovered = await registry.scaricaFile(sessionId, receipt.percorso);
    assert.equal(recovered.ok, true);
    assert.deepEqual(recovered.bytes, bytes);
    const tooLarge = await post('too-large.bin', Buffer.alloc(MAX_CHAT_FILE_BYTES + 1, 1));
    assert.equal(tooLarge.status, 413);
    assert.equal(existsSync(join(workspace, 'allegati', 'too-large.bin')), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await registry.chiudi();
  }
}));

/* ⭐ BUG-20 (06/10/2026) — mutanti M1–M4 della cura «lock SHA256 + skip-if-identical»: ogni caso nomina
 * il mutante che becca e lo dimostra sui file REALI in native/ (ripristini garantiti in finally). */

test('CHAT-FILES-HELPER-BUILD-IDEMPOTENTE (M1): BUG-20 — build con byte identici NON riscrive l\'exe (mtime stabile) e il lock resta combaciante', (t) => {
  if (!toolchain) return t.skip('serve la toolchain go1.27.1 windows/amd64 (go sul PATH o TALOS_GO_BINARY): senza build non si giudica l\'idempotenza della cura');
  if (!existsSync(ESEGUIBILE)) return t.skip('native/talos-chat-upload.exe assente: la cura si giudica su un albero già dotato del helper');
  costruisci();
  const mtimePrima = statSync(ESEGUIBILE, { bigint: true }).mtimeNs;
  const improntaPrima = sha256Di(ESEGUIBILE);
  const lockPrima = readFileSync(LOCK, 'utf8');
  costruisci();
  assert.equal(sha256Di(ESEGUIBILE), improntaPrima, 'il secondo build ha cambiato i byte: la build non è deterministica, il confronto hash non può funzionare');
  assert.equal(statSync(ESEGUIBILE, { bigint: true }).mtimeNs, mtimePrima,
    'M1: la build ha RISCRITTO un exe identico — mtime nuovo = Windows Defender riscansiona l\'exe al primo upload');
  assert.equal(readFileSync(LOCK, 'utf8'), lockPrima, 'il lock di un exe invariato non va riscritto');
  assert.equal(digestNelLock(), improntaPrima, 'il lock non combacia coi byte dell\'exe prodotto dalla build');
});

test('CHAT-FILES-HELPER-HASH-BYTE (M4): BUG-20 — il confronto è sui BYTE: un byte manomesso con --version intatto fa riscrivere, un mtime toccato a parità di byte no', (t) => {
  if (!toolchain) return t.skip('serve la toolchain go1.27.1 windows/amd64: senza build non si distingue un hash sui byte da uno su mtime/percorso');
  if (!existsSync(ESEGUIBILE)) return t.skip('native/talos-chat-upload.exe assente: niente byte da manomettere onestamente');
  costruisci();
  const canonico = readFileSync(ESEGUIBILE);
  try {
    // (1) un solo byte, stessa dimensione, `--version` intatto; il mtime torna al valore pre-manomissione
    // così che SOLO un hash sui byte possa accorgersi della differenza
    const orarioPrecedente = statSync(ESEGUIBILE);
    const manomesso = Buffer.from(canonico);
    manomesso[manomesso.length - 64] ^= 0xff;
    writeFileSync(ESEGUIBILE, manomesso);
    utimesSync(ESEGUIBILE, orarioPrecedente.atime, orarioPrecedente.mtime);
    costruisci();
    assert.deepEqual(readFileSync(ESEGUIBILE), canonico,
      'M4: la build NON ha rimpiazzato i byte manomessi — il confronto guarda mtime/percorso invece dei byte');
    // (2) mtime toccato a parità di byte: NESSUNA riscrittura — il mutante che confronta il mtime riscriverebbe
    const ieri = new Date(Date.now() - 86_400_000);
    utimesSync(ESEGUIBILE, ieri, ieri);
    const mtimeToccato = statSync(ESEGUIBILE, { bigint: true }).mtimeNs;
    costruisci();
    assert.deepEqual(readFileSync(ESEGUIBILE), canonico, 'il build ha cambiato byte a parità di sorgenti: build non deterministica');
    assert.equal(statSync(ESEGUIBILE, { bigint: true }).mtimeNs, mtimeToccato,
      'M4: la build ha riscritto un exe identico solo perché il mtime era toccato — l\'hash deve essere sui byte, non sul mtime');
  } finally {
    // ripristino onesto: byte canonici e lock riallineato, qualunque assert sia saltato
    writeFileSync(ESEGUIBILE, canonico);
    if (existsSync(LOCK)) writeFileSync(LOCK, `${sha256Di(ESEGUIBILE)}\n`);
  }
});

test('CHAT-FILES-HELPER-HASH-CORROTTO (M2): BUG-20 — col lock che porta il digest di un ALTRO file, l\'upload non esegue byte non verificati: ricompila, riverifica e RIPARA il lock', async (t) => {
  if (!toolchain) return t.skip('la cura risponde al lock corrotto ricompilando: serve go1.27.1 windows/amd64 per la verifica reale');
  if (!existsSync(ESEGUIBILE) || !existsSync(LOCK)) return t.skip('exe o lock assenti in native/: niente da corrompere onestamente');
  const lockOriginale = readFileSync(LOCK, 'utf8');
  try {
    await withWorkspace(async (rootDir) => {
      // mutante M2: il lock non descrive più l'exe (digest di un altro file del progetto)
      writeFileSync(LOCK, `${sha256Di(join(RADICE, 'package.json'))}\n`);
      const bytes = Buffer.from('m2: ricevuta consegnata solo dopo verifica dei byte');
      const risultato = await upload(rootDir, 'm2-verificato.bin', bytes);
      assert.equal(risultato.percorso, 'allegati/m2-verificato.bin',
        'l\'upload deve riuscire SOLO dopo ricostruzione e riverifica, non consegnare alla cieca');
      assert.deepEqual(readFileSync(join(rootDir, risultato.percorso)), bytes,
        'nessuna ricevuta da byte non verificati: il file pubblicato deve esistere e combaciare');
      assert.equal(digestNelLock(), sha256Di(ESEGUIBILE),
        'M2: l\'upload è riuscito senza RIPARARE il lock — l\'exe è stato eseguito comunque, senza verifica dei byte');
    });
  } finally {
    writeFileSync(LOCK, lockOriginale); // ripristino onesto del lock pre-test
  }
});

test('CHAT-FILES-HELPER-SENZA-LOCK (M3): BUG-20 — senza lock l\'exe presente NON viene eseguito tale e quale: ricompilazione + riverifica, l\'upload riesce e il lock torna', async (t) => {
  if (!toolchain) return t.skip('la cura risponde al lock assente ricompilando: serve go1.27.1 windows/amd64 per la verifica reale');
  if (!existsSync(ESEGUIBILE) || !existsSync(LOCK)) return t.skip('exe o lock assenti in native/: niente da provare');
  const canonico = readFileSync(ESEGUIBILE);
  try {
    await withWorkspace(async (rootDir) => {
      // exe reso NON avviabile (firma 'MZ' rovinata, tutto il resto intatto) e lock ELIMINATO: chi lo
      // esegue senza verifica fa esplodere l'upload; la cura DEVE ricostruire, riverificare e solo
      // allora eseguire — il successo della consegna è la prova che l'exe non verificato non è partito.
      const offuscato = Buffer.from(canonico);
      offuscato[0] = 0x4b; offuscato[1] = 0x4f; // 'MZ' → 'KO'
      writeFileSync(ESEGUIBILE, offuscato);
      rmSync(LOCK, { force: true });
      const bytes = Buffer.from('m3: nessuna esecuzione senza lock');
      const risultato = await upload(rootDir, 'm3-ricostruito.bin', bytes);
      assert.equal(risultato.percorso, 'allegati/m3-ricostruito.bin',
        'M3: l\'upload è fallito — l\'exe non verificato è stato toccato invece di ricostruire e riverificare');
      assert.deepEqual(readFileSync(join(rootDir, risultato.percorso)), bytes, 'il file deve essere consegnato davvero, dopo la ricostruzione');
      assert.ok(existsSync(LOCK), 'M3: il lock manca ANCORA dopo l\'upload — l\'exe è partito senza verifica (il lock lo ricrea solo la build)');
      assert.equal(digestNelLock(), sha256Di(ESEGUIBILE), 'il lock ricreato non combacia coi byte dell\'exe ricostruito');
      assert.deepEqual(readFileSync(ESEGUIBILE), canonico, 'l\'exe ricostruito non coincide con la build canonica');
    });
  } finally {
    writeFileSync(ESEGUIBILE, canonico);
    if (existsSync(LOCK)) writeFileSync(LOCK, `${sha256Di(ESEGUIBILE)}\n`);
  }
});
