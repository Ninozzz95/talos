import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import * as cartelleDiProva from './aiuto/cartelle-di-prova.mjs';

/*
 * ⛔⛔ DESK-TEMP-1, 23/09/2026 — owner: «bisogna scoprire perché TEMP mi si riempie di tantissime cartelle
 *   talos-*». Misurato sul ramo integrato, lanciando ognuno dei 277 file di test in una TEMP privata:
 *   **12 file lasciavano 56 cartelle a ogni giro** (session-registry 21, favicon-proxy 8,
 *   workspace-launch-store 8, tempi-del-giro 6, ui-build 4, windows-open-with 2, server-workflow-wiring 2
 *   dal Doctor del prodotto, automation-store, http-routes-research, shell-wsl-p0bis, workflow-store 1
 *   ciascuno, più la cache di compilazione di Node che non è nostra). Con decine di giri al giorno degli
 *   agenti, erano migliaia di cartelle.
 * ⇒ Questa prova lancia OGNI file di quell'elenco in un processo figlio con TEMP/TMP/TMPDIR suoi, aspetta
 *   che finisca, e pretende ZERO cartelle residue. Un file che torna a perdere la fa diventare rossa col
 *   suo nome. Ricetta ripresa da `temp-hf-lifecycle.test.mjs` (Codex, 23/09): `NODE_TEST_CONTEXT` va tolto
 *   o il figlio non esegue i test e la prova passa a vuoto — per questo si pretende anche il conteggio.
 */
const execFileAsync = promisify(execFile);
const FILE_CHE_PERDEVANO = [
  'session-registry.test.mjs',
  'favicon-proxy.test.mjs',
  'workspace-launch-store.test.mjs',
  'tempi-del-giro-sul-disco.test.mjs',
  'ui-build.test.mjs',
  'windows-open-with-talos.test.mjs',
  'server-workflow-wiring.test.mjs',
  'automation-store.test.mjs',
  'http-routes-research.test.mjs',
  'shell-wsl-p0bis.test.mjs',
  'workflow-store.test.mjs',
];
/*
 * ⛔⛔ D2-a, 24/09/2026 — il cancello gemello per il FRONTEND. La revisione avversaria del 23/09 notte ha
 *   misurato che `frontend/tests/unit/ripresa-isolamento.test.mjs` (via `frontend/scripts/ripresa-run.mjs`)
 *   lasciava a ogni corsa 8 cartelle `talos-ripresa-*` in TEMP — 2 con un clone del repo e 4 GIUNZIONI ai
 *   `node_modules` veri — più 8 cartelle di rapporti in `frontend/artifacts/ripresa/`. Questo cancello non
 *   lo vedeva: guardava solo i file del backend. Stessa ricetta, con due differenze: il figlio gira nella
 *   cartella del frontend, e si guardano ANCHE i rapporti nuovi sotto `artifacts/ripresa/` coi nomi dei
 *   tipi di esecuzione che quella prova crea (zero residui in TEMP implica anche zero giunzioni in TEMP).
 */
const FRONTEND = fileURLToPath(new URL('../frontend/', import.meta.url));
const RAPPORTI_RIPRESA = join(FRONTEND, 'artifacts', 'ripresa');
const RAPPORTO_DI_PROVA_RIPRESA = /-(?:(?:release|discovery|isolation|keyring|manifest|reporter|snapshot|pulizia)-test|backend)-[0-9a-f]{8}$/;
const FILE_DEL_FRONTEND = ['tests/unit/ripresa-isolamento.test.mjs'];
/* Non nostre: la cache di compilazione che Node stesso deposita in TEMP. */
const NON_NOSTRE = new Set(['node-compile-cache']);

