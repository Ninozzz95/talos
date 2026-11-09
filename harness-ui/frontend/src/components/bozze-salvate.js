/*
 * La fotografia delle bozze non inviate nello spazio della scheda (sessionStorage). Tester R1 (03/11/2026): la bozza si perdeva ricaricando.
 *
 * Revisione del blocco del 03/11 pomeriggio:
 * - R1b: si scriveva solo quando la pagina se ne andava (`pagehide`), che non arriva se il renderer cade. La fotografia ora è una funzione
 *   pura di ciò che c'è (le bozze parcheggiate più il campo della chat aperta), e `app.js` la riscrive a ogni parcheggio, ripresa, arrivo di
 *   un allegato e invio: una bozza inviata non resta nella scheda, una parcheggiata c'è anche senza `pagehide`.
 * - R1a: con lo spazio pieno `setItem` lanciava e restava la fotografia VECCHIA (vedi `scriviBozze`).
 * - R1c: finivano nella scheda il testo intero dei file e delle pagine e i percorsi col nome utente (Electron tiene lo sessionStorage anche
 *   sul disco). Ora si salvano solo i campi che servono a rimettere l'allegato: il riferimento nei dati di TALOS (`attachments/<id>/<nome>`,
 *   decisioni 43 e 47), l'immagine per id, la pagina per indirizzo (il testo si rilegge dal server). La chiave di una cartella libera non
 *   porta il percorso: porta la sua impronta.
 * Come Hermes tiene le bozze di ogni chat (`apps/desktop/src/store/composer-draft-stash.ts`): l'id e il testo, mai i byte.
 */
export const CHIAVE_BOZZE_SALVATE = 'talos.bozze.v2';
/** La versione di prima portava il testo dei file e i percorsi: si toglie alla prima lettura */
export const CHIAVI_BOZZE_VECCHIE = Object.freeze(['talos.bozze.v1']);
const VERSIONE = 2;

const CAMPI_SEMPLICI = Object.freeze(['id', 'allegatoId', 'tipo', 'nome', 'byte', 'bytes', 'caratteri', 'mimeType', 'larghezza', 'altezza', 'costoIgnoto', 'daBrowser']);
const RIFERIMENTO_DEI_DATI = /^attachments\/[0-9a-f]{24}\/[^\\/]+$/u;
const INDIRIZZO_IMMAGINE = /^\/api\/v1\/chat-images\/[a-f0-9]{64}$/u;
const INDIRIZZO_PAGINA = /^https?:\/\//iu;

/** Un allegato com'è nella scheda, o `null` se non si può rimettere (un caricamento a metà, una forma sconosciuta). */
export function allegatoDaSalvare(a) {
  if (!a || typeof a !== 'object') return null;
  const percorso = typeof a.percorso === 'string' ? a.percorso : '';
  const pagina = a.daBrowser === true && INDIRIZZO_PAGINA.test(percorso);
  if (!(typeof a.id === 'string' && a.id) && !(typeof a.allegatoId === 'string' && a.allegatoId) && !pagina) return null;
  const salvato = {};
  for (const campo of CAMPI_SEMPLICI) {
    const v = a[campo];
    if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) salvato[campo] = v;
  }
  /* il percorso solo se non porta il PC: il riferimento dei dati di TALOS, o l'indirizzo della pagina */
  if (RIFERIMENTO_DEI_DATI.test(percorso) || pagina) salvato.percorso = percorso;
  if (typeof a.url === 'string' && INDIRIZZO_IMMAGINE.test(a.url)) salvato.url = a.url;
  /* senza il testo nel messaggio il costo non è più quello misurato sul testo */
  if (typeof a.contenuto === 'string' && a.contenuto && !pagina) salvato.costoIgnoto = true;
  return salvato;
}

/** L'impronta di un percorso (cyrb53, 53 bit): la chiave resta la stessa per la stessa cartella, e il percorso non esce. */
export function impronta(testo) {
  let h1 = 0xdeadbeef; let h2 = 0x41c6ce57;
  for (let i = 0; i < testo.length; i += 1) {
    const c = testo.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** La chiave della bozza di una chat in attesa su una cartella: mai il percorso in chiaro. */
export function chiaveDiCartella(cartella) {
  return `cartella:${impronta(String(cartella))}`;
}

/**
 * La fotografia: le bozze parcheggiate più il campo della chat aperta (`corrente`), senza toccare le bozze in memoria.
 * @param {Map<string, {testo: string, allegati: object[]}>|Array} bozze
 * @param {{chiave: string, testo: string, allegati: object[]}|null} corrente
 * @param {number} tetto quante bozze al massimo (le più recenti)
 * @returns {{version: number, voci: Array}|null} `null` = niente da tenere
 */
export function fotografiaBozze(bozze, corrente = null, tetto = 20) {
  const unite = new Map([...(bozze ?? [])].map(([chiave, b]) => [chiave, { testo: String(b?.testo || ''), allegati: [...(b?.allegati || [])] }]));
  if (corrente?.chiave && (String(corrente.testo || '').trim() || corrente.allegati?.length)) {
    const b = unite.get(corrente.chiave) ?? { testo: '', allegati: [] };
    unite.delete(corrente.chiave); // la chat aperta è la più recente
    for (const a of corrente.allegati || []) if (!b.allegati.includes(a)) b.allegati.push(a);
    if (String(corrente.testo || '').trim()) b.testo = String(corrente.testo);
    unite.set(corrente.chiave, b);
  }
  const voci = [...unite]
    .map(([chiave, b]) => [chiave, { testo: b.testo, allegati: b.allegati.map(allegatoDaSalvare).filter(Boolean) }])
    .filter(([, b]) => b.testo.trim() || b.allegati.length)
    .slice(-tetto);
  return voci.length ? { version: VERSIONE, voci } : null;
}

/**
 * Scrive la fotografia. R1a: se la scrittura non riesce (lo spazio della scheda è pieno, `QuotaExceededError`) toglie la vecchia, che
 * altrimenti restava e rimetteva alla ricarica una bozza già inviata: meglio nessuna bozza che una bozza falsa. Uno storage che lancia
 * non rompe niente. → `true` se la scheda ora dice il vero.
 */
export function scriviBozze(storage, fotografia) {
  if (!storage) return false;
  try {
    if (fotografia) storage.setItem(CHIAVE_BOZZE_SALVATE, JSON.stringify(fotografia));
    else storage.removeItem(CHIAVE_BOZZE_SALVATE);
    return true;
  } catch {
    try { storage.removeItem(CHIAVE_BOZZE_SALVATE); return true; } catch { return false; }
  }
}

/** Le bozze salvate, già ridotte alla loro forma (una voce rovinata cade da sola); toglie le chiavi vecchie. */
export function leggiBozze(storage, tetto = 20) {
  if (!storage) return [];
  for (const vecchia of CHIAVI_BOZZE_VECCHIE) { try { storage.removeItem(vecchia); } catch { /* niente */ } }
  try {
    const salvate = JSON.parse(storage.getItem(CHIAVE_BOZZE_SALVATE) || 'null');
    if (salvate?.version !== VERSIONE || !Array.isArray(salvate.voci)) return [];
    return salvate.voci.slice(-tetto)
      .filter((voce) => Array.isArray(voce) && typeof voce[0] === 'string' && voce[1] && typeof voce[1].testo === 'string' && Array.isArray(voce[1].allegati))
      .map(([chiave, b]) => [chiave, { testo: b.testo, allegati: b.allegati.map(allegatoDaSalvare).filter(Boolean) }]); // anche in lettura, solo la forma
  } catch { return []; }
}
