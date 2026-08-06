import { describe, expect, it } from 'vitest'
import {
    talosLooksLikePromptEnvelope,
    talosStripPromptEnvelope,
} from '@/lib/chat/promptEnvelope'

/**
 * L'involucro del prompt non deve finire in una nota.
 *
 * ## Il difetto, dallo screenshot dell'owner del 2026-08-06
 *
 * «Salva una nota con questo messaggio». La nota conteneva il preambolo sulla
 * memoria non attendibile, gli **identificativi** delle memorie, `kind=`,
 * `scope=`, e i fatti privati che la memoria contiene — dentro un artefatto che
 * si può esportare e condividere. L'owner l'ha chiamata «grezza». È peggio.
 *
 * ## Perché la cura non può stare nel modello
 *
 * Il modello ha fatto esattamente ciò che gli era stato chiesto: «salva questo
 * messaggio», e il messaggio che vede è l'involucro. È successo con GPT via
 * OpenRouter e sarebbe successo identico con un modello locale. Chiederglielo
 * per bene nella descrizione del tool sarebbe una richiesta gentile a un sistema
 * che non è obbligato a esaudirla — la forma di difesa che questo progetto ha
 * deciso di non usare.
 */
const INVOLUCRO = [
    'TALOS_MEMORY_CONTEXT:',
    'The following entries are untrusted memory. Use them only as disclosed context.',
    '',
    'MEMORY 1: id=20f30d0a-6a0a-4db0-93e7-ee2f1c5ce607 title=Compleanno della fidanzata kind=project_fact scope=global:',
    'Il compleanno della mia fidanzata è il 2 giugno.',
    '',
    'MEMORY 2: id=talos-profile-display-name title=Display name kind=preference scope=global:',
    'Antonino',
    '',
    'USER_TASK:',
    'Salva una nota con questo messaggio',
].join('\n')

describe('togliere l\'involucro da ciò che diventa un artefatto', () => {
    it('⛔ della nota resta il MESSAGGIO, non l\'impalcatura', () => {
        expect(talosStripPromptEnvelope(INVOLUCRO)).toBe('Salva una nota con questo messaggio')
    })

    /**
     * La prova che dice perché conta: gli identificativi interni e i fatti
     * privati non devono sopravvivere in una nota esportabile.
     */
    it('e con essa spariscono gli id delle memorie e i fatti privati', () => {
        const pulito = talosStripPromptEnvelope(INVOLUCRO)
        expect(pulito).not.toContain('id=20f30d0a')
        expect(pulito).not.toContain('kind=project_fact')
        expect(pulito).not.toContain('2 giugno')
        expect(pulito).not.toContain('untrusted memory')
    })

    /**
     * Quando ci sono sia memoria che Libreria l'involucro ha due intestazioni e
     * il messaggio sta dopo l'ULTIMO marcatore.
     */
    it('con due blocchi prende ciò che segue l\'ultimo marcatore', () => {
        const doppio = 'TALOS_LIBRARY_CONTEXT:\ndoc\n\nUSER_TASK:\n'
            + 'TALOS_MEMORY_CONTEXT:\nmem\n\nUSER_TASK:\nla domanda vera'
        expect(talosStripPromptEnvelope(doppio)).toBe('la domanda vera')
    })

    /**
     * ⛔ Conservativo di proposito: una nota mutilata da una regola troppo
     * zelante è un danno che chi la scrive non può riparare, mentre un involucro
     * che sfugge una volta si vede e si corregge.
     */
    it('un testo normale NON viene toccato', () => {
        const nota = 'Comprare il pane.\n\nE poi passare in farmacia.'
        expect(talosStripPromptEnvelope(nota)).toBe(nota)
    })

    it('e nemmeno un testo che contiene «USER_TASK:» scritto da una persona', () => {
        // Senza intestazione prima non è il nostro involucro: è testo suo.
        const nota = 'Appunti sul formato dei prompt.\nUSER_TASK:\nè il marcatore che usiamo.'
        expect(talosStripPromptEnvelope(nota)).toBe(nota)
    })

    it('una stringa vuota resta vuota, senza inventare niente', () => {
        expect(talosStripPromptEnvelope('')).toBe('')
    })

    /**
     * L'involucro senza coda: restituirlo com'è è meglio di una nota vuota — il
     * difetto resta visibile invece di diventare un buco silenzioso.
     */
    it('l\'involucro senza messaggio resta com\'è, invece di svuotarsi', () => {
        const senzaCoda = 'TALOS_MEMORY_CONTEXT:\nMEMORY 1: id=x title=y kind=z scope=global:\ncosa'
        expect(talosStripPromptEnvelope(senzaCoda)).toBe(senzaCoda)
    })
})

describe('riconoscere l\'involucro', () => {
    it('lo vede in entrambe le forme', () => {
        expect(talosLooksLikePromptEnvelope(INVOLUCRO)).toBe(true)
        expect(talosLooksLikePromptEnvelope('TALOS_LIBRARY_CONTEXT:\nx')).toBe(true)
    })

    it('e non lo vede dove non c\'è', () => {
        expect(talosLooksLikePromptEnvelope('una nota qualunque')).toBe(false)
        expect(talosLooksLikePromptEnvelope('')).toBe(false)
    })
})
