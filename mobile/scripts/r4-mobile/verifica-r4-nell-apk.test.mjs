import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { scriviUstar } from './archivio-r4.mjs'
import { ARCHIVIO_NELL_APK, PORTACHIAVI_NELL_APK, verificaR4NellApk } from './verifica-r4-nell-apk.mjs'

/**
 * ⛔ K4-E (ledger `LEDGER-K4E-R4-NELLA-RELEASE-2026-10-17.md`; owner 17/10 «r4 al posto, il vecchio come ripiego»): dopo la firma,
 * l'APK della release deve portare r4, e r4 al commit del tag (il pin è quello che il Desktop pubblica nello stesso commit).
 * Un'APK senza r4 aprirebbe il Codice vecchio a tutti in silenzio: il ripiego è per un guasto, non per una release sbagliata.
 */
const COMMIT = '9f8b5fae5aa1b2c3d4e5f60718293a4b5c6d7e8f'
function archivio(t, manifesto) {
    const radice = mkdtempSync(join(tmpdir(), 'r4-apk-'))
    t.after(() => rmSync(radice, { recursive: true, force: true }))
    const scrivi = (p, testo) => { mkdirSync(dirname(join(radice, p)), { recursive: true }); writeFileSync(join(radice, p), testo) }
    if (manifesto !== null) scrivi('manifesto-pacchetto-r4.json', JSON.stringify(manifesto))
    scrivi('harness-ui/server.mjs', 'export const server = 1\n')
    return scriviUstar(radice)
}
const buono = { schema: 'talos.mobile.kernel-r4-pacchetto.v1', commit: COMMIT, ptyAndroid: { sha256: 'a'.repeat(64) }, file: [{ percorso: 'harness-ui/server.mjs' }] }
const apk = (tar, elenco = [ARCHIVIO_NELL_APK, PORTACHIAVI_NELL_APK, 'classes.dex']) => ({ elenco, leggi: (nome) => (nome === ARCHIVIO_NELL_APK ? tar : Buffer.alloc(0)) })

describe('r4 nell\'APK della release (K4-E)', () => {
    it('VA-01 archivio e portachiavi, manifesto del pacchetto al commit del tag: va', (t) => {
        const esito = verificaR4NellApk({ ...apk(archivio(t, buono)), commit: COMMIT })
        assert.deepEqual(esito.errori, [])
        assert.equal(esito.ok, true)
        assert.equal(esito.manifesto.commit, COMMIT)
        // il commit del tag può arrivare anche abbreviato
        assert.equal(verificaR4NellApk({ ...apk(archivio(t, buono)), commit: COMMIT.slice(0, 9) }).ok, true)
    })

    it('VA-02 ogni mancanza si dice col suo perché', (t) => {
        const motivi = (x) => verificaR4NellApk(x).errori.join(' | ')
        assert.match(motivi({ ...apk(archivio(t, buono), ['classes.dex']), commit: COMMIT }), /manca assets\/talos-r4\/r4\.tar/u)
        assert.match(motivi({ ...apk(archivio(t, buono), [ARCHIVIO_NELL_APK]), commit: COMMIT }), /manca assets\/talos-r4\/portachiavi-android\.mjs/u)
        assert.match(motivi({ ...apk(archivio(t, buono)), commit: 'deadbeef1' }), /commit 9f8b5fae5aa1.* invece di deadbeef1/u)
        assert.match(motivi({ ...apk(archivio(t, null)), commit: COMMIT }), /il primo file dell'archivio non è manifesto-pacchetto-r4\.json/u)
        assert.match(motivi({ ...apk(archivio(t, { ...buono, schema: 'altro' })), commit: COMMIT }), /schema/u)
        assert.match(motivi({ ...apk(archivio(t, { ...buono, ptyAndroid: null })), commit: COMMIT }), /pty/u)
        assert.match(motivi({ ...apk(archivio(t, { ...buono, file: [] })), commit: COMMIT }), /server\.mjs/u)
        assert.equal(verificaR4NellApk({ ...apk(archivio(t, buono)), commit: '' }).ok, false, 'senza il commit atteso non si dice «va»')
    })
})
