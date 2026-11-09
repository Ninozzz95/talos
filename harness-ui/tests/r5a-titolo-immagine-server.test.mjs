/*
 * Revisione del blocco del 03/11 pomeriggio, R5a (S3): il titolo di una chat nata da una SOLA immagine. Il client lo sistemava già col
 *   suo `rename` (Tester R5, `app.js`, «solo immagini: il nome dell'immagine»), ma il server decide da solo: senza bolla prendeva la consegna
 *   per il modello, «Describe the attached image.». Valeva per chi non passa dal rename del PC (il telefono, la CLI, un rename fallito).
 *   Ora la regola del client sta anche sul server, in un modulo solo (`fraseDelTitolo`, bolla-della-persona.mjs).
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { FRASI_SOLO_IMMAGINE } from '../src/bolla-della-persona.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'
import testiApp from '../frontend/src/i18n/testi/app.js'

const attesa = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const IMMAGINE = (nome) => ({ id: 'a'.repeat(64), tipo: 'immagine', nome, mimeType: 'image/png', byte: 10, url: `/api/v1/chat-images/${'a'.repeat(64)}` })

function registro(t) {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-r5a-titolo-'))
    const r = createSessionRegistry({
        cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
        preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
        avviaSessioneFn: () => new Promise(() => {}),
    })
    t.after(async () => { await r.chiudi?.({ attesaMassimaMs: 500 }); rimuoviCartellaDiProva(cartellaStore) })
    const titolo = (id) => r.elenca().find((s) => s.sessionId === id)?.nome
    return { r, cartellaStore, titolo }
}

test('R5A-01 una sola immagine, nelle due lingue: il titolo è il nome dell\'immagine, mai la consegna per il modello', async (t) => {
    const { r, cartellaStore, titolo } = registro(t)
    const en = r.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'Describe the attached image.', immagini: [IMMAGINE('gatto.png')] })
    const it = r.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'Descrivi l’immagine allegata.', immagini: [IMMAGINE('cane.jpg'), IMMAGINE('topo.webp')] })
    /* un client che mette la frase anche nella bolla (la bolla copia la consegna): la frase non è della persona */
    const conBolla = r.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'Describe the attached image.', immagini: [IMMAGINE('gufo.png')], bolla: { testo: 'Describe the attached image.', allegati: [] } })
    await attesa()
    assert.equal(titolo(en.sessionId), 'gatto.png')
    assert.equal(titolo(it.sessionId), 'cane.jpg, topo.webp')
    assert.equal(titolo(conBolla.sessionId), 'gufo.png')
})

test('R5A-02 AL CONTRARIO: parole e immagine danno le parole; file e immagine senza parole danno il file; la frase senza immagini resta', async (t) => {
    const { r, cartellaStore, titolo } = registro(t)
    const parole = r.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'Cosa vedi qui?', immagini: [IMMAGINE('gatto.png')] })
    const conFile = r.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'Describe the attached image.\n\nAttachments of this message:\n- nota.txt (C:\\x\\nota.txt)',
        immagini: [IMMAGINE('gatto.png')], bolla: { testo: '', allegati: [{ nome: 'nota.txt', tipo: 'file' }] } })
    const senzaImmagini = r.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'Describe the attached image.' })
    await attesa()
    assert.equal(titolo(parole.sessionId), 'Cosa vedi qui?')
    assert.equal(titolo(conFile.sessionId), 'nota.txt')
    assert.equal(titolo(senzaImmagini.sessionId), 'Describe the attached image.', 'senza immagini non c\'è un nome da dare')
})

test('R5A-03 le due frasi del server sono quelle del dizionario dell\'interfaccia, lettera per lettera', () => {
    /* una copia e non un import (l'app installata non porta `frontend/`, come `nomi-impostazioni.mjs`): questa prova la tiene uguale */
    assert.deepEqual([...FRASI_SOLO_IMMAGINE].sort(), [testiApp.it['attachments.promptDescribeImage'], testiApp.en['attachments.promptDescribeImage']].sort())
})
