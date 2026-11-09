/*
 * Che cosa ogni ospite passa all'archivio degli allegati. Il nucleo resta uno, ogni ospite salva a modo suo (forma COD-248 del Mobile, 03/11/2026).
 * `TALOS_LOCALE_OSPITE_DIR` è lo stesso segno del telefono di `aiuto-del-server.mjs`. Il PC non passa niente: `saveChatFile` e i tetti di sempre.
 *
 * ⛔ I tetti del telefono sono provvisori: vanno misurati, poi decide l'owner (forma degli allegati, punto 7).
 */
import { salvaAllegatoSenzaAiutante } from './allegato-senza-aiutante.mjs';

export const TETTI_ALLEGATI_TELEFONO = Object.freeze({
  byteTotali: 512 * 1024 ** 2, file: 500, bytePerDispositivo: 512 * 1024 ** 2, filePerDispositivo: 500,
});

export function allegatiDellOspite(env) {
  const telefono = typeof env?.TALOS_LOCALE_OSPITE_DIR === 'string' && env.TALOS_LOCALE_OSPITE_DIR.trim() !== '';
  return telefono ? { salva: salvaAllegatoSenzaAiutante, tetti: TETTI_ALLEGATI_TELEFONO } : {};
}