/*
 * ⛔⛔ D2-b, 24/09/2026 — un avviso `CartellaDiProvaRisorta` è un residuo MANCATO PER UN PELO, non un
 *   successo. La revisione ha misurato che `tempi-del-giro-sul-disco` passava questo cancello solo grazie
 *   all'attesa fissa di 300 ms della seconda passata dell'aiuto: senza passata restavano 2 cartelle, con
 *   0 ms 1, con 300 ms nessuna MA con due avvisi a ogni corsa — cioè scritture del registro arrivate dopo
 *   la fine del test, che sotto carico possono arrivare anche dopo la passata. ⇒ Il cancello pretende ZERO
 *   avvisi, non solo zero cartelle: un file che resuscita una cartella deve aspettare le SUE scritture.
 */
/*
 * ⛔ D2-a, 24/09/2026 — la TEMP privata di un figlio che PERDE può contenere giunzioni ai `node_modules`
 *   veri (è esattamente ciò che questo cancello cerca). Prima di rimuoverla ricorsivamente si elencano i
 *   collegamenti con `lstat` (che non li segue) e si staccano con `rmdir`, che su una giunzione toglie solo
 *   il collegamento (Microsoft Learn, «RemoveDirectoryW», letta il 24/09/2026). Mai una rimozione
 *   ricorsiva su un albero che ne contiene ancora.
 */
function staccaCollegamentiSotto(radice) {
  const staccati = [];
  const visita = (cartella) => {
    for (const nome of readdirSync(cartella)) {
      const percorso = join(cartella, nome);
      const info = lstatSync(percorso);
      if (info.isSymbolicLink()) {
        try { rmdirSync(percorso); } catch { unlinkSync(percorso); }
        staccati.push(percorso);
      } else if (info.isDirectory()) visita(percorso);
    }
  };
  if (existsSync(radice)) visita(radice);
  return staccati;
}

async function corriNellaTempPrivata(t, file, cwd) {
  const sandbox = await mkdtemp(join(tmpdir(), 'talos-temp-gate-'));
  t.after(async () => {
    const staccati = staccaCollegamentiSotto(sandbox);
    if (staccati.length) process.emitWarning(`collegamenti staccati nella TEMP del figlio prima di rimuoverla: ${staccati.join(', ')}`, 'CollegamentiInTemp');
    await rimuoviCartellaDiProvaAttesa(sandbox);
  });
  const env = { ...process.env, TEMP: sandbox, TMP: sandbox, TMPDIR: sandbox };
  delete env.NODE_TEST_CONTEXT;
  let uscita;
  try {
    uscita = await execFileAsync(process.execPath, ['--test', file], { cwd, env, maxBuffer: 16 * 1024 * 1024, timeout: 300_000 });
  } catch (errore) {
    uscita = { stdout: errore.stdout ?? '', stderr: errore.stderr ?? '' };
  }
  return { sandbox, testo: `${uscita.stdout}${uscita.stderr}` };
}

async function pretendiNessunResiduo(nome, { sandbox, testo }) {
  const eseguiti = Number(/ℹ tests (\d+)/.exec(testo)?.[1] ?? 0);
  assert.ok(eseguiti > 0, `il figlio non ha eseguito nessun test di ${nome}: la prova starebbe misurando il vuoto`);
  assert.match(testo, /ℹ fail 0/, `${nome} ha test rossi nel figlio: si misura solo un file verde`);
  const residui = (await readdir(sandbox)).filter((n) => !NON_NOSTRE.has(n));
  assert.deepEqual(residui, [], `${nome} lascia ${residui.length} cartelle nella TEMP: ${residui.join(', ')}`);
  const risorte = testo.split(/\r?\n/).filter((riga) => riga.includes('CartellaDiProvaRisorta'));
  /* ⛔ 24/09/2026 — DEBITO DICHIARATO, può solo scendere: `session-registry.test.mjs` (cartellaStoreVera) usa il
     registro VERO, la cui coda di scrittura è privata del modulo (nessun flush esposto): 1-2 ms dopo la fine del
     file una scrittura in volo ricrea la cartella, che la seconda passata toglie dichiarandola (misurato 3 corse su 3).
     La cura vera è un flush del negozio (Fase B3 dei writer sync/async): finché non c'è, per QUESTO file si tollerano
     al più 2 rinate — mai un residuo. Ogni altro file: zero avvisi. */
  /* ⭐ F3 (24/09/2026): il flush esiste (`attendiScritture`) e i test del registro lo chiamano prima di rimuovere la cartella (`rimuoviCartellaStoreDopoLeScritture`): la tolleranza è ZERO per tutti. */
  const rinateTollerate = 0;
  assert.ok(risorte.length <= rinateTollerate, `${nome} resuscita cartelle dopo la fine dei test (scritture non aspettate): ${risorte.join(' | ')}`);
}

