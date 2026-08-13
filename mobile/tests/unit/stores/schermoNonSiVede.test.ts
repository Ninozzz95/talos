import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⛔⛔ IL TESTO PER IL MODELLO NON SI STAMPA ADDOSSO ALLA PERSONA.
 *
 * ## Il difetto, con lo screenshot dell'owner
 *
 * 11 agosto 2026. Nella chat compariva, come messaggio dell'utente, l'intero
 * prompt del contesto: «Qui sotto c'è il testo che compare adesso sullo schermo
 * della persona…» seguito da centinaia di parole di interfaccia — Gmail,
 * Deezer, WhatsApp, il nome di ogni icona della schermata.
 *
 * Causa: una sola riga, `chat.send(cornice + testo, …)`. Concatenato, il
 * contesto diventava il messaggio: mostrato, salvato su disco, e ripetuto in
 * ogni turno successivo.
 *
 * ⛔ È la seconda volta che questa classe di difetto morde (vedi
 * `righe-per-il-modello-sullo-schermo`), e la prima volta l'avevo già nominata.
 * Per questo il presidio guarda il PUNTO DI ATTACCO e non il comportamento: la
 * concatenazione o c'è o non c'è, e se torna questo file diventa rosso.
 */

const RADICE = resolve(__dirname, '../../..')
const leggi = (f: string): string => readFileSync(resolve(RADICE, f), 'utf8')

describe('⛔ il contesto dello schermo non entra nel messaggio', () => {
    it('⛔ la barra NON concatena il contesto al testo della persona', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')

        // La forma esatta del difetto: qualunque cosa sommata al testo in send.
        expect(barra).not.toMatch(/chat\.send\(\s*\w+\s*\+\s*testo/)
        expect(barra).not.toMatch(/cornice\s*\+\s*testo/)
        // E la forma giusta: viaggia come metadato riservato.
        expect(barra).toContain('metadati[TALOS_METADATA_SCHERMO] = cornice')
    })

    it('⭐ il negozio della chat sfila il contesto PRIMA di salvare', () => {
        const chat = leggi('src/stores/chat.ts')

        expect(chat).toContain('delete metadatiPuliti[TALOS_METADATA_SCHERMO]')
        /*
         * ⛔ La riga che conta davvero: ciò che si persiste sono i metadati
         * PULITI. Se qualcuno rimettesse `metadata` qui, lo schermo tornerebbe
         * su disco — invisibile nella chat ma eterno nel database.
         */
        expect(chat).toContain('metadata: Object.freeze({ ...metadatiPuliti })')
        expect(chat).not.toMatch(/metadata:\s*Object\.freeze\(\{\s*\.\.\.metadata\s*\}\)/)
    })

    it('⭐ e lo applica SOLO all’ultimo turno che parte, non alla storia', () => {
        const chat = leggi('src/stores/chat.ts')

        // Deve toccare i turni costruiti per la richiesta, non gli scritti.
        expect(chat).toContain('if (schermoDiQuestoTurno) {')
        expect(chat).toMatch(/for \(let i = turns\.length - 1; i >= 0; i -= 1\)/)
        // ⛔ E deve fermarsi al primo turno utente trovato dal fondo: decorarne
        // più di uno vorrebbe dire raccontare al modello che lo schermo era
        // quello anche nei turni passati.
        expect(chat).toMatch(/turns\[i\] = \{ \.\.\.turns\[i\], content:[\s\S]*?\n\s*break/)
    })
})
