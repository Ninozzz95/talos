import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    readTalosImageProvenance,
    talosProvenanceLabel,
    TALOS_NO_PROVENANCE,
} from '@/lib/images/provenance'

/**
 * La fixture è un manifesto C2PA VERO — 29.030 byte firmati da OpenAI, presi
 * il 2026-08-04 da un'immagine generata dal dispositivo, non costruiti qui.
 *
 * Un manifesto inventato proverebbe che il lettore legge ciò che il lettore
 * scrive. Questo prova che legge ciò che arriva davvero, con dentro la catena
 * dei certificati, le risposte OCSP e l'icona SVG che ne fanno un file vero e
 * non uno schema.
 */
const MANIFESTO = Uint8Array.from(
    Buffer.from(readFileSync(new URL('../../fixtures/c2pa-manifest.b64', import.meta.url), 'ascii'), 'base64'),
)

/** Un PNG minimo che porta il chunk dato, come fa il file vero. */
function pngCon(tipo: string, contenuto: Uint8Array): Uint8Array {
    const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    const chunk = (nome: string, dati: Uint8Array): number[] => {
        const lunghezza = dati.length
        return [
            (lunghezza >>> 24) & 0xff, (lunghezza >>> 16) & 0xff,
            (lunghezza >>> 8) & 0xff, lunghezza & 0xff,
            ...[...nome].map((c) => c.charCodeAt(0)),
            ...dati,
            0, 0, 0, 0, // CRC: questo lettore non lo controlla
        ]
    }
    return Uint8Array.from([
        ...firma,
        ...chunk('IHDR', new Uint8Array(13)),
        ...chunk(tipo, contenuto),
        ...chunk('IEND', new Uint8Array(0)),
    ])
}

describe('cosa un’immagine dichiara di sé', () => {
    it('legge il manifesto VERO: chi lo ha fatto, con cosa, e che è di una macchina', () => {
        /**
         * I tre valori che contano, letti da byte veri. Il nome NON è
         * `dnamex`: nel CBOR il byte di lunghezza è una lettera stampabile, e
         * un lettore a caratteri riporterebbe proprio quello. È il difetto che
         * questo test esiste per tenere fuori.
         */
        const trovato = readTalosImageProvenance(pngCon('caBX', MANIFESTO))
        expect(trovato.hasCredentials).toBe(true)
        expect(trovato.generator).toBe('OpenAI Media Service API')
        expect(trovato.softwareAgent).toBe('gpt-image')
        expect(trovato.declaresAiGenerated).toBe(true)
    })

    it('«generata da IA» viene dal vocabolario IPTC, non dal nome del modello', () => {
        // Il regolamento europeo rimanda a quel vocabolario. Indovinarlo dal
        // nome del modello vorrebbe dire sbagliare su ogni modello nuovo.
        const senzaMarcatore = new TextEncoder().encode('kc2pa.claim.v2')
        const trovato = readTalosImageProvenance(pngCon('caBX', senzaMarcatore))
        expect(trovato.hasCredentials).toBe(true)
        expect(trovato.declaresAiGenerated).toBe(false)
    })

    it('una foto senza credenziali non dichiara NIENTE', () => {
        // Il caso normale: una foto scattata col telefono. Deve restare muta,
        // non «forse».
        expect(readTalosImageProvenance(pngCon('tEXt', new Uint8Array(40))))
            .toEqual(TALOS_NO_PROVENANCE)
    })

    it('la sigla `caBX` nei dati compressi non è un manifesto', () => {
        /**
         * Si cammina la catena dei chunk invece di cercare la sigla nei byte.
         * Quelle quattro lettere possono capitare per caso dentro un IDAT, e un
         * falso positivo direbbe a una persona che la SUA foto è stata fatta da
         * una macchina.
         */
        const esca = Uint8Array.from([
            ...new TextEncoder().encode('caBX'),
            ...MANIFESTO,
        ])
        expect(readTalosImageProvenance(pngCon('IDAT', esca)))
            .toEqual(TALOS_NO_PROVENANCE)
    })

    it('non lancia mai: un file rotto è «non so», non un’immagine che sparisce', () => {
        for (const rotto of [
            new Uint8Array(0),
            new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
            Uint8Array.from([...pngCon('caBX', MANIFESTO)].slice(0, 300)),
            new Uint8Array([0xff, 0xd8, 0xff, 0xeb, 0x00]),
        ]) {
            expect(() => readTalosImageProvenance(rotto)).not.toThrow()
            expect(readTalosImageProvenance(rotto).declaresAiGenerated).toBe(false)
        }
    })
})

describe('il nome che si mostra a una persona', () => {
    it('«OpenAI Media Service API» si legge come gergo: diventa «OpenAI»', () => {
        const vera = readTalosImageProvenance(pngCon('caBX', MANIFESTO))
        expect(talosProvenanceLabel(vera)).toBe('OpenAI')
    })

    it('un produttore che non conosciamo tiene il suo nome, non ne riceve uno inventato', () => {
        expect(talosProvenanceLabel({
            hasCredentials: true,
            generator: 'Qualcuno Media Service',
            softwareAgent: null,
            declaresAiGenerated: true,
        })).toBe('Qualcuno')
    })

    it('senza credenziali non c’è etichetta da mostrare', () => {
        expect(talosProvenanceLabel(TALOS_NO_PROVENANCE)).toBeNull()
    })
})
