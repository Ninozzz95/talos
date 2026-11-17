/*
 * SPESA DEI RIASSUNTI nella scheda Contesto (owner 30/10/2026 sera, «Sì, così» sul bozzetto
 * `in-corso/bozzetto-piu-riassunti-2026-10-30`; contratto `in-corso/CONTRATTO-SPESA-RIASSUNTI-SCHEDA-CONTESTO-2026-10-30.md`, forma chiusa
 * da CLI, Mobile e Performance).
 *
 * Le righe `consumo-di-servizio` (una per chiamata pagata, che dice `tentativi` se ne ha fatti più d'uno: riassunti, /compact, motore del
 * contesto, giudici…) si tengono qui, come la
 * storia del contesto: stato della pagina, ricostruito alla riapertura dalla rigiocata del giornale (tutte e tre le fonti sono durevoli).
 *   - ogni riga si lega al SUO riassunto con `idRiassunto` (o `jobId`, il lavoro del motore del contesto);
 *   - la riga «Riassunto al giro N» somma i token delle righe dei suoi id (dopo `migliora` sono due: il rapido e quello del modello);
 *   - la riga sotto la testata «Compattazioni» somma gli scopi dei riassunti, anche quelli pagati e mai applicati (sono spesi);
 *   - il numero in fondo alla chat somma TUTTE le righe, di qualunque scopo (la regola dei lettori: uno scopo sconosciuto conta), tranne
 *     quelle del motore del contesto, che ci arrivano già per un'altra strada (`GIA_NEL_PIEDE`); la percentuale di cache non cambia.
 * «token» = entrata + uscita, la stessa formula del numero in fondo alla chat.
 *
 * ⛔ Mobile 1: «nessun costo» SOLO se non c'è nessuna riga con quell'id — mai dedotto da `ripiego` (un riassunto col modello può pagare
 *   tentativi falliti e poi ricadere sul rapido).
 * ⛔ Mobile 2: un uso sconosciuto non è mai zero — tutte le righe senza uso ⇒ «non misurato»; alcune sì e alcune no ⇒ «almeno».
 * ⛔ Un riassunto di prima (senza id) non dice niente: il costo non si inventa.
 * Tutto è PURO e serializzabile (oggetti semplici, niente Map): la scheda confronta i dati con JSON per non ridisegnarsi a vuoto.
 */
import { t, tn, linguaCorrenteDiT } from './lingua.js';

/** Gli scopi che sono riassunti: la testata «Riassunti» somma solo questi (CONTRATTO §3). */
export const SCOPI_DEI_RIASSUNTI = Object.freeze(['riassunto', 'compact', 'motore']);
const ID_VALIDO = /^[A-Za-z0-9._:-]{1,256}$/u;
/* S1-b (11/11): `cache` = token letti dalla cache dichiarati, `conCache` = quante righe misurate li dichiarano (mai dedotti);
   `chiamate` (ultimo giro) = le chiamate pagate, contate per tentativo */
const conto = () => ({ token: 0, misurate: 0, nonMisurate: 0, cache: 0, conCache: 0, chiamate: 0 });

export function nuovaSpesa() {
  return { perId: Object.create(null), riassunti: conto(), totale: conto(), piede: conto(), viste: [] };
}
/* ⛔ Il motore del contesto la sua spesa la porta già al numero in fondo alla chat, coi `talos.context` `context.usage.recorded`
   (`contextUsageFromEvents`, legacy/app.js `aggiornaUsageSessione`): le sue righe `consumo-di-servizio` (parte 2 B) sono le STESSE
   chiamate. Nel piede entrerebbero due volte; nella testata «Riassunti» no (lì sono l'unica fonte). */
const GIA_NEL_PIEDE = Object.freeze(['motore']);

/** I token di una riga: entrata + uscita, o `null` se il fornitore non li ha detti (mai 0 al posto di «non so»). */
export function tokenDellaRiga(valore) {
  const u = valore?.usage;
  if (!u || typeof u !== 'object') return null;
  const dentro = Number.isFinite(u.prompt_tokens) && u.prompt_tokens >= 0 ? u.prompt_tokens : null;
  const fuori = Number.isFinite(u.completion_tokens) && u.completion_tokens >= 0 ? u.completion_tokens : null;
  if (dentro === null && fuori === null) return null;
  return (dentro ?? 0) + (fuori ?? 0);
}