for (const nome of FILE_CHE_PERDEVANO) {
  test(`DESK-TEMP-1 — «${nome}» non lascia cartelle nella TEMP`, async (t) => {
    const file = fileURLToPath(new URL(`./${nome}`, import.meta.url));
    await pretendiNessunResiduo(nome, await corriNellaTempPrivata(t, file));
  });
}

const rapportiDiProvaRipresa = () => (existsSync(RAPPORTI_RIPRESA) ? readdirSync(RAPPORTI_RIPRESA) : [])
  .filter((n) => RAPPORTO_DI_PROVA_RIPRESA.test(n));

for (const nome of FILE_DEL_FRONTEND) {
  test(`DESK-TEMP-2 — «frontend/${nome}» non lascia cartelle nella TEMP né rapporti in artifacts/ripresa`, async (t) => {
    const prima = new Set(rapportiDiProvaRipresa());
    const esito = await corriNellaTempPrivata(t, join(FRONTEND, nome), FRONTEND);
    await pretendiNessunResiduo(`frontend/${nome}`, esito);
    const nuovi = rapportiDiProvaRipresa().filter((n) => !prima.has(n));
    assert.deepEqual(nuovi, [], `frontend/${nome} lascia ${nuovi.length} cartelle in frontend/artifacts/ripresa: ${nuovi.join(', ')}`);
  });
}

/*
 * ⛔ D2-c, 24/09/2026 — una rimozione fallita non deve fermare le altre. Prima, nell'`after` dell'aiuto,
 *   il primo errore interrompeva il `for` e le cartelle successive restavano in TEMP senza che nessuno lo
 *   dicesse. ⇒ Ogni cartella si tenta; gli errori si raccolgono in UN avviso e poi arrivano al chiamante.
 */
test('DESK-TEMP-3 — una rimozione fallita non ferma le altre: tutte tentate, un avviso solo, errore al chiamante', async () => {
  const tentate = [];
  const avvisi = [];
  const rimuovi = async (cartella) => {
    tentate.push(cartella);
    if (cartella === 'b' || cartella === 'd') throw Object.assign(new Error(`bloccata ${cartella}`), { code: 'EACCES' });
  };
  const avvisa = (testo, tipo) => avvisi.push({ testo, tipo });
  await assert.rejects(cartelleDiProva.rimuoviTutteLeCartelle(['a', 'b', 'c', 'd', 'e'], { rimuovi, avvisa }), (errore) => {
    assert.ok(errore instanceof AggregateError, 'gli errori arrivano insieme, non solo il primo');
    assert.equal(errore.errors.length, 2);
    return true;
  });
  assert.deepEqual(tentate, ['a', 'b', 'c', 'd', 'e'], 'ogni cartella va tentata, anche dopo un errore');
  assert.equal(avvisi.length, 1, 'un avviso solo, con tutte le cartelle rimaste');
  assert.equal(avvisi[0].tipo, 'CartellaDiProvaNonRimossa');
  assert.match(avvisi[0].testo, /b[\s\S]*d/);
  await cartelleDiProva.rimuoviTutteLeCartelle(['x', 'y'], { rimuovi: async () => {}, avvisa });
  assert.equal(avvisi.length, 1, 'AL CONTRARIO: nessun errore, nessun avviso');
});
