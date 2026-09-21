import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

/*
 * ⛔⛔⛔ 02/09 — correzione dell'owner, testuale: «per gli screenshot la
 * regola impone viewport tablet ma noi siamo su desktop, quindi devi
 * includere anche viewport laptop e desktop».
 *
 * La regola delle QUATTRO VIEWPORT in memoria è nata per il MOBILE (tablet
 * portrait per primo, tablet landscape, telefono in entrambi gli
 * orientamenti) ed è giusta lì. Su un'app DESKTOP, applicata da sola,
 * lascia scoperto lo schermo su cui la persona lavora davvero.
 */

test('VIEWPORT-DESKTOP-01 — la matrice desktop è dichiarata in UN posto solo', async () => {
  const script = await source('scripts/qa-visual-pipeline.mjs');
  assert.match(script, /export const VIEWPORT_DESKTOP/);
  assert.match(script, /nome: 'laptop', width: 1024, height: 800/);
  assert.match(script, /nome: 'desktop', width: 1440, height: 900/);
});

test('VIEWPORT-DESKTOP-02 — nessuna viewport scritta a mano fuori dalla matrice', async () => {
  /*
   * ⛔ Erano SETTE ternarie duplicate `qa === 'laptop' ? 1024 : 1440`
   * sparse nel file: sette posti da ricordare di aggiornare, cioè sette
   * modi di dimenticarsene. Una regola che vive in sette copie non è una
   * regola.
   */
  const script = await source('scripts/qa-visual-pipeline.mjs');
  assert.doesNotMatch(script, /searchParams\.get\('qa'\) === 'laptop'/, 'la scelta viewport passa da viewportRichiesta(), non da ternarie sparse');
  assert.ok(script.split('viewportRichiesta(URL_BASE)').length - 1 >= 3, 'gli scenari devono usare la funzione condivisa');
});

test('VIEWPORT-DESKTOP-03 — AL CONTRARIO: una viewport sconosciuta NON ricade in silenzio sul default', async () => {
  /*
   * ⛔ Un nome sbagliato che ricade sul default è il difetto peggiore per
   * una pipeline di prove: si crede di aver fotografato il portatile e si
   * è fotografato il desktop, due volte, senza che nulla lo dica.
   */
  const { viewportRichiesta, VIEWPORT_DESKTOP } = await import('../scripts/qa-visual-pipeline.mjs');
  assert.deepEqual(viewportRichiesta('http://x/?qa=laptop'), { width: 1024, height: 800 });
  assert.deepEqual(viewportRichiesta('http://x/?qa=desktop'), { width: 1440, height: 900 });
  assert.deepEqual(viewportRichiesta('http://x/'), { width: 1440, height: 900 }, 'senza parametro si usa il desktop');
  assert.throws(() => viewportRichiesta('http://x/?qa=tablet'), /sconosciuta/);
  assert.equal(VIEWPORT_DESKTOP.length, 2);
});

/*
 * ⛔⛔⛔ 04/9 — LA GUARDIA CHE COSTA DENARO SE MANCA. `qa-visual-pipeline.mjs`
 * chiamava `main()` a livello di modulo: importarlo — come fa il test qui
 * sopra per leggere `VIEWPORT_DESKTOP` — faceva partire la pipeline VERA,
 * che punta al 4174 di default (il server vivo dell'owner) e avvia una
 * sessione con una chiamata a un modello A PAGAMENTO. Cioè: ogni
 * `npm run verify:all` spendeva soldi. Misurato nel log del 04/09
 * («Scenario: nuova-sessione-compito-libero · URL: http://127.0.0.1:4174/»
 * in mezzo ai test).
 *
 * ⛔ Questo test non guarda il testo del file: importa il modulo in un
 * processo figlio e verifica che non succeda NIENTE.
 */
test('QA-PIPELINE-GUARDIA — importare la pipeline non la ESEGUE (nessuno scenario, nessuna sessione, nessun costo)', async () => {
  const { execFileSync } = await import('node:child_process');
  const modulo = new URL('../scripts/qa-visual-pipeline.mjs', import.meta.url).href;
  const uscita = execFileSync(process.execPath, ['-e', `import(${JSON.stringify(modulo)}).then(() => console.log('IMPORTATO'))`], { encoding: 'utf8', timeout: 30_000 });
  assert.match(uscita, /IMPORTATO/);
  assert.doesNotMatch(uscita, /Scenario:/, 'un import non deve far partire nessuno scenario');
  assert.doesNotMatch(uscita, /4174/, 'un import non deve nemmeno nominare il server vivo dell\'owner');
});
