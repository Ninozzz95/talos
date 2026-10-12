/*
 * 11/10/2026 notte — IL SERVER r4 SUL TELEFONO (owner: «il mobile prende interamente il kernel del desktop»). La sessione mobile ha
 * fatto girare r4 sul Pad (Android 16, Node 24.18 arm64, cartella di prova) e ha misurato quattro ostacoli. Qui si provano le cure
 * fatte A MONTE, così la copia del mobile resta identica a r4. Su Windows niente cambia: ogni cura si accende solo su Android.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const radice = fileURLToPath(new URL('..', import.meta.url));

/* ANDROID-01 — `node-pty` non ha una build per android-arm64: importato in cima a `pty-terminal.mjs` faceva morire il server
   all'avvio (server.mjs:38). Ora si carica solo quando si apre un Terminale; senza, il resto del server vive e il Terminale lo dice. */
test('ANDROID-01 — without node-pty the server modules load, and opening a Terminal says it is unavailable', () => {
  const sonda = `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(spec, ctx, next) { if (spec === 'node-pty') { const e = new Error('no build for this platform'); e.code = 'MODULE_NOT_FOUND'; throw e; } return next(spec, ctx); } });
    const pty = await import('./src/pty-terminal.mjs');
    await import('./src/terminal-ws.mjs');
    const registro = pty.creaRegistroTerminali({ sceltaShellFn: () => ({ comando: 'sh', argomenti: [], enforcement: 'none' }), ambienteFn: () => ({}) });
    try { registro.apri({ id: 't1', cartella: '.' }); console.log('APERTO'); }
    catch (e) { console.log('ERRORE ' + e.code); }
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', sonda], { cwd: radice, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ERRORE TERMINAL_UNAVAILABLE/u);
});

/* ANDROID-02 — il proprietario dello Store dei Workflow ascoltava su un socket in un FILE (`.store-owner.sock`): su Android, utente
   shell, `listen` → EACCES (misurato sul Pad: ~245 prove dei Workflow cadevano lì). Lo spazio astratto (`\0nome`) funziona sul Pad,
   ed è quello che Linux usa già: Android è un kernel Linux. Si prova la scelta del punto d'ascolto con un server finto. */
test('ANDROID-02 — on Android the Workflow store owner listens in the abstract namespace, like Linux; other Unix keep the socket file', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { EventEmitter } = await import('node:events');
  const { acquireStoreOwner, releaseStoreOwner } = await import('../src/workflow/store-owner.mjs');
  const visti = [];
  const finto = () => { const s = new EventEmitter(); s.listening = false;
    s.listen = (opzioni) => { visti.push(opzioni.path); s.listening = true; setImmediate(() => s.emit('listening')); };
    s.close = (cb) => { s.listening = false; cb?.(); }; return s; };
  for (const [piattaforma, astratto] of [['android', true], ['linux', true], ['darwin', false]]) {
    const cartella = mkdtempSync(join(tmpdir(), `talos-android-02-${piattaforma}-`));
    try {
      const owner = await acquireStoreOwner({ workflowDataRoot: cartella, platform: piattaforma }, { createServer: finto });
      await releaseStoreOwner(owner);
      assert.equal(visti.at(-1).startsWith('\0'), astratto, `${piattaforma}: ${JSON.stringify(visti.at(-1))}`);
    } finally { rimuoviCartellaDiProva(cartella); }
  }
});

/* ANDROID-03 — `link` vietato (Android utente shell: EACCES; exFAT/ReFS su Windows): i due archivi dei Workflow non salvavano
   niente. Ripiego come l'archivio delle sessioni: creazione ESCLUSIVA del nome finale + rilettura dei byte; mai `rename`
   (sovrascrive). */
test('ANDROID-03 — publish once: link first; where links are refused, exclusive creation and read-back; never an overwrite', async () => {
  const { mkdtempSync, readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pubblicaUnaVolta } = await import('../src/workflow/pubblica-una-volta.mjs');
  const cartella = mkdtempSync(join(tmpdir(), 'talos-android-03-'));
  const vietato = async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); };
  try {
    const temporary = join(cartella, 'tmp'); writeFileSync(temporary, 'ABC');
    assert.equal(await pubblicaUnaVolta({ temporary, path: join(cartella, 'a'), bytes: Buffer.from('ABC') }), 'link');
    assert.equal(await pubblicaUnaVolta({ temporary, path: join(cartella, 'b'), bytes: Buffer.from('ABC') }, { linkFn: vietato }), 'senza-link');
    assert.equal(readFileSync(join(cartella, 'b'), 'utf8'), 'ABC');
    // already there: never overwritten, with or without links
    writeFileSync(join(cartella, 'c'), 'ALTRO');
    assert.equal(await pubblicaUnaVolta({ temporary, path: join(cartella, 'c'), bytes: Buffer.from('ABC') }, { linkFn: vietato }), 'esisteva');
    assert.equal(await pubblicaUnaVolta({ temporary, path: join(cartella, 'c'), bytes: Buffer.from('ABC') }), 'esisteva');
    assert.equal(readFileSync(join(cartella, 'c'), 'utf8'), 'ALTRO');
    // any other failure is not a reason to fall back
    await assert.rejects(pubblicaUnaVolta({ temporary: join(cartella, 'assente'), path: join(cartella, 'd'), bytes: Buffer.from('X') }), (e) => e.code === 'ENOENT');
    assert.equal(existsSync(join(cartella, 'd')), false);
    // bytes that do not read back: our final is removed and it fails
    await assert.rejects(pubblicaUnaVolta({ temporary, path: join(cartella, 'e'), bytes: Buffer.from('ABC') }, { linkFn: vietato, readFileFn: async () => Buffer.from('AB') }), (e) => e.code === 'EIO');
    assert.equal(existsSync(join(cartella, 'e')), false);
  } finally { rimuoviCartellaDiProva(cartella); }
});

test('ANDROID-03b — the Workflow result store saves and reads back with link() refused by the system', () => {
  const sonda = `
    import { registerHooks } from 'node:module';
    const NEGA = 'data:text/javascript,' + encodeURIComponent("export * from 'node:fs/promises'; export async function link() { const e = new Error('denied'); e.code = 'EACCES'; throw e; }");
    registerHooks({ resolve(spec, ctx, next) { if (spec === 'node:fs/promises' && /pubblica-una-volta\.mjs$/u.test(ctx.parentURL ?? '')) return { url: NEGA, shortCircuit: true }; return next(spec, ctx); } });
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { putResultBytes, readResultBytes } = await import('./src/workflow/result-store.mjs');
    const { rimuoviCartellaDiProva } = await import('./tests/aiuto/rimuovi-cartella-di-prova.mjs');
    const radice = mkdtempSync(join(tmpdir(), 'talos-android-03b-'));
    try {
      const dati = Buffer.from('risultato del passo');
      const voce = await putResultBytes({ workflowDataRoot: radice, bytes: dati, maxBytes: 1000 });
      const di = await putResultBytes({ workflowDataRoot: radice, bytes: dati, maxBytes: 1000 });
      console.log('LETTO ' + (await readResultBytes({ workflowDataRoot: radice, sha256: voce.sha256, maxBytes: 1000 })).toString() + ' ' + (di.sha256 === voce.sha256));
    } finally { rimuoviCartellaDiProva(radice); }
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', sonda], { cwd: radice, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /LETTO risultato del passo true/u);
});

