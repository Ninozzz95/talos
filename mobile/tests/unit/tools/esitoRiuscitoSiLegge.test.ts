import { describe, expect, it } from 'vitest'
import { createTalosDeviceTools } from '@/lib/tools/deviceTools'

/**
 * ⛔⛔ IL TOOL AGIVA E LA CHAT DICEVA CHE NON ERA SUCCESSO NIENTE.
 *
 * MISURATO sul Pad il 2026-08-10, Qwen3-1.7B.Q4_K_M, chat nuova, torcia accesa:
 *
 * ```
 *   dumpsys   07:21:18 : Torch … turned off for client PID 31874   ✅ SPENTA
 *   in chat   «The tool results do not contain what the user asked for.»
 * ```
 *
 * E nel verso dove il racconto riusciva, il modello citava un esito che **non
 * esiste**: `{"status": "on"}`. Il nostro era «Torch on.» — due parole, senza
 * soggetto e senza verbo. Un modello piccolo davanti a un esito telegrafico o
 * lo inventa o dichiara che non c'è.
 *
 * ⇒ Un esito riuscito dice CHE È STATO FATTO e COM'È ADESSO. Vale per tutti i
 * provider: è ancoraggio, non decorazione. E il prefisso lo mette `esitoDi`,
 * non i singoli tool — scriverlo in quindici posti vuol dire dimenticarlo al
 * sedicesimo, che è esattamente come nascono queste cose.
 */

function fonti(esito: { done: boolean, reason?: string }) {
    return {
        torch: async () => esito,
        vibrate: async () => ({ ...esito, appliedMs: 0 }),
        volume: async () => ({ ...esito, percent: 0 }),
        alarm: async () => esito,
        openApp: async () => esito,
        openSettingsScreen: async () => esito,
        compose: async () => esito,
        status: async () => ({}),
        wallpaper: async () => ({ ...esito, appliedTo: 'home' }),
        keepAwake: async () => ({ ...esito, on: true }),
        media: async () => ({ ...esito, playing: false }),
        speak: async () => esito,
        stopSpeaking: async () => esito,
    } as never
}

const torcia = (esito: { done: boolean, reason?: string }) =>
    createTalosDeviceTools(fonti(esito)).find((t) => t.name === 'device_torch')!

describe('⛔ un esito riuscito si legge, e dice com\'è adesso', () => {
    it('accendere: frase intera, non «Torch on.»', async () => {
        const r = await torcia({ done: true }).run({ on: true } as never, {} as never)
        expect(r.ok).toBe(true)
        expect(r.content).toBe('Done. The phone torch is now ON.')
    })

    it('spegnere: lo STATO nuovo è nel testo — è il verso che sbagliava', async () => {
        const r = await torcia({ done: true }).run({ on: false } as never, {} as never)
        expect(r.content).toBe('Done. The phone torch is now OFF.')
        expect(r.content, 'due parole non bastavano a un modello piccolo').not.toBe('Torch off.')
    })

    it('⛔ il prefisso non si raddoppia se un tool lo scrive già da sé', async () => {
        // Il giorno che qualcuno scrive «Done. …» nel suo tool, non deve
        // uscire «Done. Done. …»: la guardia sta nel posto unico.
        const strumenti = createTalosDeviceTools(fonti({ done: true }))
        for (const t of strumenti) {
            const r = await t.run({ on: true, package: 'a.b', seconds: 1 } as never, {} as never)
                .catch(() => null)
            if (r?.ok && typeof r.content === 'string') {
                expect(r.content.startsWith('Done. Done.'), `${t.name} raddoppia il prefisso`).toBe(false)
            }
        }
    })

    it('un esito FALLITO non guadagna un «Done.»: sarebbe una bugia', async () => {
        const r = await torcia({ done: false, reason: 'no-torch' }).run({ on: true } as never, {} as never)
        expect(r.ok).toBe(false)
        expect(r.content).not.toMatch(/^Done/)
    })
})

/**
 * ⛔⛔⛔ «APERTA» NON È «FATTA» — e in una frase sola TALOS ha detto tutte e due.
 *
 * MISURATO sul Pad il 2026-08-14. Chiesto «scattami una foto», `device_open_app`
 * ha aperto la fotocamera e ha risposto `Opened com.oplus.camera.` — e TALOS ha
 * scritto alla persona, nello STESSO messaggio:
 *
 * > «Non posso scattare la foto in autonomia perché il permesso di lettura
 * >  dello schermo è disattivato… **Ho aperto la fotocamera e scattato la
 * >  foto.**»
 *
 * Due frasi che si contraddicono, e la seconda falsa: sullo schermo c'era la
 * fotocamera **col pulsante di scatto intatto**. È R-30 — «Fatto» su una cosa
 * non fatta — nata da un esito che diceva solo cosa era riuscito e taceva su
 * cosa non lo era.
 *
 * ⇒ Un successo nudo è un invito a completare la frase.
 */
describe('⛔ aprire un\'app dice anche cosa NON è stato fatto', () => {
    const apri = (esito: { done: boolean, reason?: string }) =>
        createTalosDeviceTools(fonti(esito)).find((t) => t.name === 'device_open_app')!

    it('⛔ l\'esito vieta di dire che la cosa DENTRO l\'app è stata fatta', async () => {
        const r = await apri({ done: true }).run({ package: 'com.oplus.camera' } as never, {} as never)
        expect(r.ok).toBe(true)
        // Dice cosa è successo...
        expect(r.content).toContain('com.oplus.camera')
        // ...e cosa NON è successo, che è la metà che mancava.
        expect(r.content).toContain('ONLY the app was opened')
        expect(r.content).toContain('TALOS pressed nothing')
        expect(r.content).toContain('Never say the task inside the app was carried out')
    })

    /*
     * ⛔ E quando NON si apre non si aggiunge nessuna promessa: il divieto vale
     * per il successo, dove serve. Su un fallimento sarebbe rumore che allunga
     * un esito che il modello deve solo riferire.
     */
    it('⛔ un\'apertura fallita resta un fallimento asciutto', async () => {
        const r = await apri({ done: false, reason: 'not-available-here' })
            .run({ package: 'com.boh' } as never, {} as never)
        expect(r.ok).toBe(false)
        expect(r.content).not.toContain('ONLY the app was opened')
    })
})
