import {
    talosIsPlainToolDetailsLine,
    talosIsToolCodeHeaderLine,
} from '@/lib/chat/localToolCalls'

/**
 * Separa il ragionamento dal contenuto MENTRE arriva, non alla fine.
 *
 * ## Il difetto
 *
 * Visto sul OnePlus Pad 3 il 2026-08-06, con Qwen3-1.7B-Q8_0: la bolla della
 * risposta mostrava
 *
 *     <think> Okay, the user wants me to respond with only the word "PRONTO"…
 *
 * per tutto il tempo della generazione. `common_chat_parse`, sul lato nativo,
 * separa ragionamento e contenuto **quando la risposta è finita** — ed è ciò che
 * ha chiuso il difetto del 2026-08-03, che riguardava il testo FINALE.
 *
 * Ma su un modello locale la generazione dura decine di secondi, e quel tempo è
 * quasi tutto il tempo in cui qualcuno guarda. Quindi il marcatore era invisibile
 * solo a chi lo cercava nel risultato salvato: chi usava l'app lo vedeva sempre.
 *
 * ## Perché non basta cancellare i tag
 *
 * Perché il ragionamento non è spazzatura: TALOS ha un cassetto «Ragionamento»
 * che i provider di rete riempiono già via `onReasoning`. Il modello locale era
 * l'unico che non lo faceva — quindi la cura non è nascondere, è **instradare**,
 * e mandare le due metà dove vanno.
 *
 * ## Il caso difficile: il tag spezzato
 *
 * Uno stream arriva a pezzi arbitrari, e `<think>` può cadere fra due di essi:
 * `«…ecco <thi»` + `«nk> ragiono…»`. Chi cercasse il tag in ogni pezzo non lo
 * troverebbe mai e lo lascerebbe passare a metà — che è peggio del difetto di
 * partenza, perché produce testo mutilato invece di testo sporco.
 *
 * Perciò si trattiene la coda che POTREBBE essere l'inizio di un tag, e la si
 * rilascia appena si sa che non lo è. Il ritardo massimo è la lunghezza del tag
 * più lungo: nove caratteri, cioè niente.
 */

/** I marcatori del ragionamento: quello che va nel cassetto. */
const APERTURA = '<think>'
const CHIUSURA = '</think>'

/**
 * ⛔ E la chiamata a un tool scritta come TESTO, che invece si butta.
 *
 * ## Perché serve
 *
 * VISTO sul Pad il 2026-08-08 con Qwen3-1.7B: dopo che il tool era già stato
 * eseguito, nella bolla comparivano cinque righe di
 * `<tool_call> {"name": "device_torch", "arguments": {"on": true}} </tool_call>`.
 * È la stessa causa delle esecuzioni ripetute — la grammatica pigra non si
 * carica, quindi il modello riscrive la chiamata come testo libero — ma il
 * rimedio qui è diverso: quel testo non è ragionamento e non è una risposta.
 * È sintassi interna, e a schermo non ci va mai.
 *
 * ## Perché si BUTTA e non si instrada
 *
 * Il ragionamento ha un posto dove andare, il cassetto. Una chiamata già
 * eseguita non ha niente da aggiungere a nessuno dei due: il suo effetto è
 * altrove e il suo esito arriva per la sua strada. Mostrarla vorrebbe dire far
 * leggere alla persona il verso interno di una cosa già successa.
 *
 * Se il blocco resta aperto — generazione troncata a metà chiamata — si butta
 * anche la coda: mezza JSON a schermo è peggio di niente.
 */
const TOOL_APERTURA = '<tool_call>'
const TOOL_CHIUSURA = '</tool_call>'

/**
 * ⛔⛔ I blocchi che si BUTTANO, e il secondo l'ha trovato l'owner.
 *
 * `<tool_call>` c'era da sempre. `<tools>` no — ed è il blocco con cui un
 * modello piccolo si RILEGGE il catalogo invece di usarlo: sul Pad, l'11
 * agosto, Qwen3-1.7B ha risposto a una domanda di aritmetica con l'elenco dei
 * nostri strumenti, descrizioni comprese.
 *
 * Vale la stessa ragione della chiamata: non ha niente da aggiungere a nessuno
 * dei due cassetti. Chi vuole sapere quali strumenti esistono ha un pannello.
 */
