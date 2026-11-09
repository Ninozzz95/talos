/*
 * ⭐ Fase 8 «Impostazioni dalla chat» (owner 01/11/2026) — LE ROTTE della finestra del PC. Nessun pezzo visivo nuovo: queste sono le porte
 *   che la carta, il segno «Cambiata da TALOS · Annulla» e `/settings` useranno quando arriveranno i bozzetti del Frontend, più il lato
 *   finestra del canale della copia (§3.5, strada A), che serve già oggi.
 *   · GET  /api/v1/app-settings/catalog        il catalogo (chiavi, sezioni, valori, EN/IT): la ricerca delle Impostazioni, il Mobile;
 *   · GET  /api/v1/app-settings/changes        le ricevute dei cambi fatti dal modello (e i loro Annulla), le più nuove prima;
 *   · GET  /api/v1/app-settings/window         la copia sul server delle preferenze della finestra (la finestra si riallinea all'avvio);
 *   · POST /api/v1/app-settings/window         la finestra manda le sue preferenze quando la persona le cambia: `{ valori }`;
 *   · POST /api/v1/app-settings/window/applied la finestra risponde a `talos.impostazioni-finestra`: `{ richiestaId, applicati, nonApplicati? }`;
 *   · POST /api/v1/app-settings/undo           l'Annulla della persona: `{ receiptId }`;
 *   · POST /api/v1/app-settings/apply          `/settings` della persona (02/11/2026, forma `FORMA-SETTINGS-DELLA-PERSONA-2026-11-02.md`):
 *     `{ sessionId?, changes:[{key, value}], expectedRevision? }` ⇒ `{ ricevuta, cambi, gia, revisione }`. Niente carta.
 * ⛔ Solo la FINESTRA del PC (come le notifiche e il remoto): un'origine remota si ferma, e le richieste passano dalla guardia d'origine
 *   della finestra (la mette `http-app.mjs`). L'unica eccezione è `apply`, che il ponte chiama per il dispositivo (Mobile, 02/11): là
 *   l'origine è `dispositivo` e le voci di sicurezza e aggiornamenti vogliono il PC (`PC_CONFIRMATION_REQUIRED`).
 */
import { CATALOGO_IMPOSTAZIONI } from './catalogo-impostazioni.mjs';
import { GRUPPI_CARTA_SEMPRE } from '../kernel/impostazioni-app.mjs'; // in sola lettura: la stessa regola della carta del modello

export const PREFISSO_ROTTE_IMPOSTAZIONI = '/api/v1/app-settings';
export const ROTTA_APPLICA_IMPOSTAZIONI = '/api/v1/app-settings/apply';
export const ROTTE_IMPOSTAZIONI = Object.freeze([
  { schema: '/api/v1/app-settings/catalog', metodi: ['GET'] },
  { schema: '/api/v1/app-settings/changes', metodi: ['GET'] },
  { schema: '/api/v1/app-settings/window', metodi: ['GET', 'POST'] },
  { schema: '/api/v1/app-settings/window/applied', metodi: ['POST'] },
  { schema: '/api/v1/app-settings/undo', metodi: ['POST'] },
  { schema: ROTTA_APPLICA_IMPOSTAZIONI, metodi: ['POST'] },
]);

const rifiuta = (stato, code, message, extra = {}) => ({ stato, errore: { code, message, ...extra } });
const oggetto = (v) => v && typeof v === 'object' && !Array.isArray(v);
const soloChiavi = (corpo, ammesse) => Object.keys(corpo).every((k) => ammesse.includes(k));

/**
 * Vero se un corpo di `apply` porta una voce della CONVERSAZIONE con un `sessionId`: dal dispositivo è una scrittura in quella sessione, e
 * vuole il consenso della sua cartella come ogni altra (R5.12; `http-app.mjs` e `remoto/operazioni.mjs`). Le voci dell'app no.
 */
