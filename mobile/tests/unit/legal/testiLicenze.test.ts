import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_NATIVE_COMPONENTS } from '@/lib/legal/nativeComponents'
import {
    TALOS_ANDROID_LICENZE_SENZA_TESTO,
    talosTestoAndroid,
    talosTestoCrateRust,
    talosTestoNativo,
    type TalosLicenzeNative,
} from '@/lib/legal/testiLicenze'
import nativeLicenses from '@/generated/nativeLicenses.json'
import androidLicenses from '@/generated/androidLicenses.json'
import fonti from '../../../scripts/licenze-native/fonti.json'

/**
 * ⛔ N1 (25/10/2026) — MIT, BSD, Apache-2.0 e Zlib chiedono che il testo o l'avviso di copyright viaggi col binario. Prima le Note
 * legali davano il testo solo alle librerie npm: i componenti nativi e le librerie Android avevano nome, licenza e indirizzo.
 * Il cancello: ogni voce nativa e ogni libreria Android ha un testo non vuoto, oppure sta in un elenco esplicito col motivo;
 * nessuna voce senza testo passa in silenzio.
 */
const dati = nativeLicenses as unknown as TalosLicenzeNative
const about = androidLicenses as unknown as {
    libraries: Array<{ uniqueId: string, licenses?: string[] }>
    licenses: Record<string, { content?: string }>
}

/** Componenti nativi senza testo, col motivo. Vuoto: oggi ogni componente ha la sua copia upstream. */
const NATIVI_SENZA_TESTO: Readonly<Record<string, string>> = Object.freeze({})

const testo = (catalogo: unknown, chiave: string): unknown =>
    chiave.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), catalogo)
const frase = (catalogo: unknown, chiave: string) => typeof testo(catalogo, chiave) === 'string'

