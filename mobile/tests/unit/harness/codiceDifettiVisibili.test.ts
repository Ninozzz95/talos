import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'

/*
 * ⭐⭐ P4-sexies #1 (02/10/2026, prova P4-quater sul Pad): l'elenco delle sessioni del Codice mostrava la chiave grezza
 * «HARNESS.GROUPS.LAST7» come titolo di gruppo. `HarnessScreen.vue:170` traduce `harness.groups.${bucket}` con i bucket di
 * `chatDateBuckets.ts` (today, yesterday, last7, last30, older, undated); il catalogo aveva `week` e `last30`. Stessa forma
 * del «HARNESS.GROUPS.LAST30» del 12/09, curato allora solo per quella chiave: qui TUTTI i bucket, in entrambe le lingue.
 * Il difetto è quello che passa inosservato nei test se non si controlla ogni bucket: lo si controlla sul codice che li
 * produce, non su un elenco scritto a mano.
 */
const sorgenteBucket = readFileSync(resolve(process.cwd(), 'src/lib/chat/chatDateBuckets.ts'), 'utf8')
const bucket = /export type TalosChatBucket =([\s\S]*?)\n\nexport/.exec(sorgenteBucket)![1]!
    .match(/'([a-z0-9]+)'/g)!.map((voce) => voce.replace(/'/g, ''))

describe('P4-sexies #1 — ogni gruppo dell\'elenco del Codice ha il suo titolo, mai la chiave grezza', () => {
    it('SEXIES-01 i bucket letti dal codice sono quelli attesi (la prova non gira a vuoto)', () => {
        expect(bucket).toEqual(expect.arrayContaining(['today', 'yesterday', 'last7', 'last30', 'older', 'undated']))
    })

    it.each([['it', TALOS_IT_MESSAGES], ['en', TALOS_EN_MESSAGES]])('SEXIES-02 %s: harness.groups ha una parola per ogni bucket', (_lingua, messaggi) => {
        const gruppi = (messaggi as unknown as { harness: { groups: Record<string, string> } }).harness.groups
        for (const nome of bucket) {
            expect(gruppi[nome], `harness.groups.${nome}`).toBeTypeOf('string')
            expect(gruppi[nome]!.length, `harness.groups.${nome}`).toBeGreaterThan(2)
            expect(gruppi[nome], `harness.groups.${nome} non deve essere la chiave stessa`).not.toMatch(/^harness\./i)
        }
    })
})
