import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * ⛔⛔ LA GUARDIA CHE RENDE IL DEBITO #47 INDELEBILE.
 *
 * ## Cosa sta succedendo
 *
 * Dentro l'APK di TALOS finiscono **56** file che non abbiamo scritto noi: il
 * programma `adb` di Termux e le 55 librerie che la sua chiusura transitiva
 * pretende — 46 delle quali sono Abseil, tirate dentro da `libprotobuf`. Uno di
 * essi **esegue comandi di shell sul telefono**, e tutti e 56 viaggiano sotto la
 * firma dell'owner.
 *
 * ## ⭐ Perché questo test guarda un DOCUMENTO e non dei byte
 *
 * Perché i byte li guarda già qualcun altro, e meglio: il compito Gradle
 * `preparaPonteAdb` scarica ogni pacchetto, ne verifica l'impronta, estrae i
 * file e **ricontrolla l'impronta di ciascuno** — a ogni singola compilazione.
 * Se domani Termux ripubblica qualcosa di diverso, il build si ferma lì.
 *
 * I binari infatti **nella repo non ci sono**, e non è una dimenticanza: dieci
 * megabyte di binari altrui in una repo pubblica non se ne vanno più, perché la
 * storia di git non si cancella. Restano la scheda e le impronte.
 *
 * ⇒ Qui si guarda ciò che il build non può guardare da sé: che la SCHEDA sia
 * intera, coerente e che dica ancora di essere un debito. Un manifesto che
 * perde le sue righe di avvertimento diventa un inventario neutro, e un
 * inventario neutro non lo sostituisce nessuno.
 */

const CARTELLA = new URL('../../../android/app/src/main/jniLibs/', import.meta.url)
const SCHEDA = fileURLToPath(new URL('PROVENIENZA.md', CARTELLA))
const TESTO = readFileSync(SCHEDA, 'utf8')

/** Le righe «file → pacchetto → byte → impronta». */
function fileDichiarati(): Map<string, { pacchetto: string, impronta: string }> {
    const dichiarati = new Map<string, { pacchetto: string, impronta: string }>()
    for (const riga of TESTO.split('\n')) {
        const t = /^\|\s*`(\S+\.so)`\s*\|\s*(\S+)[^|]*\|[^|]*\|\s*`([0-9a-f]{64})`\s*\|$/
            .exec(riga.trim())
        if (t) dichiarati.set(t[1], { pacchetto: t[2], impronta: t[3] })
    }
    if (dichiarati.size === 0) {
        throw new Error(
            'PROVENIENZA.md non ha prodotto nemmeno una riga di file: la tabella è cambiata e '
            + 'questa lettura non la riconosce più. Non è una scheda vuota — ed è la stessa '
            + 'espressione che usa il compito Gradle, quindi se qui non legge, il build si ferma.',
        )
    }
    return dichiarati
}

/** Le righe «pacchetto → .deb → impronta». */
function pacchettiDichiarati(): Map<string, { url: string, impronta: string }> {
    const dichiarati = new Map<string, { url: string, impronta: string }>()
    for (const riga of TESTO.split('\n')) {
        const t = /^\|\s*(\S+)\s*\|\s*\[[^\]]+\]\((\S+)\)\s*\|\s*`([0-9a-f]{64})`\s*\|$/
            .exec(riga.trim())
        if (t) dichiarati.set(t[1], { url: t[2], impronta: t[3] })
    }
    return dichiarati
}

describe('provenienza dei binari del ponte ADB', () => {
    it('il numero dei binari di terzi è quello dichiarato, e non un altro', () => {
        // ⛔ 56, e il numero sta scritto qui apposta.
        //
        // `adb` dichiara sette librerie non di sistema. Ma quelle hanno le
        // proprie, e `libprotobuf` da sola ne tira dentro quarantasei di
        // Abseil. Io stesso l'ho misurato male la prima volta — un tetto di
        // trenta giri nel mio script tagliava la chiusura a 25 file, e il conto
        // sembrava metà di quello vero.
        //
        // ⇒ Se questo numero cambia, qualcuno ha aggiunto o tolto un binario di
        // terzi dall'APK dell'owner. Va VISTO, non passato.
        expect(fileDichiarati().size).toBe(56)
    })

    it('ogni file nomina un pacchetto che ha la sua riga fra i .deb', () => {
        // ⭐ È il legame che il build percorre davvero: dal file al pacchetto,
        // dal pacchetto all'URL da scaricare. Un file che nomina un pacchetto
        // assente fa fallire il build a metà scaricamento, con un errore che
        // non assomiglia alla causa.
        const pacchetti = pacchettiDichiarati()
        const orfani = [...fileDichiarati().values()]
            .map((f) => f.pacchetto)
            .filter((p) => !pacchetti.has(p))
        expect([...new Set(orfani)]).toEqual([])
        expect(pacchetti.size).toBe(8)
    })

    it('gli URL puntano tutti al deposito Termux, e nessun altrove', () => {
        for (const [pacchetto, riga] of pacchettiDichiarati()) {
            expect(riga.url, pacchetto).toMatch(/^https:\/\/packages\.termux\.dev\/apt\/termux-main\//)
        }
    })

    it('nessuna impronta è ripetuta: due file identici sarebbero un errore di copia', () => {
        const impronte = [...fileDichiarati().values()].map((f) => f.impronta)
        expect(new Set(impronte).size).toBe(impronte.length)
    })

    it('i tre nomi cambiati sono dichiarati, perché senza di loro il ponte non parte', () => {
        // Android estrae solo `lib*.so`; il caricatore però cerca i nomi veri.
        // Il divario lo colmano i collegamenti creati da TalosPonteAdb, e la
        // tabella qui è ciò che li tiene allineati al confezionamento.
        for (const coppia of ['`adb` | `libadb.so`', '`libz.so.1` | `libz.so`', '`libzstd.so.1` | `libzstd.so`']) {
            expect(TESTO).toContain(coppia)
        }
    })

    it('la scheda dice a chiare lettere che è un debito, e nomina il compito', () => {
        expect(TESTO).toContain('NON LI ABBIAMO SCRITTI NOI')
        expect(TESTO).toContain('#47')
        expect(TESTO).toContain('prima di\n> qualunque rilascio pubblico')
    })

    it('la scheda misurata è quella dentro android/, non un\'altra', () => {
        // Un test che legge il file sbagliato passa sempre. Si ancora.
        expect(SCHEDA.replace(/\\/g, '/')).toContain('/android/app/src/main/jniLibs/')
    })
})
