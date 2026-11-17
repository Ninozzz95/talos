import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

/*
 * 12/11/2026 (giro piccolo del censimento delle 95 prove, giudice v1624-v1625) — L'UNICO MODO in cui una prova di unità apre un browser.
 *
 * Col profilo finto, lanciate a mano senza il runner, le 95 prove cadevano mute («browser has been closed», «Executable doesn't
 * exist»): nessuno capiva che era l'ambiente. Le cause misurate (vedi `scripts/argomenti-prove-node.mjs`):
 *   - binari di Playwright cercati sotto il LOCALAPPDATA dato, dove non ci sono;
 *   - Chrome installato (`channel: 'chrome'`) con un USERPROFILE senza `AppData\Local`: non risolve la sua cartella dati di serie e
 *     rifiuta il canale dei DevTools.
 * ⇒ L'aiuto controlla prima ciò che si può controllare (la `AppData\Local`) e traduce gli errori muti in una causa con il rimando al
 *   lanciatore `npm run test:unit`, che prepara l'ambiente da sé. La prova FALLISCE sempre: MAI saltata, una saltata sparisce dal verde.
 */
export const FILE_CHE_APRONO_UN_BROWSER = Object.freeze([
  'b3-calm-controls-ordine', 'blocchi-lato-pagina-vera-browser', 'famiglia-consenso-stile-browser', 'interruttore-nuova-sessione-browser',
  'link-conferma-browser', 'piano-chatgpt-browser', 'process-output-lettore-browser', 'provider-esclusi-browser',
  'provider-modale-salva-browser', 'provider-pk-browser', 'provider-pkl-bis-dom', 'provider-pool-browser',
  'provider-zai-indirizzo-browser', 'richiesta-mcp-browser', 'terminale-schede-agente-browser',
]);

const RIMANDO = 'Run the tests with `npm run test:unit` (it prepares the environment) · Lancia le prove con `npm run test:unit` (prepara l ambiente).';

function senzaAppDataLocal(userProfile) {
  return new Error(
    `The test browser cannot start: USERPROFILE (${userProfile}) has no AppData\\Local, so Chrome cannot resolve its default data directory and refuses the DevTools channel. `
    + `Il browser della prova non parte: lo USERPROFILE (${userProfile}) non ha AppData\\Local, Chrome non risolve la sua cartella dati di serie e rifiuta il canale dei DevTools. ${RIMANDO}`,
  );
}

/** Lancia il browser di una prova; senza l'ambiente giusto FALLISCE con la causa (mai salta). Le opzioni vanno a `chromium.launch`. */
export async function lanciaBrowserDelleProve(opzioni = {}, {
  env = process.env, esiste = existsSync, piattaforma = process.platform, lancia = (o) => chromium.launch(o),
} = {}) {
  const chromeInstallato = Boolean(opzioni.channel) && opzioni.channel !== 'chromium';
  if (chromeInstallato && piattaforma === 'win32' && env.USERPROFILE && !esiste(join(env.USERPROFILE, 'AppData', 'Local'))) {
    throw senzaAppDataLocal(env.USERPROFILE);
  }
  try {
    return await lancia(opzioni);
  } catch (errore) {
    const testo = String(errore?.message ?? errore);
    if (/Executable doesn't exist/u.test(testo)) {
      throw new Error(
        'The test browser cannot start: the Playwright binaries are not where PLAYWRIGHT_BROWSERS_PATH (or the LOCALAPPDATA of this profile) points. '
        + `I binari di Playwright non sono dove punta PLAYWRIGHT_BROWSERS_PATH (o il LOCALAPPDATA di questo profilo). ${RIMANDO}\n${testo}`,
        { cause: errore },
      );
    }
    if (/DevTools remote debugging requires/u.test(testo)) throw Object.assign(senzaAppDataLocal(env.USERPROFILE), { cause: errore });
    throw errore;
  }
}
