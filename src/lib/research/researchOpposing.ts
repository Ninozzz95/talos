import type { TalosResearchSource } from '@/lib/research/researchCollector'

/**
 * ⛔⛔ CONTESA-02 — cercare chi dice il CONTRARIO.
 *
 * ## Il difetto misurato sul Pad il 2026-08-20
 *
 * Il rapporto su GGUF scriveva, in chiaro, «le fonti… non specificano però
 * formalmente un maintainer unico»: una divergenza, in prosa. La barra sopra
 * diceva **7 su 7 sostenute · 0 contese**. `talosResearchContestedVerdict`
 * esisteva coi suoi test, e **non lo chiamava nessuno**: la contesa non poteva
 * entrare nei dati, quindi né la barra né la scheda potevano mostrarla mai.
 *
 * ## Perché serve un secondo giro, e perché costa poco
 *
 * Il giudice risponde su UNA coppia (affermazione, passaggio). Per sapere se
 * qualcun altro dice il contrario bisogna dargli l'altro passaggio: è una
 * domanda in più, non c'è scorciatoia. Il costo si tiene basso scegliendo
 * **un solo candidato** per affermazione, e solo quando ne esiste uno che
 * parla davvero dello stesso argomento.
 *
 * ⛔ E si chiede solo sulle affermazioni già SOSTENUTE (o in parte): la contesa
 * è disaccordo, e il disaccordo esiste solo se prima c'era un accordo. Su una
 * già smentita una fonte contraria non è un conflitto, è la stessa cosa detta
 * due volte.
 *
 * ## Perché la scelta è lessicale e non semantica
 *
 * Un modello che sceglie il candidato è un secondo giudizio pagato per
 * decidere cosa far giudicare, e sposta il risultato prima ancora di
 * misurarlo. La sovrapposizione di parole è cieca, gratis e ripetibile: non
 * decide chi ha ragione, decide soltanto **di cosa si sta parlando**. Il
 * verdetto resta al giudice.
 */

/** Le parole che portano significato: le corte le ha ogni frase. */
const CORTA = 4
/** Sotto due parole in comune non si sta parlando della stessa cosa. */
const SOGLIA = 2
/**
 * ⛔⛔ Sopra questa soglia i due passaggi sono LA STESSA FRASE.
 *
 * MISURATO sul Pad il 2026-08-20, prima contesa vera trovata dal giudice:
 * «Dice di sì» e «Dice di no» portavano il testo IDENTICO, parola per
 * parola, da due siti che si ricopiano. Il giudice aveva risposto «sì,
 * contraddice» a una frase uguale a quella che aveva appena approvato.
 *
 * ⇒ Due siti che riportano la stessa frase sono un’ECO, non un disaccordo —
 * ed è la stessa distinzione che il rapporto fa già sulle fonti
 * indipendenti. Una contesa inventata è peggio di una contesa non trovata:
 * toglie forza a quelle vere.
 */
const ECO = 0.9

/** Un passaggio più lungo di così non è una citazione, è una pagina. */
/**
 * ⛔ Sotto questo numero di parole di contenuto il rapporto non dice niente:
 * due frasi corte con due parole in comune non sono la stessa frase.
 */
const PAVIMENTO = 4

const MASSIMO = 400

/**
 * Quanto questa frase è la stessa cosa del passaggio già approvato.
 *
 * ⛔⛔ Il confronto è nel VERSO PIÙ CORTO, e la prima versione lo faceva in uno
 * solo — quello comodo.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20, seconda contesa: «Dice di sì» portava
 * «Sviluppato da Georgi Gerganov e dal team del progetto llama.cpp come
 * evoluzione del precedente GGML», e «Dice di no» portava LA STESSA FRASE più
 * un paragrafo di contorno. Guardando solo quanta parte della frase contraria
 * è nel passaggio a favore, il contorno abbassava il rapporto e l’eco passava.
 *
 * ⇒ Si divide per il PIÙ CORTO dei due: se uno contiene l’altro, sono la
 * stessa affermazione con più cornice, in qualunque verso stia la cornice. Il
 * pavimento a quattro parole evita che due frasi brevissime con due parole in
 * comune si dichiarino identiche.
 */
