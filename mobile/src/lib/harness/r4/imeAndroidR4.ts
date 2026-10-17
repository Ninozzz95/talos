/**
 * ⛔ TERM-IME (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`, misurato sul Pad il 16/10): con la tastiera Android ogni tasto arriva a
 * xterm come keyCode 229, e xterm 6.0.0 ricava il testo con `nuovo.replace(vecchio, '')` (CompositionHelper), giusto solo per le
 * aggiunte: `ls -la` arrivava `lss -lla`, un suggerimento confermato due volte. È xterm #3600, aperta dal 2022; Hermes ha lo stesso
 * guaio (#136179). Cura adattata da mullion-session-manager #1421 (dossier, quarta tornata), con le sole API pubbliche di xterm:
 *   · in cattura su `term.element`, il keydown 229 fuori composizione si ferma lì e «arma»;
 *   · `beforeinput` fotografa il campo, `input` manda UNA modifica (prefisso e suffisso comuni: DEL per ogni carattere tolto, poi il
 *     testo nuovo) con `term.input(…, true)`, e si ferma lì;
 *   · la composizione (CJK), l'incolla vero e i tasti con un keyCode reale restano a xterm; l'a capo è CR e svuota il campo.
 * Il campo non si svuota a ogni tasto: la tastiera lo legge per i suggerimenti.
 */

const DEL = '\x7f'

export interface ModificaR4 {
    tolti: number
    inseriti: string
}

/** La modifica da `prima` a `dopo`, in code point (un'emoji è un carattere). */
export function modificaR4(prima: string, dopo: string): ModificaR4 {
    const a = Array.from(prima)
    const b = Array.from(dopo)
    let inizio = 0
    while (inizio < a.length && inizio < b.length && a[inizio] === b[inizio]) inizio += 1
    let fine = 0
    while (fine < a.length - inizio && fine < b.length - inizio && a[a.length - 1 - fine] === b[b.length - 1 - fine]) fine += 1
    return { tolti: a.length - inizio - fine, inseriti: b.slice(inizio, b.length - fine).join('') }
}

/** Ciò che va alla shell: un DEL per ogni carattere tolto, poi il testo nuovo con l'a capo come CR. */
export function testoDellaModificaR4({ tolti, inseriti }: ModificaR4): string {
    return DEL.repeat(tolti) + inseriti.replace(/\r?\n/gu, '\r')
}

export interface TerminaleConIme {
    element?: HTMLElement
    input(data: string, wasUserInput?: boolean): void
}

/** Attacca la cura al terminale; restituisce lo stacco (da chiamare prima del `dispose`). */
export function attaccaImeR4(term: TerminaleConIme): () => void {
    const elemento = term.element
    if (!elemento) return () => {}
    let armato = false
    let componendo = false
    let fotografia: string | null = null
    const campo = (e: Event) => (e.target instanceof HTMLTextAreaElement ? e.target : null)

    const suKeydown = (e: KeyboardEvent) => {
        if (!campo(e) || e.keyCode !== 229 || e.isComposing || componendo) return
        armato = true
        e.stopImmediatePropagation()
    }
    const suBeforeinput = (e: Event) => {
        const area = campo(e)
        if (area && armato && !componendo) fotografia = area.value
    }
    const suInput = (e: Event) => {
        const area = campo(e)
        if (!area || !armato || componendo || fotografia === null) return
        const tipo = (e as InputEvent).inputType
        e.stopImmediatePropagation()
        armato = false
        const prima = fotografia
        fotografia = null
        if (tipo === 'insertLineBreak' || tipo === 'insertParagraph') {
            term.input('\r', true)
            area.value = ''
            return
        }
        const testo = testoDellaModificaR4(modificaR4(prima, area.value))
        if (testo) term.input(testo, true)
    }
    const suCompositionstart = () => { componendo = true; armato = false; fotografia = null }
    const suCompositionend = () => { componendo = false }
    const disarma = () => { armato = false; fotografia = null }
    const suBlur = () => { componendo = false; disarma() }

    const ascolti: Array<[string, EventListener]> = [
        ['keydown', suKeydown as EventListener],
        ['beforeinput', suBeforeinput],
        ['input', suInput],
        ['compositionstart', suCompositionstart],
        ['compositionend', suCompositionend],
        ['paste', disarma],
        ['blur', suBlur],
    ]
    for (const [nome, fn] of ascolti) elemento.addEventListener(nome, fn, true)
    return () => { for (const [nome, fn] of ascolti) elemento.removeEventListener(nome, fn, true) }
}