export function applicaToccaLaConversazione(corpo) {
  if (!oggetto(corpo) || typeof corpo.sessionId !== 'string' || !corpo.sessionId || !Array.isArray(corpo.changes)) return false;
  return corpo.changes.some((c) => CATALOGO_IMPOSTAZIONI.find((v) => v.chiave === (typeof c?.key === 'string' ? c.key.trim() : ''))?.ambito === 'conversazione');
}

/**
 * Condizione del Mobile (giro 2, 02/11/2026 notte, voce 6): dal ponte una voce che è INSIEME della conversazione e del gruppo a carta
 * sempre (permessi della conversazione, Coordinazione) risponde PRIMA `PC_CONFIRMATION_REQUIRED`, anche senza il consenso della cartella:
 * il controllo più stretto passa per primo. ⇒ i parametri della prima voce di un gruppo a carta sempre (`{ chiave, nome, nomeEn, nomeIt }`,
 * gli stessi del servizio), o null. Il ponte e la rotta la chiedono PRIMA del consenso; il servizio resta il cancello vero.
 */
export function voceCheVuoleIlPc(corpo) {
  if (!oggetto(corpo) || !Array.isArray(corpo.changes)) return null;
  for (const c of corpo.changes) {
    const v = CATALOGO_IMPOSTAZIONI.find((x) => x.chiave === (typeof c?.key === 'string' ? c.key.trim() : ''));
    if (v && GRUPPI_CARTA_SEMPRE.includes(v.gruppo)) return { chiave: v.chiave, nome: v.testo.en, nomeEn: v.testo.en, nomeIt: v.testo.it };
  }
  return null;
}
/** Il messaggio del rifiuto dal dispositivo, lo stesso del servizio. */
export const fraseDelPcPerIlDispositivo = (chiave) => `${chiave} can be changed from a device only after a confirmation on the computer. Nothing was changed.`;

/** La forma del corpo di `apply`, prima del servizio (che convalida chiavi e valori sul catalogo). */
function formaDiApplica(c) {
  if (!soloChiavi(c, ['sessionId', 'changes', 'expectedRevision'])) return false;
  if (c.sessionId !== undefined && c.sessionId !== null && (typeof c.sessionId !== 'string' || !c.sessionId || c.sessionId.length > 200)) return false;
  if (c.expectedRevision !== undefined && c.expectedRevision !== null && !Number.isSafeInteger(c.expectedRevision)) return false;
  return Array.isArray(c.changes) && c.changes.length > 0 && c.changes.every((x) => oggetto(x) && soloChiavi(x, ['key', 'value']) && typeof x.key === 'string' && x.key.length <= 120);
}

/**
 * @param {{ servizio: ReturnType<import('./servizio-impostazioni.mjs').creaServizioImpostazioni>|null }} p
 * @returns {(r: {method:string, percorso:string, corpo?:object|null, origine?:object, perApplica?:{origine:object, confermatoDa:object}}) => Promise<{stato:number, dati?:any, errore?:{code:string,message:string}, allow?:string}>}
 */
