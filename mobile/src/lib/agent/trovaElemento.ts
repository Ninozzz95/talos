/**
 * ⭐⭐⭐ DALLA PAROLA ALL'ELEMENTO — e il rifiuto di indovinare.
 *
 * Owner 2026-08-15: «se io voglio chiedere a TALOS mentre sono su WhatsApp di
 * cliccare sul **primo contatto**, oppure di fare cose in maniera dinamica, per
 * esempio cliccare sul **pulsante sticker**».
 *
 * ## ⛔ Cosa lo stato dell'arte dichiara APERTO
 *
 * Interrogato esplicitamente sui due casi, il paper di GUI-Owl
 * (`arXiv 2508.15144`) risponde testualmente:
 *
 * > *«The document does not address ordinal references ("first contact") or
 * > icon-button grounding strategies.»*
 *
 * Non è una lacuna nostra da colmare: è terreno dove si può arrivare primi. E
 * i due pezzi che servono ce li abbiamo già:
 *
 * - **le icone mute** hanno il nome nel sottoalbero — dal 75% al 95% a seconda
 *   di quanto è grafica la schermata, e costa zero giri in più;
 * - **gli ordinali** funzionano perché gli indici adesso seguono lo schermo, e
 *   non più la visita in profondità dell'albero (misurato: erano 0 su 19).
 *
 * Qui c'è il terzo: far combaciare una parola con un elemento **senza
 * indovinare**.
 *
 * ## ⛔⛔ La regola che vale più di tutte le altre
 *
 * Owner, nello stesso documento: *«quando due elementi combaciano allo stesso
 * modo, **non si sceglie**: si chiede alla persona quale. Un agente che indovina
 * fra due pulsanti è un agente che un giorno preme quello sbagliato»*.
 *
 * Per questo il risultato non è un elemento: è **uno di tre esiti**, e
 * `ambiguo` è un esito di prima classe, non un fallimento. Chi chiama deve
 * poterli distinguere — è la stessa lezione di
 * `[[ok-false-su-un-elenco-fa-inventare]]`: gli stati sono tre, non due.
 */
import type { TalosElementoSchermo } from '@/lib/agent/passoDelloSchermo'

export type TalosRicerca =
    | { esito: 'trovato', elemento: TalosElementoSchermo, perche: string }
    | { esito: 'ambiguo', candidati: readonly TalosElementoSchermo[] }
    | { esito: 'assente' }

/**
 * ⛔ La sinonimia italiano↔inglese, e perché è UN ELENCO scritto a mano.
 *
 * `[[nothing-hardcoded-must-adapt]]` dice che un fatto **sul dispositivo** si
 * misura invece di scriverlo. Questo non è un fatto sul dispositivo: è come si
 * dice una cosa in due lingue, e non c'è niente da interrogare.
 *
 * ⇒ Ma resta piccolo di proposito: **solo le parole d'interfaccia** che
 * ricorrono ovunque. Un elenco che prova a coprire ogni app diventa il registro
 * scritto a mano che invecchia e mente — che è esattamente ciò che la regola
 * vieta. Quando una parola manca, la strada giusta è il sottoalbero, non una
 * riga in più qui.
 */
const SINONIMI: ReadonlyArray<readonly string[]> = Object.freeze([
    ['sticker', 'adesivi', 'adesivo'],
    ['invia', 'send', 'manda'],
    ['cerca', 'search', 'ricerca'],
    ['indietro', 'back', 'torna'],
    ['impostazioni', 'settings', 'opzioni'],
    ['allega', 'attach', 'allegato', 'graffetta'],
    ['fotocamera', 'camera', 'foto'],
    ['galleria', 'gallery', 'immagini'],
    ['microfono', 'mic', 'microphone', 'registra'],
    ['emoji', 'emoticon', 'faccine'],
    ['chiudi', 'close', 'annulla', 'cancel'],
    ['altro', 'more', 'menu', 'opzioni'],
    ['aggiungi', 'add', 'nuovo', 'new'],
    ['elimina', 'delete', 'cancella', 'rimuovi'],
    ['salva', 'save', 'conferma', 'ok'],
    ['condividi', 'share'],
    ['modifica', 'edit', 'rinomina', 'rename'],
    ['profilo', 'profile', 'account'],
])

