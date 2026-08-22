/**
 * ⭐⭐ COME L'APP SA DI ESSERE «LA BARRA» — e non la schermata intera.
 *
 * La barra e la app sono lo STESSO bundle nella STESSA WebView: cambia solo chi
 * la ospita (`TalosBarraActivity` invece di `MainActivity`) e cosa disegna. Ma
 * il codice web non ha modo di guardare quale Activity lo sta mostrando, quindi
 * l'informazione va consegnata — e questo file e' la consegna.
 *
 * ## ⛔ Perche' un INDIRIZZO e non un extra dell'Intent
 *
 * Tre strade, misurate contro il costo di sbagliarle:
 *
 *   1. **un `putExtra` letto da un plugin nostro nuovo** — vuol dire scrivere
 *      codice nativo, registrarlo in `MainActivity`, e un giro di ponte in
 *      piu' su OGNI avvio dell'app, anche quelli che non sono la barra;
 *   2. **iniettare una variabile globale dalla Activity** — `addJavascriptInterface`
 *      e `evaluateJavascript` valgono per il caricamento SUCCESSIVO della
 *      pagina, e qui la pagina la sta gia' caricando `super.onCreate`: sarebbe
 *      una corsa fra due cose che partono insieme, cioe' un difetto che si
 *      presenta una volta su venti e su un telefono solo;
 *   3. **l'indirizzo di lancio** — `Intent.setData(...)`, che dall'altra parte
 *      e' esattamente quello che `App.getLaunchUrl()` restituisce. Nessun
 *      codice nativo nuovo, nessuna corsa: il dato e' gia' dentro l'Intent
 *      quando la Activity nasce, e resta li' finche' qualcuno lo chiede.
 *
 * La terza. E il contesto viaggia con lei, negli stessi parametri, perche' il
 * contesto E' parte di cosa la barra deve dire alla persona.
 *
 * ## ⛔ Il contesto si DICHIARA, non si usa di nascosto
 *
 * `nodi` e `immagine` non servono (ancora) a rispondere: servono a SCRIVERLO
 * sulla barra. Misurato l'11 agosto sul Pad: 49 nodi su Impostazioni, 319 su
 * Chrome, piu' lo screenshot. Gemini, ChatGPT e Perplexity quel contesto lo
 * prendono e basta; qui la persona legge quanto e' stato visto e puo' toglierlo
 * con un tocco. E' il primo dei cinque sorpassi del compito #90.
 */

/** Quanto della schermata sottostante e' arrivato con la chiamata. */
export interface TalosContestoBarra {
    /** Quanti nodi aveva l'albero della schermata. 0 = non e' arrivato niente. */
    readonly nodi: number
    /** Se il sistema ha consegnato anche l'immagine dello schermo. */
    readonly immagine: boolean
}

export interface TalosModoBarra {
    /**
     * Chi ha chiamato ha PARLATO (gesto dell'assistente), non digitato.
     *
     * Cambia due cose: la barra apre il microfono da sola invece della
     * tastiera, e la risposta torna a voce. Chi ha parlato si aspetta di
     * sentire — e' la stessa regola gia' misurata per il composer.
     */
    readonly daVoce: boolean
    /** La barra è stata aperta sopra il keyguard: prima dello sblocco è muta. */
    readonly bloccata: boolean
    /** La wake-word ha interrotto una lettura TTS già in corso. */
    readonly bargeIn: boolean
    readonly contesto: TalosContestoBarra
    /**
     * ⭐⭐ L'IDENTITÀ DELL'APERTURA — «questa chiamata è una sola».
     *
     * Lo scrive chi apre: `TalosAssistente` per il gesto (lo stesso su tutti gli
     * intent di una sessione), `TalosBarraActivity` per tutte le altre porte.
     * `null` solo per un indirizzo che non l'ha dichiarata — sul web, o da una
     * porta futura che se ne dimenticasse.
     *
     * ⛔ Serve a distinguere «mi hanno chiamato di nuovo» da «mi hanno mandato
     * un dato che mancava», e i due vogliono comportamenti opposti: il primo
     * riaccende il microfono, il secondo deve lasciarlo in pace. MISURATO il 12
     * agosto: un solo gesto contava DUE chiamate, e la seconda spegneva
     * l'ascolto appena partito.
     */
    readonly apertura: string | null
}

const SCHEMA_BARRA = 'talos:'
const OSPITE_BARRA = 'barra'

function numeroNonNegativo(grezzo: string | null): number {
    if (!grezzo) return 0
    const valore = Number.parseInt(grezzo, 10)
    // ⛔ `Number.parseInt('12abc')` fa 12 e `NaN` non e' minore di zero: le due
    // condizioni servono tutte e due, e la seconda non copre la prima.
    return Number.isFinite(valore) && valore > 0 ? valore : 0
}

/**
 * Legge l'indirizzo di lancio. `null` quando non e' la barra — che e' il caso
 * di gran lunga piu' comune: l'app aperta dall'icona non ha nessun indirizzo.
 *
 * ⛔ Fallisce CHIUSO: qualunque indirizzo che non sia esattamente il nostro
 * apre la app normale. Un difetto di lettura qui darebbe a una persona che ha
 * toccato l'icona una barretta in fondo allo schermo al posto della sua app.
 */
export function talosModoBarraDa(indirizzo: string | null | undefined): TalosModoBarra | null {
    if (!indirizzo) return null
    let letto: URL
    try {
        letto = new URL(indirizzo)
    } catch {
        return null
    }
    if (letto.protocol !== SCHEMA_BARRA) return null
    // `talos://barra?...` mette «barra» nell'host; `talos:barra?...` nel
    // percorso. Si accettano tutti e due perche' la differenza e' una barra
    // obliqua scritta a mano dall'altra parte del ponte, non una scelta.
    const dove = letto.hostname || letto.pathname.replace(/^\/+/, '')
    if (dove !== OSPITE_BARRA) return null

    const parametri = letto.searchParams
    return {
        daVoce: parametri.get('voce') === '1',
        bloccata: parametri.get('bloccato') === '1',
        bargeIn: parametri.get('barge') === '1',
        contesto: {
            nodi: numeroNonNegativo(parametri.get('nodi')),
            immagine: parametri.get('immagine') === '1',
        },
        apertura: parametri.get('apertura'),
    }
}

/**
 * Lo stesso, chiesto al telefono.
 *
 * ⛔ Non lancia MAI: su web il plugin non c'e', e un avvio che muore perche'
 * non ha saputo dire «non sono la barra» sarebbe il difetto peggiore possibile
 * — l'app non si apre piu' per nessuno.
 */
export async function talosModoBarraDalLancio(): Promise<TalosModoBarra | null> {
    try {
        const { App } = await import('@capacitor/app')
        const lancio = await App.getLaunchUrl()
        return talosModoBarraDa(lancio?.url ?? null)
    } catch {
        return null
    }
}
