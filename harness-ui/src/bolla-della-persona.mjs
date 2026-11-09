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
import { origineValida } from './origine-remota.mjs';

export const TETTI_BOLLA = Object.freeze({ testo: 20_000, allegati: 20, nome: 300, percorso: 2_000, tipo: 20, chiave: 400 });

/* FE-003: i blocchi che danno un gesto. Lista chiusa, come `puoAgire` nel client. */
const TIPI_DI_BLOCCO_CON_GESTO = new Set(['scelte', 'modulo']);

const ID_ALLEGATO = /^[0-9a-f]{24}$/u;

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
        /* Decisioni 43 e 47: il riferimento opaco dell'allegato nei dati di TALOS. È il campo strutturato da cui nasce il legame con la conversazione */
        ...(typeof a.allegatoId === 'string' && ID_ALLEGATO.test(a.allegatoId) ? { allegatoId: a.allegatoId } : {}),
        ...(Number.isSafeInteger(a.caratteri) && a.caratteri >= 0 ? { caratteri: a.caratteri } : {}),
        // BOLLA-03 (02/11, owner sceglie B): il peso della scheda del file, sennò dopo una ricarica la scheda lo perde
        ...(Number.isSafeInteger(a.byte) && a.byte >= 0 ? { byte: a.byte } : {}),
    };
}

/*
 * FE-003: il blocco da cui nasce il messaggio. La chiave resta intera o cade: tagliata non spegnerebbe più il suo blocco. `titolo` e `idBlocco`
 * vengono dal modello: sono solo testo con un tetto. ⛔ Il campo non dà nessun permesso e non arriva al modello, come tutta la bolla.
 */
function bloccoDellaBolla(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b) || !TIPI_DI_BLOCCO_CON_GESTO.has(b.tipo)) return null;
    const { idBlocco, chiave } = b;
    if (typeof idBlocco !== 'string' || idBlocco.length === 0 || idBlocco.length > TETTI_BOLLA.nome) return null;
    if (typeof chiave !== 'string' || chiave.length > TETTI_BOLLA.chiave || !chiave.includes(':') || !chiave.endsWith(`#${idBlocco}`)) return null;
    const titolo = stringaCorta(b.titolo, TETTI_BOLLA.nome);
    return { idBlocco, tipo: b.tipo, chiave, ...(titolo ? { titolo } : {}) };
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

/*
 * Revisione del blocco del 03/11 pomeriggio, R5a: la consegna che il client manda con una SOLA immagine e nessuna parola
 *   (`app.attachments.promptDescribeImage`, nelle due lingue; il telefono manda le stesse, `allegatiR4.ts`). Una copia e non un import: l'app
 *   installata non porta `frontend/` (come `impostazioni/nomi-impostazioni.mjs`); la prova R5A-03 la tiene uguale al dizionario.
 */
export const FRASI_SOLO_IMMAGINE = Object.freeze(['Descrivi l’immagine allegata.', 'Describe the attached image.'])

/**
 * La frase da cui nasce il titolo della chat, con la regola del client (`app.js`, Tester R5): ciò che la persona ha scritto; senza parole i
 * nomi dei file; con le sole immagini i loro nomi. La consegna per le immagini non è mai un titolo. `null` = nessuna frase migliore della
 * consegna (il titolo di sempre).
 * @param {{ testo: string, allegati: object[] } | null} bolla la bolla già validata (`bollaPerLaConsegna`)
 * @param {unknown} consegna il testo per il modello
 * @param {Array<{ nome?: string }>} immagini le immagini del messaggio, già validate dall'archivio
 */
export function fraseDelTitolo(bolla, consegna, immagini = []) {
    const scritta = String(bolla?.testo ?? '').replace(/\s+/g, ' ').trim()
    if (scritta && !FRASI_SOLO_IMMAGINE.includes(scritta)) return scritta
    const allegati = Array.isArray(bolla?.allegati) ? bolla.allegati : []
    const nomiFile = allegati.filter((a) => a?.tipo !== 'immagine').map((a) => a.nome || a.percorso).filter(Boolean)
    if (nomiFile.length) return nomiFile.join(', ')
    const soloImmagine = FRASI_SOLO_IMMAGINE.includes(String(consegna ?? '').trim())
    const nomiImmagini = [...(Array.isArray(immagini) ? immagini : []), ...allegati.filter((a) => a?.tipo === 'immagine')]
        .map((i) => (typeof i?.nome === 'string' ? i.nome.trim() : '')).filter(Boolean)
    if (!soloImmagine && !bolla) return null // parole senza bolla: la consegna è già la frase della persona
    return nomiImmagini.length ? [...new Set(nomiImmagini)].join(', ') : null
}

/** Gli allegati che questo invio porta: solo dal campo strutturato, mai dal testo del messaggio (ritocco del Mobile). */
export function idAllegatiDellaBolla(bolla) {
    return [...new Set((Array.isArray(bolla?.allegati) ? bolla.allegati : []).map((a) => a?.allegatoId).filter((id) => typeof id === 'string' && ID_ALLEGATO.test(id)))];
}

export function bollaValida(grezza) {
    if (!grezza || typeof grezza !== 'object' || Array.isArray(grezza)) return null;
    const testo = typeof grezza.testo === 'string' ? grezza.testo.slice(0, TETTI_BOLLA.testo) : '';
    const allegati = Array.isArray(grezza.allegati)
        ? grezza.allegati.slice(0, TETTI_BOLLA.allegati).map(allegatoDellaBolla).filter(Boolean) : [];
    if (testo.trim() === '' && allegati.length === 0) return null;
    /* 18/10/2026: l'origine «dal telefono» resta se ha la sua forma. Che non arrivi da un client lo garantisce `separaBolla`
       (http-app.mjs), che la toglie al confine: qui passa solo quella messa dal server (`origine-remota.mjs`). */
    const origine = origineValida(grezza.origine);
    const blocco = bloccoDellaBolla(grezza.blocco);
    return { testo, allegati, ...(origine ? { origine } : {}), ...(blocco ? { blocco } : {}) };
}
