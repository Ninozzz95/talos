/*
 * SPESA DEI RIASSUNTI nella scheda Contesto (owner 30/10/2026 sera, «Sì, così» sul bozzetto
 * `in-corso/bozzetto-piu-riassunti-2026-10-30`; contratto `in-corso/CONTRATTO-SPESA-RIASSUNTI-SCHEDA-CONTESTO-2026-10-30.md`, forma chiusa
 * da CLI, Mobile e Performance).
 *
 * Le righe `consumo-di-servizio` (una per tentativo pagato: riassunti, /compact, motore del contesto, giudici…) si tengono qui, come la
 * storia del contesto: stato della pagina, ricostruito alla riapertura dalla rigiocata del giornale (tutte e tre le fonti sono durevoli).
 *   - ogni riga si lega al SUO riassunto con `idRiassunto` (o `jobId`, il lavoro del motore del contesto);
 *   - la riga «Riassunto al giro N» somma i token delle righe dei suoi id (dopo `migliora` sono due: il rapido e quello del modello);
 *   - la testata «Riassunti» somma gli scopi dei riassunti, anche quelli pagati e mai applicati (sono spesi);
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
import { t, tn } from './lingua.js';

/** Gli scopi che sono riassunti: la testata «Riassunti» somma solo questi (CONTRATTO §3). */
export const SCOPI_DEI_RIASSUNTI = Object.freeze(['riassunto', 'compact', 'motore']);
const ID_VALIDO = /^[A-Za-z0-9._:-]{1,256}$/u;
const conto = () => ({ token: 0, misurate: 0, nonMisurate: 0 });

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

function aggiungi(c, token) {
  if (token === null) c.nonMisurate += 1;
  else { c.token += token; c.misurate += 1; }
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
  aggiungi(spesa.riassunti, token);
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

/** Il costo di tutti i riassunti della conversazione (la testata); `null` se nessuno è stato pagato (la testata resta il solo numero). */
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
  const k = { k: kilo(costo.token) };
  return costo.stato === 'almeno' ? tn('pannello.contesto.costoAlmenoOne', 'pannello.contesto.costoAlmenoMany', costo.token, k)
    : tn('pannello.contesto.costatoOne', 'pannello.contesto.costatoMany', costo.token, k);
}

/** Il conto della testata «Riassunti»: «3 · 2,2k token» (bozzetto), o il solo numero se nessun riassunto è stato pagato. */
export function contoTestataRiassunti(numero, costo, kilo, cifra = String) {
  if (!costo || costo.stato === 'nessuno') return numero;
  const n = cifra(numero);
  if (costo.stato === 'non-misurato') return t('pannello.contesto.testataNonMisurata', { n });
  const v = { n, k: kilo(costo.token) };
  return costo.stato === 'almeno' ? tn('pannello.contesto.testataAlmenoOne', 'pannello.contesto.testataAlmenoMany', costo.token, v)
    : tn('pannello.contesto.testataCostoOne', 'pannello.contesto.testataCostoMany', costo.token, v);
}