/**
 * ⛔⛔ Una TABELLA SROTOLATA non è una frase, e non si manda al giudice.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20: come passaggio contrario è arrivato
 * l’infobox di una pagina, estratto senza spazi fra le celle —
 * «…0x46Developed byGeorgi Gerganov and communityInitial releaseAugust 22,
 * 2023…». Il giudice ha risposto «sì, contraddice» a un blocco che in realtà
 * CONFERMAVA la data: gli era stata data spazzatura, e ha risposto lo stesso.
 *
 * Il segno è preciso: una minuscola attaccata a una maiuscola è il punto in
 * cui due celle si sono toccate. La prosa non lo fa quasi mai — una volta
 * capita («iPhone», un nome proprio); tre volte in una frase sola è una
 * tabella.
 *
 * ⛔ E si scarta PRIMA di pagare il giudice: una risposta comprata su un
 * testo illeggibile costa uguale e vale meno di niente, perché entra nel
 * rapporto come se fosse una verifica.
 */
const INCOLLATE = /\p{Ll}\p{Lu}/gu
const MAX_INCOLLATE = 3

function tabellaSrotolata(frase: string): boolean {
    return (frase.match(INCOLLATE)?.length ?? 0) >= MAX_INCOLLATE
}

function eco(frase: string, sostiene: Set<string>): boolean {
    if (sostiene.size === 0) return false
    const sue = contenuto(frase)
    if (sue.size === 0) return false
    let comuni = 0
    for (const parola of sue) if (sostiene.has(parola)) comuni += 1
    const piuCorto = Math.max(PAVIMENTO, Math.min(sue.size, sostiene.size))
    return comuni / piuCorto >= ECO
}

function contenuto(testo: string): Set<string> {
    const parole = testo
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((parola) => parola.length >= CORTA)
    return new Set(parole)
}

/**
 * Le frasi di un testo, tagliate anche dove la punteggiatura non arriva.
 *
 * ⛔ Un muro di testo senza punti diventerebbe UNA frase lunga quanto la
 * pagina, e mandarla al giudice sarebbe mandargli la pagina intera: la domanda
 * diventerebbe «questa fonte dice il contrario», che non è verificabile.
 */
function frasi(testo: string): string[] {
    const out: string[] = []
    for (const pezzo of testo.split(/(?<=[.!?])\s+/)) {
        const pulito = pezzo.trim()
        if (!pulito) continue
        if (pulito.length <= MASSIMO) { out.push(pulito); continue }

        // ⛔ Il taglio cade sull’ULTIMO SPAZIO, non al carattere esatto.
        //   FOTOGRAFATO sul Pad il 2026-08-20: un passaggio finiva con
        //   «distributing quantized large lang» — mezza parola. Al giudice
        //   arrivava una frase mutilata, e alla persona pure.
        let da = 0
        while (da < pulito.length) {
            let a = Math.min(da + MASSIMO, pulito.length)
            if (a < pulito.length) {
                const spazio = pulito.lastIndexOf(String.fromCharCode(32), a)
                if (spazio > da) a = spazio
            }
            const fetta = pulito.slice(da, a).trim()
            if (fetta) out.push(fetta)
            da = a
        }
    }
    return out
}

/** Una fonte diversa da quella citata, e la sua frase più pertinente. */
export interface TalosResearchOpposingCandidate {
    /** L'indice nella lista delle fonti raccolte, contando da zero. */
    readonly sourceIndex: number
    readonly url: string
    readonly title: string
    readonly passage: string
    readonly span: { readonly from: number, readonly to: number }
    /** Quante parole di contenuto ha in comune con l'affermazione. */
    readonly overlap: number
}

/**
 * La frase, in un'altra fonte, che parla più da vicino di questa affermazione.
 *
 * ⛔ `null` quando nessuna arriva alla soglia: chiedere al giudice di
 * confrontare l'affermazione con un paragrafo che non c'entra produce un «no,
 * non lo contraddice» che sembra una verifica e non lo è — e costa comunque.
 *
 * ⛔ E la fonte già citata è esclusa: il giudice l'ha appena letta. Riproporgli
 * la stessa pagina significherebbe farsi contraddire da chi ha appena detto di
 * sì, e chiamare «contesa» un disaccordo con sé stesso.
 */
