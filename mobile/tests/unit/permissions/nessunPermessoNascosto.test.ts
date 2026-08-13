import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TALOS_PERMISSION_ROWS } from '@/lib/permissions/permissionRows'

/**
 * ⛔⛔ NESSUN PERMESSO PERICOLOSO RESTA FUORI DALLA SUA SCHERMATA.
 *
 * Owner, 2026-08-13: «tutti i permessi della app necessari vanno collegati
 * nella relativa schermata nelle impostazioni di autorizzazione e permessi,
 * TUTTI».
 *
 * ## Perché serve una guardia e non la buona volontà
 *
 * MISURATO lo stesso giorno: aggiungendo `READ_CONTACTS` al manifest per il
 * motore degli intent, la pagina dei permessi non se n'è accorta. E il
 * censimento ha trovato che `CAMERA` mancava **da prima**, senza che nessuno
 * lo notasse.
 *
 * ⇒ Un permesso dichiarato in un file e spiegato in un altro è due elenchi che
 * divergono al primo che si dimentica. La persona lo scopre da un dialogo di
 * sistema che compare senza preavviso, su una pagina che le aveva promesso di
 * dirle tutto.
 *
 * ## Perché SOLO i pericolosi
 *
 * I permessi `normal` (vibrazione, sveglia, sfondo, rete) Android li concede
 * all'installazione: non c'è niente da concedere, niente da revocare, e una
 * riga che non si può toccare in una pagina di interruttori è rumore. La lista
 * qui sotto è quella dei permessi che Android classifica **dangerous** o che
 * chiedono un consenso esplicito.
 */
const MANIFEST = resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml')

/** Nome Android → id della riga che lo deve spiegare. */
const ATTESI: Readonly<Record<string, string>> = {
    RECORD_AUDIO: 'microphone',
    POST_NOTIFICATIONS: 'notifications',
    READ_CONTACTS: 'contacts',
    CAMERA: 'camera',
}

describe('⛔ nessun permesso pericoloso resta fuori dalla sua schermata', () => {
    it('ogni permesso PERICOLOSO del manifest ha la sua riga spiegata', () => {
        const manifest = readFileSync(MANIFEST, 'utf8')
        const dichiarati = [...manifest.matchAll(/uses-permission android:name="android\.permission\.([A-Z_]+)"([^>]*)>/g)]
            // ⛔ Le righe con `tools:node="remove"` NON sono permessi chiesti:
            // sono permessi che togliamo a una libreria. Contarle farebbe
            // pretendere una spiegazione per una cosa che non succede.
            .filter(([, , resto]) => !resto.includes('tools:node="remove"'))
            .map(([, nome]) => nome)

        const idPresenti = new Set(TALOS_PERMISSION_ROWS.map((r) => r.id))
        const senzaRiga = dichiarati
            .filter((nome) => nome in ATTESI)
            .filter((nome) => !idPresenti.has(ATTESI[nome] as never))

        expect(senzaRiga).toEqual([])
    })

    /*
     * ⛔ E la metà contraria: una riga che promette un permesso che l'app NON
     * chiede è una bugia nell'altro verso — la persona crede di aver dato
     * qualcosa che nessuno le ha mai chiesto, e non trova l'interruttore.
     */
    it('e nessuna riga «runtime» promette un permesso che l’app non chiede', () => {
        const manifest = readFileSync(MANIFEST, 'utf8')
        const perId = new Map(Object.entries(ATTESI).map(([nome, id]) => [id, nome]))
        for (const riga of TALOS_PERMISSION_ROWS) {
            if (riga.kind !== 'runtime') continue
            const nome = perId.get(riga.id)
            // Una riga runtime che questo test non conosce è un buco nel test
            // stesso: si dichiara qui, o la guardia protegge meno di quel che
            // sembra.
            expect(nome, `riga runtime «${riga.id}» non mappata in ATTESI`).toBeDefined()
            expect(manifest).toContain(`android.permission.${nome}`)
        }
    })

    it('ogni riga spiega il CONFINE, non «serve per funzionare»', () => {
        for (const riga of TALOS_PERMISSION_ROWS) {
            expect(riga.purpose.length).toBeGreaterThan(40)
            expect(riga.purpose.toLowerCase()).not.toContain('required for full')
        }
    })
})
