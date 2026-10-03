/*
 * ⛔⛔ I TESTI A CHIAVI STABILI (owner 03/10/2026: «ogni singola parola nella app deve essere sia in inglese che in italiano,
 *   non negoziabile»; «chiavi stabili, inglese di riserva»).
 *
 * Un file per AREA (`chat.js`, `kernel.js`, …), e dentro ogni file l'italiano e l'inglese AFFIANCATI con le stesse chiavi:
 *   export default { it: { chiave: '…' }, en: { chiave: '…' } }
 * La chiave pubblica è `<area>.<chiave>` (`t('kernel.fermatoDallaRiga')`), come i percorsi puntati del catalogo di Hermes
 * (`apps/desktop/src/i18n/en.ts`, chiavi tipo `agents.activeCount`, letto il 03/10/2026).
 * ⇒ Perché un file per area e non un catalogo per lingua: le lavorazioni in parallelo (fino a cinque, owner 03/10) non toccano
 *   mai lo stesso file, e una traduzione che manca si vede accanto alla sua sorella invece che in un altro file.
 * ⛔ Il cancello (`tests/unit/lingua-cancello.test.mjs`, strato 1) pretende per ogni area: le stesse chiavi in it ed en, nessun
 *   valore vuoto, gli stessi segnaposto `{nome}`. La riserva è l'INGLESE: una chiave che mancasse in italiano mostrerebbe
 *   l'inglese, mai una chiave grezza e mai l'italiano a chi ha scelto l'inglese.
 */
import kernel from './kernel.js';
import app from './app.js';
import chat from './chat.js';
import agenti from './agenti.js';
import processi from './processi.js';
import modelli from './modelli.js';
import sezioni from './sezioni.js';
import github from './github.js';
import varie from './varie.js';
import errori from './errori.js';
import comandi from './comandi.js';
import home from './home.js';
import impostazioni from './impostazioni.js';
import modello from './modello.js'; // 03/10/2026, corsia S1: il modello HTML e i frammenti
import server from './server.js'; // 03/10/2026, corsia K4a: i testi che il server manda alla persona come dati

/** Le aree registrate: per aggiungerne una si importa qui il suo file. */
export const AREE = Object.freeze({ kernel, app, chat, agenti, processi, modelli, sezioni, github, varie, errori, comandi, home, impostazioni, modello, server });

function appiattisci(lingua) {
  const fuori = {};
  for (const [area, voci] of Object.entries(AREE)) {
    for (const [chiave, valore] of Object.entries(voci[lingua] || {})) fuori[`${area}.${chiave}`] = valore;
  }
  return Object.freeze(fuori);
}

/** Le due lingue, appiattite: `TESTI.en['kernel.fermatoDallaRiga']`. */
export const TESTI = Object.freeze({ it: appiattisci('it'), en: appiattisci('en') });
