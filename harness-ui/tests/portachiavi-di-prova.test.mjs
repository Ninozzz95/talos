import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  PORTACHIAVI_MEMORIA, creaAdattatorePortachiavi, creaAdattatorePortachiaviInMemoria, leggiPortachiaviDiProva,
} from '../src/adattatore-keyring.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/*
 * ⛔⛔ 23/09/2026 — la chiave OpenRouter VERA dell'owner è stata sostituita da `sk-bc62-fixture`, scritta
 * dal server di prova di Playwright nel Credential Manager di Windows: otto sessioni GLM «Credenziale
 * rifiutata». Questi test provano la custodia di prova SENZA mai scrivere nella custodia vera: se la
 * cura si rompe, la prova di processo diventa rossa leggendo, non scrivendo.
 */

test('KEYRING-PROVA-01 — la variabile è STRICT: assente → sistema, «memoria» → prova, altro → errore', () => {
  assert.equal(leggiPortachiaviDiProva({}), false);
  assert.equal(leggiPortachiaviDiProva({ TALOS_HARNESS_UI_KEYRING: '' }), false);
  assert.equal(leggiPortachiaviDiProva({ TALOS_HARNESS_UI_KEYRING: PORTACHIAVI_MEMORIA }), true);
  assert.throws(() => leggiPortachiaviDiProva({ TALOS_HARNESS_UI_KEYRING: 'finto' }), /non è valida/);
});

test('KEYRING-PROVA-02 — la custodia in memoria conserva, rimuove, e ogni istanza è separata', async () => {
  const a = await creaAdattatorePortachiavi({ TALOS_HARNESS_UI_KEYRING: 'memoria' });
  assert.equal(a.get('talos-harness-provider-pool', 'openrouter:x'), null);
  a.set('talos-harness-provider-pool', 'openrouter:x', 'sk-prova');
  assert.equal(a.get('talos-harness-provider-pool', 'openrouter:x'), 'sk-prova');
  assert.equal(creaAdattatorePortachiaviInMemoria().get('talos-harness-provider-pool', 'openrouter:x'), null, 'una custodia nuova non vede le chiavi di un\'altra');
  a.remove('talos-harness-provider-pool', 'openrouter:x');
  assert.equal(a.get('talos-harness-provider-pool', 'openrouter:x'), null);
  a.remove('talos-harness-provider-pool', 'openrouter:mai-esistita'); // l'assenza già rimossa non è un errore
});

async function portaLibera() {
  const s = createServer();
  await new Promise((fatto) => s.listen(0, '127.0.0.1', fatto));
  const { port } = s.address();
  await new Promise((fatto) => s.close(fatto));
  return port;
}

test('KEYRING-PROVA-03 — un server con la custodia di prova non vede né la custodia vera né i semi dell\'ambiente', async (t) => {
  const radice = cartellaDiProva('talos-keyring-prova-');
  const temp = join(radice, 'temp');
  mkdirSync(temp, { recursive: true });
  mkdirSync(join(radice, 'workspace'), { recursive: true });
  const porta = await portaLibera();
  const figlio = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_TOKEN: '',
      TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, 'sessions'),
      TALOS_DESKTOP_DATA_DIR: join(radice, 'desktop'), TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_HARNESS_UI_KEYRING_SCOPE: '', TALOS_SCRATCH_DIR: join(radice, 'scratch'), // 24/09/2026: mai la radice vera
      // Un seme finto nell'ambiente: con la custodia di prova NON deve diventare una chiave configurata.
      OPENROUTER_API_KEY: 'sk-seme-finto-keyring-prova',
      TEMP: temp, TMP: temp, TMPDIR: temp,
    },
  });
  t.after(() => { figlio.kill(); });
  let coda = '';
  for (const flusso of [figlio.stdout, figlio.stderr]) flusso.on('data', (c) => { coda = (coda + c).slice(-3000); });
  const base = `http://127.0.0.1:${porta}`;
  let pronto = false;
  for (let i = 0; i < 150 && figlio.exitCode === null; i += 1) {
    try { if ((await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(300) })).ok) { pronto = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(pronto, `il server non è partito: ${coda}`);
  // SOLO letture: se la cura è rotta questo server legge la custodia vera, ma non ci scrive.
  const risposta = await (await fetch(`${base}/api/v1/providers`)).json();
  const openrouter = risposta.data.items.find((p) => p.id === 'openrouter');
  assert.equal(openrouter.keyConfigured, false, `con la custodia di prova OpenRouter deve partire vuoto; trovata origine «${openrouter.origineChiave}»`);
  assert.deepEqual(openrouter.pool, []);
});

/*
 * KEYRING-PROVA-04 — revisione avversaria del 23/09: la cura (`ef3b3859b`) proteggeva SOLO il server di
 * `playwright.config.mjs`; altre sei configurazioni e prove avviavano `server.mjs` con la custodia vera, e un
 * 401/429 durante una prova avrebbe riscritto l'indice del pool dell'owner (`mettiInPanchina` → `salvaPool`).
 * ⇒ Ogni file che avvia `server.mjs` deve dichiarare `TALOS_HARNESS_UI_KEYRING` = `memoria`. Il cancello legge il
 *   sorgente: se qualcuno toglie quella riga, o aggiunge un avvio nuovo senza, diventa rosso col nome del file.
 */
test('KEYRING-PROVA-04 — ogni avvio di server.mjs nelle prove usa la custodia in memoria', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join: unisci, relative } = await import('node:path');
  const radice = fileURLToPath(new URL('..', import.meta.url));
  const cartelle = ['tests', 'frontend/tests', 'frontend/scripts', 'frontend'].map((c) => unisci(radice, c));
  const file = [];
  const visita = (dir, profondita) => {
    for (const nome of readdirSync(dir)) {
      if (nome === 'node_modules' || nome === 'artifacts' || nome === 'dist') continue;
      const p = unisci(dir, nome);
      const st = statSync(p);
      if (st.isDirectory()) { if (profondita < 4) visita(p, profondita + 1); continue; }
      if (/\.(mjs|js|ts)$/.test(nome)) file.push(p);
    }
  };
  for (const c of cartelle) { try { if (statSync(c).isDirectory()) visita(c, c.endsWith('frontend') ? 4 : 0); } catch {} }
  const avvia = /\[\s*'server\.mjs'\s*\]|\['?[^'\n]*harness-ui\/server\.mjs'\]|node \.\.\/server\.mjs|command:\s*'node server\.mjs'/;
  const senza = [];
  for (const p of new Set(file)) {
    const testo = readFileSync(p, 'utf8');
    if (!avvia.test(testo)) continue;
    if (!/TALOS_HARNESS_UI_KEYRING\s*:\s*'memoria'/.test(testo)) senza.push(relative(radice, p));
    // 24/09/2026: e la radice dei temporanei (`src/scratch.mjs`): senza, un server di prova spazza %LOCALAPPDATA%/TALOS della persona
    else if (!/TALOS_SCRATCH_DIRs*:/.test(testo)) senza.push(relative(radice, p) + ' (senza TALOS_SCRATCH_DIR)');
  }
  assert.deepEqual(senza, [], `avviano server.mjs con la custodia VERA di Windows: ${senza.join(', ')}`);
  assert.ok(file.length > 50, 'la scansione non ha letto le cartelle delle prove');
});
