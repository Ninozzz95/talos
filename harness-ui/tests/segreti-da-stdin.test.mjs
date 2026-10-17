/*
 * ⭐ I segreti di r4 dallo stdin (owner via la sessione mobile, 14/10/2026 notte). Il lettore da solo, in ogni caso d'errore e nei
 * casi buoni, e il SERVER VERO avviato coi segreti sullo stdin: il token protegge le API, il portachiavi a modulo riceve le voci
 * che r4 non consuma (e non il token), e nessun valore finisce in un messaggio d'errore.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { leggiRigheDeiSegreti, leggiSegretiDaStdin } from '../src/segreti-da-stdin.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const TOKEN = 'tok-di-prova-lungo-almeno-trentadue-caratteri-0001';
const flusso = (testo, { chiudi = true } = {}) => { const s = new PassThrough(); if (testo !== null) s.write(testo); if (chiudi) s.end(); return s; };
const leggi = (testo, opzioni = {}) => leggiSegretiDaStdin({ env: { TALOS_HARNESS_UI_SEGRETI_DA: 'stdin', ...(opzioni.env ?? {}) }, stdin: opzioni.stdin ?? flusso(testo), ...opzioni.altre });

test('SEGRETI-01 — senza la variabile non si legge niente; con la variabile: il token a r4, il resto al portachiavi, congelato', async () => {
  const vuoto = await leggiSegretiDaStdin({ env: {}, stdin: flusso('X=1\n', { chiudi: false }) });
  assert.deepEqual(vuoto.perR4, {});
  assert.ok(Object.isFrozen(vuoto.perIlPortachiavi));
  const r = await leggi(`TALOS_HARNESS_UI_TOKEN=${TOKEN}\r\n\nTALOS_R4_PORTACHIAVI_CHIAVE=chiave-dati\nALTRO_1=a=b\n`);
  assert.deepEqual(r.perR4, { TALOS_HARNESS_UI_TOKEN: TOKEN });
  assert.deepEqual({ ...r.perIlPortachiavi }, { TALOS_R4_PORTACHIAVI_CHIAVE: 'chiave-dati', ALTRO_1: 'a=b' });
  assert.ok(Object.isFrozen(r.perIlPortachiavi));
});

test('SEGRETI-02 — ogni forma sbagliata ferma l\'avvio col suo codice, e nessun messaggio contiene un valore', async () => {
  const casi = [
    ['riga senza uguale', 'SENZA_UGUALE\n', 'SECRETS_STDIN_MALFORMED'],
    ['nome minuscolo', 'minuscolo=valore-segreto\n', 'SECRETS_STDIN_MALFORMED'],
    ['valore vuoto', 'VUOTO=\n', 'SECRETS_STDIN_MALFORMED'],
    ['nome ripetuto', 'DOPPIO=valore-segreto\nDOPPIO=valore-segreto-2\n', 'SECRETS_STDIN_DUPLICATE'],
    ['UTF-8 non valido', Buffer.from([0x41, 0x3d, 0xff, 0x0a]), 'SECRETS_STDIN_MALFORMED'],
  ];
  for (const [nome, testo, codice] of casi) {
    await assert.rejects(leggi(testo), (e) => e.code === codice && !/valore-segreto/u.test(e.message), nome);
  }
  await assert.rejects(leggi(`TALOS_HARNESS_UI_TOKEN=${TOKEN}\n`, { env: { TALOS_HARNESS_UI_TOKEN: 'dall-ambiente-lungo-almeno-trentadue-c' } }),
    (e) => e.code === 'SECRETS_STDIN_ALSO_IN_ENV' && !e.message.includes(TOKEN));
  await assert.rejects(leggiSegretiDaStdin({ env: { TALOS_HARNESS_UI_SEGRETI_DA: 'file' }, stdin: flusso('') }), (e) => e.code === 'SECRETS_STDIN_INVALID');
  const tty = Object.assign(flusso(''), { isTTY: true });
  await assert.rejects(leggi('', { stdin: tty }), (e) => e.code === 'SECRETS_STDIN_NOT_A_PIPE');
});

test('SEGRETI-03 — oltre il tetto, o senza EOF entro il tempo, non parte', async () => {
  await assert.rejects(leggi(`A=${'x'.repeat(5000)}\n`), (e) => e.code === 'SECRETS_STDIN_TOO_LARGE');
  await assert.rejects(leggi(null, { stdin: flusso('A=1\n', { chiudi: false }), altre: { tempoMs: 50 } }), (e) => e.code === 'SECRETS_STDIN_NO_EOF');
  // AL CONTRARIO: proprio al tetto si legge
  const conToken = `TALOS_HARNESS_UI_TOKEN=${TOKEN}\n`;
  const pieno = `${conToken}A=${'x'.repeat(4096 - conToken.length - 3)}\n`;
  assert.equal(Buffer.byteLength(pieno), 4096);
  assert.equal((await leggi(pieno)).perIlPortachiavi.A.length, 4096 - conToken.length - 3);
  assert.deepEqual(leggiRigheDeiSegreti('\n\n'), new Map());
});

test('SEGRETI-05 — SEGRETI-REV-01 del bugfixer: in questa modalità il token è obbligatorio e solo dallo stdin; un nome di r4 sconosciuto è un refuso', async () => {
  const casi = [
    ['stdin vuoto', '', {}, 'SECRETS_STDIN_TOKEN_MISSING'],
    ['solo altre voci', 'TALOS_R4_PORTACHIAVI_CHIAVE=valore-segreto\n', {}, 'SECRETS_STDIN_TOKEN_MISSING'],
    ['token solo nell\'ambiente', 'ALTRO=valore-segreto\n', { TALOS_HARNESS_UI_TOKEN: TOKEN }, 'SECRETS_STDIN_TOKEN_MISSING'],
    ['nome del token sbagliato di una lettera', `TALOS_HARNESS_UI_TOKN=${TOKEN}\n`, {}, 'SECRETS_STDIN_UNKNOWN_NAME'],
    ['nome di r4 sconosciuto accanto al token giusto', `TALOS_HARNESS_UI_TOKEN=${TOKEN}\nTALOS_HARNESS_UI_ALTRO=valore-segreto\n`, {}, 'SECRETS_STDIN_UNKNOWN_NAME'],
  ];
  for (const [nome, testo, env, codice] of casi) {
    await assert.rejects(leggi(testo, { env }), (e) => e.code === codice && !e.message.includes(TOKEN) && !/valore-segreto/u.test(e.message), nome);
  }
  // AL CONTRARIO: il token giusto da solo basta, e un nome fuori dal prefisso di r4 va al portachiavi
  assert.deepEqual((await leggi(`TALOS_HARNESS_UI_TOKEN=${TOKEN}\n`)).perR4, { TALOS_HARNESS_UI_TOKEN: TOKEN });
  assert.deepEqual({ ...(await leggi(`TALOS_HARNESS_UI_TOKEN=${TOKEN}\nTALOS_R4_X=1\n`)).perIlPortachiavi }, { TALOS_R4_X: '1' });
});

const RADICE = fileURLToPath(new URL('..', import.meta.url));
async function portaLibera() {
  const s = createServer();
  await new Promise((fatto) => s.listen(0, '127.0.0.1', fatto));
  const { port } = s.address();
  await new Promise((fatto) => s.close(fatto));
  return port;
}

test('SEGRETI-04 — il SERVER vero: il token dallo stdin protegge le API; il modulo riceve le voci che r4 non consuma, non il token; lo stdin non chiuso lo ferma', async (t) => {
  const radice = mkdtempSync(join(tmpdir(), 'talos-segreti-'));
  const temp = join(radice, 'temp');
  for (const c of [temp, join(radice, 'workspace')]) mkdirSync(c, { recursive: true });
  const visti = join(radice, 'visti.json');
  const modulo = join(radice, 'portachiavi.mjs');
  writeFileSync(modulo, `import { writeFileSync } from 'node:fs';
export function creaPortachiavi({ segreti }) {
  writeFileSync(${JSON.stringify(visti)}, JSON.stringify({ nomi: Object.keys(segreti).sort(), congelati: Object.isFrozen(segreti), chiaveGiusta: segreti.TALOS_R4_PORTACHIAVI_CHIAVE === 'chiave-dati' }));
  const m = new Map(); return { get: (s, a) => m.get(s + a) ?? null, set: (s, a, v) => { m.set(s + a, v); }, remove: (s, a) => { m.delete(s + a); } };
}`);
  const avvia = async (stdinTesto, { chiudi = true } = {}) => {
    const porta = await portaLibera();
    const env = { ...process.env, TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_TOKEN: undefined,
      TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, 'sessions'), TALOS_DESKTOP_DATA_DIR: join(radice, 'desktop'),
      TALOS_HARNESS_UI_KEYRING: `modulo:${modulo}`, TALOS_HARNESS_UI_KEYRING_SCOPE: '', TALOS_HARNESS_UI_SEGRETI_DA: 'stdin',
      TALOS_SCRATCH_DIR: join(radice, 'scratch'), TEMP: temp, TMP: temp, TMPDIR: temp };
    delete env.TALOS_HARNESS_UI_TOKEN;
    const figlio = spawn(process.execPath, ['server.mjs'], { cwd: RADICE, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env });
    const uscita = new Promise((fatto) => figlio.once('exit', fatto));
    const scritto = { out: '', err: '' };
    figlio.stdout.on('data', (c) => { scritto.out += c; });
    figlio.stderr.on('data', (c) => { scritto.err += c; });
    figlio.stdin.write(stdinTesto);
    if (chiudi) figlio.stdin.end();
    const ferma = async () => { if (figlio.exitCode === null && figlio.signalCode === null) { figlio.kill(); await Promise.race([uscita, delay(15_000)]); } };
    for (let i = 0; i < 300 && figlio.exitCode === null; i += 1) { if (/Harness UI disponibile/u.test(scritto.out)) break; await delay(100); }
    return { porta, scritto, ferma, uscito: () => figlio.exitCode };
  };
  const servers = [];
  t.after(async () => { for (const s of servers) await s.ferma(); await rimuoviCartellaDiProva(radice); }, { timeout: 60_000 });

  const si = await avvia(`TALOS_HARNESS_UI_TOKEN=${TOKEN}\nTALOS_R4_PORTACHIAVI_CHIAVE=chiave-dati\n`);
  servers.push(si);
  assert.match(si.scritto.out, /Harness UI disponibile/u, (si.scritto.out + si.scritto.err).slice(-1500));
  assert.equal((await fetch(`http://127.0.0.1:${si.porta}/api/v1/sessions`)).status, 401, 'senza cookie: 401');
  const conCookie = await fetch(`http://127.0.0.1:${si.porta}/api/v1/sessions`, { headers: { cookie: `talos_token=${TOKEN}` } });
  assert.equal(conCookie.status, 200, 'col token dallo stdin: 200');
  assert.deepEqual(JSON.parse(readFileSync(visti, 'utf8')), { nomi: ['TALOS_R4_PORTACHIAVI_CHIAVE'], congelati: true, chiaveGiusta: true });
  assert.ok(!(si.scritto.out + si.scritto.err).includes(TOKEN), 'il token non compare nei log');
  await si.ferma();

  // AL CONTRARIO: lo stdin mai chiuso ⇒ il server non parte, col codice; e un valore sbagliato non compare
  const no = await avvia('ALTRO=valore-da-non-mostrare\n', { chiudi: false });
  servers.push(no);
  for (let i = 0; i < 150 && no.uscito() === null; i += 1) await delay(100);
  assert.notEqual(no.uscito(), null, 'è uscito');
  assert.notEqual(no.uscito(), 0);
  assert.match(no.scritto.out + no.scritto.err, /SECRETS_STDIN_NO_EOF/u);
  assert.ok(!(no.scritto.out + no.scritto.err).includes('valore-da-non-mostrare'));
});
