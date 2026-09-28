/**
 * F5 File reader (26/09/2026) — i LASCIAPASSARE delle pagine HTML rese nel lettore.
 *
 * ⛔ Perché esistono, misurato il 26/09 (`scratchpad/prova-cookie-sandbox.mjs`, Chromium di Playwright): la cornice della
 *   resa ha la CSP `sandbox allow-scripts`, cioè un'origine NULLA; la sua navigazione parte dalla nostra pagina e porta il
 *   cookie `talos_token` (SameSite=Strict, `http-app.mjs:2791`), ma CSS, immagini e script chiesti DA DENTRO arrivano con
 *   `Sec-Fetch-Site: cross-site` e SENZA cookie. Nell'app installata (server col gettone) sarebbero tutti 401: la pagina
 *   resterebbe senza stili né script. Abbassare il cookie a Lax non basta (Lax non viaggia sulle sottorisorse
 *   cross-site) e indebolirebbe ogni rotta.
 * ⇒ La forma degli indirizzi-capacità: la pagina di TALOS (che il cookie ce l'ha) chiede al server un lasciapassare per
 *   UNA pagina; il lasciapassare è 32 byte casuali, vale per la sessione e per la CARTELLA di quella pagina (o per la sola
 *   voce di Libreria), scade se non si usa, e sta nel percorso: i link relativi della pagina lo ereditano da soli.
 * ⛔ Chi ha il lasciapassare legge in GET i file di quella cartella e nient'altro — la stessa cosa che la pagina resa può
 *   già fare. Per questo scade (30 minuti dall'ultimo uso) e i vivi sono al più 256: il più vecchio cade per primo.
 */
import { randomBytes } from 'node:crypto';

export const DURATA_LASCIAPASSARE_MS = 30 * 60 * 1000;
export const MASSIMO_LASCIAPASSARE = 256;
const FORMA = /^[A-Za-z0-9_-]{43}$/u; // 32 byte in base64url, senza riempimento

export function creaLasciapassarePagine({ ora = () => Date.now(), durataMs = DURATA_LASCIAPASSARE_MS, massimo = MASSIMO_LASCIAPASSARE, casuali = randomBytes } = {}) {
  const vivi = new Map(); // gettone → { ambito, scade }; l'ordine d'inserimento è l'ordine d'uso (si reinserisce a ogni uso)

  const pulisci = () => {
    const adesso = ora();
    for (const [gettone, voce] of vivi) if (voce.scade <= adesso) vivi.delete(gettone);
  };

  return {
    /** Un lasciapassare nuovo per un ambito (`{sessionId, prefisso:[...], nome}` o `{sessionId, voceId, nome}`). */
    crea(ambito) {
      pulisci();
      while (vivi.size >= massimo) vivi.delete(vivi.keys().next().value);
      const gettone = casuali(32).toString('base64url');
      vivi.set(gettone, { ambito: Object.freeze({ ...ambito }), scade: ora() + durataMs });
      return gettone;
    },
    /** L'ambito di un lasciapassare vivo (e il suo tempo ricomincia), o `null`. */
    usa(gettone) {
      if (typeof gettone !== 'string' || !FORMA.test(gettone)) return null;
      const voce = vivi.get(gettone);
      if (!voce) return null;
      if (voce.scade <= ora()) { vivi.delete(gettone); return null; }
      vivi.delete(gettone);
      vivi.set(gettone, { ambito: voce.ambito, scade: ora() + durataMs });
      return voce.ambito;
    },
    revoca(gettone) { return vivi.delete(gettone); },
    get quanti() { pulisci(); return vivi.size; },
  };
}
