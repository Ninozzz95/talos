// Revisione a blocco 5 (24/10/2026): le sonde del revisore (REV5-COL-1/2) e del Desktop 9 (CURA5-COL-2b), tenute nella suite.
// REV5-COL-1: «spegni» fra la PRIMA e la SECONDA accensione di apriAccoppiamento. REV5-COL-2: due salvataggi nello stesso millisecondo
// (lo «spegni» lanciava ENOENT prima di fermare il trasporto). CURA5-COL-2b: due prime letture in parallelo delle cartelle.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs'
import { creaRemoto } from '../src/remoto/index.mjs'
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

test('REV5-COL-1 spegni fra le due accensioni del QR: mai trasporto vivo con lo stato «spento»', async (t) => {
  const esiti = []
  for (let giro = 0; giro < 12; giro += 1) {
    const dir = mkdtempSync(join(tmpdir(), 'talos-rev5-col-'))
    let avviati = 0; let fermati = 0
    const r = creaRemoto({
      keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'remoto', 'impostazioni.json'), fileTelefoni: join(dir, 'remoto', 'telefoni.json'),
      chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => false, elenca: () => [] }, iscriviConRigiocata: () => () => {},
      caricaIroh: async () => ({}), nomePc: 'PC',
      avviaTrasporto: async () => { avviati += 1; return { id: `pc-${avviati}`, relayDiCasa: () => 'x', indirizziDiretti: () => [], ferma: async () => { fermati += 1 } } },
    })
    await r.imposta({ relay: { modo: 'n0' } })
    const qr = r.apriAccoppiamento().then(() => 'QR', (e) => e.code)
    for (let i = 0; i < giro * 3 && avviati === 0; i += 1) await new Promise((x) => setImmediate(x))
    while (avviati === 0) await new Promise((x) => setImmediate(x))
    for (let i = 0; i < giro; i += 1) await new Promise((x) => setImmediate(x))
    const spento = await r.imposta({ acceso: false }).catch((e) => ({ acceso: `ERR ${e.code}` }))
    const esitoQr = await qr
    await new Promise((x) => setTimeout(x, 20))
    const s = await r.stato()
    esiti.push({ giro, qr: esitoQr, acceso: s.acceso, pcId: s.pcId, avviati, fermati, rispostaSpegni: spento.acceso })
    await r.imposta({ acceso: false }).catch(() => {})
    rimuoviCartellaDiProva(dir)
  }
  console.log('REV5-COL-1', JSON.stringify(esiti))
  const rotti = esiti.filter((e) => e.acceso === false && (e.pcId !== null || e.avviati !== e.fermati))
  assert.deepEqual(rotti, [], '⛔ trasporto vivo (raggiungibile) con lo stato «spento»')
  /* REV5-COL-2: lo «spegni» non fallisce mai per un salvataggio concorrente */
  assert.deepEqual(esiti.filter((e) => String(e.rispostaSpegni).startsWith('ERR')), [], '⛔ lo «spegni» è fallito (REV5-COL-2)')
})

test('CURA5-COL-2b due prime letture in parallelo: un segreto solo, uguale in memoria e sul disco', async () => {
  const esiti = []
  for (let giro = 0; giro < 20; giro += 1) {
    const dir = mkdtempSync(join(tmpdir(), 'talos-cura5-seg-'))
    const opz = { fileConsensi: join(dir, 'r', 'consensi.json'), fileSegreto: join(dir, 'r', 'segreto'), cartelleAmmesse: [dir] }
    const a = creaCartelleDeiDispositivi(opz)
    const r = await Promise.allSettled([a.descrivi(dir), a.descrivi(dir), a.elenco('d1')])
    const errori = r.filter((x) => x.status === 'rejected').map((x) => x.reason?.code ?? String(x.reason))
    const inMemoria = r[0].value?.cartellaId ?? null
    const secondo = r[1].value?.cartellaId ?? null
    const dopo = (await creaCartelleDeiDispositivi(opz).descrivi(dir))?.cartellaId ?? null
    esiti.push({ giro, errori, stessoFraLoro: inMemoria === secondo, stessoDopoRiavvio: inMemoria === dopo })
    rimuoviCartellaDiProva(dir)
  }
  const rotti = esiti.filter((e) => e.errori.length || !e.stessoFraLoro || !e.stessoDopoRiavvio)
  console.log('CURA5-COL-2b', JSON.stringify(rotti.slice(0, 4)), 'rotti', rotti.length, 'su', esiti.length)
  assert.deepEqual(rotti, [])
})

/* REV5-COL-1b (Desktop 9, 24/10/2026): la stessa finestra, resa deterministica. Lo «spegni» parte MENTRE `apriAccoppiamento` salva
   «acceso» dopo l'accensione (il punto fra le due `accendi()` di prima): il QR non deve uscire, e nessun trasporto resta vivo. */
test('REV5-COL-1b spegni durante il salvataggio dell\'accensione del QR: REMOTE_OFF, nessun trasporto vivo', async () => {
  const { promises: fsp } = await import('node:fs')
  const dir = mkdtempSync(join(tmpdir(), 'talos-rev5-col-b-'))
  let avviati = 0; let fermati = 0; let spegni = null; let r = null
  const fs = {
    ...fsp,
    writeFile: async (p, testo, o) => {
      if (!spegni && String(p).includes('impostazioni.json') && /"acceso": true/u.test(String(testo))) {
        spegni = r.imposta({ acceso: false }).catch((e) => ({ acceso: `ERR ${e.code}` }))
        for (let i = 0; i < 20; i += 1) await new Promise((x) => setImmediate(x))
      }
      return fsp.writeFile(p, testo, o)
    },
  }
  r = creaRemoto({
    keyring: creaAdattatorePortachiaviInMemoria(), fileImpostazioni: join(dir, 'remoto', 'impostazioni.json'), fileTelefoni: join(dir, 'remoto', 'telefoni.json'),
    chiama: async () => ({ dati: null }), sessionRegistry: { esiste: () => false, elenca: () => [] }, iscriviConRigiocata: () => () => {},
    caricaIroh: async () => ({}), nomePc: 'PC', fs,
    avviaTrasporto: async () => { avviati += 1; return { id: `pc-${avviati}`, relayDiCasa: () => 'x', indirizziDiretti: () => [], ferma: async () => { fermati += 1 } } },
  })
  await r.imposta({ relay: { modo: 'n0' } })
  const esitoQr = await r.apriAccoppiamento().then(() => 'QR', (e) => e.code)
  const rispostaSpegni = (await spegni)?.acceso
  const s = await r.stato()
  rimuoviCartellaDiProva(dir)
  assert.ok(spegni, 'la prova deve aver fatto partire lo «spegni» durante il salvataggio')
  assert.deepEqual({ esitoQr, rispostaSpegni, acceso: s.acceso, pcId: s.pcId, vivi: avviati - fermati },
    { esitoQr: 'REMOTE_OFF', rispostaSpegni: false, acceso: false, pcId: null, vivi: 0 })
})
