import { describe, expect, it } from 'vitest'
import { talosRifiutoPerCrediti, talosTettoDaiCrediti } from '@/lib/chat/tettoDaiCrediti'

/**
 * ⛔⛔ «You requested up to 65536 tokens» — e non li avevamo chiesti noi.
 *
 * Owner 2026-08-10, screenshot dal telefono. Il corpo che TALOS manda a
 * OpenRouter NON contiene `max_tokens` (misurato leggendo il costruttore): è
 * lui che, in assenza del campo, riserva il massimo di output del modello
 * contro il credito.
 *
 * ⇒ Il numero giusto non si sceglie: lo dice il rifiuto. Questi casi usano il
 * TESTO VERO, e se qualcuno un giorno "semplificasse" il riconoscimento la
 * prima riga torna rossa con la frase dell'owner dentro.
 */
const RIFIUTO_VERO = 'This request requires more credits, or fewer max_tokens. '
    + 'You requested up to 65536 tokens, but can only afford 65050. '
    + 'To increase, visit https://openrouter.ai/settings/credits and add more credits'

describe('⛔ il tetto lo dice il rifiuto, non lo inventiamo noi', () => {
    it('il caso dell\'owner: 65.050 diventano 63.749 col margine', () => {
        // 2% di margine: fra il rifiuto e il secondo tentativo il credito può
        // essere sceso, e riprovare con la cifra esatta rischia un secondo 402.
        expect(talosTettoDaiCrediti(RIFIUTO_VERO)).toBe(63_749)
        expect(talosRifiutoPerCrediti(RIFIUTO_VERO)).toBe(true)
    })

    it('e regge le forme che i gateway scrivono diverse', () => {
        expect(talosTettoDaiCrediti('fewer max_tokens … can only afford 2')).toBe(1)
        expect(talosTettoDaiCrediti('max_tokens: you can only afford 1,024 now')).toBe(1003)
        expect(talosTettoDaiCrediti('MAX_TOKENS — CAN ONLY AFFORD 400')).toBe(392)
    })

    it('⛔ e NON scatta su un errore qualunque che contiene un numero', () => {
        /*
         * Un ripiego che scatta sul messaggio sbagliato imporrebbe un tetto a
         * caso a una richiesta sana: per questo servono ENTRAMBI i segni.
         */
        expect(talosTettoDaiCrediti('stream HTTP 500: upstream timeout after 30000 ms')).toBeNull()
        expect(talosTettoDaiCrediti('rate limit: you can only afford 3 requests per minute')).toBeNull()
        expect(talosTettoDaiCrediti('max_tokens must be a positive integer')).toBeNull()
        expect(talosTettoDaiCrediti('')).toBeNull()
        expect(talosRifiutoPerCrediti('stream HTTP 402: quota exhausted')).toBe(false)
    })

    it('⛔ e non torna mai zero o un negativo: un tetto a zero è una risposta vuota', () => {
        expect(talosTettoDaiCrediti('max_tokens … can only afford 0')).toBeNull()
        expect(talosTettoDaiCrediti('max_tokens … can only afford 1')).toBe(1)
    })
})