/**
 * ⛔ Si toglie tutto ciò che separa due modi di scrivere la stessa parola.
 *
 * `emoji_picker_btn`, `stickerPicker`, «Adesivi» e «ADESIVI» devono ridursi
 * alla stessa forma, se no la corrispondenza fallisce su un trattino basso.
 */
export function talosNormalizza(testo: string): string {
    /*
     * ⛔ Non lancia MAI su un ingresso che non è una stringa.
     *
     * Trovato collegando la guardia degli ordinali: un chiamante senza
     * obiettivo passava `undefined`, e questa riga faceva cadere l'intero
     * pilota — cioè una funzione di confronto fra parole spegneva la guida
     * dello schermo. Una utility che lancia su un ingresso storto sposta il
     * guasto lontano dalla sua causa.
     */
    if (typeof testo !== 'string') return ''
    return testo
        .normalize('NFD')
        /*
         * Via gli accenti: «però» e «pero» sono la stessa parola qui.
         * ⛔ Il range si scrive con gli escape e non coi segni veri: un
         * carattere combinante messo letteralmente nel sorgente si attacca a
         * quello prima e un editor può mangiarlo senza che si veda.
         */
        .replace(/[̀-ͯ]/g, '')
        /*
         * ⛔ Le maiuscole interne si spezzano PRIMA di abbassare tutto: era il
         * difetto della prima stesura — `toLowerCase()` veniva per primo, e
         * quando la regex cercava le maiuscole non ce n'erano più.
         * `emojiPickerBtn` diventava `emojipickerbtn`, cioè una parola sola che
         * non combacia con niente.
         */
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/[_\-.]+/g, ' ')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function parenti(parola: string): readonly string[] {
    const gruppo = SINONIMI.find((g) => g.includes(parola))
    return gruppo ?? [parola]
}

/**
 * Quanto bene una parola combacia con un'etichetta. `0` = per niente.
 *
 * ⛔ I gradini sono NETTI e non una somma di pesi: servono a dire «questi due
 * combaciano allo stesso modo», e con dei punteggi continui due candidati non
 * pareggiano quasi mai — cioè l'ambiguità sparirebbe proprio dove serve.
 */
/**
 * ⛔⛔ SI CONFRONTA ANCHE SENZA SPAZI — e lo ha trovato il telefono.
 *
 * MISURATO il 2026-08-16 sulle Impostazioni del Pad: la prima voce della lista
 * è **«Wi-Fi»**, e cercando **«wifi»** il risultato era **«assente»**.
 *
 * `talosNormalizza('Wi-Fi')` dà `wi fi` — il trattino diventa uno spazio, ed è
 * giusto che lo diventi — mentre `wifi` resta attaccato. Due forme della stessa
 * parola che non si incontrano mai.
 *
 * ⇒ È il caso **più comune che esista**, e i miei test non lo vedevano perché
 * usavano tutte parole singole: «sticker», «Adesivi», «Invia». Vale per «Wi-Fi»,
 * «E-mail», «Non disturbare» detto «nondisturbare», «Play Store» detto
 * «playstore».
 */
const compatta = (t: string): string => t.replace(/ /g, '')

function gradino(r: string, e: string): number {
    if (e === r) return 4
    if (e.split(' ').includes(r)) return 3
    if (e.includes(r)) return 2
    // Ultimo tentativo: senza spazi da entrambe le parti.
    const rc = compatta(r)
    const ec = compatta(e)
    if (rc === '' ) return 0
    if (ec === rc) return 4
    if (ec.includes(rc)) return 2
    return 0
}

function quanto(richiesta: string, etichetta: string): number {
    if (etichetta === '') return 0
    const r = talosNormalizza(richiesta)
    const e = talosNormalizza(etichetta)
    if (r === '' ) return 0
    let massimo = gradino(r, e)
    for (const p of parenti(r)) {
        if (p === r) continue
        massimo = Math.max(massimo, gradino(p, e))
    }
    return massimo
}

