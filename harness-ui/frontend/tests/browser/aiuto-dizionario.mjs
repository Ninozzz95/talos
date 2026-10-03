/*
 * Corsia D della lingua (03/10/2026) — le spec che caricano un componente dal suo SORGENTE su un percorso finto
 * (`/__lab/x.js`, `/__c3/x.js`, `/__corsiad/x.js`) servono i file di `src/components/` per nome. Da quando i componenti
 * parlano col dizionario, `lingua.js` importa `../i18n/en.js` e `../i18n/testi/index.js`, che dal percorso finto diventano
 * `/i18n/…`: il 4174 serve la build in un pacchetto solo e quei file non li ha, quindi l'import falliva
 * («Failed to fetch dynamically imported module»).
 * ⇒ Questo aiuto serve anche l'albero del dizionario dal sorgente, come il componente. Un percorso che esce da `src/i18n`
 *   o un file che manca rispondono 404: un import che non risolve deve farsi vedere, mai un vuoto.
 */
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const DIZIONARIO = resolve(process.cwd(), 'src', 'i18n');

export async function serviIlDizionario(page) {
  await page.route('**/i18n/**/*.js', async (route) => {
    const percorso = new URL(route.request().url()).pathname;
    const dentro = percorso.slice(percorso.indexOf('/i18n/') + '/i18n/'.length);
    const file = resolve(DIZIONARIO, dentro);
    if (relative(DIZIONARIO, file).startsWith('..')) {
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `fuori dal dizionario: ${dentro}` });
      return;
    }
    try {
      const sorgente = await readFile(file, 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: sorgente });
    } catch {
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `manca ${dentro}` });
    }
  });
}
