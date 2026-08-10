import type { TalosAzione, TalosAzioneNome } from '@/lib/agent/passoDelloSchermo'

/**
 * ⭐⭐ COME PARLA TALOS MENTRE GUIDA — e perché non somiglia a nessuno.
 *
 * ## Cosa fanno gli altri (ricerca del 2026-08-10)
 *
 * | chi                        | tecnica                                    |
 * |----------------------------|--------------------------------------------|
 * | Google Assistant/Dialogflow| massime di Grice + «randomize variations»  |
 * | Amazon Alexa               | «randomized variations», conferma solo sul rischio |
 * | Mycroft / OpenVoiceOS      | file `.dialog` a più righe, `speak_dialog` ne pesca UNA A CASO |
 * | Rabbit R1 (LAM)            | l'assistente dà voce a ciò che fa nelle app |
 * | OpenAI Presence / voce sugli agenti | «l'agente narra, tu tieni gli occhi sul lavoro vero» |
 *
 * Il denominatore comune è **pescare a caso da una lista**. È meglio di una
 * frase sola, e non basta.
 *
 * ## ⭐ Le quattro cose che facciamo noi e loro no
 *
 * **1. ROTAZIONE, non sorteggio.** Il caso si ripete da solo: con cinque
 * varianti, la probabilità che la prossima sia uguale alla precedente è 1 su 5
 * — cioè, su venti passi, quattro «déjà entendu». Qui la scelta ruota
 * sull'indice del passo: la ripetizione immediata è **impossibile**, non
 * improbabile. Ed è deterministica, quindi si può provare.
 *
 * **2. BREVITÀ PROGRESSIVA.** Una persona che si racconta dice la frase intera
 * la prima volta, poi va per frammenti: «Apro le impostazioni…», «…ora le
 * notifiche», «…ci siamo». Gli assistenti dicono una frase compiuta ogni volta,
 * ed è lì che si sente la macchina. Qui il primo passo ha il soggetto, dal
 * secondo si cade nel frammento.
 *
 * **3. IL SILENZIO È UNA RIGA.** Tre scorrimenti di fila non si annunciano tre
 * volte: chi lo fa non sta parlando, sta leggendo un registro. Questa funzione
 * può rispondere `null`, e chi guida tace. Nessuno dei cinque lo prevede: il
 * loro ciclo dice sempre qualcosa.
 *
 * **4. SI DICE LA COSA, NON IL MECCANISMO.** «Tocco l'elemento 4» è la vista
 * della macchina; «apro Chrome» è quella della persona. Indici, nomi di
 * pacchetto e nomi interni non si pronunciano MAI — è la stessa regola del
 * toast (`avvisoDiTool.ts`), applicata all'orecchio invece che all'occhio.
 *
 * ## E la brevità non è stile: è la barriera
 *
 * Chi ascolta può fermare TALOS toccando lo schermo, e può farlo solo finché la
 * frase non è finita e il dito non è ancora partito. Una riga lunga si mangia
 * la finestra in cui la persona può dire «no». Per questo il tetto è duro:
 * dodici parole.
 */
export const TALOS_PAROLE_AL_MASSIMO = 12

export interface TalosPassoDaDire {
    /** Il numero del passo, da 1. Decide rotazione e brevità. */
    numero: number
    azione: TalosAzione
    /** L'etichetta UMANA dell'elemento, se ce n'è una a schermo. */
    etichetta?: string
    /** L'azione del passo precedente: serve al silenzio. */
    precedente?: TalosAzioneNome
    /** L'etichetta del passo precedente: due tocchi diversi si dicono entrambi. */
    etichettaPrecedente?: string
}

