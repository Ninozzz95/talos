/*
 * Segnalato dalla CLI (review della lane R, 01/10/2026): dentro una riga lunga, il `byteOffset` che il kernel stesso suggerisce
 * («continue inside it with leggi byteOffset=2000») veniva rifiutato con READ_INVALID_UTF8 e una frase che mandava il modello
 * dalla parte sbagliata — «byteOffset does not start at a character boundary … Use the byteOffset given by a previous read» —
 * quando il modello l'aveva usato davvero e il guasto era un byte non UTF-8 più AVANTI. Nessun testo tornava (giusto: niente
 * di lossy), ma la frase deve dire il guasto vero: QUALE byte, e come guardarlo.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leggiTestoLimitato } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
    const c = mkdtempSync(join(tmpdir(), 'talos-byteoffset-utf8-'))
    t.after(() => rimuoviCartellaDiProva(c))
    return c
}

test('READ-UTF8-01: il byteOffset suggerito, con un byte non valido più avanti, dice QUALE byte e come guardarlo', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'f.txt'), Buffer.concat([Buffer.from('A'.repeat(3000)), Buffer.from([0xff]), Buffer.from('B'.repeat(10) + '\n')]))
    await assert.rejects(leggiTestoLimitato(dir, 'f.txt', { byteOffset: 2000 }), (e) => {
        assert.equal(e.code, 'READ_INVALID_UTF8')
        assert.match(e.message, /byte 3000 is not valid UTF-8/u)
        assert.match(e.message, /leggi format:"hex" offset=3000/u)
        assert.doesNotMatch(e.message, /does not start at a character boundary/u, 'il modello ha usato un confine giusto')
        return true
    })
})

test('READ-UTF8-02: un byteOffset che cade DENTRO un carattere lo dice, e rimanda all offset di una lettura precedente', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'f.txt'), 'é'.repeat(3000) + '\n') // due byte ciascuna: 1 è a metà carattere
    await assert.rejects(leggiTestoLimitato(dir, 'f.txt', { byteOffset: 1 }), (e) => {
        assert.equal(e.code, 'READ_INVALID_UTF8')
        assert.match(e.message, /byteOffset=1 falls inside a character/u)
        assert.match(e.message, /Use the byteOffset given by a previous read/u)
        return true
    })
})

test('READ-UTF8-03: un U+FFFD VERO nel file non è un byte non valido (si salta), e il guasto dopo si trova lo stesso', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'f.txt'), Buffer.concat([Buffer.from('A'.repeat(2100) + '�' + 'C'.repeat(50)), Buffer.from([0xc3, 0x28]), Buffer.from('\n')]))
    const atteso = 2100 + 3 + 50
    await assert.rejects(leggiTestoLimitato(dir, 'f.txt', { byteOffset: 2000 }), (e) => {
        assert.match(e.message, new RegExp(`byte ${atteso} is not valid UTF-8`, 'u'))
        return true
    })
})

test('READ-UTF8-04: il testo valido dal byteOffset suggerito si legge come prima', async (t) => {
    const dir = cartella(t)
    writeFileSync(join(dir, 'f.txt'), 'A'.repeat(3000) + 'Z\n')
    const letta = await leggiTestoLimitato(dir, 'f.txt', { byteOffset: 2000 })
    assert.equal(letta.testo, 'A'.repeat(1000) + 'Z')
})