/* ANDROID-04 — `shell: true` vuol dire `/bin/sh` su Unix (doc Node v24 child_process, «Uses '/bin/sh' on Unix»), che su Android
   non esiste; il Node del Pad (build di Termux) cercava `/data/data/com.termux/files/usr/bin/sh` e falliva con ENOENT: tutti i
   comandi del modello morivano (13 prove del kernel sul Pad). Su Android la shell è `/system/bin/sh`, detta esplicita. */
test('ANDROID-04 — commands run through /system/bin/sh on Android; everywhere else Node picks the shell as before', async () => {
  const { shellDeiComandi } = await import('../src/kernel/talosHarness.mjs');
  assert.equal(shellDeiComandi('android'), '/system/bin/sh');
  for (const p of ['win32', 'linux', 'darwin']) assert.equal(shellDeiComandi(p), true, p);
  assert.equal(shellDeiComandi(), process.platform === 'android' ? '/system/bin/sh' : true);
  // both places that start a command use it
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');
  assert.deepEqual(sorgente.split('\n').filter((r) => /spawn\(/u.test(r) && /shell: true/u.test(r)), [], 'no spawn left with a literal shell: true');
  assert.equal((sorgente.match(/shell: shellDeiComandi\(\)/gu) ?? []).length, 2);
});