const DA_BUTTARE = [
    { apre: TOOL_APERTURA, chiude: TOOL_CHIUSURA },
    { apre: '<tools>', chiude: '</tools>' },
    { apre: '<|tool_call_start|>', chiude: '<|tool_call_end|>' },
] as const

/** La prima delle aperture da buttare che compare, con la sua chiusura. */
function primaDi(
    testo: string,
    aperture: readonly string[],
): { dove: number, apre: string, chiude: string } {
    let dove = -1
    let quale = 0
    for (let i = 0; i < aperture.length; i += 1) {
        const at = testo.indexOf(aperture[i]!)
        if (at >= 0 && (dove < 0 || at < dove)) { dove = at; quale = i }
    }
    return { dove, apre: DA_BUTTARE[quale]!.apre, chiude: DA_BUTTARE[quale]!.chiude }
}

export interface TalosThinkSlice {
    /** Ciò che va nella bolla della risposta. */
    text: string
    /** Ciò che va nel cassetto «Ragionamento». */
    reasoning: string
}

export interface TalosThinkSplitter {
    /** Consuma un pezzo dello stream e dice dove va ciascuna metà. */
    push(delta: string): TalosThinkSlice
    /**
     * Chiude lo stream.
     *
     * Serve perché la coda trattenuta va rilasciata: se una risposta finisce con
     * `«…fatto <»`, quel carattere è testo vero e non l'inizio di un tag che non
     * arriverà mai. Senza questo, l'ultimo pezzo di una risposta su tre sparirebbe.
     */
    flush(): TalosThinkSlice
}

/**
 * La lunghezza della coda che potrebbe essere l'inizio di `marcatore`.
 *
 * Restituisce quanti caratteri finali di `testo` sono un prefisso proprio del
 * marcatore — zero se nessuno lo è.
 */
function codaAmbigua(testo: string, marcatore: string): number {
    const massimo = Math.min(testo.length, marcatore.length - 1)
    for (let lunghezza = massimo; lunghezza > 0; lunghezza -= 1) {
        if (marcatore.startsWith(testo.slice(testo.length - lunghezza))) return lunghezza
    }
    return 0
}

/** Hold only a possible protocol line suffix, so ordinary prose stays live. */
function creaFiltroRigaToolDetails(): (delta: string, chiudendo: boolean) => string {
    let attesa = ''
    return (delta: string, chiudendo: boolean): string => {
        let input = attesa + delta
        attesa = ''
        let output = ''
        for (;;) {
            const nuovaRiga = input.indexOf('\n')
            if (nuovaRiga >= 0) {
                const riga = input.slice(0, nuovaRiga)
                if (!talosIsPlainToolDetailsLine(riga)) output += `${riga}\n`
                input = input.slice(nuovaRiga + 1)
                continue
            }
            if (!input) break
            const minuscolo = input.trimStart().toLowerCase()
            const possibile = 'tool_details'.startsWith(minuscolo)
                || minuscolo.startsWith('tool_details:')
            if (!chiudendo && possibile) {
                attesa = input
                break
            }
            if (chiudendo && talosIsPlainToolDetailsLine(input)) break
            output += input
            break
        }
        if (chiudendo) {
            if (attesa && !talosIsPlainToolDetailsLine(attesa)) output += attesa
            attesa = ''
        }
        return output
    }
}

/**
 * Nasconde il blocco multilinea TOOL_CODE mentre arriva.
 *
 * Una regex sul singolo chunk non basta: nello screenshot reale l'output era
 * abbastanza lungo da poter attraversare piu' repaint, e `TOO` / `L_CODE`
 * possono stare in chunk diversi. Si lavora per righe e, riconosciuta
 * l'intestazione esatta, si scarta fino alla riga vuota o alla fine.
 */
