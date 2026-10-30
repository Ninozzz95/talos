/*
 * Area 'pannello' — il pannello di destra v2, nella FORMA delle aree del prodotto (`frontend/src/i18n/testi/*.js`:
 * `export default { it: {…}, en: {…} }`, owner 03/10/2026). Si copia in `frontend/src/i18n/testi/pannello.js` insieme ai due
 * file accanto, e si registra in `testi/index.js` (`import pannello from './pannello.js'` + `pannello` in `AREE`).
 * Le chiavi pubbliche sono `pannello.<chiave>`. L'inglese è la sorgente (`pannello.en.js`), l'italiano la traduzione.
 */
import en from '../pannello.en.js';
import it from '../pannello.it.js';

export default { it, en };
