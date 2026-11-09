/*
 * Centro assistenza (owner 01/11/2026): quale guida porta questo server, e per quale prodotto.
 *
 *   - La copia sta in `harness-ui/aiuto/index.json`, costruita dalla release con `scripts/costruisci-aiuto.mjs` dalle pagine del sito
 *     della sua versione; `TALOS_AIUTO_DIR` la sposta (il telefono la mette negli asset dell'APK, condizione del Mobile).
 *   - Senza `index.json` l'attrezzo NON si offre (meglio assente che rotto): si guarda solo se il file c'è, l'indice si legge alla
 *     prima chiamata (condizione di Performance).
 *   - Il prodotto: `TALOS_AIUTO_PRODOTTO` se c'è; altrimenti `android` per il server dell'app del telefono (`TALOS_LOCALE_OSPITE_DIR`),
 *     `desktop` per tutti gli altri. La versione: `TALOS_AIUTO_VERSIONE`, poi quella dell'app desktop (`versioneDesktopFn`).
 *   - La lingua della persona: `TALOS_AIUTO_LINGUA` (revisione del blocco 25); senza, l'attrezzo dice al modello che non la sa.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { creaAiutoTalos } from '../kernel/aiuto-talos.mjs'

const PRODOTTI = new Set(['desktop', 'cli', 'android'])
const pulito = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function aiutoDelServer(env, { cartellaPredefinita, versioneDesktopFn = () => null, esisteFn = existsSync } = {}) {
    const cartella = pulito(env?.TALOS_AIUTO_DIR) ?? cartellaPredefinita
    if (!cartella || !esisteFn(join(cartella, 'index.json'))) return null
    const scelto = pulito(env?.TALOS_AIUTO_PRODOTTO)
    const prodotto = scelto && PRODOTTI.has(scelto) ? scelto : (pulito(env?.TALOS_LOCALE_OSPITE_DIR) ? 'android' : 'desktop')
    const versione = pulito(env?.TALOS_AIUTO_VERSIONE) ?? (prodotto === 'desktop' ? pulito(versioneDesktopFn()) : null)
    /* Revisione del blocco 25 (S3, R8): la lingua della persona arriva se l'ospite la conosce (`TALOS_AIUTO_LINGUA`, per ogni prodotto, come la versione);
       ignota, l'attrezzo lo DICE al modello invece di tacere (`notaDiLingua`). Telefono e CLI: mettono le due variabili quando le sanno */
    const lingua = pulito(env?.TALOS_AIUTO_LINGUA)
    return creaAiutoTalos({ cartella, prodotto, versione, lingua })
}