/** I token letti dalla cache che la riga DICHIARA (sottoinsieme di `prompt_tokens`), o `null`: le tre forme che il nucleo somma già. */
export function cacheDellaRiga(valore) {
  const u = valore?.usage;
  if (!u || typeof u !== 'object') return null;
  for (const v of [u.prompt_tokens_details?.cached_tokens, u.cache_read_input_tokens, u.prompt_cache_hit_tokens]) if (Number.isFinite(v) && v >= 0) return v;
  return null;
}

/** Le chiamate pagate di una riga: `tentativi` se è un intero oltre 1 (il nucleo lo scrive solo allora, consumo-di-servizio.mjs:96), se no 1. */
export function chiamateDellaRiga(valore) {
  const n = valore?.tentativi;
  return Number.isSafeInteger(n) && n > 1 ? n : 1;
}

function aggiungi(c, token, cache = null, chiamate = 1) {
  c.chiamate = (c.chiamate ?? 0) + chiamate;
  if (token === null) c.nonMisurate += 1;
  else {
    c.token += token; c.misurate += 1;
    if (cache !== null) { c.cache = (c.cache ?? 0) + cache; c.conCache = (c.conCache ?? 0) + 1; }
  }
}

/**
 * Una riga `consumo-di-servizio` entra nel conto. `sequenza` (la `_sequenza` del giornale) evita il doppio a una riconnessione; senza,
 * la riga si conta (la rigiocata alla riapertura parte da un conto azzerato). Restituisce `true` se il conto è cambiato.
 */
export function registraSpesa(spesa, valore, sequenza = null) {
  if (!spesa || !valore || typeof valore !== 'object') return false;
  if (Number.isSafeInteger(sequenza)) {
    if (spesa.viste.includes(sequenza)) return false;
    spesa.viste.push(sequenza);
    if (spesa.viste.length > 4000) spesa.viste.splice(0, spesa.viste.length - 4000);
  }
  const token = tokenDellaRiga(valore);
  aggiungi(spesa.totale, token);
  if (!GIA_NEL_PIEDE.includes(valore.scopo)) aggiungi(spesa.piede ??= conto(), token);
  if (!SCOPI_DEI_RIASSUNTI.includes(valore.scopo)) return true;
  aggiungi(spesa.riassunti, token, cacheDellaRiga(valore), chiamateDellaRiga(valore));
  for (const id of [valore.idRiassunto, valore.jobId]) {
    if (typeof id !== 'string' || !ID_VALIDO.test(id)) continue;
    aggiungi(spesa.perId[id] ??= conto(), token);
  }
  return true;
}

/** Gli id del riassunto di una riga della scheda, dall'evento di fine: il suo id, e il lavoro del motore che scriverà quello del modello. */
export function idDellaFine(c) {
  return [c?.idRiassunto, c?.lavoroDelMotore].filter((id) => typeof id === 'string' && ID_VALIDO.test(id));
}

function stato(c) {
  if (c.misurate === 0 && c.nonMisurate === 0) return { stato: 'nessuno', token: 0 };
  if (c.misurate === 0) return { stato: 'non-misurato', token: null };
  return { stato: c.nonMisurate > 0 ? 'almeno' : 'misurato', token: c.token };
}

/** Il costo di UN riassunto (una riga della scheda) dai suoi id; `null` = riassunto senza id (di prima): non si scrive niente. */
export function costoDelRiassunto(spesa, ids) {
  const validi = Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === 'string' && ID_VALIDO.test(id)))] : [];
  if (!validi.length) return null;
  const somma = conto();
  for (const id of validi) {
    const c = spesa?.perId?.[id];
    if (!c) continue;
    somma.token += c.token; somma.misurate += c.misurate; somma.nonMisurate += c.nonMisurate;
  }
  return stato(somma);
}

/** Il costo di tutte le compattazioni della conversazione (la riga sotto la testata); `null` se nessuna è stata pagata (nessuna riga). */
export function costoDeiRiassunti(spesa) {
  const c = spesa?.riassunti;
  if (!c || (c.misurate === 0 && c.nonMisurate === 0)) return null;
  return stato(c);
}

/** I token di servizio da sommare al numero in fondo alla chat: ogni scopo tranne quelli che ci arrivano già (il motore), solo i misurati. */
export function tokenDiServizio(spesa) {
  const c = spesa?.piede;
  return c && c.misurate > 0 ? c.token : 0;
}

