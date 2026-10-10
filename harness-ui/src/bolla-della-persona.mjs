/*
 * ⭐ C09 (owner 10/10/2026, «Come Hermes, completo») — LA COPIA PER LO SCHERMO DEL MESSAGGIO DELLA PERSONA.
 *
 * Con un allegato il testo che va al MODELLO e quello che la persona ha scritto sono due cose diverse: il primo porta
 * l'intestazione degli allegati, i percorsi e il contenuto dei file (fino a 20.000 caratteri). Dal vivo la bolla mostrava
 * il secondo (O-41, `bollaDaMostrare`), ma la storia conservava solo il primo: dopo una ricarica la bolla rigiocata
 * mostrava tutto il testo per il modello e perdeva i chip. Riprodotto dal vivo sulla 4176 il 10/10/2026.
 *
 * Come Hermes, che conserva il testo pulito della persona accanto a quello per il modello (`persist_user_message`) e i
 * metadati da mostrare (`display_kind` / `display_metadata`, `agent/turn_context.py:686-691`: «display-only event
 * rendering; the model still receives the message unchanged»): il client manda anche la `bolla`, il server la
 * conserva accanto alla consegna, la rigiocata la usa. Il modello non la vede mai.
 *
 * ⛔ È un dato che arriva dal client e finisce nella storia: si tiene SOLO la forma attesa, con tetti, e i campi
 *   sconosciuti cadono. Una bolla malformata non rompe l'invio: vale «nessuna bolla», e la rigiocata ripiega sul
 *   lettore delle sessioni vecchie (lato interfaccia).
 */
export const TETTI_BOLLA = Object.freeze({ testo: 20_000, allegati: 20, nome: 300, percorso: 2_000, tipo: 20 });

const stringaCorta = (valore, massimo) => (typeof valore === 'string' && valore.length > 0 ? valore.slice(0, massimo) : null);

function allegatoDellaBolla(a) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
    const nome = stringaCorta(a.nome, TETTI_BOLLA.nome);
    const percorso = stringaCorta(a.percorso, TETTI_BOLLA.percorso);
    if (!nome && !percorso) return null;
    const tipo = stringaCorta(a.tipo, TETTI_BOLLA.tipo);
    return {
        ...(tipo ? { tipo } : {}),
        ...(nome ? { nome } : {}),
        ...(percorso ? { percorso } : {}),
        ...(a.daBrowser === true ? { daBrowser: true } : {}),
        ...(Number.isSafeInteger(a.caratteri) && a.caratteri >= 0 ? { caratteri: a.caratteri } : {}),
    };
}

/**
 * La bolla in arrivo, ridotta alla sua forma: `{ testo, allegati }`, oppure `null` se manca o non ha niente da mostrare.
 * @param {unknown} grezza
 * @returns {{ testo: string, allegati: object[] } | null}
 */
/**
 * ⛔ Review del desktop (N1): la bolla si tiene SOLO se il testo per il modello comincia con la frase che mostra. Il client non
 *   può far vedere alla persona una frase diversa da quella che il modello ha ricevuto: può solo togliere il blocco degli
 *   allegati in coda. Hermes la copia per lo schermo la costruisce lato server per lo stesso motivo.
 * @param {unknown} grezza
 * @param {unknown} perIlModello il testo che parte davvero (consegna, messaggio accodato o reindirizzo)
 */
export function bollaPerLaConsegna(grezza, perIlModello) {
    const bolla = bollaValida(grezza)
    if (!bolla || typeof perIlModello !== 'string') return null
    return perIlModello.trimStart().startsWith(bolla.testo.trim()) ? bolla : null
}

export function bollaValida(grezza) {
    if (!grezza || typeof grezza !== 'object' || Array.isArray(grezza)) return null;
    const testo = typeof grezza.testo === 'string' ? grezza.testo.slice(0, TETTI_BOLLA.testo) : '';
    const allegati = Array.isArray(grezza.allegati)
        ? grezza.allegati.slice(0, TETTI_BOLLA.allegati).map(allegatoDellaBolla).filter(Boolean) : [];
    if (testo.trim() === '' && allegati.length === 0) return null;
    return { testo, allegati };
}
