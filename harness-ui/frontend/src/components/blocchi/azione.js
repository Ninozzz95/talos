/*
 * Il canale blocco → TALOS (forma §3): un clic su `scelte` o l'invio di un `modulo` diventa UN oggetto `talos.blocco.azione.v1`
 * con la sua chiave d'unicità. L'invio vero (messaggio della persona con «dal blocco …» nel canale normale, evento nel giornale)
 * arriva con l'aggancio: qui si costruisce l'oggetto e si blocca il blocco dopo il primo gesto.
 * ⛔ Mai un clic prima di «completo» (condizione del Mobile, 02/11): la `fonte` arriva per ultima e solo allora si sa se il blocco
 *   viene da dati esterni. ⛔ Mai un clic in un blocco con `fonte` (decisione dell'owner del 31/10: lo vieta già il lettore; qui di
 *   nuovo, perché il disegnatore non si fida di chi lo chiama).
 * ⛔ Ciò che scrive passa dalla carta dei permessi: il blocco non porta mai un pulsante di consenso. Il clic è un messaggio, e se il
 *   modello poi vuole cambiare qualcosa chiede il sì come sempre (0 interruzioni in più, regola 17).
 * La chiave: la conversazione e il blocco, non il valore (Genesys, «repeated button clicks», letto il 02/11/2026: la chiave si
 *   costruisce dalla conversazione e dal punto del flusso). Un blocco dà UNA azione sola, anche da due viste o dopo un ricaricamento.
 */
export const EVENTO_AZIONE = 'talos.blocco.azione.v1';

/** Si può cliccare? Solo un blocco completo, senza `fonte`, di un tipo che chiede un gesto. */
export function puoAgire(risultato) {
  return Boolean(risultato && risultato.stato === 'completo' && risultato.blocco && !risultato.blocco.fonte
    && (risultato.blocco.tipo === 'scelte' || risultato.blocco.tipo === 'modulo'));
}

/** Lo stato del gesto, condiviso fra le viste dello stesso blocco: dopo il primo, nessun altro. */
export function statoAzione(giaFatta = null) {
  return { azione: giaFatta };
}

/*
 * G-G2, UIG-5.5 (06/11/2026): le viste dello stesso blocco (in linea, a lato, a tutto schermo) condividono lo stato, e un gesto fatto in
 * una le spegne TUTTE subito, senza ricarica: ogni vista si iscrive (`osservaAzione`) e chi cambia lo stato avvisa (`avvisaAzione`).
 * Una WeakMap per stato: quando lo stato non serve più, le iscrizioni vanno con lui.
 */
const iscritti = new WeakMap();

/** Una vista si iscrive ai cambi del gesto del suo blocco (`segna` di scelte e modulo). */
export function osservaAzione(stato, quando) {
  if (!stato || typeof quando !== 'function') return;
  let s = iscritti.get(stato);
  if (!s) { s = new Set(); iscritti.set(stato, s); }
  s.add(quando);
}

/** Lo stato del gesto è cambiato (un clic, oppure l'aggancio lo ha spento o riacceso): ogni vista si ridisegna. */
export function avvisaAzione(stato) {
  for (const f of iscritti.get(stato) ?? []) { try { f(); } catch { /* una vista rotta non ferma le altre */ } }
}

function nuovaOrigine() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* sotto */ }
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {object} blocco l'albero completo
 * @param {unknown} valore il testo scelto (`scelte`) o le risposte per id (`modulo`)
 * @param {string} [origine] il messaggio che porta il blocco (lo passa l'aggancio); senza, una per disegno
 */
export function creaAzione(blocco, valore, origine) {
  const o = typeof origine === 'string' && origine ? origine : nuovaOrigine();
  return Object.freeze({
    evento: EVENTO_AZIONE,
    idBlocco: blocco.id,
    tipo: blocco.tipo,
    valore: valore && typeof valore === 'object' ? Object.freeze({ ...valore }) : valore,
    chiave: `${o}#${blocco.id}`,
    titolo: blocco.titolo ?? null,
  });
}

/**
 * Il primo gesto vince: registra l'azione nello stato condiviso e la consegna; i gesti dopo non fanno niente.
 * @returns {object|null} l'azione, oppure `null` se il blocco era già stato usato
 */
export function agisci(stato, azione, consegna) {
  if (stato.azione) return null;
  stato.azione = azione;
  avvisaAzione(stato);
  try { consegna?.(azione); } catch { /* chi consegna non deve poter sbloccare il blocco */ }
  return azione;
}