function creaFiltroBloccoToolCode(): (delta: string, chiudendo: boolean) => string {
    let attesa = ''
    let dentro = false
    return (delta: string, chiudendo: boolean): string => {
        let input = attesa + delta
        attesa = ''
        let output = ''

        for (;;) {
            const nuovaRiga = input.indexOf('\n')
            if (nuovaRiga < 0) break
            const riga = input.slice(0, nuovaRiga)
            input = input.slice(nuovaRiga + 1)
            if (dentro) {
                if (riga.trim() === '') {
                    dentro = false
                    output += '\n'
                }
                continue
            }
            if (talosIsToolCodeHeaderLine(riga)) {
                dentro = true
                continue
            }
            output += `${riga}\n`
        }

        if (dentro) {
            // A fine risposta il protocollo senza riga vuota e' comunque
            // completo per i nostri scopi: si scarta la coda.
            if (!chiudendo) attesa = input
            return output
        }

        const possibile = 'tool_code'.startsWith(input.trimStart().toLowerCase())
        if (!chiudendo && possibile) {
            attesa = input
        } else {
            output += input
        }
        if (chiudendo) attesa = ''
        return output
    }
}

export function talosCreateThinkSplitter(startsInReasoning = false): TalosThinkSplitter {
    /**
     * Tre stati e non un booleano, da quando i marcatori sono due paia:
     * `testo` cerca l'una o l'altra apertura, `ragionamento` e `chiamata`
     * cercano la propria chiusura. Un booleano non saprebbe DA COSA sta
     * uscendo, e uscirebbe dalla cosa sbagliata.
     */
    let stato: 'testo' | 'ragionamento' | 'chiamata' = startsInReasoning
        ? 'ragionamento'
        : 'testo'
    let sospeso = ''
    const filtraTesto = creaFiltroRigaToolDetails()
    const filtraRagionamento = creaFiltroRigaToolDetails()
    const filtraToolCodeTesto = creaFiltroBloccoToolCode()
    const filtraToolCodeRagionamento = creaFiltroBloccoToolCode()
    /** Quale chiusura sta aspettando lo stato «chiamata»: le aperture sono due. */
    let chiusuraAttesa: string = TOOL_CHIUSURA

    function consuma(chiudendo: boolean): TalosThinkSlice {
        let text = ''
        let reasoning = ''

        for (;;) {
            if (stato === 'testo') {
                /*
                 * ⛔⛔ TRE aperture, non due — e la terza l'ha trovata l'owner.
                 *
                 * RIPRODOTTO sul Pad l'11 agosto con Qwen3-1.7B: a una domanda
                 * di aritmetica, in chat è comparso il CATALOGO degli strumenti
                 * dentro `<tools><tool_details>…`. Il separatore conosceva
                 * `<tool_call>` — e infatti quello non lampeggiava mai — ma non
                 * `<tools>`, che è il blocco con cui il modello si rilegge la
                 * lista invece di usarla.
                 *
                 * ⇒ Stesso trattamento: si butta. Un catalogo a schermo non
                 * aggiunge niente a nessuno dei due cassetti, esattamente come
                 * una chiamata già eseguita.
                 */
                const dovePensiero = sospeso.indexOf(APERTURA)
                const doveChiamata = primaDi(sospeso, DA_BUTTARE.map((b) => b.apre))
                // La PRIMA delle due, non una preferita: l'ordine lo decide il
                // testo, non noi.
                const primo = dovePensiero < 0 ? doveChiamata.dove
                    : doveChiamata.dove < 0 ? dovePensiero
                        : Math.min(dovePensiero, doveChiamata.dove)
                if (primo >= 0) {
                    text += sospeso.slice(0, primo)
                    const pensiero = primo === dovePensiero
                    sospeso = sospeso.slice(
                        primo + (pensiero ? APERTURA : doveChiamata.apre).length,
                    )
                    if (!pensiero) chiusuraAttesa = doveChiamata.chiude
                    stato = pensiero ? 'ragionamento' : 'chiamata'
                    continue
                }
                /*
                 * Nessuna apertura intera: si emette tutto tranne la coda che
                 * potrebbe esserne l'inizio. Si trattiene la PIU' LUNGA delle
                 * code possibili, altrimenti `«…ecco <tool_c»` uscirebbe a
                 * schermo perche' non e' un prefisso di `<think>`.
                 */
                const trattenuti = chiudendo ? 0 : Math.max(
                    codaAmbigua(sospeso, APERTURA),
                    ...DA_BUTTARE.map((b) => codaAmbigua(sospeso, b.apre)),
                )
                text += sospeso.slice(0, sospeso.length - trattenuti)
                sospeso = sospeso.slice(sospeso.length - trattenuti)
                return { text, reasoning }
            }

            const chiusura = stato === 'ragionamento' ? CHIUSURA : chiusuraAttesa
            const at = sospeso.indexOf(chiusura)
            if (at >= 0) {
                // ⛔ Il contenuto della chiamata non va da nessuna parte.
                if (stato === 'ragionamento') reasoning += sospeso.slice(0, at)
                sospeso = sospeso.slice(at + chiusura.length)
                stato = 'testo'
                continue
            }

            const trattenuti = chiudendo ? 0 : codaAmbigua(sospeso, chiusura)
            if (stato === 'ragionamento') {
                reasoning += sospeso.slice(0, sospeso.length - trattenuti)
            }
            sospeso = sospeso.slice(sospeso.length - trattenuti)
            return { text, reasoning }
        }
    }

    return {
        push(delta: string): TalosThinkSlice {
            sospeso += delta
            const fetta = consuma(false)
            return {
                text: filtraTesto(filtraToolCodeTesto(fetta.text, false), false),
                reasoning: filtraRagionamento(
                    filtraToolCodeRagionamento(fetta.reasoning, false), false,
                ),
            }
        },
        flush(): TalosThinkSlice {
            const esito = consuma(true)
            sospeso = ''
            return {
                text: filtraTesto(filtraToolCodeTesto(esito.text, true), true),
                reasoning: filtraRagionamento(
                    filtraToolCodeRagionamento(esito.reasoning, true), true,
                ),
            }
        },
    }
}