/** Le parole della riga: «costato 1,1k token», «nessun costo», «almeno 1,1k token», «costo non misurato». */
export function testoCosto(costo, kilo) {
  if (!costo) return null;
  if (costo.stato === 'nessuno') return t('pannello.contesto.nessunCosto');
  if (costo.stato === 'non-misurato') return t('pannello.contesto.costoNonMisurato');
  /* il plurale segue il numero (LINGUA-7); le chiavi per intero, perché il cancello dei letterali le ritrovi (LINGUA-1) */
  const k = { k: tokenBrevi(costo.token, kilo) }; // S1-b (11/11): da un milione «M», come la riga della spesa
  return costo.stato === 'almeno' ? tn('pannello.contesto.costoAlmenoOne', 'pannello.contesto.costoAlmenoMany', costo.token, k)
    : tn('pannello.contesto.costatoOne', 'pannello.contesto.costatoMany', costo.token, k);
}

/*
 * ⭐ S1-b (owner 11/11/2026 07:47-07:52, «Piccole subito»): la testata «Compattazioni N» dice solo il numero; la spesa sta su una riga sua,
 *   sotto, perché il numero conta i riassunti applicati e la spesa OGNI chiamata pagata (segmenti, fusioni, ritentativi, mai applicati):
 *   «3 · 5597,9k token» faceva leggere 1,9 M a riassunto. Ora: «Spesa delle compattazioni: almeno 5,6 M token in 41 chiamate, di cui
 *   2,1 M dalla cache». La parte della cache SOLO se ogni riga misurata la dichiara (mai dedotta); «almeno» se una riga non ha l'uso.
 * ⛔ Ultimo giro (controllore 11/11 10:45, owner 10:48): il nome è quello vero della somma (riassunti, /compact e motore del contesto:
 *   `SCOPI_DEI_RIASSUNTI`), non «del motore»; le chiamate si contano per TENTATIVO (una riga con `tentativi: 3` sono tre chiamate pagate:
 *   Hermes `agent/empty_response_guard.py:173` e `:240` conta e paga ogni tentativo vuoto).
 * pi `footer.ts:25-30` (`formatTokens`): da un milione «M» con una cifra decimale; `:183` la cache letta solo se c'è.
 */
/** La spesa delle chiamate dei riassunti per la riga sotto la testata, o `null` se nessuna è stata pagata. PURA. */
export function spesaDelMotore(spesa) {
  const base = costoDeiRiassunti(spesa);
  if (!base) return null;
  const c = spesa.riassunti;
  const tutteConCache = c.misurate > 0 && (c.conCache ?? 0) === c.misurate;
  /* `chiamate` manca in un conto di una versione di prima (la pagina lo rifà dal giornale, ma per sicurezza): una per riga */
  return { ...base, chiamate: c.chiamate ?? c.misurate + c.nonMisurate, cache: tutteConCache ? c.cache ?? 0 : null };
}

/** «41,2k» sotto il milione (il `kilo` di chi chiama), da lì «5,6 M» con una cifra decimale. 999.950 si scriverebbe «1000k»: è già «1,0 M». */
export function tokenBrevi(n, kilo, locale = linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT') {
  if (!Number.isFinite(n) || n < 999_950) return kilo(n);
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 1_000_000)} M`;
}

/** Le parole della riga sotto «Compattazioni N» da `spesaDelMotore`, o `null` (niente pagato: nessuna riga). */
export function testoSpesaDelMotore(s, kilo, locale) {
  if (!s) return null;
  const n = s.chiamate;
  if (s.stato === 'non-misurato') return tn('pannello.contesto.spesaCompattazioniNonMisurataOne', 'pannello.contesto.spesaCompattazioniNonMisurataMany', n, { n });
  const v = { n, k: tokenBrevi(s.token, kilo, locale) };
  const frase = s.stato === 'almeno' ? tn('pannello.contesto.spesaCompattazioniAlmenoOne', 'pannello.contesto.spesaCompattazioniAlmenoMany', n, v)
    : tn('pannello.contesto.spesaCompattazioniOne', 'pannello.contesto.spesaCompattazioniMany', n, v);
  return s.cache !== null && s.cache > 0 ? `${frase}${t('pannello.contesto.spesaCompattazioniCache', { k: tokenBrevi(s.cache, kilo, locale) })}` : frase;
}