/**
 * Trova l'elemento che la persona sta nominando.
 *
 * ⛔ Se due candidati combaciano **allo stesso modo**, non si sceglie: si torna
 * `ambiguo` con tutti. Chi chiama deve chiedere alla persona.
 */
export function talosTrovaElemento(
    elementi: readonly TalosElementoSchermo[],
    richiesta: string,
): TalosRicerca {
    const punteggi = elementi
        .map((elemento) => ({ elemento, punto: quanto(richiesta, elemento.etichetta) }))
        .filter((c) => c.punto > 0)
    if (punteggi.length === 0) return { esito: 'assente' }

    const massimo = Math.max(...punteggi.map((c) => c.punto))
    const migliori = punteggi.filter((c) => c.punto === massimo)
    if (migliori.length > 1) {
        return { esito: 'ambiguo', candidati: migliori.map((c) => c.elemento) }
    }
    const solo = migliori[0]!
    const come = massimo === 4 ? 'esatto'
        : massimo === 3 ? 'una parola dell\'etichetta'
            : 'contenuto nell\'etichetta'
    return { esito: 'trovato', elemento: solo.elemento, perche: come }
}

/**
 * ⭐⭐ GLI ORDINALI — «il primo contatto», «l'ultimo messaggio».
 *
 * ## ⛔ «Il primo» vuol dire «il primo che VEDO»
 *
 * Non «il primo del dataset». Una lista scorrevole ha elementi fuori schermo, e
 * prenderli sarebbe sbagliato **in un modo che nessuno nota** finché non apre
 * la chat sbagliata. Qui si guarda solo ciò che l'occhio ha restituito, che per
 * costruzione è ciò che è visibile.
 *
 * ## E perché funziona solo da oggi
 *
 * MISURATO il 2026-08-16: gli indici seguivano la visita in **profondità**
 * dell'albero, non lo schermo — **0 su 19** erano in ordine visivo. «Il primo»
 * era un elemento a caso. Adesso `TalosOcchio` ordina per riquadro prima di
 * numerare, quindi «il primo» è davvero quello in cima.
 *
 * `inLista` serve a dire quando l'ordinale ha senso: «il primo» dentro una
 * lista è una posizione; fra pulsanti sparsi in una barra è un modo di dire.
 */
export type TalosOrdinale = 'primo' | 'secondo' | 'terzo' | 'ultimo'

const ORDINALI: Readonly<Record<string, TalosOrdinale>> = Object.freeze({
    primo: 'primo', prima: 'primo', 1: 'primo',
    secondo: 'secondo', seconda: 'secondo', 2: 'secondo',
    terzo: 'terzo', terza: 'terzo', 3: 'terzo',
    ultimo: 'ultimo', ultima: 'ultimo',
})

export function talosLeggiOrdinale(richiesta: string): TalosOrdinale | null {
    for (const parola of talosNormalizza(richiesta).split(' ')) {
        const trovato = ORDINALI[parola]
        if (trovato) return trovato
    }
    return null
}

/**
 * L'n-esimo elemento **fra quelli in lista**, in ordine di schermo.
 *
 * ⛔ Torna `null` se non ce n'è abbastanza, invece di prendere l'ultimo che
 * c'è: «il terzo» quando ce ne sono due non è «il secondo», è una richiesta
 * che non si può soddisfare — e dirlo è l'unico modo di non aprire la cosa
 * sbagliata.
 */
export function talosNesimoInLista(
    elementi: readonly TalosElementoSchermo[],
    ordinale: TalosOrdinale,
): TalosElementoSchermo | null {
    const inLista = elementi.filter((e) => e.inLista && e.etichetta !== '')
    if (inLista.length === 0) return null
    if (ordinale === 'ultimo') return inLista[inLista.length - 1] ?? null
    const quale = ordinale === 'primo' ? 0 : ordinale === 'secondo' ? 1 : 2
    return inLista[quale] ?? null
}