/**
 * Ripulisce un testo GIÀ COMPLETO dai marcatori, e dice dove va ciascuna metà.
 *
 * Serve per il risultato **finale**, che non passa dallo stream: il ponte
 * nativo restituisce `text` e `reasoning` separati da `common_chat_parse`, e su
 * alcuni modelli quella separazione lascia il tag dentro.
 *
 * Visto sul tablet il 2026-08-06 con **Qwen3-MoE-6x0.6B**: la sezione
 * «Ragionamento» cominciava con `<think> Okay, let's look at…`. Lo streaming era
 * corretto — era il testo salvato a portarsi dietro il marcatore, e quello è
 * ciò che si rilegge riaprendo la chat, cioè per sempre.
 *
 * Perché non basta una `replace` dei due tag: perché un `<think>` aperto e mai
 * chiuso lascerebbe il ragionamento nella bolla della risposta. Qui si riusa lo
 * stesso separatore dello stream, che quel caso lo sa già gestire — una regola
 * sola, provata una volta.
 */
export function talosSplitFinalThink(
    text: string | null | undefined,
    reasoning: string | null | undefined,
): TalosThinkSlice {
    const separatore = talosCreateThinkSplitter()
    const dallo = separatore.push(text ?? '')
    const coda = separatore.flush()

    /*
     * Il ragionamento nativo passa dal separatore anche lui, e si tiene ENTRAMBE
     * le metà: se `common_chat_parse` ha messo lì dentro un blocco `<think>`,
     * quello che sta fuori dal blocco è ragionamento comunque — è arrivato sul
     * canale del ragionamento, e buttarlo perderebbe testo.
     */
    const nativo = talosCreateThinkSplitter()
    const dalNativo = nativo.push(reasoning ?? '')
    const codaNativa = nativo.flush()
    const ragionamentoNativo = dalNativo.reasoning + codaNativa.reasoning
        + dalNativo.text + codaNativa.text

    return {
        text: dallo.text + coda.text,
        reasoning: ragionamentoNativo + dallo.reasoning + coda.reasoning,
    }
}

