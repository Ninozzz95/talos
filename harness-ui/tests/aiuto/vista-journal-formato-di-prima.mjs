/*
 * ⭐ 24/09/2026 (F2-bis, corsia B, coordinatore) — LA VISTA NEL FORMATO DI PRIMA di un journal a delta.
 *
 * Con la decisione 9 dell'owner il registro non riscrive più la storia intera a ogni giro: accoda `messaggi-delta` (i soli
 * messaggi nuovi) e, ogni tanto, un `checkpoint` (la storia intera). Le prove scritte prima chiedono al disco «la storia del
 * giro N c'è?» cercando `messaggi-finali`/`checkpoint-ripresa` con la storia INTERA dentro. La domanda resta giusta; cambia
 * solo come il file la conserva.
 *
 * Qui ogni `messaggi-delta`/`checkpoint` diventa, NELLA STESSA POSIZIONE, il record di prima con la storia intera a quel punto:
 * `fase:'finale'` ⇒ `{ tipo:'messaggi-finali', versioneGiro, messaggiFinali }`, `fase:'ripresa'` ⇒ `{ tipo:'checkpoint-ripresa',
 * versioneGiro, messaggi, recupero?, consegnaCoda? }`. La ricostruzione è la stessa regola del registro (`creaConsumatoreDiStoria`):
 * un checkpoint riparte da capo, un delta tronca a `da` e accoda. Un delta INCOERENTE (`da` oltre la storia) resta com'è: la
 * vista non inventa una storia che il registro scarterebbe. Le prove sul formato NUOVO stanno in
 * `registro-journal-delta.test.mjs` e leggono i record veri, non questa vista.
 */
export function vistaNelFormatoDiPrima(righe) {
  if (!Array.isArray(righe)) return righe;
  let storia = [];
  const vista = righe.map((r) => {
    if (!r || typeof r !== 'object') return r;
    if (r.tipo === 'messaggi-finali') { storia = Array.isArray(r.messaggiFinali) ? [...r.messaggiFinali] : []; return r; }
    if (r.tipo === 'checkpoint-ripresa') { storia = Array.isArray(r.messaggi) ? [...r.messaggi] : []; return r; }
    if (r.tipo !== 'checkpoint' && r.tipo !== 'messaggi-delta') return r;
    if (r.tipo === 'checkpoint') {
      storia = Array.isArray(r.storia) ? [...r.storia] : [];
    } else {
      if (!Number.isSafeInteger(r.da) || r.da < 0 || r.da > storia.length) return r;
      storia = [...storia.slice(0, r.da), ...(Array.isArray(r.messaggi) ? r.messaggi : [])];
    }
    // eslint-disable-next-line no-unused-vars
    const { tipo, fase, da, messaggi, storia: _storia, recordCompattazione, ...resto } = r;
    return fase === 'ripresa'
      ? { ...resto, tipo: 'checkpoint-ripresa', messaggi: [...storia] }
      : { ...resto, tipo: 'messaggi-finali', messaggiFinali: [...storia] };
  });
  // la riparazione della coda (non enumerabile, come la mette `leggiRegistro`) viaggia con la vista
  if (righe.riparazione) Object.defineProperty(vista, 'riparazione', { value: righe.riparazione, enumerable: false, configurable: true, writable: true });
  return vista;
}

/** `leggiRegistro` visto nel formato di prima: stessa firma, stessi errori. */
export function conVistaDiPrima(leggi) {
  return async (...argomenti) => vistaNelFormatoDiPrima(await leggi(...argomenti));
}
