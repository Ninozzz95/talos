/*
 * Riga 199, giro unico (punto 7) — le controprove per i 4 mutanti vivi del revisore B: dentro una radice che sta a sua volta sulla rete
 *   (la cartella, un progetto dell'ambiente) il posto si misura COME OGGI. La condivisione è simulata dalla spia, con un collegamento
 *   dentro (`link` → `vero`) perché il percorso vero sia diverso da quello scritto; l'ospite è inventato, nessun `\\…` va al disco vero.
 *   B10: F3 senza i progetti dell'ambiente; B12: `ePercorsoDiControllo` senza la cartella; B14: le cartelle bloccate senza la cartella;
 *   B17: il `breve` di `\\ospite` senza condivisione.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { portaInRete } = await import('../src/kernel/file-namespace-contract.mjs');
const { ePercorsoDiControllo, bloccataDa } = await import('../src/path-policy.mjs');
const { cancellazioneCritica, dimenticaPercorsiVeri } = await import('../src/kernel/cancellazioni-critiche.mjs');
const { B, NAS, unc } = S;

const solo = { skip: process.platform !== 'win32' && 'solo Windows' };
const link = unc(NAS, 'lavoro', 'link');
const vero = unc(NAS, 'lavoro', 'vero');
S.collegamentiDelNas.set(link.toLowerCase(), vero);

test('R199-B12: con la cartella su una condivisione, `skills/` alla radice del progetto (percorso vero diverso) resta un file di controllo', solo, () => {
  S.azzera();
  assert.equal(ePercorsoDiControllo(link, `skills${B}x.md`), true);
  assert.ok(S.delNas.length > 0, 'la cartella sulla condivisione si misura');
  assert.deepEqual(S.elencoDeiTocchi(), []);
});

test('R199-B14: con la cartella su una condivisione, una cartella bloccata raggiunta attraverso il collegamento resta bloccata', solo, () => {
  S.azzera();
  assert.equal(bloccataDa(`segreto${B}a.txt`, { cartella: link, bloccati: [`${vero}${B}segreto`] })?.radice, `${vero}${B}segreto`);
  assert.deepEqual(S.elencoDeiTocchi(), []);
});

test('R199-B10: un progetto dell ambiente su una condivisione (non la cartella) si legge come oggi dal lettore delle cancellazioni', solo, () => {
  S.azzera();
  dimenticaPercorsiVeri();
  cancellazioneCritica(`rm -rf ${link}${B}src/`, { cartella: 'C:\\progetto-r199', ambiente: { TALOS_HARNESS_UI_PROJECT_DIRS: link } });
  assert.ok(S.delNas.some((p) => /realpath/u.test(p)), 'il percorso vero dentro il progetto dell ambiente si cerca');
  assert.deepEqual(S.elencoDeiTocchi(), []);
});

test('R199-B17: `\\\\ospite` senza condivisione resta `\\\\ospite` (Node lo darebbe con una barra sola)', () => {
  assert.equal(portaInRete(`${B}${B}ospite`, { platform: 'win32' })?.breve, `${B}${B}ospite`);
  assert.equal(portaInRete(`${B}${B}ospite${B}`, { platform: 'win32' })?.breve.startsWith(`${B}${B}ospite`), true);
});
