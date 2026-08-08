/**
 * I nove tool del telefono arrivano davvero al modello — o non ci arrivano
 * affatto, e in nessun caso ci arrivano a metà.
 *
 * ## ⛔ Il difetto che questo test esiste per impedire
 *
 * Trovato il 2026-08-08 a lavoro «finito». I nove tool erano scritti, nel
 * catalogo, con la riga di sicurezza, l'icona, l'interruttore nelle
 * impostazioni e le frasi nelle due lingue. Il typecheck era pulito e 4.312
 * test passavano. E il modello **non li vedeva**, perché il toolset li offre
 * solo se qualcuno gli passa `deps.device` — e nessuno gliela passava.
 *
 * È il difetto peggiore della categoria: tutto ciò che si può vedere leggendo
 * il codice dice che la funzione c'è. L'unica cosa che manca è l'ultimo
 * centimetro, e nessun test lo guardava.
 *
 * ## E la seconda metà: quando NON ci sono
 *
 * Fuori da Android non c'è un telefono da toccare, e la risposta giusta non è
 * offrire nove tool che falliranno sempre: sono token spesi a ogni turno per
 * insegnare al modello che una capacità non funziona. Il gruppo sparisce
 * intero.
 */
import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { TALOS_DEFAULT_AGENT_TOOL_ENABLED } from '@/lib/tools/toolControls'
import { createTalosDeviceTools, type TalosDeviceToolSources } from '@/lib/tools/deviceTools'


const fonti = (): TalosDeviceToolSources => ({
    vibrate: vi.fn(async () => ({ done: true, appliedMs: 200 })),
    torch: vi.fn(async () => ({ done: true })),
    volume: vi.fn(async () => ({ done: true, percent: 31 })),
    alarm: vi.fn(async () => ({ done: true })),
    openApp: vi.fn(async () => ({ done: true })),
    openSettings: vi.fn(async () => ({ done: true })),
    compose: vi.fn(async () => ({ done: true })),
    status: vi.fn(async () => ({ batteryPercent: 82 })),
    speak: vi.fn(async () => ({ spoken: true })),
})

async function suite(device: (() => TalosDeviceToolSources | null) | undefined) {
    return createTalosToolset({
        repository: {} as never,
        readVaultFileText: vi.fn(async () => null),
        libraryAccess: () => 'allow',
        device,
    } as never)
}

/**
 * ⛔ I nomi vengono dalla FABBRICA, non dal gruppo del catalogo.
 *
 * All'inizio li prendevo dal gruppo `device`, ed era giusto finché quel gruppo
 * aveva una fonte sola. Poi è arrivato T2 — Wi-Fi, Bluetooth, Non disturbare —
 * che sta nello stesso gruppo (per chi legge le impostazioni è tutto «questo
 * telefono») ma ha una **fonte diversa**: il ponte privilegiato, che può non
 * esserci.
 *
 * Il test è caduto subito, ed era nel giusto: stava affermando che i tool
 * privilegiati arrivano da `deps.device`, che è falso. La lezione è che il
 * gruppo è una scelta di **presentazione** e la fabbrica è una scelta di
 * **architettura**, e un test non deve confonderle.
 */
const NOMI_DISPOSITIVO = createTalosDeviceTools(fonti()).map((tool) => tool.name)

const TUTTO_CONSENTITO = { read: 'allow', write: 'allow', outbound: 'allow' } as const

describe('i tool del telefono nel toolset', () => {
    it('DISPOSITIVO-01 con le fonti, tutti e nove arrivano al modello', async () => {
        const offerti = (await suite(() => fonti()))
            .offer(TUTTO_CONSENTITO, { ...TALOS_DEFAULT_AGENT_TOOL_ENABLED, ...Object.fromEntries(
                NOMI_DISPOSITIVO.map((nome) => [nome, true]),
            ) })
            .map((tool) => tool.name)

        expect(NOMI_DISPOSITIVO.length).toBeGreaterThan(0)
        for (const nome of NOMI_DISPOSITIVO) expect(offerti).toContain(nome)
    })

    it('DISPOSITIVO-02 senza le fonti nessuno dei nove viene offerto', async () => {
        // `undefined` — la dipendenza che nessuno passa. È ESATTAMENTE lo stato
        // in cui il codice si trovava a lavoro creduto finito.
        const senzaNiente = (await suite(undefined))
            .offer(TUTTO_CONSENTITO, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .map((tool) => tool.name)
        // E `null` — la dipendenza passata, ma fuori da Android.
        const fuoriDaAndroid = (await suite(() => null))
            .offer(TUTTO_CONSENTITO, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .map((tool) => tool.name)

        for (const nome of NOMI_DISPOSITIVO) {
            expect(senzaNiente).not.toContain(nome)
            expect(fuoriDaAndroid).not.toContain(nome)
        }
        /*
         * ⛔ E il resto del catalogo resta in piedi. Senza questa parte il test
         * passerebbe dicendo la cosa giusta per il motivo sbagliato: un
         * toolset che non offre NIENTE soddisfa «nessuno dei nove» alla
         * perfezione.
         *
         * Il confronto e' con lo stesso toolset ma CON le fonti, e la
         * differenza dev'essere esattamente il gruppo `device` — cioe' passare
         * la dipendenza non cambia nient'altro. Cosi' il numero non e' scritto
         * da nessuna parte e il decimo tool del telefono non richiedera' di
         * tornare qui.
         */
        expect(senzaNiente).toContain('library_list')
        const accesi = { ...TALOS_DEFAULT_AGENT_TOOL_ENABLED, ...Object.fromEntries(
            NOMI_DISPOSITIVO.map((nome) => [nome, true]),
        ) }
        const con = (await suite(() => fonti())).offer(TUTTO_CONSENTITO, accesi).map((t) => t.name)
        const senza = (await suite(undefined)).offer(TUTTO_CONSENTITO, accesi).map((t) => t.name)
        expect(con.filter((nome) => !senza.includes(nome as never)).sort())
            .toEqual([...NOMI_DISPOSITIVO].sort())
        expect(senza.filter((nome) => !con.includes(nome))).toEqual([])
    })

    it('DISPOSITIVO-03 l’interruttore spento vince sulle fonti presenti', async () => {
        const spenti = Object.fromEntries(NOMI_DISPOSITIVO.map((nome) => [nome, false]))
        const offerti = (await suite(() => fonti()))
            .offer(TUTTO_CONSENTITO, { ...TALOS_DEFAULT_AGENT_TOOL_ENABLED, ...spenti })
            .map((tool) => tool.name)

        for (const nome of NOMI_DISPOSITIVO) expect(offerti).not.toContain(nome)
    })
})
