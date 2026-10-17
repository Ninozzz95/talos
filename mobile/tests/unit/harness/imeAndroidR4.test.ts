// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attaccaImeR4, modificaR4, testoDellaModificaR4 } from '@/lib/harness/r4/imeAndroidR4'

/*
 * ⛔ TERM-IME (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`, misurato sul Pad il 16/10): con la tastiera Android ogni tasto arriva come
 * keyCode 229 e xterm 6.0.0 ricava il testo con `nuovo.replace(vecchio, '')` (CompositionHelper; xterm #3600 aperta, Hermes #136179):
 * `ls -la` arrivava `lss -lla`. La cura (adattata da mullion #1421, solo API pubbliche) ferma il 229 in cattura e manda UNA modifica per
 * coppia beforeinput/input. Qui un ascoltatore sul campo fa il diff di xterm, per mostrare che senza la cura l'errore c'è.
 */

function campo() {
    const elemento = document.createElement('div')
    const area = document.createElement('textarea')
    area.className = 'xterm-helper-textarea'
    elemento.append(area)
    document.body.append(elemento)
    const mandati: string[] = []
    const term = { element: elemento, input: vi.fn((d: string) => { mandati.push(d) }) }
    // il comportamento di xterm 6.0.0 sul 229: fotografa al keydown, al giro dopo manda `nuovo.replace(vecchio, '')`
    const xterm: string[] = []
    area.addEventListener('keydown', (e) => {
        if (e.keyCode !== 229) return
        const vecchio = area.value
        setTimeout(() => { const d = area.value.replace(vecchio, ''); if (d) xterm.push(d) }, 0)
    })
    area.addEventListener('input', () => { /* xterm guarda anche qui */ })
    return { elemento, area, term, mandati, xterm }
}

/** Un tasto della tastiera Android: keydown 229, beforeinput, il valore cambia, input. */
function tasto(area: HTMLTextAreaElement, nuovoValore: string, inputType = 'insertText', data: string | null = null) {
    area.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 229, bubbles: true, cancelable: true }))
    area.dispatchEvent(new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true }))
    area.value = nuovoValore
    area.dispatchEvent(new InputEvent('input', { inputType, data, bubbles: true }))
}
const DEL = '\x7f'

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers() })

describe('la tastiera Android nel Terminale (TERM-IME)', () => {
    it('IME-01 la modifica fra due valori: prefisso e suffisso comuni, in code point', () => {
        expect(modificaR4('ls', 'ls ')).toEqual({ tolti: 0, inseriti: ' ' })
        expect(modificaR4('git helo', 'git hello ')).toEqual({ tolti: 1, inseriti: 'lo ' })
        expect(modificaR4('git hello', 'git ')).toEqual({ tolti: 5, inseriti: '' })
        expect(modificaR4('ciao 😀', 'ciao ')).toEqual({ tolti: 1, inseriti: '' })
        expect(modificaR4('abc', 'abc')).toEqual({ tolti: 0, inseriti: '' })
        expect(testoDellaModificaR4({ tolti: 2, inseriti: 'x\ny' })).toBe(`${DEL}${DEL}x\ry`)
    })

    it('IME-02 la sequenza del Pad: col diff di xterm `ls -la` diventa `lss -lla`; con la cura arriva una volta sola', async () => {
        vi.useFakeTimers()
        const senza = campo()
        let v = ''
        for (const c of 'ls -la') { v += c; tasto(senza.area, v, 'insertText', c) }
        await vi.runAllTimersAsync()
        expect(senza.xterm.join('')).not.toBe('ls -la')
        document.body.innerHTML = ''

        const con = campo()
        const stacca = attaccaImeR4(con.term)
        v = ''
        for (const c of 'ls -la') { v += c; tasto(con.area, v, 'insertText', c) }
        await vi.runAllTimersAsync()
        expect(con.mandati.join('')).toBe('ls -la')
        expect(con.xterm).toEqual([])
        stacca()
    })

    it('IME-03 autocorrezione a metà parola, suggerimento con due keydown, cancella parola, a capo', () => {
        const c = campo()
        attaccaImeR4(c.term)
        let v = ''
        for (const x of 'git helo') { v += x; tasto(c.area, v, 'insertText', x) }
        c.mandati.length = 0
        // il suggerimento «hello» confermato: DUE keydown 229, poi una sola modifica
        c.area.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 229, bubbles: true, cancelable: true }))
        tasto(c.area, 'git hello ', 'insertReplacementText', null)
        expect(c.mandati).toEqual([`${DEL}lo `])
        tasto(c.area, 'git ', 'deleteWordBackward')
        expect(c.mandati.at(-1)).toBe(DEL.repeat(6))
        tasto(c.area, 'git \n', 'insertLineBreak')
        expect(c.mandati.at(-1)).toBe('\r')
        expect(c.area.value).toBe('')
    })

    it('IME-04 la composizione (CJK) e l\'incolla restano a xterm; un input senza keydown 229 non si tocca', () => {
        const c = campo()
        const xtermVede: string[] = []
        c.area.addEventListener('input', (e) => xtermVede.push((e as InputEvent).inputType))
        attaccaImeR4(c.term)
        c.area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        c.area.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 229, isComposing: true, bubbles: true, cancelable: true }))
        c.area.value = 'ni'
        c.area.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'ni', bubbles: true, isComposing: true }))
        c.area.dispatchEvent(new CompositionEvent('compositionend', { data: '你', bubbles: true }))
        expect(c.term.input).not.toHaveBeenCalled()
        expect(xtermVede).toEqual(['insertCompositionText'])
        c.area.dispatchEvent(new Event('paste', { bubbles: true }))
        c.area.value = 'incollato'
        c.area.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', bubbles: true }))
        expect(c.term.input).not.toHaveBeenCalled()
        // un tasto vero (keyCode reale) lo gestisce xterm
        c.area.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 65, key: 'a', bubbles: true, cancelable: true }))
        c.area.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'a', bubbles: true }))
        expect(c.term.input).not.toHaveBeenCalled()
    })

    it('IME-05 staccato non ferma più niente; senza elemento non fa niente', () => {
        const c = campo()
        const stacca = attaccaImeR4(c.term)
        stacca()
        tasto(c.area, 'x', 'insertText', 'x')
        expect(c.term.input).not.toHaveBeenCalled()
        expect(() => attaccaImeR4({ element: undefined, input: vi.fn() })()).not.toThrow()
    })
})