describe('i testi delle licenze nelle Note legali (N1)', () => {
    it('N1-LIC-01 ogni componente nativo ha il testo completo della sua licenza, o un motivo scritto', () => {
        const senza = TALOS_NATIVE_COMPONENTS
            .filter((voce) => !talosTestoNativo(voce.name, dati) && !NATIVI_SENZA_TESTO[voce.name])
            .map((voce) => voce.name)
        expect(senza).toEqual([])
    })

    it('N1-LIC-02 nessun testo orfano: ogni voce generata è un componente dell’elenco (un nome cambiato non perde il suo testo)', () => {
        const nomi = new Set(TALOS_NATIVE_COMPONENTS.map((voce) => voce.name))
        expect(Object.keys(dati.componenti).filter((nome) => !nomi.has(nome))).toEqual([])
        expect(Object.keys(NATIVI_SENZA_TESTO).filter((nome) => !nomi.has(nome))).toEqual([])
    })

    it('N1-LIC-03 iroh porta l’avviso «Copyright 2025 N0, INC.» e le licenze dei suoi crate Rust, tutte con testo', () => {
        expect(talosTestoNativo('iroh (iroh-ffi)', dati)).toContain('N0, INC.')
        expect(dati.rust.crates).toBeGreaterThan(0)
        expect(talosTestoCrateRust(dati)).not.toBeNull()
        // rustls, il crate che abbiamo aggiornato noi (`jniLibs/PROVENIENZA-IROH.md`), c'è con la versione della build
        expect(dati.rust.licenze.some((voce) => voce.crates.includes('rustls 0.23.46'))).toBe(true)
    })

    it('N1-LIC-04 ogni libreria Android ha un testo, o tutte le sue licenze sono nell’elenco esplicito delle condizioni senza testo', () => {
        const senza = about.libraries
            .filter((voce) => !talosTestoAndroid(voce.uniqueId, voce.licenses ?? [], about.licenses, dati))
            .filter((voce) => !(voce.licenses ?? []).length || (voce.licenses ?? []).some((k) => !TALOS_ANDROID_LICENZE_SENZA_TESTO[k]))
            .map((voce) => voce.uniqueId)
        expect(senza).toEqual([])
    })

    it('N1-LIC-05 l’elenco delle eccezioni Android non marcisce: ogni voce è usata, e solo da librerie che un testo non l’hanno', () => {
        for (const chiave of Object.keys(TALOS_ANDROID_LICENZE_SENZA_TESTO)) {
            const usate = about.libraries.filter((voce) => (voce.licenses ?? []).includes(chiave))
            expect(usate.length, chiave).toBeGreaterThan(0)
            expect(usate.filter((voce) => talosTestoAndroid(voce.uniqueId, voce.licenses ?? [], about.licenses, dati)).map((v) => v.uniqueId), chiave)
                .toEqual([])
        }
    })

    it('N1-LIC-06 le note dei componenti nativi sono chiavi del catalogo, in inglese E in italiano', () => {
        const chiavi = TALOS_NATIVE_COMPONENTS.flatMap((voce) => (voce.noteKey ? [voce.noteKey] : []))
        expect(chiavi.length).toBeGreaterThan(0)
        expect(chiavi.filter((k) => !frase(TALOS_EN_MESSAGES, k) || !frase(TALOS_IT_MESSAGES, k))).toEqual([])
    })
    it('N1-LIC-07 (N1-bis, MPL-2.0 §3.2a) ogni crate MPL ha il link al suo sorgente, generato dallo script, e il pannello lo mostra', () => {
        const mpl = dati.rust.licenze.filter((voce) => /MPL/u.test(voce.id))
        expect(mpl.length).toBeGreaterThan(0)
        for (const voce of mpl) {
            const attesi = voce.crates.map((crate) => {
                const [nome, versione] = crate.split(' ')
                return `https://crates.io/crates/${nome}/${versione}`
            })
            expect(voce.sorgenti ?? [], voce.crates.join(', ')).toEqual(attesi)
        }
        const testo = talosTestoCrateRust(dati, (indirizzo) => `SORGENTE ${indirizzo}`) ?? ''
        for (const indirizzo of mpl.flatMap((voce) => voce.sorgenti ?? [])) expect(testo).toContain(`SORGENTE ${indirizzo}`)
        // la frase del pannello, in inglese E in italiano
        expect(frase(TALOS_EN_MESSAGES, 'legal.sourceCode') && frase(TALOS_IT_MESSAGES, 'legal.sourceCode')).toBe(true)
    })

    it('N1-LIC-08 (N1-bis) un componente fissato a un commit, senza versione dichiarata, mostra il commit corto di fonti.json', () => {
        const commit = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([0-9a-f]{40})\//u
        const elenco = (fonti as unknown as { componenti: Record<string, Array<{ url?: string }>> }).componenti
        const fissati = TALOS_NATIVE_COMPONENTS.flatMap((voce) => {
            const sha = (elenco[voce.name] ?? []).map((f) => commit.exec(f.url ?? '')?.[1]).find(Boolean)
            return sha ? [{ nome: voce.name, versione: voce.version, attesa: sha.slice(0, 7) }] : []
        })
        expect(fissati.map((v) => v.nome).sort()).toEqual(['Classificatore della parola «TALOS»', 'SentencePiece', 'Silero VAD'])
        for (const voce of fissati) expect(voce.versione, voce.nome).toBe(voce.attesa)
    })

    it('N1-LIC-10 (N1-ter) LLVM senza versione unica ha la nota delle due firme di clang, ONNX Runtime ha la sua versione', () => {
        const llvm = TALOS_NATIVE_COMPONENTS.find((voce) => voce.name === 'LLVM libc++ / OpenMP')
        expect(llvm?.version).toBeNull()
        expect(llvm?.noteKey).toBe('legal.nativeNotes.llvm')
        for (const messaggi of [TALOS_EN_MESSAGES, TALOS_IT_MESSAGES]) {
            expect(testo(messaggi, 'legal.nativeNotes.llvm')).toMatch(/clang 21\.0\.0 \(llvm-project 5e96669\).*clang 19\.0\.0 \(97a699b\)/u)
        }
        expect(TALOS_NATIVE_COMPONENTS.find((voce) => voce.name === 'ONNX Runtime')?.version).toBe('1.29.0')
        const sp = TALOS_NATIVE_COMPONENTS.find((voce) => voce.name === 'SentencePiece')
        expect(sp?.noteKey).toBe('legal.nativeNotes.sentencePiece')
        expect(frase(TALOS_EN_MESSAGES, 'legal.nativeNotes.sentencePiece')).toBe(true)
        expect(frase(TALOS_IT_MESSAGES, 'legal.nativeNotes.sentencePiece')).toBe(true)
    })

    it('N1-LIC-09 (N1-bis) nomi ed etichette di licenza a schermo: chiavi del catalogo in en E it, o testo senza italiano', () => {
        const chiavi = TALOS_NATIVE_COMPONENTS.flatMap((voce) => [voce.nameKey, voce.licenseKey].filter((k): k is string => !!k))
        expect(chiavi.filter((k) => !frase(TALOS_EN_MESSAGES, k) || !frase(TALOS_IT_MESSAGES, k))).toEqual([])
        const italiano = /«|»|\b(?:della|delle|ed|da confermare|parola|pubblico|dominio|classificatore)\b|Public domain/iu
        const grezzi = TALOS_NATIVE_COMPONENTS.flatMap((voce) => [
            ...(voce.nameKey ? [] : [voce.name]),
            ...(voce.licenseKey ? [] : [voce.license]),
        ])
        expect(grezzi.filter((testo) => italiano.test(testo))).toEqual([])
    })

    /*
     * ⛔ REV6-N2 (25/10/2026) — N1-LIC-01…06 controllano che i testi CI SIANO; un `nativeLicenses.json` ritoccato a mano passava.
     * Qui ogni testo si rilegge: il suo sha256 si ricalcola e deve tornare con l'impronta del file E con quella di `fonti.json`.
     */
    const sha256 = (testo: string) => createHash('sha256').update(testo, 'utf8').digest('hex')
    type Fonte = { titolo: string, sha256: string | null, copre?: string[] }
    const fontiTipate = fonti as unknown as {
        componenti: Record<string, Fonte[]>
        android: { perLicenza: Record<string, Fonte>, perLibreria: Record<string, Fonte> }
        rust: { cargoAbout?: string, licenzeSha256?: string | null }
    }

    it('N1-LIC-11 (REV6-N2) ogni testo dei componenti nativi e delle librerie Android ha lo sha256 fissato in fonti.json', () => {
        const coppie: Array<[string, { titolo: string, sha256: string, testo: string }, Fonte | undefined]> = []
        for (const [nome, elenco] of Object.entries(dati.componenti)) {
            expect(elenco.length, nome).toBe(fontiTipate.componenti[nome]?.length)
            elenco.forEach((voce, i) => coppie.push([`${nome} / ${voce.titolo}`, voce, fontiTipate.componenti[nome]?.[i]]))
        }
        for (const gruppo of ['perLicenza', 'perLibreria'] as const) {
            expect(Object.keys(dati.android[gruppo]).sort(), gruppo).toEqual(Object.keys(fontiTipate.android[gruppo]).sort())
            for (const [chiave, voce] of Object.entries(dati.android[gruppo])) coppie.push([`android ${chiave}`, voce, fontiTipate.android[gruppo][chiave]])
        }
        expect(coppie.length).toBeGreaterThan(30)
        const storte = coppie
            .filter(([, voce, fonte]) => !fonte || fonte.titolo !== voce.titolo || sha256(voce.testo) !== voce.sha256 || voce.sha256 !== fonte.sha256)
            .map(([chi]) => chi)
        expect(storte).toEqual([])
    })

    it('N1-LIC-12 (REV6-N1/N2) i testi dei crate Rust hanno un’impronta in fonti.json, e la versione di cargo-about è quella fissata', () => {
        expect(fontiTipate.rust.licenzeSha256).toMatch(/^[0-9a-f]{64}$/u)
        expect(sha256(JSON.stringify(dati.rust.licenze))).toBe(fontiTipate.rust.licenzeSha256)
        expect(fontiTipate.rust.cargoAbout).toMatch(/^\d+\.\d+\.\d+$/u)
        expect(dati.rust.fonte).toContain(`cargo-about ${fontiTipate.rust.cargoAbout},`)
    })

    /*
     * ⛔ REV6, osservazione sulle librerie a più licenze — con un LICENSE proprio, il testo comune delle ALTRE licenze si saltava.
     * Sui dati veri (25/10/2026) erano due: `computer.iroh:iroh` (Apache-2.0 | MIT, LICENSE-MIT proprio: perdeva l'Apache-2.0) e
     * `androidx.camera:camera-core` (Apache-2.0 | BSD di libyuv, LICENSE di libyuv: perdeva l'Apache-2.0). Ora il testo proprio
     * dichiara in `fonti.json` quali licenze copre (`copre`), e solo quelle si saltano.
     */
    const testoDi = (id: string) => {
        const voce = about.libraries.find((l) => l.uniqueId === id)
        return talosTestoAndroid(id, voce?.licenses ?? [], about.licenses, dati) ?? ''
    }
    it('N1-LIC-13 iroh e camera-core mostrano il loro LICENSE E il testo di Apache-2.0', () => {
        const apache = dati.android.perLicenza['Apache-2.0'].testo.trim()
        for (const id of ['computer.iroh:iroh', 'androidx.camera:camera-core']) {
            expect(testoDi(id), id).toContain(dati.android.perLibreria[id].testo.trim())
            expect(testoDi(id), id).toContain(apache)
        }
    })

    it('N1-LIC-14 ogni libreria con un testo proprio ha il testo di OGNI sua licenza: coperta dal proprio, comune, o fra le eccezioni', () => {
        const mancanti: string[] = []
        let conPiuLicenze = 0
        for (const [id, propria] of Object.entries(dati.android.perLibreria)) {
            const chiavi = about.libraries.find((l) => l.uniqueId === id)?.licenses ?? []
            const copre = fontiTipate.android.perLibreria[id]?.copre ?? []
            expect(copre.length, `${id}: copre`).toBeGreaterThan(0)
            expect(copre.filter((k) => !chiavi.includes(k)), `${id}: copre una licenza che la libreria non ha`).toEqual([])
            expect(propria.copre ?? [], `${id}: copre nel JSON generato`).toEqual(copre)
            if (chiavi.length >= 2) conPiuLicenze++
            const testo = testoDi(id)
            for (const k of chiavi) {
                const comune = dati.android.perLicenza[k]?.testo.trim() ?? about.licenses[k]?.content?.trim()
                const ok = copre.includes(k) || (comune ? testo.includes(comune) : !!TALOS_ANDROID_LICENZE_SENZA_TESTO[k])
                if (!ok) mancanti.push(`${id} ${k}`)
            }
        }
        expect(conPiuLicenze).toBe(2)
        expect(mancanti).toEqual([])
    })
})
