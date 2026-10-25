import { describe, expect, it } from 'vitest'

import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_NOMI_LICENZE, talosLicenzeDellaLibreria } from '@/lib/legal/licenzeScelte'
import androidLicenses from '@/generated/androidLicenses.json'

/**
 * ⛔ REV6, nomi delle licenze (25/10/2026) — AboutLibraries dà a certe licenze una chiave di 32 cifre esadecimali e un nome vuoto
 * o generico: le Note legali mostravano «45546b23f3f1354cdc022f8f8e4a7bb1» per sqlcipher e «License» per le quattro librerie
 * Ionic. Il nome visibile viene dal catalogo (en+it), per chiave di AboutLibraries; i nomi propri delle licenze restano quelli.
 */
const about = androidLicenses as unknown as {
    libraries: Array<{ uniqueId: string, licenses?: string[] }>
    licenses: Record<string, { name?: string }>
}

const leggi = (catalogo: unknown, chiave: string): unknown =>
    chiave.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), catalogo)

const etichetta = (catalogo: unknown, id: string, chiavi: readonly string[]) =>
    talosLicenzeDellaLibreria(id, chiavi, about.licenses, (licenza, offerte) => `${licenza} (${offerte})`,
        (chiave) => String(leggi(catalogo, chiave)))

describe('i nomi delle licenze nelle Note legali', () => {
    it('LIC-NOMI-01 nessuna libreria mostra una chiave grezza di 32 cifre o un «License» generico, in en e in it', () => {
        for (const catalogo of [TALOS_EN_MESSAGES, TALOS_IT_MESSAGES]) {
            const storte = about.libraries
                .map((l) => [l.uniqueId, etichetta(catalogo, l.uniqueId, l.licenses ?? [])] as const)
                .filter(([, testo]) => /\b[0-9a-f]{32}\b/u.test(testo) || testo.split(/[,()]\s*/u).some((parte) => parte.trim() === 'License'))
            expect(storte).toEqual([])
        }
    })

    it('LIC-NOMI-02 ogni nome del catalogo esiste in en e in it, e copre solo chiavi che le librerie usano', () => {
        const usate = new Set(about.libraries.flatMap((l) => l.licenses ?? []))
        for (const [chiave, frase] of Object.entries(TALOS_NOMI_LICENZE)) {
            expect(usate.has(chiave), chiave).toBe(true)
            expect(typeof leggi(TALOS_EN_MESSAGES, frase), `en ${frase}`).toBe('string')
            expect(typeof leggi(TALOS_IT_MESSAGES, frase), `it ${frase}`).toBe('string')
        }
    })

    it('LIC-NOMI-03 le librerie Ionic dicono MIT, sqlcipher e libyuv BSD-3-Clause', () => {
        const nome = (id: string) => etichetta(TALOS_IT_MESSAGES, id, about.libraries.find((l) => l.uniqueId === id)?.licenses ?? [])
        for (const id of ['io.ionic.libs:ioncamera-android', 'io.ionic.libs:ionfilesystem-android', 'io.ionic.libs:iongeolocation-android',
            'io.ionic.libs:ioninappbrowser-android']) expect(nome(id), id).toBe('MIT')
        expect(nome('net.zetetic:sqlcipher-android')).toBe('BSD-3-Clause')
        expect(nome('androidx.camera:camera-core')).toBe('The Apache License, Version 2.0, BSD-3-Clause')
    })
})