export function talosResearchOpposingCandidate(
    claimText: string,
    citedIndex: number,
    sources: readonly TalosResearchSource[],
    /** Il passaggio che sostiene l’affermazione: chi lo ripete non lo nega. */
    citedPassage = '',
): TalosResearchOpposingCandidate | null {
    const parole = contenuto(claimText)
    if (parole.size === 0) return null
    const sostiene = contenuto(citedPassage)

    let migliore: TalosResearchOpposingCandidate | null = null

    for (let indice = 0; indice < sources.length; indice += 1) {
        if (indice === citedIndex) continue
        const fonte = sources[indice]
        if (!fonte?.text) continue

        let scorso = 0
        for (const frase of frasi(fonte.text)) {
            // La posizione si cerca a partire da dove siamo arrivati: la stessa
            // frase può comparire due volte, e la seconda non sta dove sta la
            // prima.
            const da = fonte.text.indexOf(frase, scorso)
            if (da >= 0) scorso = da + frase.length

            let overlap = 0
            for (const parola of contenuto(frase)) if (parole.has(parola)) overlap += 1
            if (overlap < SOGLIA) continue
            if (migliore && overlap <= migliore.overlap) continue
            // ⛔ Prima ancora dell’eco: se non è prosa, non è un passaggio.
            if (tabellaSrotolata(frase)) continue
            // ⛔ L’eco si scarta QUI, prima di pagare il giudice: chiedergli se
            //   una frase contraddice sé stessa è comprare una risposta a una
            //   domanda senza senso.
            if (eco(frase, sostiene)) continue

            migliore = {
                sourceIndex: indice,
                url: fonte.url,
                title: fonte.title,
                passage: frase,
                span: da >= 0 ? { from: da, to: da + frase.length } : { from: 0, to: 0 },
                overlap,
            }
        }
    }

    return migliore
}

/**
 * La domanda al giudice, e non è la stessa di prima.
 *
 * ⛔ Non «sostiene l'affermazione?» ma «la CONTRADDICE?». Sembra la stessa
 * domanda al negativo e non lo è: un passaggio che non sostiene un'affermazione
 * quasi sempre non dice niente al riguardo, e leggere quel silenzio come una
 * smentita farebbe apparire contese ovunque. La contesa deve essere DETTA dalla
 * fonte.
 */
export function talosResearchOpposingPrompt(claim: string, passage: string): string {
    return [
        'Passaggio, copiato da UN’ALTRA fonte:',
        '"""',
        passage,
        '"""',
        '',
        'Affermazione:',
        claim,
        '',
        'Questo passaggio CONTRADDICE l’affermazione?',
        'Contraddire vuol dire dire il contrario, non tacere: se il passaggio',
        'semplicemente non parla dell’affermazione, la risposta è NO.',
        'Non usare altro: né quello che sai, né quello che ti sembra probabile.',
        '',
        // ⛔ Nessun menu con le barre: un modello lo ricopia invece di
        //   sceglierne una voce. Vedi la nota sulla domanda del primo giro.
        'Rispondi con UNA riga sola. Comincia con SI oppure con NO,',
        'poi un trattino e il motivo, massimo quindici parole.',
        '',
        'Esempio di risposta: NO — il passaggio non parla di questo.',
    ].join('\n')
}

/**
 * Legge la riga del giudice: contraddice, sì o no.
 *
 * ⛔ Nel dubbio è NO. Una risposta illeggibile letta come «sì» marcherebbe
 * contesa un'affermazione che nessuno ha smentito, e una contesa inventata è
 * peggio di una contesa non trovata: toglie forza a quelle vere.
 */
export function talosResearchParseOpposingVerdict(risposta: string): boolean {
    const riga = risposta.trim().toLowerCase()
    if (!riga) return false
    // Si guarda solo la PRIMA parola: un motivo che contiene «no» dentro una
    // frase («non c'è dubbio che sia il contrario») non deve ribaltare l'esito.
    const prima = riga.split(/[^\p{L}]+/u).filter(Boolean)[0]
    return prima === 'si' || prima === 'sì' || prima === 'yes'
}