/** I verbi, in rotazione. ⛔ Nessuno nomina indici, pacchetti o elementi. */
const VERBI: Record<TalosAzioneNome, readonly string[]> = {
    tocca: ['tocco', 'apro', 'vado su', 'premo'],
    scrivi: ['scrivo', 'digito'],
    scorri: ['scorro', 'scendo', 'cerco più giù'],
    indietro: ['torno indietro', 'faccio un passo indietro'],
    home: ['vado alla schermata iniziale', 'torno alla home'],
    apri_app: ['apro', 'faccio partire'],
    attendi: ['aspetto che carichi', 'un attimo che carica'],
    fine: ['ci siamo'],
}

/**
 * La frase da dire ad alta voce prima di questo passo, o `null` per tacere.
 *
 * ⛔ È PURA e deterministica: la rotazione dipende dal numero del passo, non
 * dal caso. Una voce che non si può provare è una voce che un giorno dice una
 * cosa sbagliata e nessuno se ne accorge.
 */
export function talosFraseDaDire(passo: TalosPassoDaDire): string | null {
    const nome = passo.azione.azione
    if (nome === 'fine') return null

    /*
     * ⛔ IL SILENZIO. Stessa azione del passo prima, e nessun bersaglio nuovo:
     * non c'è niente di nuovo da dire, e ripeterlo trasforma il racconto in un
     * registro letto ad alta voce.
     */
    const etichetta = pulisci(passo.etichetta ?? passo.azione.testo)
    if (
        passo.precedente === nome
        && (!etichetta || etichetta === pulisci(passo.etichettaPrecedente))
    ) {
        return null
    }

    const verbi = VERBI[nome]
    // ⭐ Rotazione sull'indice del passo: la ripetizione immediata NON PUÒ
    // capitare, mentre il sorteggio la produce una volta su `verbi.length`.
    const verbo = verbi[(passo.numero - 1) % verbi.length]!

    const corpo = nome === 'scrivi' && etichetta
        ? `${verbo} ${virgolette(etichetta)}`
        : etichetta
            ? `${verbo} ${etichetta}`
            : verbo

    /*
     * ⭐ BREVITÀ PROGRESSIVA. Il primo passo apre con una parola che dice «sto
     * cominciando»; dal secondo in poi resta il frammento, che è come parla
     * chiunque racconti mentre fa.
     */
    const frase = passo.numero === 1 ? `Ok, ${corpo}` : corpo
    return tetto(maiuscola(frase))
}

/**
 * ⛔ Dodici parole, e si taglia sull'ULTIMO spazio utile.
 *
 * Tagliare a metà parola suona peggio di una frase lunga, e i puntini di
 * sospensione a voce non si sentono: si chiude e basta.
 */
function tetto(frase: string): string {
    const parole = frase.split(/\s+/)
    if (parole.length <= TALOS_PAROLE_AL_MASSIMO) return frase
    return parole.slice(0, TALOS_PAROLE_AL_MASSIMO).join(' ')
}

/**
 * Toglie ciò che non si pronuncia.
 *
 * ⛔ Un nome di pacchetto (`com.android.chrome`) letto ad alta voce è
 * incomprensibile, e un'etichetta vuota o fatta di soli simboli farebbe dire
 * «tocco» seguito da niente. In entrambi i casi meglio il verbo nudo.
 */
function pulisci(testo: string | undefined): string | undefined {
    const t = (testo ?? '').trim()
    if (!t) return undefined
    if (/^[a-z0-9]+(\.[a-z0-9_]+){2,}$/i.test(t)) return undefined
    if (!/\p{L}|\p{N}/u.test(t)) return undefined
    // Le etichette lunghe si accorciano alla prima riga: a voce, il resto è rumore.
    const prima = t.split(/[\n·|]/)[0]!.trim()
    return prima.length > 40 ? `${prima.slice(0, 40).trimEnd()}` : prima
}

/** Il testo scritto va fra virgolette parlate, o si confonde con la frase. */
function virgolette(testo: string): string {
    return `«${testo}»`
}

function maiuscola(frase: string): string {
    return frase.charAt(0).toUpperCase() + frase.slice(1)
}
