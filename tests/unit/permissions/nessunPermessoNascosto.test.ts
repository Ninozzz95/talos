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
 *
 * ## ⛔⛔ E il nome è INTERO, non solo la coda dopo `android.permission.`
 *
 * MISURATO sul Pad il 2026-08-14: `com.google.android.gm.permission.READ_CONTENT_PROVIDER`
 * — il contatore di Gmail — risponde `prot=dangerous` a
 * `dumpsys package permission`. Cioè un permesso **pericoloso che Android non
 * definisce**: lo definisce un'altra app, si chiede con lo stesso dialogo, si
 * revoca dalla stessa pagina.
 *
 * Questa guardia leggeva solo i nomi che cominciano per `android.permission.`:
 * un permesso pericoloso di un'altra app le passava sotto il naso. Adesso il
 * nome si scrive per intero, e la stessa riga copre tutti e due i casi.
 */
const MANIFEST = resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml')

/** Nome INTERO del permesso → id della riga che lo deve spiegare. */
const ATTESI: Readonly<Record<string, string>> = {
    'android.permission.RECORD_AUDIO': 'microphone',
    'android.permission.POST_NOTIFICATIONS': 'notifications',
    'android.permission.READ_CONTACTS': 'contacts',
    'android.permission.CAMERA': 'camera',
    /*
     * ⭐ 2026-08-14: il calendario. Nasce da un difetto misurato — «che impegni
     * ho domani?» e TALOS rispondeva dalle PROPRIE note, cioè una risposta
     * sicura e falsa sulla giornata di una persona.
     */
    'android.permission.READ_CALENDAR': 'calendar',
    /*
     * ⭐ 2026-08-15: la POSIZIONE. Nasce da un difetto misurato — «ho chiesto
     * che ristorante mi consigli per cenare stasera e lui mi ha dato una
     * posizione completamente diversa». Il permesso non era dimenticato: era
     * RIMOSSO dal manifest con `tools:node="remove"`, ereditato da una libreria
     * e tolto di proposito quando TALOS non lo usava. Adesso lo usa, e quindi lo
     * chiede di proposito.
     *
     * ⛔ FINE e COARSE sulla STESSA riga, per la stessa regola del calendario:
     * le righe si raggruppano per SCOPO. Per una persona «dove sono» e' una cosa
     * sola; che Android ne faccia due permessi (preciso e approssimativo) e' un
     * dettaglio suo, e chiederli entrambi e' cio' che le lascia la scelta fra i
     * due nel dialogo di sistema.
     */
    'android.permission.ACCESS_FINE_LOCATION': 'location',
    'android.permission.ACCESS_COARSE_LOCATION': 'location',
    /*
     * ⭐ 2026-08-14, la SCRITTURA. Stessa riga della lettura, e non e' pigrizia:
     * le righe si raggruppano per SCOPO, mai per `Manifest.permission` — per
     * una persona «il mio calendario» e' una cosa sola. Sono due permessi e due
     * dialoghi, ma un solo posto dove leggere cosa TALOS fa con l'agenda.
     */
    'android.permission.WRITE_CALENDAR': 'calendar',
    /*
     * ⭐⭐ 2026-08-14, IL CONTATORE DI GMAIL — e non è di Android.
     *
     * Lo definisce Gmail, ed è `dangerous` (MISURATO: `dumpsys package
     * permission …` → `prot=dangerous`), quindi si chiede con un dialogo e si
     * revoca come gli altri. Dichiararlo solo nel manifest non basta: la prima
     * versione lo faceva e il provider rispondeva `SecurityException`.
     */
    'com.google.android.gm.permission.READ_CONTENT_PROVIDER': 'mailCount',
}

describe('⛔ nessun permesso pericoloso resta fuori dalla sua schermata', () => {
    it('ogni permesso PERICOLOSO del manifest ha la sua riga spiegata', () => {
        const manifest = readFileSync(MANIFEST, 'utf8')
        // ⛔ Qualunque nome, non solo `android.permission.*`: un permesso
        // pericoloso definito da un'altra app è pericoloso uguale.
        const dichiarati = [...manifest.matchAll(/uses-permission android:name="([\w.]+)"([^>]*)>/g)]
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
            expect(manifest, `il manifest non chiede ${nome}`).toContain(`android:name="${nome}"`)
        }
    })

    it('ogni riga spiega il CONFINE, non «serve per funzionare»', () => {
        for (const riga of TALOS_PERMISSION_ROWS) {
            expect(riga.purpose.length).toBeGreaterThan(40)
            expect(riga.purpose.toLowerCase()).not.toContain('required for full')
        }
    })
})