export function creaRotteImpostazioni({ servizio }) {
  /* PR21-I1 (revisione cloud, 04/11/2026): `serveLaCarta` lo mette chi ospita quando il server gira SENZA gettone (come `perApplica`): vale
     per l'Annulla, che prima saltava il cancello dei gruppi a carta sempre. */
  return async function rottaImpostazioni({ method, percorso, corpo = null, origine = { tipo: 'pc' }, perApplica = null, serveLaCarta = false }) {
    const voce = ROTTE_IMPOSTAZIONI.find((r) => r.schema === percorso);
    if (!voce) return rifiuta(404, 'NOT_FOUND', 'Not found.');
    if (!voce.metodi.includes(method)) return { ...rifiuta(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.'), allow: voce.metodi.join(', ') };
    if (!servizio || servizio.pronto?.() !== true) return rifiuta(503, 'SETTINGS_UNAVAILABLE', 'Settings from the chat are not available on this server.');
    const c = oggetto(corpo) ? corpo : {};
    if (percorso === '/api/v1/app-settings/catalog') return { stato: 200, dati: servizio.catalogo() };
    if (percorso === '/api/v1/app-settings/changes') return { stato: 200, dati: { ricevute: await servizio.ricevute() } };
    if (percorso === '/api/v1/app-settings/window' && method === 'GET') {
      const copia = await servizio.finestra.leggi();
      return copia ? { stato: 200, dati: copia } : rifiuta(503, 'SETTINGS_UNAVAILABLE', 'The window preferences copy is not available on this server.');
    }
    if (percorso === '/api/v1/app-settings/window') {
      if (!soloChiavi(c, ['valori']) || !oggetto(c.valori)) return rifiuta(400, 'QUERY_INVALID', 'Expected { valori: { ... } }.');
      try {
        const copia = await servizio.finestra.dallaPersona(c.valori);
        return copia ? { stato: 200, dati: { revisione: copia.revisione } } : rifiuta(503, 'SETTINGS_UNAVAILABLE', 'The window preferences copy is not available on this server.');
      } catch (e) {
        return rifiuta(400, 'QUERY_INVALID', e?.message ?? 'Invalid window preferences.');
      }
    }
    if (percorso === '/api/v1/app-settings/window/applied') {
      if (!soloChiavi(c, ['richiestaId', 'applicati', 'nonApplicati']) || typeof c.richiestaId !== 'string' || !c.richiestaId || c.richiestaId.length > 128
        || (c.applicati !== undefined && !oggetto(c.applicati)) || (c.nonApplicati !== undefined && !oggetto(c.nonApplicati))) {
        return rifiuta(400, 'QUERY_INVALID', 'Expected { richiestaId, applicati?, nonApplicati? }.');
      }
      return { stato: 200, dati: servizio.finestra.risposta({ richiestaId: c.richiestaId, applicati: c.applicati ?? {}, nonApplicati: c.nonApplicati ?? {} }) };
    }
    if (percorso === ROTTA_APPLICA_IMPOSTAZIONI) {
      if (!formaDiApplica(c)) return rifiuta(400, 'QUERY_INVALID', 'Expected { sessionId?, changes: [{ key, value }], expectedRevision? }.');
      /* chi ha chiesto e chi ha confermato li dice SOLO chi ospita la rotta (la finestra o il ponte), mai il corpo */
      if (!perApplica?.origine) return rifiuta(403, 'REMOTE_ORIGIN_FORBIDDEN', 'Settings are applied only from the TALOS window or a paired device.');
      try {
        return { stato: 200, dati: await servizio.applicaDallaPersona({ sessionId: c.sessionId ?? null, changes: c.changes, expectedRevision: c.expectedRevision ?? null,
          origine: perApplica.origine, confermatoDa: perApplica.confermatoDa ?? null, serveLaCarta: perApplica.serveLaCarta === true }) };
      } catch (e) {
        return rifiuta(Number.isInteger(e?.stato) ? e.stato : 409, typeof e?.code === 'string' ? e.code : 'SETTINGS_APPLY_REFUSED', e?.message ?? 'Nothing was changed.',
          { ...(typeof e?.reason === 'string' ? { reason: e.reason } : {}), ...(oggetto(e?.params) ? { params: e.params } : {}) });
      }
    }
    /* /undo */
    if (!soloChiavi(c, ['receiptId']) || typeof c.receiptId !== 'string' || !c.receiptId || c.receiptId.length > 64) return rifiuta(400, 'QUERY_INVALID', 'Expected { receiptId }.');
    try {
      return { stato: 200, dati: await servizio.annullaDallaPersona({ receiptId: c.receiptId, origine, serveLaCarta: serveLaCarta === true }) };
    } catch (e) {
      /* PR21-I1: il cancello dei gruppi a carta sempre esce col suo codice e i suoi parametri, come da `apply` */
      if (e?.code === 'PC_CONFIRMATION_REQUIRED') {
        return rifiuta(403, 'PC_CONFIRMATION_REQUIRED', e.message, { ...(typeof e.reason === 'string' ? { reason: e.reason } : {}), ...(oggetto(e.params) ? { params: e.params } : {}) });
      }
      return rifiuta(409, 'SETTINGS_UNDO_REFUSED', e?.message ?? 'The change was not undone.');
    }
  };
}
