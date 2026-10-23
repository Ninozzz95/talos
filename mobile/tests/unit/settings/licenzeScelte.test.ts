import { describe, expect, it } from 'vitest'

import { talosLicenzeDellaLibreria } from '@/lib/legal/licenzeScelte'

/**
 * ⛔ Owner 20/10/2026: JNA (il ponte di iroh, controllo remoto) è «LGPL-2.1-or-later OR Apache-2.0» a scelta di chi la usa, e
 * la usiamo come Apache-2.0 (PKLA Qualcomm 3.6: niente LGPL accanto ai binari NPU). AboutLibraries unisce le licenze dichiarate
 * e non ne toglie: la scelta si mostra nelle Note legali, con le licenze offerte accanto.
 */
const licenze = {
    'LGPL-2.1-or-later': { name: 'LGPL-2.1-or-later' },
    'Apache-2.0': { name: 'Apache License 2.0' },
    MIT: { name: 'MIT License' },
}
const scelta = (licenza: string, offerte: string) => `${licenza} (${offerte})`

describe('le licenze di una libreria Android nelle Note legali', () => {
    it('LIC-01 JNA: la licenza scelta, e le offerte dette per intero', () => {
        expect(talosLicenzeDellaLibreria('net.java.dev.jna:jna', ['LGPL-2.1-or-later', 'Apache-2.0'], licenze, scelta))
            .toBe('Apache License 2.0 (LGPL-2.1-or-later, Apache License 2.0)')
    })

    it('LIC-02 una libreria senza scelta resta come la scrive il plugin', () => {
        expect(talosLicenzeDellaLibreria('org.example:x', ['MIT', 'Apache-2.0'], licenze, scelta)).toBe('MIT License, Apache License 2.0')
    })

    it('LIC-03 se JNA smette di offrire Apache-2.0, la scelta non si inventa: si mostra quello che dichiara', () => {
        expect(talosLicenzeDellaLibreria('net.java.dev.jna:jna', ['LGPL-2.1-or-later', 'MIT'], licenze, scelta))
            .toBe('LGPL-2.1-or-later, MIT License')
    })

    it('LIC-04 se JNA dichiara la sola Apache-2.0, non resta una scelta da raccontare', () => {
        expect(talosLicenzeDellaLibreria('net.java.dev.jna:jna', ['Apache-2.0'], licenze, scelta)).toBe('Apache License 2.0')
    })
})
