/*
 * ⛔⛔ C2b «Coordinazione» (owner 08/10/2026 sera; contratto `C2B-CONTRATTO-2026-10-08.md`) — il lato interfaccia delle stesse
 *   regole del server (`harness-ui/src/coordinazione.mjs`): lo stato vive nelle scelte per attrezzo della sessione, alla chiave
 *   `delega_sottotask`. Accesa = «sempre»; assente o «chiedi» = spenta (di serie).
 * ⛔ Due copie della chiave e del tetto (server e interfaccia) perché il frontend non importa i moduli del server: la prova
 *   unitaria le confronta con i valori del contratto, e il server rifiuta comunque qualunque altra chiave.
 */

/** La chiave delle scelte per attrezzo che porta lo stato di Coordinazione (lo stesso nome dell'attrezzo della delega). */
export const CHIAVE_COORDINAZIONE = 'delega_sottotask';

/** Agenti avviati da soli per conversazione (albero): owner 08/10/2026. La frase della modale lo legge da qui. */
export const TETTO_AVVII_DA_SOLO = 20;

const eMappa = (mappa) => Boolean(mappa) && typeof mappa === 'object' && !Array.isArray(mappa);

/**
 * Accesa per una catena di sessioni (la sessione prima, la conversazione principale ultima): la regola del server
 * (`modoCoordinazione`) senza il tetto. Un «nega», un «chiedi» o un valore storto in un anello spengono; un anello senza la
 * chiave eredita; la conversazione principale decide. Serve alla modale di un agente delegato, che dice lo stato e non lo cambia.
 */
export function coordinazioneAccesaNellaCatena(sceltePerAnello) {
  const anelli = Array.isArray(sceltePerAnello) ? sceltePerAnello : [];
  if (anelli.length === 0) return false;
  const scelte = anelli.map((m) => (eMappa(m) && Object.hasOwn(m, CHIAVE_COORDINAZIONE) ? m[CHIAVE_COORDINAZIONE] : undefined));
  if (scelte.some((s) => s !== undefined && s !== 'sempre')) return false;
  return scelte[scelte.length - 1] === 'sempre';
}

/**
 * La mappa che diventa il PREDEFINITO di una sessione nuova (preferenze, «Nuova sessione»), senza Coordinazione: owner, «spenta di
 * serie per le sessioni nuove». Accenderla in una conversazione non la accende nelle prossime. Una copia: l'originale non si tocca.
 */
export function mappaPerUnaSessioneNuova(mappa) {
  if (!eMappa(mappa)) return {};
  const { [CHIAVE_COORDINAZIONE]: _tolta, ...resto } = mappa;
  return resto;
}
