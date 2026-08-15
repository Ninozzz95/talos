/**
 * ⭐⭐⭐ I FILE CHE SI POSSONO MANDARE, e come si sceglie quello giusto.
 *
 * Owner, 2026-08-13:
 *
 * > «si possa dire alla chat di **inviare un file della libreria via social
 * > media o app di messaggistica** e poi anche successivamente **inviare un
 * > file che abbiamo nella memoria, salvato nel dispositivo**»
 *
 * ## Perché non basta la fonte che c'era già
 *
 * `listLibraryEntries` rende `{id, displayName, mediaType}` — abbastanza per
 * ELENCARE, niente per MANDARE: manca il percorso su disco, che è l'unica cosa
 * che il ponte nativo può trasformare in un `content://`.
 *
 * ## E perché il tipo viaggia col file
 *
 * Il MIME non è un'etichetta: **decide chi può ricevere**. La stessa domanda
 * («chi accetta questo?») dà elenchi diversi per un'immagine e per un testo, e
 * l'elenco si chiede al telefono — mai a una tabella scritta a mano.
 */

/** Un file della libreria, con ciò che serve per consegnarlo a un'altra app. */
export interface TalosFileMandabile {
    readonly id: string
    readonly nome: string
    /** Il MIME dichiarato: decide QUALI app possono riceverlo. */
    readonly tipo: string
    /** Percorso relativo alla cartella privata dell'app. */
    readonly percorso: string
}

/**
 * Il file che la persona intendeva, fra quelli che ci sono.
 *
 * ⛔ TRE ESITI, non due — è la lezione che è già costata una volta, quando un
 * elenco vero dentro un `ok:false` ha fatto inventare al modello app che non
 * erano installate:
 *
 * | esito | cosa vuol dire | cosa deve fare chi chiama |
 * |---|---|---|
 * | `trovato` | uno solo corrisponde | mandarlo |
 * | `ambiguo` | più d'uno corrisponde | **chiedere quale**, con i nomi veri |
 * | `nessuno` | niente corrisponde | dire cosa c'è, senza inventare |
 *
 * La differenza fra `ambiguo` e `nessuno` conta: nel primo caso il file c'è e
 * la domanda è legittima; nel secondo, insistere significherebbe mandare **un
 * file a caso a una persona vera**, che non si annulla.
 */
export type TalosSceltaFile =
    | { readonly esito: 'trovato', readonly file: TalosFileMandabile }
    | { readonly esito: 'ambiguo', readonly fra: readonly TalosFileMandabile[] }
    | { readonly esito: 'nessuno', readonly cePero: readonly TalosFileMandabile[] }

/** Minuscolo, senza accenti e senza punteggiatura: due nomi si confrontano così. */
function piatto(testo: string): string {
    return testo
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

/**
 * Le due forme con cui un nome di file si fa riconoscere: con e senza
 * estensione.
 *
 * ⛔ Senza la seconda, «mandami la nota talos» NON trovava `nota-talos.txt` —
 * misurato dal test. La persona dice il nome, non il suffisso, e `txt` in
 * fondo bastava a far fallire il confronto.
 */
function chiaviDi(nome: string): readonly string[] {
    const senzaEstensione = nome.replace(/\.[a-z0-9]{1,8}$/i, '')
    const conEst = piatto(nome)
    const senza = piatto(senzaEstensione)
    return senza === conEst ? [conEst] : [conEst, senza]
}

/**
 * ⛔ La corrispondenza è a SCALINI, dal più stretto al più largo, e si ferma al
 * primo che dà qualcosa. Cercare «nota» non deve pescare `nota-talos.txt` E
 * `annotazioni.pdf` allo stesso titolo: chi ha scritto il nome esatto ha
 * già detto quale voleva.
 */
export function talosScegliFile(
    file: readonly TalosFileMandabile[],
    cercato: string,
): TalosSceltaFile {
    const ago = piatto(cercato)
    if (ago === '' || file.length === 0) return { esito: 'nessuno', cePero: file }
    const scalini: ((chiave: string) => boolean)[] = [
        (chiave) => chiave === ago,
        (chiave) => chiave.startsWith(ago),
        (chiave) => chiave.includes(ago),
        // L'ultimo scalino guarda il verso opposto: la persona può aver detto
        // «mandami la nota di talos» dove il nome del file è più corto di ciò
        // che ha detto lei.
        (chiave) => chiave !== '' && ago.includes(chiave),
    ]
    for (const scalino of scalini) {
        const presi = file.filter((f) => chiaviDi(f.nome).some(scalino))
        if (presi.length === 1) return { esito: 'trovato', file: presi[0]! }
        if (presi.length > 1) return { esito: 'ambiguo', fra: presi }
    }
    return { esito: 'nessuno', cePero: file }
}

/**
 * L'app di destinazione, fra quelle che il TELEFONO dice di saper ricevere.
 *
 * ⛔ Il confronto è sull'ETICHETTA, non sull'id di pacchetto: la persona dice
 * «WhatsApp», non `com.whatsapp`. Ed è la stessa ragione per cui il registro
 * scritto a mano diceva `org.telegram.messenger` mentre sul Pad c'è Telegram X
 * (`org.thunderdog.challegram`): l'id lo sa il telefono, il nome lo sa la
 * persona.
 */
export function talosScegliApp<T extends { readonly nome: string, readonly pacchetto: string }>(
    app: readonly T[],
    detta: string,
): T | null {
    const ago = piatto(detta)
    if (ago === '') return null
    return app.find((a) => piatto(a.nome) === ago)
        ?? app.find((a) => piatto(a.nome).startsWith(ago))
        ?? app.find((a) => piatto(a.nome).includes(ago) || ago.includes(piatto(a.nome)))
        // Ultimo tentativo: qualcuno può aver detto l'id per intero.
        ?? app.find((a) => a.pacchetto.toLowerCase() === detta.toLowerCase().trim())
        ?? null
}
