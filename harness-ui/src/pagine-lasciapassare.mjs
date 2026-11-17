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
 * ⭐ Giro di sicurezza 5 delle anteprime (11/11/2026, forma `FORMA-ORIGINE-PER-PAGINA-2026-11-11.md`, giudice v1417 a): ogni
 *   lasciapassare ha anche la sua ETICHETTA, il nome dell'origine della pagina nel guscio del PC (`<etichetta>.localhost:<porta>`).
 *   Il lasciapassare non va bene come nome: base64url distingue maiuscole e minuscole, gli host no. L'etichetta è 16 byte casuali in
 *   esadecimale minuscolo (128 bit, 32 cifre: sta nei 63 caratteri di un'etichetta DNS), propria e non ricavata dal lasciapassare.
 *   La legge la guardia dell'Host (`http-app.mjs`) senza allungare la vita del lasciapassare.
 */
import { randomBytes } from 'node:crypto';

export const DURATA_LASCIAPASSARE_MS = 30 * 60 * 1000;
export const MASSIMO_LASCIAPASSARE = 256;
const FORMA = /^[A-Za-z0-9_-]{43}$/u; // 32 byte in base64url, senza riempimento
export const FORMA_ETICHETTA = /^[0-9a-f]{32}$/u; // 16 byte in esadecimale minuscolo

export function creaLasciapassarePagine({ ora = () => Date.now(), durataMs = DURATA_LASCIAPASSARE_MS, massimo = MASSIMO_LASCIAPASSARE, casuali = randomBytes } = {}) {
  const vivi = new Map(); // gettone → { ambito, scade, etichetta }; l'ordine d'inserimento è l'ordine d'uso (si reinserisce a ogni uso)

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
      vivi.set(gettone, { ambito: Object.freeze({ ...ambito }), scade: ora() + durataMs, etichetta: casuali(16).subarray(0, 16).toString('hex') });
      return gettone;
    },
    /** L'ambito di un lasciapassare vivo (e il suo tempo ricomincia), o `null`. */
    usa(gettone) {
      if (typeof gettone !== 'string' || !FORMA.test(gettone)) return null;
      const voce = vivi.get(gettone);
      if (!voce) return null;
      if (voce.scade <= ora()) { vivi.delete(gettone); return null; }
      vivi.delete(gettone);
      vivi.set(gettone, { ambito: voce.ambito, scade: ora() + durataMs, etichetta: voce.etichetta });
      return voce.ambito;
    },
    /** L'etichetta dell'origine di un lasciapassare VIVO, o `null`. Non rinnova il suo tempo (chiederla non è usarlo). */
    etichetta(gettone) {
      if (typeof gettone !== 'string' || !FORMA.test(gettone)) return null;
      const voce = vivi.get(gettone);
      return voce && voce.scade > ora() ? voce.etichetta : null;
    },
    revoca(gettone) { return vivi.delete(gettone); },
    get quanti() { pulisci(); return vivi.size; },
  };
}
