import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CAUSE_R4, confrontaAtteseR4, esitiDaTabellaR4, leggiTapR4, proponiAtteseR4, validaAtteseR4 } from './confronta-attese-r4.mjs'

/**
 * ⛔ K4-A (ledger `LEDGER-K4-CANCELLO-PROVE-R4-2026-10-17.md`; owner 14/10 «elenco scritto nel mobile»): il cancello delle prove di r4
 * sul Pad. Si fanno girare TUTTE le prove e si confronta con un elenco scritto, come le aspettative di web-platform-tests e
 * `xfail(strict=True)` di pytest: un problema è ogni esito che differisce da quello scritto, anche una riga che adesso passa.
 * La fixture è un TAP VERO del terzo giro di K0 sul Pad (`bc57-prova-senza-suite`: 15 foglie in 2 genitori, 2 rosse).
 */
const TAP = readFileSync(new URL('./fixtures/tap-k0-bc57.tap', import.meta.url), 'utf8')
const FILE = 'tests/bc57-prova-senza-suite.test.mjs'
const GENITORE_1 = 'BC-57 — `prova` senza una suite da lanciare'
const ROSSA_1 = `${GENITORE_1} > ⛔⛔⛔ B1 — MONOREPO: da una sottocartella vuota la suite del GENITORE si esegue, non si rifiuta`
const ROSSA_2 = 'F-017 residuo — «exit 0» con ZERO test eseguiti NON è un pass > ⛔ «0 passing» di Mocha con uscita 0 (mochajs/mocha #4062): la CI muta diventa loud'
const CAUSE = { 'npm-assente': 'npm non c\'è sul telefono', 'windows-nella-prova': 'la prova scrive un percorso Windows' }
const attese = (voci) => ({ schema: 'talos.mobile.attese-r4.v1', pin: '701c6c0d2', cause: CAUSE, voci })
const esito = (tap = TAP, extra = {}) => ({ file: FILE, codice: 1, scaduto: false, tap, ...extra })

