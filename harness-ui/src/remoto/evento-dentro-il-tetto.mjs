/*
 * Un evento oltre il tetto del filo (1 MiB, `filo.mjs`). D-44: sessioni vere hanno `RunStarted` da 1,2 MB, e il rifiuto impediva di aprire la chat dal dispositivo.
 *
 * Due casi. Un testo che la rigiocata ha fuso (`sse-replay-coalescente.mjs`) si spezza in eventi dello stesso tipo: la concatenazione dà la stessa stringa, come dice AG-UI. ⛔ Solo l'ultimo
 *   pezzo porta `_sequenza`: è il numero con cui il dispositivo scarta ciò che ha già visto, e con un numero solo sui pezzi resterebbe solo il primo. Ogni altro evento esce con la stessa
 *   `_sequenza`, i testi lunghi tagliati e `_ridotto: true`, e il dispositivo dice che il testo intero è sul PC.
 * ⛔ M2 (revisione 3 del Mobile, contratto §10): i pezzi senza `_sequenza` non muovono il cursore, quindi dopo una caduta a metà la rigiocata li ridà tutti, e applicati come arrivano sullo
 *   schermo fanno un doppione (e negli argomenti di un attrezzo, un JSON rotto). Ogni pezzo porta `_pezzo: { id, n, fine }`: il dispositivo tiene i pezzi per `id`, applica all'arrivo di
 *   `fine` e alla ripartenza butta i gruppi incompleti. `id` viene dalla `_sequenza` dell'evento fuso, quindi resta uguale in una rigiocata.
 * ⛔ Il conto del tetto lo fa `codifica`: qui si arriva solo dopo il suo rifiuto, e un evento normale non paga una serializzazione in più.
 */
import { randomUUID } from 'node:crypto';

const PEZZO_DI_TESTO = 128 * 1024; // caratteri: nel caso peggiore uno pesa 6 byte in JSON, e 768 KiB stanno nel filo
const TESTO_RIDOTTO = 16 * 1024;
const TETTO_RIDOTTO_BYTE = 900 * 1024;
const TETTO_ACCANTO_AL_TESTO_BYTE = 128 * 1024; // un pezzo pesa al più 768 KiB: ciò che gli sta accanto non lo porta oltre il filo
const pesoIn = (valore) => Buffer.byteLength(JSON.stringify(valore), 'utf8');

const finePezzo = (testo, fine) => {
  const c = testo.charCodeAt(fine - 1);
  return fine < testo.length && c >= 0xd800 && c <= 0xdbff ? fine - 1 : fine; // mai un carattere spezzato a metà
};
const soloCampiSemplici = (evento) => Object.fromEntries(Object.entries(evento).filter(([, v]) => typeof v !== 'object' || v === null).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 256) : v]));
function pezziDelTesto(evento) {
  const { _sequenza: sequenza, delta, ...resto } = evento;
  /* B4: `resto` viaggia su ogni pezzo, e il testo si salva anche con un campo pesante accanto */
  const accanto = pesoIn(resto) > TETTO_ACCANTO_AL_TESTO_BYTE ? { ...soloCampiSemplici(resto), _ridotto: true } : resto;
  const id = `p${sequenza ?? randomUUID()}`; // un evento senza numero non si rigioca: basta che l'id sia suo
  const pezzi = [];
  for (let da = 0; da < delta.length;) {
    const fino = finePezzo(delta, Math.min(da + PEZZO_DI_TESTO, delta.length));
    pezzi.push({ ...accanto, delta: delta.slice(da, fino), _pezzo: { id, n: pezzi.length, fine: fino >= delta.length } });
    da = fino;
  }
  if (sequenza !== undefined) pezzi[pezzi.length - 1]._sequenza = sequenza;
  return pezzi;
}
const taglia = (valore) => {
  if (typeof valore === 'string') return valore.length > TESTO_RIDOTTO ? `${valore.slice(0, finePezzo(valore, TESTO_RIDOTTO))}…` : valore;
  if (Array.isArray(valore)) return valore.map(taglia);
  if (valore && typeof valore === 'object') return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, taglia(v)]));
  return valore;
};
function eventoRidotto(evento) {
  const ridotto = { ...taglia(evento), _ridotto: true };
  if (Buffer.byteLength(JSON.stringify(ridotto), 'utf8') <= TETTO_RIDOTTO_BYTE) return ridotto;
  /* tanti pezzi piccoli: restano i soli campi semplici, che dicono che cosa è successo */
  return { ...soloCampiSemplici(ridotto), _ridotto: true };
}

export function eventiDentroIlTetto(evento) {
  return typeof evento?.delta === 'string' && evento.delta.length > PEZZO_DI_TESTO ? pezziDelTesto(evento) : [eventoRidotto(evento)];
}
