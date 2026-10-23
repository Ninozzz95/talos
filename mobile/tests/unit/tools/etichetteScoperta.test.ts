import { describe, expect, it } from 'vitest'
import { TALOS_EN_MESSAGES as en } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES as it_ } from '@/i18n/locales/it'
import { TALOS_TOOL_LABEL_KEYS } from '@/lib/tools/toolLabels'
import { TALOS_ATTREZZI_DI_SOLA_SCOPERTA } from '@/lib/tools/azioneDichiarata'
import { TALOS_NOME_CERCA_ATTREZZI_DEL_PROTOCOLLO } from '@/lib/chat/localToolPromptProtocol'

/*
 * A0-5 (ledger `LEDGER-A0-ASSISTENTE-2026-10-21.md`): sul Pad, nelle riprese del 21/10, la riga dell'attrezzo diceva
 * «tool_search: set alarm 7 am» — il nome tecnico, perché gli attrezzi di scoperta non avevano una parola. Ogni riga a schermo è
 * una frase nelle due lingue.
 */
const valore = (messaggi: unknown, chiave: string): unknown =>
    chiave.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), messaggi)

describe('A0-5 gli attrezzi di scoperta hanno una parola', () => {
    // dall'elenco vero, non a mano: un attrezzo di scoperta nuovo senza parola fa fallire questo test (revisione avversaria)
    const nomi = new Set([...TALOS_ATTREZZI_DI_SOLA_SCOPERTA, TALOS_NOME_CERCA_ATTREZZI_DEL_PROTOCOLLO])
    it("l'elenco degli attrezzi di scoperta non è vuoto",() => expect(nomi.size).toBeGreaterThanOrEqual(2))
    for (const nome of nomi) {
        it(`${nome} ha una frase in inglese e in italiano, senza nomi tecnici`, () => {
            const chiave = TALOS_TOOL_LABEL_KEYS[nome]
            expect(chiave).toBeTruthy()
            const inglese = valore(en, chiave)
            const italiano = valore(it_, chiave)
            expect(typeof inglese).toBe('string')
            expect(typeof italiano).toBe('string')
            expect(inglese).not.toEqual(italiano)
            // niente nomi tecnici (`tool_search`, `tool_details`): il trattino basso è il segno che a schermo è finito un id
            for (const frase of [inglese, italiano] as string[]) expect(frase).not.toMatch(/_/)
        })
    }
})