describe('il cancello delle prove di r4 sul Pad (K4-A)', () => {
    it('KA-01 dal TAP vero: solo le foglie, col nome dei genitori, e i conti che il runner dichiara', () => {
        const letto = leggiTapR4(TAP)
        assert.equal(letto.completo, true)
        assert.equal(letto.prove.length, 15)
        assert.deepEqual(letto.prove.filter((p) => p.esito === 'fail').map((p) => p.nome), [ROSSA_1, ROSSA_2])
        assert.equal(letto.prove.filter((p) => p.esito === 'pass').length, 13)
        assert.ok(!letto.prove.some((p) => p.nome === GENITORE_1), 'un genitore che fallisce per i figli non è una prova in più')
        assert.deepEqual(letto.conti, { tests: 15, pass: 13, fail: 2 })
        assert.equal(leggiTapR4('# Subtest: a\n').completo, false, 'senza i conti finali il TAP è troncato')
        // il perché di una rossa: il blocco YAML che la segue (serve a proporre la causa nell'elenco)
        const rossa = letto.prove.find((p) => p.nome === ROSSA_1)
        assert.match(rossa.dettaglio, /npm: inaccessible or not found/u)
        assert.equal(letto.prove.find((p) => p.esito === 'pass').dettaglio, undefined)
    })

    it('KA-02 una rossa non in elenco è inattesa; in elenco è attesa; la riga a file intero copre ogni foglia', () => {
        const senza = confrontaAtteseR4({ esiti: [esito()], attese: attese([]) })
        assert.equal(senza.ok, false)
        assert.deepEqual(senza.inattese.map((x) => x.prova), [ROSSA_1, ROSSA_2])
        const una = confrontaAtteseR4({ esiti: [esito()], attese: attese([{ file: FILE, prova: ROSSA_1, esito: 'fail', causa: 'npm-assente' }]) })
        assert.equal(una.ok, false)
        assert.deepEqual(una.inattese.map((x) => x.prova), [ROSSA_2])
        const tutte = confrontaAtteseR4({ esiti: [esito()], attese: attese([
            { file: FILE, prova: ROSSA_1, esito: 'fail', causa: 'npm-assente' },
            { file: FILE, prova: ROSSA_2, esito: 'fail', causa: 'npm-assente' },
        ]) })
        assert.equal(tutte.ok, true)
        assert.deepEqual(tutte.conti, { file: 1, prove: 15, verdi: 13, rosseAttese: 2, inattese: 0, vecchie: 0 })
        const intero = confrontaAtteseR4({ esiti: [esito()], attese: attese([{ file: FILE, prova: null, esito: 'fail', causa: 'windows-nella-prova' }]) })
        assert.equal(intero.ok, true)
    })

    it('KA-03 una riga in elenco che adesso passa è vecchia e il cancello è rosso; intermittente no', () => {
        const verde = 'BC-57 — `prova` senza una suite da lanciare > ⭐ B1 — `bun run test` invece nomina uno script, e lo si pretende'
        const voci = [
            { file: FILE, prova: ROSSA_1, esito: 'fail', causa: 'npm-assente' },
            { file: FILE, prova: ROSSA_2, esito: 'fail', causa: 'npm-assente' },
        ]
        const vecchia = confrontaAtteseR4({ esiti: [esito()], attese: attese([...voci, { file: FILE, prova: verde, esito: 'fail', causa: 'npm-assente' }]) })
        assert.equal(vecchia.ok, false)
        assert.deepEqual(vecchia.vecchie.map((x) => x.prova), [verde])
        const ballerina = confrontaAtteseR4({ esiti: [esito()], attese: attese([...voci, { file: FILE, prova: verde, esito: ['fail', 'pass'], causa: 'npm-assente' }]) })
        assert.equal(ballerina.ok, true)
        assert.deepEqual(ballerina.intermittenti.map((x) => x.prova), [verde])
        // una riga che nomina una prova che non c'è più è vecchia anche lei
        const sparita = confrontaAtteseR4({ esiti: [esito()], attese: attese([...voci, { file: FILE, prova: 'non esiste', esito: 'fail', causa: 'npm-assente' }]) })
        assert.deepEqual(sparita.vecchie.map((x) => x.prova), ['non esiste'])
        // e una riga a file intero su un file tutto verde
        const tuttoVerde = TAP.replace(/^(\s*)not ok /gmu, '$1ok ')
        const fileVerde = confrontaAtteseR4({ esiti: [esito(tuttoVerde, { codice: 0 })], attese: attese([{ file: FILE, prova: null, esito: 'fail', causa: 'windows-nella-prova' }]) })
        assert.equal(fileVerde.ok, false)
        assert.deepEqual(fileVerde.vecchie.map((x) => x.file), [FILE])
    })

    it('KA-04 un file scaduto o senza TAP completo è inatteso, salvo una riga a file intero', () => {
        const scaduto = confrontaAtteseR4({ esiti: [esito('', { scaduto: true, codice: 124 })], attese: attese([]) })
        assert.equal(scaduto.ok, false)
        assert.deepEqual(scaduto.inattese, [{ file: FILE, prova: null, motivo: 'scaduto' }])
        const troncato = confrontaAtteseR4({ esiti: [esito('# Subtest: a\n', { codice: 1 })], attese: attese([]) })
        assert.deepEqual(troncato.inattese, [{ file: FILE, prova: null, motivo: 'senza-tap' }])
        const coperto = confrontaAtteseR4({ esiti: [esito('', { scaduto: true, codice: 124 })], attese: attese([{ file: FILE, prova: null, esito: 'fail', causa: 'npm-assente' }]) })
        assert.equal(coperto.ok, true)
        // un file uscito con codice ≠ 0 ma senza foglie rosse (per esempio un errore dopo l'ultima prova) è inatteso
        const uscitaStrana = confrontaAtteseR4({ esiti: [esito(TAP.replace(/^(\s*)not ok /gmu, '$1ok '), { codice: 1 })], attese: attese([]) })
        assert.deepEqual(uscitaStrana.inattese, [{ file: FILE, prova: null, motivo: 'uscita-1' }])
    })

    it('KA-06 dalla tabella del Pad agli esiti: uscita 124 è il tetto dei 300 s; il TAP letto per nome di file', () => {
        const tabella = `${FILE}|1|13|2|0|9\ntests/lento.test.mjs|124|?|?|?|300\n`
        const letti = []
        const esiti = esitiDaTabellaR4(tabella, (nome) => { letti.push(nome); return nome.includes('bc57') ? TAP : '' })
        assert.deepEqual(esiti.map((e) => [e.file, e.codice, e.scaduto, e.secondi]), [[FILE, 1, false, 9], ['tests/lento.test.mjs', 124, true, 300]])
        assert.deepEqual(letti, ['tests_bc57-prova-senza-suite.test.mjs.tap', 'tests_lento.test.mjs.tap'])
        assert.equal(esiti[0].tap, TAP)
    })

    it('KA-07 l\'elenco proposto: ogni rossa con la causa letta dal suo perché; quella senza causa nota resta «da-capire»', () => {
        // nella fixture tutte e due le rosse sono «npm assente»; la seconda qui ha un errore mai visto
        const strano = TAP.replace(/(Ricevuto: exit 127\r?\n\s*<<<TALOS_DATA[^\n]*\n\s*)\/system\/bin\/sh: npm: inaccessible or not found/u, '$1un errore mai visto')
        assert.notEqual(strano, TAP)
        const proposta = proponiAtteseR4({ esiti: [esito(strano), { file: 'tests/lento.test.mjs', codice: 124, scaduto: true, tap: '' }], pin: '701c6c0d2' })
        assert.equal(proposta.schema, 'talos.mobile.attese-r4.v1')
        assert.equal(proposta.pin, '701c6c0d2')
        assert.deepEqual(proposta.voci.map((v) => [v.file, v.prova, v.causa]), [
            [FILE, ROSSA_1, 'npm-assente'],
            [FILE, ROSSA_2, 'da-capire'],
            ['tests/lento.test.mjs', null, 'da-capire'],
        ])
        assert.equal(proposta.cause['npm-assente'], CAUSE_R4['npm-assente'].parole)
        // «da-capire» non è una causa accettabile: un elenco con quella riga non passa la validazione finché qualcuno non la legge
        assert.match(validaAtteseR4(proposta).join(' '), /da-capire/u)
        // anche se qualcuno la dichiara fra le cause: va letta e cambiata, non dichiarata
        assert.match(validaAtteseR4({ ...proposta, cause: { ...proposta.cause, 'da-capire': 'boh' } }).join(' '), /leggere la rossa e dare la causa/u)
    })

    it('KA-05 l\'elenco si valida: schema, causa nota, campi, doppioni', () => {
        assert.deepEqual(validaAtteseR4(attese([{ file: FILE, prova: ROSSA_1, esito: 'fail', causa: 'npm-assente' }])), [])
        assert.match(validaAtteseR4({ ...attese([]), schema: 'altro' })[0], /schema/u)
        assert.match(validaAtteseR4(attese([{ file: FILE, prova: ROSSA_1, esito: 'fail', causa: 'boh' }]))[0], /causa «boh»/u)
        assert.match(validaAtteseR4(attese([{ prova: ROSSA_1, esito: 'fail', causa: 'npm-assente' }]))[0], /file/u)
        assert.match(validaAtteseR4(attese([{ file: FILE, prova: ROSSA_1, esito: 'pass', causa: 'npm-assente' }]))[0], /esito/u)
        const doppia = { file: FILE, prova: ROSSA_1, esito: 'fail', causa: 'npm-assente' }
        assert.match(validaAtteseR4(attese([doppia, { ...doppia }]))[0], /doppione/u)
        assert.throws(() => confrontaAtteseR4({ esiti: [], attese: { ...attese([]), schema: 'altro' } }), /schema/u)
    })
})
