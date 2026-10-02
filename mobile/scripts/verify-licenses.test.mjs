import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { licenseVerdict, verifyLicenses } from './verify-licenses.mjs'

/**
 * ⛔ PKLA Qualcomm 3.6 (owner, 01/10/2026): niente codice GPL/LGPL/AGPL nell'app
 * accanto ai binari NPU. Un pacchetto «MIT OR GPL» si usa come MIT; un
 * pacchetto di cui non sappiamo la licenza ferma la build finché qualcuno non
 * la verifica a mano.
 */
describe('verify-licenses — la regola', () => {
    it('LIC-01 le permissive passano', () => {
        for (const l of ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'MIT*']) {
            assert.equal(licenseVerdict(l).ok, true, l)
        }
    })

    it('LIC-02 GPL, LGPL e AGPL da sole fermano la build', () => {
        for (const l of ['GPL-3.0', 'GPL-2.0-only', 'LGPL-2.1', 'AGPL-3.0-or-later', '(GPL-2.0 AND MIT)']) {
            assert.equal(licenseVerdict(l).ok, false, l)
        }
    })

    it('LIC-03 con una scelta permissiva si usa quella', () => {
        assert.deepEqual(licenseVerdict('(MIT OR GPL-3.0-or-later)'), { ok: true, chosen: 'MIT' })
        assert.deepEqual(licenseVerdict('(MPL-2.0 OR Apache-2.0)'), { ok: true, chosen: 'Apache-2.0' })
    })

    it('LIC-04 sconosciuta o non dichiarata ferma la build', () => {
        assert.equal(licenseVerdict('UNKNOWN').ok, false)
        assert.equal(licenseVerdict('Custom: https://example.com').ok, false)
    })

    it('LIC-05 una verifica a mano registrata vale solo per quella versione', () => {
        const rivisti = { 'vaul-vue@0.4.1': { license: 'MIT', note: 'repo MIT' } }
        const esito = verifyLicenses({
            'vaul-vue@0.4.1': { licenses: 'UNKNOWN' },
            'vaul-vue@0.5.0': { licenses: 'UNKNOWN' },
            'jszip@3.10.1': { licenses: '(MIT OR GPL-3.0-or-later)' },
        }, rivisti)
        assert.equal(esito.verdict, 'FAIL')
        assert.deepEqual(esito.issues.map((i) => i.package), ['vaul-vue@0.5.0'])
        assert.equal(esito.packages.find((p) => p.package === 'jszip@3.10.1').license, 'MIT')
    })

    it('LIC-06 i nostri pacchetti privati non sono dipendenze di terzi', () => {
        const esito = verifyLicenses({ '@talos-mobile/contracts@0.1.0': { licenses: 'UNLICENSED', private: true } }, {})
        assert.equal(esito.verdict, 'PASS')
        assert.equal(esito.packages.length, 0)
    })
})
