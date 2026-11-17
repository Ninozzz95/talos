/*
 * 0.2.2-DL, giro 3 (decisione dell'owner del 09/11/2026 21:57, «Spente, rispetta la scelta»; giudice v1303-v1304) — LA MIGRAZIONE della
 *   copia sul server di «Domande a tutta larghezza» al primo avvio della 0.2.2.
 *
 * La 0.2.0 si ricostruisce con i moduli VERI (stesse strade di scrittura: la finestra, il `set` del modello, `/settings`, l'Annulla), poi
 *   si toglie dal file della copia il solo campo `migrazioni`: è esattamente il file che scriveva la 0.2.0 (`copia-finestra.mjs` della base
 *   13bed6195 scrive `{ schema, revisione, valori, aggiornataIl }`; il file delle ricevute non è cambiato). Il riavvio con la 0.2.2 è una
 *   copia e un servizio NUOVI sugli stessi due file, come `server.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, chmodSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { creaServizioImpostazioni, MIGRAZIONE_DOMANDE_LARGHE, ultimoCambioDellaVoce } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'
import { creaRotteImpostazioni } from '../src/impostazioni/rotte-impostazioni.mjs'
import { scriviAtomico } from '../src/research-store.mjs'
/* giro 6 (cancello BC-09): la cartella messa AL POSTO del file delle ricevute la crea la prova e nessuno la tiene aperta ⇒ classe A */
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const CHIAVE = 'appearance.userBubbleFullWidth'
const PERSONA = { tipo: 'persona' }

function cartella() {
  return mkdtempSync(join(tmpdir(), 'dlm-')) // giro 6 (R-E): nel TEMP di chi lancia, non in una cartella fissa
}
const fileCopia = (d) => join(d, '.preferenze-finestra.json')
const fileRicevute = (d) => join(d, '.impostazioni-ricevute.json')
const sulDisco = (d) => JSON.parse(readFileSync(fileCopia(d), 'utf8'))

/** Un avvio del server sulla cartella `d`: copia e servizio nuovi, come `server.mjs:1053-1054`. */
function avvia(d, { scriviFn, ricevute = true, osservaCambioFn = null } = {}) {
  const copia = creaCopiaFinestra({ file: fileCopia(d), ...(scriviFn ? { scriviFn } : {}) })
  const servizio = creaServizioImpostazioni({ copiaFinestra: copia, ...(ricevute ? { fileRicevute: fileRicevute(d) } : {}), attesaFinestraMs: 20, osservaCambioFn })
  const fn = servizio.perLaSessione({ sessionId: null })
  const leggi = async () => {
    const { testo } = await fn('app_settings', { action: 'list', query: CHIAVE }, { fase: 'esegui' })
    const riga = testo.split('\n').find((r) => r.includes(CHIAVE))
    return { valore: /= (true|false);/u.exec(riga)?.[1], rev: Number(/Revision (\d+)/u.exec(testo)[1]) }
  }
  const metti = async (value) => fn('app_settings', { action: 'set', expected_revision: (await leggi()).rev, changes: [{ key: CHIAVE, value }] }, { fase: 'esegui', toolCallId: 'c' })
  const ferma = async () => { await copia.leggi(); await servizio.attendiScritture() }
  return { copia, servizio, leggi, metti, ferma }
}

/** Fine della 0.2.0: il file della copia senza il timbro, come lo scriveva la 0.2.0. */
async function chiudiLa020(s, d) {
  await s.ferma()
  const { migrazioni: _timbro, ...comeLa020 } = sulDisco(d)
  assert.deepEqual(Object.keys(comeLa020).sort(), ['aggiornataIl', 'revisione', 'schema', 'valori'], 'la forma del file della 0.2.0')
  writeFileSync(fileCopia(d), `${JSON.stringify(comeLa020, null, 1)}\n`)
  return comeLa020
}

/** 0.2.0: prima apertura della finestra (l'aspetto INTERO, col false di serie di allora, `copia-sul-server.js:65-71`). */
async function primaApertura020(d) {
  const s = avvia(d)
  await s.servizio.finestra.dallaPersona({ themePreset: 'paper', userBubbleFullWidth: false, chatFullWidth: false })
  return s
}

test('MIG-01 (REV-A) · mai toccata: il false della prima apertura della 0.2.0 si SCARTA; il modello legge accesa; nient altro cambia', async () => {
  const d = cartella()
  const prima = await chiudiLa020(await primaApertura020(d), d)
  assert.equal(prima.valori.userBubbleFullWidth, false)
  const s = avvia(d)
  assert.equal((await s.leggi()).valore, 'true', 'il modello legge ciò che la persona vede')
  const dopo = sulDisco(d)
  assert.equal(Object.hasOwn(dopo.valori, 'userBubbleFullWidth'), false, 'il false è scartato dal file')
  assert.deepEqual(dopo.valori, { themePreset: 'paper', chatFullWidth: false }, 'nessun altro campo toccato')
  assert.deepEqual(dopo.migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], 'il timbro è nello stesso file')
  assert.equal(dopo.revisione, prima.revisione + 1, 'la revisione avanza: le finestre trovano una copia più nuova')
  assert.match((await s.metti(false)).testo, /true → false/u, 'e il modello ora può spegnerla (REV-B: prima diceva «Nothing to change»)')
})

test('MIG-02 · false con la RICEVUTA del modello ⇒ RESTA, la revisione avanza; un secondo e un terzo avvio non cambiano niente', async () => {
  const d = cartella()
  const s020 = await primaApertura020(d)
  await s020.servizio.finestra.dallaPersona({ userBubbleFullWidth: true }) // la persona l'accende a mano
  await s020.metti(false) // il modello la spegne: `scriviCampi` + ricevuta (MIS-1)
  const prima = await chiudiLa020(s020, d)
  assert.equal(prima.valori.userBubbleFullWidth, false)
  const s = avvia(d)
  assert.equal((await s.leggi()).valore, 'false', 'una scelta con la ricevuta resta')
  const dopo = sulDisco(d)
  assert.equal(dopo.valori.userBubbleFullWidth, false)
  assert.equal(dopo.revisione, prima.revisione + 1, 'la revisione avanza anche se il valore resta: la finestra che mostra accesa si spegne')
  assert.deepEqual(dopo.migrazioni, [MIGRAZIONE_DOMANDE_LARGHE])
  await s.ferma()
  /* idempotente: due avvii in più = stesso file */
  const fotografia = readFileSync(fileCopia(d), 'utf8')
  await avvia(d).ferma()
  await avvia(d).ferma()
  assert.equal(readFileSync(fileCopia(d), 'utf8'), fotografia, 'un avvio dopo il timbro non scrive niente')
})

test('MIG-03 · false da `/settings` della persona (anche dal dispositivo) ⇒ RESTA', async () => {
  for (const origine of [PERSONA, { tipo: 'dispositivo', dispositivoId: 'pad' }]) {
    const d = cartella()
    const s020 = await primaApertura020(d)
    await s020.servizio.finestra.dallaPersona({ userBubbleFullWidth: true })
    const esito = await s020.servizio.applicaDallaPersona({ changes: [{ key: CHIAVE, value: false }], origine })
    assert.ok(esito.ricevuta, 'con ricevuta (MIS-3)')
    await chiudiLa020(s020, d)
    const s = avvia(d)
    assert.equal((await s.leggi()).valore, 'false', `${origine.tipo}: la scelta resta`)
    assert.equal(sulDisco(d).valori.userBubbleFullWidth, false)
  }
})

test('MIG-04 · false seguito dall Annulla ⇒ SCARTATO (anche se poi la finestra l ha rispenta senza ricevuta); l Annulla di un accensione ⇒ RESTA', async () => {
  /* (a) il modello spegne, la persona annulla (torna accesa), poi la spegne con l'interruttore della finestra: l'ultimo cambio con la
     ricevuta è «→ true» (l'Annulla), quindi il false senza ricevuta si scarta */
  const d = cartella()
  const s020 = await primaApertura020(d)
  await s020.servizio.finestra.dallaPersona({ userBubbleFullWidth: true })
  await s020.metti(false)
  const [r1] = await s020.servizio.ricevute()
  await s020.servizio.annullaDallaPersona({ receiptId: r1.id, origine: PERSONA })
  await s020.servizio.finestra.dallaPersona({ userBubbleFullWidth: false })
  await chiudiLa020(s020, d)
  const s = avvia(d)
  assert.equal((await s.leggi()).valore, 'true', 'false annullato: scartato')
  assert.equal(Object.hasOwn(sulDisco(d).valori, 'userBubbleFullWidth'), false)
  /* (b) il modello ACCENDE, la persona annulla: l'Annulla scrive «→ false» con la sua ricevuta ⇒ una scelta, resta */
  const d2 = cartella()
  const t020 = await primaApertura020(d2)
  await t020.metti(true)
  const [acceso] = await t020.servizio.ricevute()
  await t020.servizio.annullaDallaPersona({ receiptId: acceso.id, origine: PERSONA })
  await chiudiLa020(t020, d2)
  assert.equal((await avvia(d2).leggi()).valore, 'false', 'l Annulla di un accensione è un «→ false» non annullato: resta')
})

test('MIG-05 · false dell interruttore della finestra, SENZA ricevuta ⇒ SCARTATO (MIS-2); un true resta; senza il campo resta senza', async () => {
  const d = cartella()
  const s020 = await primaApertura020(d)
  await s020.servizio.finestra.dallaPersona({ userBubbleFullWidth: true })
  await s020.servizio.finestra.dallaPersona({ userBubbleFullWidth: false })
  assert.equal((await s020.servizio.ricevute()).length, 0)
  await chiudiLa020(s020, d)
  assert.equal((await avvia(d).leggi()).valore, 'true')
  /* chi l'aveva accesa resta accesa, e il file non perde il true */
  const d2 = cartella()
  const a = avvia(d2)
  await a.servizio.finestra.dallaPersona({ userBubbleFullWidth: true, themePreset: 'calm' })
  const prima = await chiudiLa020(a, d2)
  await avvia(d2).ferma()
  assert.deepEqual(sulDisco(d2).valori, prima.valori, 'true: valori identici')
  assert.equal(sulDisco(d2).revisione, prima.revisione, 'niente scartato: la revisione non si muove')
  assert.deepEqual(sulDisco(d2).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE])
  /* una copia senza il campo resta senza */
  const d3 = cartella()
  const b = avvia(d3)
  await b.servizio.finestra.dallaPersona({ themePreset: 'calm' })
  const primaB = await chiudiLa020(b, d3)
  await avvia(d3).ferma()
  assert.deepEqual(sulDisco(d3).valori, primaB.valori)
})

test('MIG-06 (giudice v1304) · ricevute mancanti, illeggibili o rovinate = nessuna ricevuta: il false si scarta, mai un errore all avvio', async () => {
  const casi = {
    mancanti: null,
    'JSON rotto': '{ "ricevute": [ {"cambi": [',
    'non un oggetto': '"ciao"',
    'ricevute non elenco': JSON.stringify({ schema: 'talos.app-settings.receipts.v1', ricevute: { a: 1 } }),
    'voci fuori forma': JSON.stringify({ ricevute: [null, 3, 'x', { cambi: 'no' }, { cambi: [null, { chiave: 7 }] }] }),
    /* una ricevuta «→ false» segnata annullata la cui ricevuta dell'Annulla manca (file tagliato a mano): annullata vuol dire scartata */
    'annullata senza seguito': JSON.stringify({ ricevute: [{ id: 'set-x', cambi: [{ chiave: CHIAVE, prima: true, dopo: false }], annullata: { quando: '2026-11-08T10:00:00.000Z' } }] }),
    /* giro 4 (revisore R1-e, mutanti N13 e N14): una «→ false» di UN ALTRA voce non conta; un `dopo` che non è sì/no non è un false */
    'altra voce': JSON.stringify({ ricevute: [{ id: 'set-1', cambi: [{ chiave: 'appearance.chatFullWidth', prima: true, dopo: false }], annullata: null }] }),
    'altra voce DOPO quella della voce': JSON.stringify({ ricevute: [
      { id: 'set-1', cambi: [{ chiave: CHIAVE, prima: false, dopo: true }], annullata: null },
      { id: 'set-2', cambi: [{ chiave: 'appearance.chatFullWidth', prima: true, dopo: false }], annullata: null }] }),
    'dopo come testo': JSON.stringify({ ricevute: [{ id: 'set-1', cambi: [{ chiave: CHIAVE, prima: true, dopo: 'false' }], annullata: null }] }),
  }
  const avvisi = []
  const avviso = console.warn
  console.warn = (...a) => { avvisi.push(a.join(' ')) }
  try {
    for (const [nome, contenuto] of Object.entries(casi)) {
      const d = cartella()
      await chiudiLa020(await primaApertura020(d), d)
      if (contenuto === null) rmSync(fileRicevute(d), { force: true })
      else writeFileSync(fileRicevute(d), contenuto)
      if (contenuto === null) assert.equal(existsSync(fileRicevute(d)), false)
      let s
      assert.doesNotThrow(() => { s = avvia(d) }, `${nome}: l avvio non lancia`)
      assert.equal((await s.leggi()).valore, 'true', `${nome}: il false si scarta`)
      assert.equal(Object.hasOwn(sulDisco(d).valori, 'userBubbleFullWidth'), false, nome)
      assert.deepEqual(sulDisco(d).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], `${nome}: timbro scritto`)
      await s.servizio.attendiScritture()
    }
  } finally { console.warn = avviso }
  /* e un servizio senza file delle ricevute (nessuna cartella): lo stesso */
  const d = cartella()
  await chiudiLa020(await primaApertura020(d), d)
  assert.equal((await avvia(d, { ricevute: false }).leggi()).valore, 'true')
  assert.equal(ultimoCambioDellaVoce('no', CHIAVE), null)
})

test('MIG-07 · un false scritto DOPO il timbro (interruttore della finestra, senza ricevuta) sopravvive ai riavvii', async () => {
  const d = cartella()
  await chiudiLa020(await primaApertura020(d), d)
  const s = avvia(d)
  assert.equal((await s.leggi()).valore, 'true')
  await s.servizio.finestra.dallaPersona({ userBubbleFullWidth: false })
  await s.ferma()
  assert.deepEqual(sulDisco(d).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], 'la scrittura della finestra porta il timbro con sé')
  assert.equal((await avvia(d).leggi()).valore, 'false', 'dopo il riavvio resta spenta')
  assert.equal((await avvia(d).leggi()).valore, 'false', 'e dopo un altro ancora')
  /* installazione nuova (nessun file): il primo false è già della 0.2.2 e resta */
  const nuova = cartella()
  const n = avvia(nuova)
  await n.servizio.finestra.dallaPersona({ userBubbleFullWidth: false, themePreset: 'calm' })
  await n.ferma()
  assert.deepEqual(sulDisco(nuova).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], 'il timbro va sul disco con la prima scrittura')
  assert.equal((await avvia(nuova).leggi()).valore, 'false')
})

test('MIG-08 (giudice v1299) · scarto, timbro e revisione in UNA scrittura; se quella fallisce il disco resta tutto com era', async () => {
  const d = cartella()
  const prima = await chiudiLa020(await primaApertura020(d), d)
  const scritture = []
  const s = avvia(d, { scriviFn: async (file, contenuto) => { scritture.push(JSON.parse(contenuto)); return scriviAtomico(file, contenuto) } })
  await s.copia.leggi()
  assert.equal(scritture.length, 1, 'una scrittura sola')
  assert.equal(Object.hasOwn(scritture[0].valori, 'userBubbleFullWidth'), false)
  assert.deepEqual(scritture[0].migrazioni, [MIGRAZIONE_DOMANDE_LARGHE])
  assert.equal(scritture[0].revisione, prima.revisione + 1)
  /* la scrittura fallisce (disco pieno, antivirus): il file resta quello della 0.2.0, intero; in memoria valgono scarto e timbro insieme */
  const d2 = cartella()
  const prima2 = await chiudiLa020(await primaApertura020(d2), d2)
  const testo = readFileSync(fileCopia(d2), 'utf8')
  let falliscono = true
  const t = avvia(d2, { scriviFn: async (file, contenuto) => { if (falliscono) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return scriviAtomico(file, contenuto) } })
  assert.equal((await t.leggi()).valore, 'true', 'le due porte d accordo anche senza disco')
  assert.equal(readFileSync(fileCopia(d2), 'utf8'), testo, 'né il timbro senza lo scarto né lo scarto senza il timbro')
  falliscono = false
  await t.servizio.finestra.dallaPersona({ themePreset: 'calm' })
  const dopo = sulDisco(d2)
  assert.equal(Object.hasOwn(dopo.valori, 'userBubbleFullWidth'), false)
  assert.deepEqual(dopo.migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], 'la prossima scrittura porta scarto e timbro insieme')
  assert.equal(dopo.revisione, prima2.revisione + 2)
})

test('MIG-10 · una copia nata in QUESTO processo è già della 0.2.2: niente si scarta, e un avvio su una cartella vuota non scrive niente', async () => {
  /* copia in memoria (le prove, un ospite senza cartella), riempita prima che nasca il servizio: il suo false è una scelta di adesso */
  const copia = creaCopiaFinestra()
  await copia.dallaFinestra({ userBubbleFullWidth: false })
  const servizio = creaServizioImpostazioni({ copiaFinestra: copia })
  assert.deepEqual(await copia.leggi(), { revisione: 1, valori: { userBubbleFullWidth: false } })
  assert.equal(await copia.migraUnaVolta(MIGRAZIONE_DOMANDE_LARGHE, () => ({ valori: {} })), 'gia-fatta', 'il timbro c è già, in memoria')
  assert.ok(servizio.pronto())
  /* installazione nuova: nessun file finché qualcuno non scrive (le prove del browser lo vogliono: `browser-p0.spec.mjs:81`) */
  const d = cartella()
  await avvia(d, { ricevute: false }).ferma()
  assert.equal(existsSync(fileCopia(d)), false)
})

test('MIG-09 · ospiti senza la finestra (la CLI): niente da migrare, niente scritto, nessun errore', async () => {
  const fonte = { leggi: async () => ({ fonteRicerca: 'auto' }), scrivi: async () => {} }
  assert.doesNotThrow(() => creaServizioImpostazioni({ fonti: { ricerca: fonte } }))
  assert.equal(creaServizioImpostazioni({}).pronto(), false)
  /* una copia della finestra di forma vecchia, senza `migraUnaVolta`: si usa com'è */
  const vecchia = { leggi: async () => ({ revisione: 3, valori: { userBubbleFullWidth: false } }), scriviCampi: async () => ({ revisione: 4, valori: {} }), dallaFinestra: async () => ({ revisione: 4, valori: {} }) }
  const s = creaServizioImpostazioni({ copiaFinestra: vecchia })
  assert.equal((await s.finestra.leggi()).revisione, 3)
})

/*
 * Giro 4 (revisione GIALLA del giro 2, reperto 1 MEDIO; giudice v1313) — TRE CASI del file delle ricevute, da non confondere:
 *   · MANCA (ENOENT): nessuna ricevuta, si decide (giudice v1304);
 *   · si legge ma è ROVINATO (JSON rotto): nessuna ricevuta, si decide (giudice v1304);
 *   · c'è ma NON SI LEGGE (bloccato da un altro processo oltre i ritenti, una cartella al suo posto, permessi): NON si decide. Niente
 *     scarto, niente timbro, il disco resta com'era; si riprova all'avvio dopo. È la regola del file stesso
 *     (`servizio-impostazioni.mjs`, `leggiFileRicevute`: «`null` vuol dire NON SCRIVERE SOPRA»).
 * La 0.2.0 qui ha la scelta CON ricevuta (il modello l'ha spenta): se le ricevute ci sono, quel false resta.
 */
async function sceltaDelModello020(d) {
  const s020 = await primaApertura020(d)
  await s020.servizio.finestra.dallaPersona({ userBubbleFullWidth: true })
  await s020.metti(false)
  return chiudiLa020(s020, d)
}
async function zitto(lavoro) {
  const avviso = console.warn
  const avvisi = []
  console.warn = (...a) => { avvisi.push(a.join(' ')) }
  try { await lavoro(); } finally { console.warn = avviso }
  return avvisi
}

test('MIG-11 (giro 4) · ricevute MANCANTI o ROVINATE ⇒ si decide (nessuna ricevuta); c è ma NON SI LEGGE (una cartella al suo posto) ⇒ non si decide mai, il disco resta', async () => {
  await zitto(async () => {
    for (const [nome, prepara] of [['mancanti', (f) => rmSync(f)], ['rovinate', (f) => writeFileSync(f, '{ "ricevute": [ {')]]) {
      const d = cartella()
      const prima = await sceltaDelModello020(d)
      prepara(fileRicevute(d))
      const s = avvia(d)
      assert.equal((await s.leggi()).valore, 'true', `${nome}: nessuna ricevuta, il false si scarta`)
      assert.deepEqual(sulDisco(d).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], `${nome}: deciso, timbro scritto`)
      assert.equal(sulDisco(d).revisione, prima.revisione + 1, nome)
      await s.ferma()
    }
    /* il file c'è ma non si legge, e non per un attimo: al suo posto una cartella (EISDIR, nessun ritento) */
    const d = cartella()
    await sceltaDelModello020(d)
    rmSync(fileRicevute(d))
    mkdirSync(fileRicevute(d))
    const testo = readFileSync(fileCopia(d), 'utf8')
    for (let avvio = 1; avvio <= 2; avvio += 1) {
      const s = avvia(d)
      assert.equal((await s.leggi()).valore, 'false', `avvio ${avvio}: niente scartato senza aver letto le ricevute`)
      await s.ferma()
      assert.equal(readFileSync(fileCopia(d), 'utf8'), testo, `avvio ${avvio}: né scarto né timbro sul disco`)
    }
    /* tolta la cartella e rimesse le ricevute, l'avvio dopo decide: qui nessuna ricevuta ⇒ si scarta */
    rimuoviCartellaDiProva(fileRicevute(d))
    const dopo = avvia(d)
    assert.equal((await dopo.leggi()).valore, 'true')
    assert.deepEqual(sulDisco(d).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE])
  })
})

/* Il file delle ricevute tenuto aperto SENZA condivisione da un altro processo (antivirus, OneDrive, indicizzatore): ogni lettura dà
   EBUSY/EPERM per tutti i ritenti (1,3 s). Come la misura del revisore (R1-f): PowerShell `FileShare None`. */
function bloccaFile(percorso, ms) {
  const ps = `$f=[System.IO.File]::Open('${percorso.replace(/\//gu, '\\')}','Open','ReadWrite','None'); Write-Output PRESO; Start-Sleep -Milliseconds ${ms}; $f.Close()`
  const p = spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true })
  const fine = new Promise((ok) => { p.on('exit', ok) })
  return new Promise((ok, ko) => {
    p.stdout.on('data', (b) => { if (String(b).includes('PRESO')) ok({ fine }) })
    p.on('error', ko)
  })
}
test('MIG-11b (giro 4, revisore R1-f) · ricevute BLOCCATE al primo avvio ⇒ non si decide (il modello legge ancora spenta, disco intatto); sbloccate, l avvio dopo tiene la scelta', { skip: process.platform !== 'win32' && 'il blocco senza condivisione si misura su Windows' }, async () => {
  const d = cartella()
  const prima = await sceltaDelModello020(d)
  const testo = readFileSync(fileCopia(d), 'utf8')
  const { fine } = await bloccaFile(fileRicevute(d), 4000)
  await zitto(async () => {
    const s = avvia(d)
    assert.equal((await s.leggi()).valore, 'false', 'durante il blocco: il false resta com era')
    await s.ferma()
  })
  assert.equal(readFileSync(fileCopia(d), 'utf8'), testo, 'durante il blocco: niente scarto, niente timbro')
  await fine
  const s = avvia(d)
  assert.equal((await s.leggi()).valore, 'false', 'sbloccate: la ricevuta del modello c è, la scelta resta')
  assert.deepEqual(sulDisco(d).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE])
  assert.equal(sulDisco(d).revisione, prima.revisione + 1, 'e la revisione avanza: la finestra si spegne')
})

test('MIG-12 (giro 4, revisore R3-b) · i campi di primo livello che non conosce e i nomi di migrazione fuori forma restano sul disco, uguali', async () => {
  const estranei = { futuro: { x: 1, elenco: [1, 'a', null] }, zeta: 'z' }
  const migrazioniDiPrima = ['altra-0.2.2', 'NON-VALIDA', 7]
  const scrivi = (d) => writeFileSync(fileCopia(d), `${JSON.stringify({ schema: 'talos.window-preferences.v1', revisione: 3, valori: { userBubbleFullWidth: false, themePreset: 'calm' }, aggiornataIl: null, migrazioni: migrazioniDiPrima, ...estranei }, null, 1)}\n`)
  const conservati = (d, perché) => {
    const disco = sulDisco(d)
    assert.deepEqual({ futuro: disco.futuro, zeta: disco.zeta }, estranei, perché)
    assert.deepEqual(disco.migrazioni, [...migrazioniDiPrima, MIGRAZIONE_DOMANDE_LARGHE], perché)
  }
  const d = cartella()
  scrivi(d)
  const s = avvia(d)
  assert.equal((await s.leggi()).valore, 'true')
  conservati(d, 'alla migrazione')
  await s.servizio.finestra.dallaPersona({ themePreset: 'paper' })
  conservati(d, 'a una scrittura della finestra')
  await s.metti(false)
  conservati(d, 'a una scrittura del modello')
  await s.ferma()
  /* la scrittura della migrazione fallisce: la prossima porta tutto insieme, anche i campi sconosciuti */
  const d2 = cartella()
  scrivi(d2)
  let falliscono = true
  const t = avvia(d2, { scriviFn: async (file, contenuto) => { if (falliscono) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return scriviAtomico(file, contenuto) } })
  assert.equal((await t.leggi()).valore, 'true')
  falliscono = false
  await t.servizio.finestra.dallaPersona({ themePreset: 'paper' })
  conservati(d2, 'dopo una scrittura fallita')
})

test('MIG-13 (giro 4, revisore reperto 4) · copia in SOLA LETTURA: nessuna attesa di 1,3 s a ogni avvio, nessun `.non-rinominato`, disco intatto', { skip: process.platform !== 'win32' && 'sola lettura = attributo di Windows (su POSIX il rename la sostituisce)' }, async () => {
  const d = cartella()
  await chiudiLa020(await primaApertura020(d), d)
  const testo = readFileSync(fileCopia(d), 'utf8')
  chmodSync(fileCopia(d), 0o444)
  try {
    for (let avvio = 1; avvio <= 2; avvio += 1) {
      const t0 = performance.now()
      const s = avvia(d)
      assert.equal((await s.leggi()).valore, 'true', 'in memoria la migrazione vale: le due porte d accordo')
      const ms = performance.now() - t0
      await s.ferma()
      assert.ok(ms < 1000, `avvio ${avvio}: ${Math.round(ms)} ms (prima 1,3 s di ritenti del rename)`)
      assert.equal(readFileSync(fileCopia(d), 'utf8'), testo, `avvio ${avvio}: disco intatto`)
      assert.deepEqual(readdirSync(d).filter((n) => n.startsWith('.preferenze-finestra.json.')), [], `avvio ${avvio}: nessun temporaneo né .non-rinominato`)
    }
  } finally { chmodSync(fileCopia(d), 0o666) }
})

/*
 * 0.2.2-DL, giro 5 (revisione GIALLA del giro 3, reperto D1 MEDIO) — UNA SESSIONE «NON DECISA» NON PERDE UNA SCELTA, e la migrazione
 *   riprova nella STESSA sessione. Le ricevute «che ci sono ma non si leggono» qui sono una cartella al posto del file (EISDIR: subito,
 *   senza ritenti, su ogni sistema); `rimetti()` le fa tornare leggibili, con ciò che c'era dentro.
 *   (a) la scelta del modello con la ricevuta non si copre con l'aspetto intero mandato dalla finestra;
 *   (b) il false scelto dalla persona (o chiesto di nuovo dal modello, o con `/settings`) mentre la migrazione aspetta resta;
 *   (c) tornate leggibili, la migrazione decide senza aspettare il riavvio.
 */
function nascondiRicevute(d) {
  const f = fileRicevute(d)
  const daParte = `${f}.da-parte`
  const cera = existsSync(f)
  if (cera) renameSync(f, daParte)
  mkdirSync(f)
  return () => { rimuoviCartellaDiProva(f); if (cera) renameSync(daParte, f) }
}
async function maiToccata020(d) { return chiudiLa020(await primaApertura020(d), d) }
/** Le finestre aperte: gli eventi `talos.impostazioni-finestra` che il servizio manda. */
function ascolta(s) {
  const eventi = []
  s.servizio.finestra.ascolta((e) => { eventi.push({ valori: e.valori, revisione: e.revisione, origine: e.origine }) })
  return eventi
}

test('MIG-14 (giro 5, D1c) · blocco BREVE delle ricevute (2 s): tornate leggibili, la migrazione decide nella STESSA sessione; la scelta del modello resta', { skip: process.platform !== 'win32' && 'il blocco senza condivisione si misura su Windows' }, async () => {
  const d = cartella()
  const prima = await sceltaDelModello020(d)
  const { fine } = await bloccaFile(fileRicevute(d), 2000)
  let s
  const avvisi = await zitto(async () => {
    s = avvia(d)
    assert.equal((await s.leggi()).valore, 'false', 'durante il blocco: non decisa, il false resta')
    assert.equal(Object.hasOwn(sulDisco(d), 'migrazioni'), false, 'durante il blocco: nessun timbro')
    await fine
    await s.ferma() // la scrittura d'avvio delle ricevute le rilegge e fa ritentare la migrazione
  })
  assert.deepEqual(sulDisco(d).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], 'decisa senza riavvio')
  assert.equal(sulDisco(d).valori.userBubbleFullWidth, false, 'la ricevuta del modello c è: la scelta resta')
  assert.equal(sulDisco(d).revisione, prima.revisione + 1)
  assert.equal((await s.servizio.ricevute()).length, 1, 'le ricevute del disco in memoria una volta sola')
  assert.equal(avvisi.filter((a) => a.includes('full-width questions update waits')).length, 1, 'un avviso solo')
})

test('MIG-15 (giro 5, D1b) · mai toccata, ricevute illeggibili: il false che la persona sceglie dalla finestra in questa versione RESTA al riavvio', async () => {
  await zitto(async () => {
    /* la persona spegne (la finestra manda il false): la migrazione si chiude col timbro, senza aspettare le ricevute */
    const d = cartella()
    const prima = await maiToccata020(d)
    const rimetti = nascondiRicevute(d)
    const s = avvia(d)
    assert.equal((await s.leggi()).valore, 'false')
    const copia = await s.servizio.finestra.dallaPersona({ themePreset: 'paper', userBubbleFullWidth: false, chatFullWidth: false })
    assert.equal(copia.revisione, prima.revisione + 1, 'la revisione avanza: le altre finestre la riprendono')
    assert.deepEqual({ valore: sulDisco(d).valori.userBubbleFullWidth, timbro: sulDisco(d).migrazioni }, { valore: false, timbro: [MIGRAZIONE_DOMANDE_LARGHE] })
    await s.ferma()
    rimetti()
    const dopo = avvia(d)
    assert.equal((await dopo.leggi()).valore, 'false', 'riavvio con le ricevute leggibili (nessuna ricevuta): la scelta di questa versione resta')
    await dopo.ferma()

    /* lo stesso invio porta anche un altro cambio: una scrittura sola, col timbro */
    const d2 = cartella()
    const prima2 = await maiToccata020(d2)
    nascondiRicevute(d2)
    const scritture = []
    const t = avvia(d2, { scriviFn: async (file, contenuto) => { scritture.push(JSON.parse(contenuto)); return scriviAtomico(file, contenuto) } })
    await t.leggi()
    await t.servizio.finestra.dallaPersona({ themePreset: 'calm', userBubbleFullWidth: false, chatFullWidth: false })
    assert.equal(scritture.length, 1)
    assert.deepEqual({ rev: scritture[0].revisione, valori: scritture[0].valori, timbro: scritture[0].migrazioni },
      { rev: prima2.revisione + 1, valori: { themePreset: 'calm', userBubbleFullWidth: false, chatFullWidth: false }, timbro: [MIGRAZIONE_DOMANDE_LARGHE] })
    await t.ferma()

    /* tornate leggibili PRIMA del clic: il ritento decide (nessuna ricevuta ⇒ scarto), poi il false della persona si scrive e resta */
    const d3 = cartella()
    await maiToccata020(d3)
    const rimetti3 = nascondiRicevute(d3)
    const u = avvia(d3)
    await u.leggi()
    rimetti3()
    await u.servizio.finestra.dallaPersona({ themePreset: 'calm', userBubbleFullWidth: true, chatFullWidth: false }) // un altro cambio: fa ritentare
    assert.equal((await u.leggi()).valore, 'true', 'decisa al primo cambio: nessuna ricevuta, il false di serie della 0.2.0 è scartato')
    assert.deepEqual({ ha: Object.hasOwn(sulDisco(d3).valori, 'userBubbleFullWidth'), timbro: sulDisco(d3).migrazioni }, { ha: false, timbro: [MIGRAZIONE_DOMANDE_LARGHE] })
    await u.servizio.finestra.dallaPersona({ themePreset: 'calm', userBubbleFullWidth: false, chatFullWidth: false })
    await u.ferma()
    assert.equal((await avvia(d3).leggi()).valore, 'false')
  })
})

test('MIG-16 (giro 5, D1a) · scelta del modello con la ricevuta, ricevute illeggibili: l aspetto intero mandato dalla finestra NON la copre; tornate leggibili, resta e le finestre aperte la ricevono', async () => {
  await zitto(async () => {
    const d = cartella()
    const prima = await sceltaDelModello020(d)
    const rimetti = nascondiRicevute(d)
    const s = avvia(d)
    const eventi = ascolta(s)
    assert.equal((await s.leggi()).valore, 'false')
    /* la persona cambia UN ALTRA voce: la finestra 0.2.2, che mostra accesa di serie, manda l'aspetto intero */
    const copia = await s.servizio.finestra.dallaPersona({ themePreset: 'paper', userBubbleFullWidth: true, chatFullWidth: true })
    assert.deepEqual(sulDisco(d).valori, { themePreset: 'paper', userBubbleFullWidth: false, chatFullWidth: true }, 'l altra voce è scritta, il false no')
    assert.deepEqual({ rev: copia.revisione, timbro: sulDisco(d).migrazioni ?? null }, { rev: prima.revisione + 1, timbro: [] }, 'ancora non decisa: nessun timbro')
    assert.equal((await s.leggi()).valore, 'false')
    assert.deepEqual(eventi, [], 'finché non è decisa niente va alle finestre')
    /* le ricevute tornano leggibili: il prossimo invio della finestra fa ritentare, e il suo «accesa» (mai scelto) non copre la scelta */
    rimetti()
    const dopo = await s.servizio.finestra.dallaPersona({ themePreset: 'calm', userBubbleFullWidth: true, chatFullWidth: true })
    assert.deepEqual(sulDisco(d).valori, { themePreset: 'calm', userBubbleFullWidth: false, chatFullWidth: true })
    assert.deepEqual(sulDisco(d).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], 'decisa nella stessa sessione')
    assert.equal(dopo.revisione, prima.revisione + 3, 'la migrazione (la scelta resta, la revisione avanza) e poi il tema')
    assert.deepEqual(eventi, [{ valori: { userBubbleFullWidth: false }, revisione: prima.revisione + 2, origine: { tipo: 'aggiornamento' } }], 'la finestra aperta riceve la scelta: si spegne')
    assert.equal((await s.servizio.ricevute()).length, 1, 'le ricevute del disco in memoria una volta sola')
    await s.ferma()
    /* e resta al riavvio; un invio dopo il timbro vale come sempre (la persona la riaccende) */
    const n = avvia(d)
    assert.equal((await n.leggi()).valore, 'false')
    await n.servizio.finestra.dallaPersona({ userBubbleFullWidth: true })
    assert.equal((await n.leggi()).valore, 'true', 'dopo il timbro un «accesa» della finestra è una scelta')
    await n.ferma()

    /* senza altri cambi nella sessione, l'avvio dopo decide come nel giro 4 (la scelta resta, la revisione avanza) */
    const d2 = cartella()
    const prima2 = await sceltaDelModello020(d2)
    const rimetti2 = nascondiRicevute(d2)
    const t = avvia(d2)
    await t.leggi()
    await t.servizio.finestra.dallaPersona({ themePreset: 'paper', userBubbleFullWidth: true, chatFullWidth: true })
    await t.ferma()
    rimetti2()
    const v = avvia(d2)
    assert.equal((await v.leggi()).valore, 'false', 'la scelta con la ricevuta sopravvive al cambio di un altra voce')
    assert.deepEqual({ rev: sulDisco(d2).revisione, timbro: sulDisco(d2).migrazioni }, { rev: prima2.revisione + 2, timbro: [MIGRAZIONE_DOMANDE_LARGHE] })
  })
})

test('MIG-17 (giro 5, l altra porta di D1b) · mentre la migrazione aspetta, `/settings` della persona che la chiede spenta («già così») l ha scelta: resta, e le finestre aperte la ricevono; l anteprima del `set` del modello no (giro 6: l esecuzione sì, MIG-21)', async () => {
  await zitto(async () => {
    const d = cartella()
    const prima = await maiToccata020(d)
    const rimetti = nascondiRicevute(d)
    const s = avvia(d)
    const eventi = ascolta(s)
    /* il modello: l'ANTEPRIMA di un «già così» non decide niente e niente va alle finestre (giro 6: l'esecuzione chiude, vedi MIG-21) */
    const fn = s.servizio.perLaSessione({ sessionId: null })
    const anteprima = await fn('app_settings', { action: 'set', expected_revision: (await s.leggi()).rev, changes: [{ key: CHIAVE, value: false }] }, { fase: 'anteprima', toolCallId: 'c' })
    assert.equal(anteprima.carta, false)
    assert.deepEqual({ timbro: sulDisco(d).migrazioni ?? null, rev: sulDisco(d).revisione, eventi }, { timbro: null, rev: prima.revisione, eventi: [] }, 'l anteprima non chiude la migrazione')
    /* la persona, con `/settings` (anche dal dispositivo): è una scelta di questa versione */
    assert.deepEqual((await s.servizio.applicaDallaPersona({ changes: [{ key: CHIAVE, value: false }], origine: PERSONA })).gia, [CHIAVE])
    assert.deepEqual({ valore: sulDisco(d).valori.userBubbleFullWidth, timbro: sulDisco(d).migrazioni, rev: sulDisco(d).revisione },
      { valore: false, timbro: [MIGRAZIONE_DOMANDE_LARGHE], rev: prima.revisione + 1 })
    assert.deepEqual(eventi, [{ valori: { userBubbleFullWidth: false }, revisione: prima.revisione + 1, origine: { tipo: 'aggiornamento' } }], 'la finestra aperta, che mostra accesa, si spegne')
    await s.ferma()
    rimetti()
    const n = avvia(d)
    assert.equal((await n.leggi()).valore, 'false', 'al riavvio (nessuna ricevuta) la scelta resta')
    await n.ferma()

    /* un altra voce «già così» non chiude niente */
    const d2 = cartella()
    await maiToccata020(d2)
    nascondiRicevute(d2)
    const t = avvia(d2)
    await t.leggi()
    assert.deepEqual((await t.servizio.applicaDallaPersona({ changes: [{ key: 'appearance.theme', value: 'paper' }], origine: PERSONA })).gia, ['appearance.theme'])
    assert.equal(Object.hasOwn(sulDisco(d2), 'migrazioni'), false)
    await t.ferma()
  })
})

test('MIG-18 (giro 5) · il ritento parte prima di ogni scrittura del modello; un «accesa» scritto mentre aspetta resta e prende il timbro', async () => {
  await zitto(async () => {
    /* mai toccata: tornate leggibili, il modello cambia il tema ⇒ la migrazione decide in quella scrittura (scarto), e la finestra lo sa */
    const d = cartella()
    const prima = await maiToccata020(d)
    const rimetti = nascondiRicevute(d)
    const s = avvia(d)
    const eventi = ascolta(s)
    await s.leggi()
    rimetti()
    const fn = s.servizio.perLaSessione({ sessionId: null })
    const set = await fn('app_settings', { action: 'set', expected_revision: (await s.leggi()).rev, changes: [{ key: 'appearance.theme', value: 'calm' }] }, { fase: 'esegui', toolCallId: 'c' })
    assert.match(set.testo, /→ "calm"/u)
    assert.deepEqual(sulDisco(d).valori, { themePreset: 'calm', chatFullWidth: false }, 'il false di serie della 0.2.0 è scartato, il tema è scritto')
    assert.deepEqual({ timbro: sulDisco(d).migrazioni, rev: sulDisco(d).revisione }, { timbro: [MIGRAZIONE_DOMANDE_LARGHE], rev: prima.revisione + 2 })
    assert.deepEqual(eventi[0], { valori: { userBubbleFullWidth: true }, revisione: prima.revisione + 1, origine: { tipo: 'aggiornamento' } }, 'accesa di serie, detto alle finestre aperte')
    assert.equal((await s.leggi()).valore, 'true')
    await s.ferma()

    /* ricevute ancora illeggibili: il modello l'ACCENDE (una scelta vera, con la ricevuta in memoria); al riavvio resta, col timbro */
    const d2 = cartella()
    await maiToccata020(d2)
    const rimetti2 = nascondiRicevute(d2)
    const t = avvia(d2)
    assert.match((await t.metti(true)).testo, /false → true/u)
    assert.deepEqual({ valore: sulDisco(d2).valori.userBubbleFullWidth, timbro: sulDisco(d2).migrazioni ?? null }, { valore: true, timbro: [] })
    await t.ferma()
    rimetti2()
    const n = avvia(d2)
    assert.equal((await n.leggi()).valore, 'true')
    assert.deepEqual(sulDisco(d2).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE])
  })
})

test('MIG-19 (giro 5) · la copia: una migrazione in sospeso si ritenta, lo dice una volta sola, e i campi che non dichiara passano come sempre', async () => {
  const scrivi = (d, valori) => writeFileSync(fileCopia(d), `${JSON.stringify({ schema: 'talos.window-preferences.v1', revisione: 5, valori, aggiornataIl: null }, null, 1)}\n`)
  const d = cartella()
  scrivi(d, { a: false, b: 'x' })
  const copia = creaCopiaFinestra({ file: fileCopia(d) })
  const chiamate = []
  const chiuse = []
  let pronto = false
  const decidi = async (valori, opzioni) => { chiamate.push(opzioni); if (!pronto) throw new Error('not yet'); const { a: _a, ...resto } = valori; return { valori: resto } }
  assert.equal(await copia.migraUnaVolta('prova-1', decidi, { campi: ['a', 'NON VALIDO', 7], quandoSiChiude: (c) => { chiuse.push(c) } }), 'non-decisa')
  assert.equal(await copia.ritentaMigrazioni(), 'non-decisa')
  /* in sospeso: `a` diverso non si scrive, `b` sì; nessun timbro */
  assert.deepEqual((await copia.dallaFinestra({ a: true, b: 'y' })).valori, { a: false, b: 'y' })
  assert.deepEqual({ rev: sulDisco(d).revisione, timbro: sulDisco(d).migrazioni }, { rev: 6, timbro: [] })
  /* un campo che la migrazione NON dichiara, mandato uguale, non chiude niente */
  await copia.dallaFinestra({ b: 'y' })
  assert.deepEqual(sulDisco(d).migrazioni, [])
  assert.deepEqual(chiuse, [])
  pronto = true
  assert.equal(await copia.ritentaMigrazioni(), 'fatta')
  assert.deepEqual(chiamate.map((c) => c.ritento), [false, true, true, true, true], 'il primo tentativo no, i ritenti sì (uno per scrittura e uno per richiesta)')
  assert.deepEqual(chiuse, [{ revisione: 7, valori: { b: 'y' } }], 'chiusa: detto una volta, coi valori decisi')
  assert.equal(await copia.ritentaMigrazioni(), null, 'niente più in sospeso')
  assert.deepEqual((await copia.dallaFinestra({ a: true })).valori, { a: true, b: 'y' }, 'dopo il timbro la finestra scrive come sempre')
  assert.equal(chiamate.length, 5)

  /* decisa al PRIMO tentativo: nessun annuncio (la finestra la legge all'avvio) */
  const d2 = cartella()
  scrivi(d2, { a: false })
  const subito = creaCopiaFinestra({ file: fileCopia(d2) })
  const chiuse2 = []
  assert.equal(await subito.migraUnaVolta('prova-1', async (valori) => ({ valori, avanza: true }), { campi: ['a'], quandoSiChiude: (c) => { chiuse2.push(c) } }), 'fatta')
  assert.deepEqual(chiuse2, [])
  assert.equal(await subito.confermaInSospeso(['a']), false)

  /* la scrittura del solo timbro fallisce: nessun errore per chi ha scelto, vale in memoria e va sul disco con la scrittura dopo */
  const d3 = cartella()
  scrivi(d3, { a: false, b: 'x' })
  let falliscono = true
  const rotta = creaCopiaFinestra({ file: fileCopia(d3), scriviFn: async (file, contenuto) => { if (falliscono) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return scriviAtomico(file, contenuto) } })
  await rotta.migraUnaVolta('prova-1', async () => { throw new Error('not yet') }, { campi: ['a'] })
  assert.deepEqual(await rotta.dallaFinestra({ a: false }), { revisione: 6, valori: { a: false, b: 'x' } })
  assert.equal(sulDisco(d3).revisione, 5, 'il disco non si è scritto')
  assert.equal(await rotta.ritentaMigrazioni(), null, 'ma la migrazione è chiusa')
  /* un cambio VERO che non si scrive resta un errore, e la migrazione resta in sospeso */
  const d4 = cartella()
  scrivi(d4, { a: false, b: 'x' })
  const rotta4 = creaCopiaFinestra({ file: fileCopia(d4), scriviFn: async (file, contenuto) => { if (falliscono) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return scriviAtomico(file, contenuto) } })
  await rotta4.migraUnaVolta('prova-1', async () => { throw new Error('not yet') }, { campi: ['a'] })
  await assert.rejects(() => rotta4.dallaFinestra({ a: false, b: 'y' }), /disk full/u)
  assert.equal(await rotta4.ritentaMigrazioni(), 'non-decisa')
  falliscono = false
  await rotta.dallaFinestra({ b: 'y' })
  assert.deepEqual({ rev: sulDisco(d3).revisione, valori: sulDisco(d3).valori, timbro: sulDisco(d3).migrazioni }, { rev: 7, valori: { a: false, b: 'y' }, timbro: ['prova-1'] })
})

test('MIG-20 (giro 5) · copia in SOLA LETTURA e migrazione in sospeso: il false scelto dalla persona non aspetta 1,3 s, non lascia `.non-rinominato` e non è un errore', { skip: process.platform !== 'win32' && 'sola lettura = attributo di Windows (su POSIX il rename la sostituisce)' }, async () => {
  const d = cartella()
  await maiToccata020(d)
  nascondiRicevute(d)
  const testo = readFileSync(fileCopia(d), 'utf8')
  chmodSync(fileCopia(d), 0o444)
  try {
    await zitto(async () => {
      const s = avvia(d)
      await s.leggi()
      const t0 = performance.now()
      const copia = await s.servizio.finestra.dallaPersona({ themePreset: 'paper', userBubbleFullWidth: false, chatFullWidth: false })
      const ms = performance.now() - t0
      assert.ok(ms < 1000, `${Math.round(ms)} ms`)
      assert.equal(copia.valori.userBubbleFullWidth, false)
      assert.equal(await s.copia.ritentaMigrazioni(), null, 'chiusa in memoria')
      await s.ferma()
    })
    assert.equal(readFileSync(fileCopia(d), 'utf8'), testo, 'disco intatto')
    assert.deepEqual(readdirSync(d).filter((n) => n.startsWith('.preferenze-finestra.json.')), [])
  } finally { chmodSync(fileCopia(d), 0o666) }
})

test('MIG-14b (giro 5) · durante il blocco un cambio dalla finestra non aspetta i ritenti; allo sblocco decide il primo che legge, e le ricevute del disco entrano in memoria UNA volta', { skip: process.platform !== 'win32' && 'il blocco senza condivisione si misura su Windows' }, async () => {
  const d = cartella()
  await sceltaDelModello020(d)
  const { fine } = await bloccaFile(fileRicevute(d), 2000)
  const invio = { themePreset: 'calm', userBubbleFullWidth: true, chatFullWidth: false }
  let s
  let primoMs
  await zitto(async () => {
    s = avvia(d)
    await s.leggi() // ~1,3 s: non decisa; la scrittura d'avvio delle ricevute le sta rileggendo coi ritenti interi
    const t0 = performance.now()
    await s.servizio.finestra.dallaPersona(invio)
    primoMs = performance.now() - t0
    /* la finestra insiste con lo stesso invio: ogni volta UN tentativo di lettura; allo sblocco il suo arriva prima del ritento lento,
       che poi legge anche lui (e non deve rimettere in memoria le stesse ricevute) */
    const scadenza = performance.now() + 8000
    while (!sulDisco(d).migrazioni?.includes(MIGRAZIONE_DOMANDE_LARGHE) && performance.now() < scadenza) await s.servizio.finestra.dallaPersona(invio)
    await fine
    await s.ferma()
  })
  assert.ok(primoMs < 400, `il cambio durante il blocco: ${Math.round(primoMs)} ms (coi ritenti interi sarebbero oltre 600)`)
  assert.deepEqual({ piena: sulDisco(d).valori.userBubbleFullWidth, tema: sulDisco(d).valori.themePreset, timbro: sulDisco(d).migrazioni },
    { piena: false, tema: 'calm', timbro: [MIGRAZIONE_DOMANDE_LARGHE] }, 'il tema è scritto, la scelta del modello resta, decisa nella sessione')
  assert.equal((await s.servizio.ricevute()).length, 1, 'due riletture insieme: le ricevute del disco una volta sola')
})

test('MIG-19b (giro 5) · la copia: la riconferma chiude la migrazione in sospeso solo per un campo che lei decide, e lo dice', async () => {
  const d = cartella()
  writeFileSync(fileCopia(d), `${JSON.stringify({ schema: 'talos.window-preferences.v1', revisione: 5, valori: { a: false, b: 'x' }, aggiornataIl: null }, null, 1)}\n`)
  const copia = creaCopiaFinestra({ file: fileCopia(d) })
  const chiuse = []
  await copia.migraUnaVolta('prova-1', async () => { throw new Error('not yet') }, { campi: ['a'], quandoSiChiude: (c) => { chiuse.push(c) } })
  assert.equal(await copia.confermaInSospeso(['b']), false, 'un campo che la migrazione non decide')
  assert.equal(await copia.confermaInSospeso('a'), false, 'non un elenco')
  assert.equal(Object.hasOwn(sulDisco(d), 'migrazioni'), false)
  assert.equal(await copia.confermaInSospeso(['b', 'a']), true)
  assert.deepEqual({ rev: sulDisco(d).revisione, valori: sulDisco(d).valori, timbro: sulDisco(d).migrazioni }, { rev: 6, valori: { a: false, b: 'x' }, timbro: ['prova-1'] })
  assert.deepEqual(chiuse, [{ revisione: 6, valori: { a: false, b: 'x' } }])
  assert.equal(await copia.confermaInSospeso(['a']), false, 'già chiusa')
  assert.deepEqual((await copia.leggi({ perLaFinestra: true })).valori, { a: false, b: 'x' }, 'chiusa: la finestra la legge intera')
  /* e finché aspetta, la copia letta dalla finestra non porta il campo in sospeso (il modello sì) */
  const d2 = cartella()
  writeFileSync(fileCopia(d2), `${JSON.stringify({ schema: 'talos.window-preferences.v1', revisione: 5, valori: { a: false, b: 'x' }, aggiornataIl: null }, null, 1)}\n`)
  const sospesa = creaCopiaFinestra({ file: fileCopia(d2) })
  await sospesa.migraUnaVolta('prova-1', async () => { throw new Error('not yet') }, { campi: ['a'] })
  assert.deepEqual({ finestra: (await sospesa.leggi({ perLaFinestra: true })).valori, modello: (await sospesa.leggi()).valori }, { finestra: { b: 'x' }, modello: { a: false, b: 'x' } })
})

/*
 * 0.2.2-DL, giro 6 (controllore GIALLO del giro 5, R-A; owner 10/11/2026 22:51 «un piccolo segno a schermo quando finestra e assistente
 *   non sono d'accordo») — IL LATO SERVER DEL SEGNO, e la porta del modello che dice il vero.
 *   · finché la migrazione aspetta, la copia letta dalla finestra (e la risposta al suo invio) porta `nonConfermati`: il valore che il
 *     modello legge, FUORI da `valori` (la finestra non lo applica e non lo salva: lo confronta con ciò che mostra);
 *   · `list` e `pick` del modello dicono che la voce non è confermata; il suo `set` allo stesso valore, ESEGUITO, la conferma (la persona
 *     gliel'ha chiesta): timbro, revisione, e la finestra aperta la segue. Giudice v1377 (iii): MAI alla sola lettura né in anteprima;
 *   · quando le due parti sono d'accordo `nonConfermati` non c'è e le righe del modello non cambiano (giudice (ii): rumore zero).
 */
const ROTTA_FINESTRA = '/api/v1/app-settings/window'
test('MIG-21 (giro 6, R-A) · in attesa: la finestra riceve `nonConfermati`, il modello lo DICE, la sola lettura non decide MAI e il `set` eseguito allo stesso valore conferma', async () => {
  await zitto(async () => {
    const d = cartella()
    const prima = await maiToccata020(d)
    nascondiRicevute(d)
    const s = avvia(d)
    const eventi = ascolta(s)
    const rotta = creaRotteImpostazioni({ servizio: s.servizio })
    const fn = s.servizio.perLaSessione({ sessionId: null })
    const elenco = async () => (await fn('app_settings', { action: 'list', query: CHIAVE }, { fase: 'esegui' })).testo.split('\n').find((r) => r.includes(CHIAVE))
    const scegli = async () => (await fn('app_settings', { action: 'pick', key: CHIAVE }, { fase: 'esegui' })).testo
    /* la finestra: il valore in attesa sta in `nonConfermati`, mai in `valori`; la rotta lo porta, in lettura e in risposta all'invio */
    assert.deepEqual(await s.servizio.finestra.leggi(), { revisione: prima.revisione, valori: { themePreset: 'paper', chatFullWidth: false }, nonConfermati: { userBubbleFullWidth: false } })
    assert.deepEqual((await rotta({ method: 'GET', percorso: ROTTA_FINESTRA })).dati.nonConfermati, { userBubbleFullWidth: false })
    const invio = await rotta({ method: 'POST', percorso: ROTTA_FINESTRA, corpo: { valori: { themePreset: 'calm', userBubbleFullWidth: true, chatFullWidth: false } } })
    assert.deepEqual(invio.dati, { revisione: prima.revisione + 1, nonConfermati: { userBubbleFullWidth: false } }, 'la risposta all invio di un altra voce lo ripete: resta in attesa')
    /* (iii) la sola lettura, cinque volte ogni porta, e l'anteprima del set: niente deciso, niente scritto, niente alle finestre */
    for (let i = 0; i < 5; i += 1) {
      assert.match(await elenco(), /= false; .*not confirmed yet/u)
      assert.match(await scegli(), /is false\. Not confirmed yet/u)
      await fn('app_settings', { action: 'list', section: 'appearance' }, { fase: 'esegui' })
      await fn('app_settings', { action: 'list', query: CHIAVE }, { fase: 'anteprima' })
      assert.equal((await fn('app_settings', { action: 'set', expected_revision: (await s.leggi()).rev, changes: [{ key: CHIAVE, value: false }] }, { fase: 'anteprima', toolCallId: `a${i}` })).carta, false, '0 carte in più')
      await s.servizio.finestra.leggi()
      await rotta({ method: 'GET', percorso: ROTTA_FINESTRA })
    }
    assert.deepEqual({ timbro: sulDisco(d).migrazioni, rev: sulDisco(d).revisione, piena: sulDisco(d).valori.userBubbleFullWidth, eventi },
      { timbro: [], rev: prima.revisione + 1, piena: false, eventi: [] }, 'letture e anteprime non chiudono niente (la revisione +1 è il tema)')
    /* la persona gliela chiede spenta: il set ESEGUITO la conferma e lo dice, la finestra aperta la segue */
    const set = await s.metti(false)
    /* giro 7 (K2, controllore del giro 6): ciò che la persona VEDE cambia ⇒ la risposta dice il cambio com'è (mai «stays») e c'è la
       ricevuta, come per ogni cambio del modello (MIG-26 la guarda tutta) */
    assert.match(set.testo, /^appearance\.userBubbleFullWidth: true → false \(/u)
    assert.doesNotMatch(set.testo, /Nothing to change|stays/u)
    assert.match(set.ricevuta, /^set-/u, 'la ricevuta del cambio che la persona ha visto')
    assert.deepEqual({ timbro: sulDisco(d).migrazioni, rev: sulDisco(d).revisione, piena: sulDisco(d).valori.userBubbleFullWidth }, { timbro: [MIGRAZIONE_DOMANDE_LARGHE], rev: prima.revisione + 2, piena: false })
    assert.deepEqual(eventi, [{ valori: { userBubbleFullWidth: false }, revisione: prima.revisione + 2, origine: { tipo: 'aggiornamento' } }], 'la finestra aperta, che mostra accesa, si spegne')
    /* d'accordo: niente `nonConfermati`, le righe tornano quelle di sempre, e un secondo set uguale non ha niente da fare */
    const dopo = await s.servizio.finestra.leggi()
    assert.deepEqual({ ha: Object.hasOwn(dopo, 'nonConfermati'), piena: dopo.valori.userBubbleFullWidth }, { ha: false, piena: false })
    assert.doesNotMatch(await elenco(), /not confirmed/iu)
    assert.doesNotMatch(await scegli(), /not confirmed/iu)
    assert.match((await s.metti(false)).testo, /^Nothing to change/u)
    assert.equal(eventi.length, 1)
    await s.ferma()
  })
})

test('MIG-21b (giro 6, giudice (ii)) · d accordo ⇒ `nonConfermati` non c è MAI: installazione nuova, mai toccata decisa, scelta del modello decisa, 5 letture e 5 invii ciascuna', async () => {
  const casi = { nuova: async () => {}, maiToccata: maiToccata020, modello: sceltaDelModello020 }
  for (const [caso, prepara] of Object.entries(casi)) {
    const d = cartella()
    await prepara(d)
    const s = avvia(d)
    const rotta = creaRotteImpostazioni({ servizio: s.servizio })
    const fn = s.servizio.perLaSessione({ sessionId: null })
    for (let i = 0; i < 5; i += 1) {
      assert.equal(Object.hasOwn(await s.servizio.finestra.leggi(), 'nonConfermati'), false, caso)
      assert.equal(Object.hasOwn((await rotta({ method: 'GET', percorso: ROTTA_FINESTRA })).dati, 'nonConfermati'), false, caso)
      assert.deepEqual(Object.keys((await rotta({ method: 'POST', percorso: ROTTA_FINESTRA, corpo: { valori: { chatFullWidth: i % 2 === 0 } } })).dati), ['revisione'], caso)
      assert.doesNotMatch((await fn('app_settings', { action: 'list', query: CHIAVE }, { fase: 'esegui' })).testo, /not confirmed/iu, caso)
      assert.doesNotMatch((await fn('app_settings', { action: 'pick', key: CHIAVE }, { fase: 'esegui' })).testo, /not confirmed/iu, caso)
    }
    await s.ferma()
  }
})

test('MIG-21c (giro 6) · il `set` del modello che cambia UN ALTRA voce e ripete questa uguale la conferma nella stessa chiamata, e lo dice', async () => {
  await zitto(async () => {
    const d = cartella()
    const prima = await maiToccata020(d)
    nascondiRicevute(d)
    const s = avvia(d)
    const fn = s.servizio.perLaSessione({ sessionId: null })
    const set = await fn('app_settings', { action: 'set', expected_revision: (await s.leggi()).rev, changes: [{ key: 'appearance.theme', value: 'calm' }, { key: CHIAVE, value: false }] }, { fase: 'esegui', toolCallId: 'c' })
    assert.match(set.testo, /→ "calm"/u)
    assert.match(set.testo, /appearance\.userBubbleFullWidth: true → false \(/u) // giro 7 (K2): il cambio che la persona vede, mai «stays»
    assert.doesNotMatch(set.testo, /stays/u)
    assert.deepEqual({ timbro: sulDisco(d).migrazioni, piena: sulDisco(d).valori.userBubbleFullWidth, tema: sulDisco(d).valori.themePreset, rev: sulDisco(d).revisione },
      { timbro: [MIGRAZIONE_DOMANDE_LARGHE], piena: false, tema: 'calm', rev: prima.revisione + 2 })
    await s.ferma()
  })
})

test('MIG-22 (giro 6, R-C; mutante C8 del controllore) · «già così» chiesto dal DISPOSITIVO mentre la migrazione aspetta è una scelta: resta, col timbro, le finestre aperte la ricevono', async () => {
  await zitto(async () => {
    const d = cartella()
    const prima = await maiToccata020(d)
    const rimetti = nascondiRicevute(d)
    const s = avvia(d)
    const eventi = ascolta(s)
    const esito = await s.servizio.applicaDallaPersona({ changes: [{ key: CHIAVE, value: false }], origine: { tipo: 'dispositivo', dispositivoId: 'pad' } })
    assert.deepEqual({ gia: esito.gia, ricevuta: esito.ricevuta, cambi: esito.cambi }, { gia: [CHIAVE], ricevuta: null, cambi: [] })
    assert.deepEqual({ valore: sulDisco(d).valori.userBubbleFullWidth, timbro: sulDisco(d).migrazioni, rev: sulDisco(d).revisione }, { valore: false, timbro: [MIGRAZIONE_DOMANDE_LARGHE], rev: prima.revisione + 1 })
    assert.deepEqual(eventi, [{ valori: { userBubbleFullWidth: false }, revisione: prima.revisione + 1, origine: { tipo: 'aggiornamento' } }], 'la finestra del PC, che mostra accesa, si spegne')
    assert.equal(Object.hasOwn(await s.servizio.finestra.leggi(), 'nonConfermati'), false)
    await s.ferma()
    rimetti()
    const n = avvia(d)
    assert.equal((await n.leggi()).valore, 'false', 'al riavvio (nessuna ricevuta) la scelta fatta dal dispositivo resta')
    await n.ferma()
  })
})

test('MIG-23 (giro 6, R-D; mutanti C4 e C5 del controllore) · l avviso nel log una volta sola anche dopo più ritenti; decisa al ritento con la copia che non si scrive ⇒ chi l ha registrata lo sa lo stesso', async () => {
  const d = cartella()
  await maiToccata020(d)
  nascondiRicevute(d)
  const avvisi = await zitto(async () => { const s = avvia(d); await s.leggi(); await s.copia.ritentaMigrazioni(); await s.copia.ritentaMigrazioni(); await s.ferma() })
  assert.equal(avvisi.filter((a) => a.includes('full-width questions update waits')).length, 1, 'C4: tre tentativi, un avviso')
  /* C5: la copia decide al ritento, la scrittura fallisce ⇒ vale in memoria e chi l'ha registrata viene avvisato */
  const d2 = cartella()
  writeFileSync(fileCopia(d2), `${JSON.stringify({ schema: 'talos.window-preferences.v1', revisione: 5, valori: { a: false, b: 'x' }, aggiornataIl: null }, null, 1)}\n`)
  const copia = creaCopiaFinestra({ file: fileCopia(d2), scriviFn: async () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) } })
  const chiuse = []
  let pronto = false
  await copia.migraUnaVolta('prova-1', async (valori) => { if (!pronto) throw new Error('not yet'); return { valori, avanza: true } }, { campi: ['a'], quandoSiChiude: (c) => { chiuse.push(c) } })
  pronto = true
  assert.equal(await copia.ritentaMigrazioni(), 'non-scritta')
  assert.deepEqual(chiuse, [{ revisione: 6, valori: { a: false, b: 'x' } }])
})

/*
 * giro 6, ripresa (mutanti S8, S3, S17 rimasti vivi alla prima corsa): le prove che mancavano.
 *   · S8: l'ANTEPRIMA di un `set` con un cambio vero (la carta) che ripete questa voce uguale non conferma niente: la carta non è ancora
 *     un sì, e la persona può rifiutarla. Solo l'esecuzione (MIG-21c) conferma. Giudice v1377 (iii).
 *   · S3: chi legge la copia senza essere la finestra (il modello, `leggiFonte`) riceve `{ revisione, valori }` e basta.
 *   · S17: un campo dichiarato dalla migrazione che la copia non ha non è «non confermato» (nessun valore da confrontare). Node,
 *     `assert.deepStrictEqual` (documentazione letta l'11/11/2026): contano le proprietà proprie enumerabili, quindi `{ c: undefined }` ≠ `{}`.
 */
test('MIG-24 (giro 6, ripresa; mutante S8) · l ANTEPRIMA di un `set` con un cambio vero che ripete questa voce uguale non la conferma; l esecuzione sì', async () => {
  await zitto(async () => {
    const d = cartella()
    const prima = await maiToccata020(d)
    nascondiRicevute(d)
    const s = avvia(d)
    const eventi = ascolta(s)
    const fn = s.servizio.perLaSessione({ sessionId: null })
    const argomenti = { action: 'set', expected_revision: (await s.leggi()).rev, changes: [{ key: 'appearance.theme', value: 'calm' }, { key: CHIAVE, value: false }] }
    for (let i = 0; i < 3; i += 1) {
      const anteprima = await fn('app_settings', argomenti, { fase: 'anteprima', toolCallId: `p${i}` })
      assert.equal(anteprima.carta, true, 'il tema cambia: la carta c è (e la persona può dire no)')
    }
    assert.deepEqual({ timbro: sulDisco(d).migrazioni ?? [], rev: sulDisco(d).revisione, eventi, sospesa: (await s.servizio.finestra.leggi()).nonConfermati },
      { timbro: [], rev: prima.revisione, eventi: [], sospesa: { userBubbleFullWidth: false } }, 'tre anteprime: niente chiuso, niente scritto, niente alle finestre')
    assert.match((await fn('app_settings', { action: 'list', query: CHIAVE }, { fase: 'esegui' })).testo, /not confirmed yet/u)
    /* al contrario: la stessa chiamata ESEGUITA (la persona ha detto sì alla carta) la conferma */
    const set = await fn('app_settings', argomenti, { fase: 'esegui', toolCallId: 'p-si' })
    assert.match(set.testo, /appearance\.userBubbleFullWidth: true → false \(/u) // giro 7 (K2): il cambio che la persona vede, mai «stays»
    assert.doesNotMatch(set.testo, /stays/u)
    assert.deepEqual({ timbro: sulDisco(d).migrazioni, chiusa: eventi.filter((e) => e.origine?.tipo === 'aggiornamento').map((e) => e.valori), tema: eventi.some((e) => e.valori?.themePreset === 'calm') },
      { timbro: [MIGRAZIONE_DOMANDE_LARGHE], chiusa: [{ userBubbleFullWidth: false }], tema: true }, 'la finestra aperta riceve la chiusura e il tema')
    await s.ferma()
  })
})

test('MIG-25 (giro 6, ripresa; mutanti S3 e S17) · la copia: `nonConfermati` solo alla finestra e solo per i campi che ha; il modello legge i valori interi e basta', async () => {
  const copiaDa = async (campi) => {
    const d = cartella()
    writeFileSync(fileCopia(d), `${JSON.stringify({ schema: 'talos.window-preferences.v1', revisione: 5, valori: { a: false, b: 'x' }, aggiornataIl: null }, null, 1)}\n`)
    const copia = creaCopiaFinestra({ file: fileCopia(d) })
    assert.equal(await copia.migraUnaVolta('prova-1', async () => { throw new Error('not yet') }, { campi }), 'non-decisa')
    return copia
  }
  /* S3: il modello (`leggiFonte`) legge senza `perLaFinestra`: i valori interi, il campo in sospeso compreso, e nessun campo in più */
  const copia = await copiaDa(['a', 'c'])
  assert.deepEqual(await copia.leggi(), { revisione: 5, valori: { a: false, b: 'x' } })
  /* S17: «c» la migrazione lo dichiara ma la copia non lo ha: non è in sospeso per nessuno */
  assert.deepEqual(await copia.leggi({ perLaFinestra: true }), { revisione: 5, valori: { b: 'x' }, nonConfermati: { a: false } })
  assert.deepEqual(await copia.nonConfermati(), { a: false })
  const soloAssente = await copiaDa(['c'])
  assert.deepEqual({ finestra: await soloAssente.leggi({ perLaFinestra: true }), nonConfermati: await soloAssente.nonConfermati() },
    { finestra: { revisione: 5, valori: { a: false, b: 'x' } }, nonConfermati: {} }, 'niente da confrontare ⇒ niente segno')
})

/*
 * 0.2.2-DL, giro 7 (controllore del giro 6, K2 / R1 e R2; brief del giro 7, punto 1) — LA CONFERMA DEL MODELLO LASCIA LA RICEVUTA.
 *   Finché la migrazione aspetta, la finestra mostra accesa (il suo valore di serie) e il modello legge spenta. Il `set` del modello
 *   ESEGUITO allo stesso valore la conferma (giro 6, resta: 0 carte per il `set` puro, regola 17): ma ciò che la persona VEDE cambia,
 *   «accesa → spenta». Allora quel cambio ha la traccia di ogni altro cambio del modello: la ricevuta «accesa → spenta» con origine
 *   modello (da lei nascono la riga «Cambiata da TALOS · Annulla» e la notifica), la risposta al modello dice il cambio com'è (mai
 *   «stays false»), nel `set` misto la carta elenca ANCHE questa voce, e l'Annulla della ricevuta la rimette accesa.
 *   Come WorkOS (blog «AI agent trace tampering and audit logs», letto l'11/11/2026): «Emit an audit event for every agent action that
 *   changes state, with the agent as the actor».
 */
test('MIG-26 (giro 7, K2a) · `set` PURO allo stesso valore mentre aspetta: 0 carte, ricevuta «true → false» con origine modello, risposta col cambio vero, notifica; l Annulla della persona la rimette accesa', async () => {
  await zitto(async () => {
    const d = cartella()
    await maiToccata020(d)
    nascondiRicevute(d)
    const notifiche = []
    const s = avvia(d, { osservaCambioFn: (r) => { notifiche.push(r) } })
    const eventi = ascolta(s)
    const fn = s.servizio.perLaSessione({ sessionId: null })
    const argomenti = { action: 'set', expected_revision: (await s.leggi()).rev, changes: [{ key: CHIAVE, value: false }] }
    assert.deepEqual(await fn('app_settings', argomenti, { fase: 'anteprima', toolCallId: 'k2' }), { ok: true, carta: false }, 'regola 17: 0 carte in più')
    const set = await fn('app_settings', argomenti, { fase: 'esegui', toolCallId: 'k2' })
    assert.match(set.testo, /^appearance\.userBubbleFullWidth: true → false \(this app, window preference\)/u, 'il cambio come la persona lo vede')
    assert.match(set.testo, /not confirmed yet/u, 'e perché: per il modello valeva già false')
    assert.doesNotMatch(set.testo, /stays|Nothing to change/u)
    assert.match(set.testo, / Receipt set-[A-Za-z0-9]+ \(undo with receipt_id\)\./u, 'la forma che la riga della chat legge (`ricevutaDallEsito`)')
    const [ricevuta] = await s.servizio.ricevute()
    assert.equal(set.ricevuta, ricevuta.id)
    assert.deepEqual({ origine: ricevuta.origine?.tipo, cambi: ricevuta.cambi, annulla: ricevuta.annulla, annullata: ricevuta.annullata },
      { origine: 'modello', cambi: [{ chiave: CHIAVE, ambito: 'app', prima: true, dopo: false }], annulla: undefined, annullata: null }, 'la ricevuta di un cambio del modello: nasce «Cambiata da TALOS · Annulla»')
    await new Promise((r) => { setImmediate(r) })
    assert.deepEqual(notifiche.map((r) => r.id), [ricevuta.id], 'la notifica, come per ogni cambio del modello')
    assert.deepEqual({ timbro: sulDisco(d).migrazioni, piena: sulDisco(d).valori.userBubbleFullWidth, eventi: eventi.map((e) => e.valori) },
      { timbro: [MIGRAZIONE_DOMANDE_LARGHE], piena: false, eventi: [{ userBubbleFullWidth: false }] }, 'la conferma del giro 6 resta')
    /* l'Annulla della persona (il segno «Cambiata da TALOS · Annulla»): torna com'era a schermo, accesa, per tutti */
    const annullo = await s.servizio.annullaDallaPersona({ receiptId: ricevuta.id, origine: PERSONA })
    assert.deepEqual(annullo.cambi, [{ chiave: CHIAVE, ambito: 'app', prima: false, dopo: true }])
    assert.deepEqual({ modello: (await s.leggi()).valore, disco: sulDisco(d).valori.userBubbleFullWidth, ultimo: eventi.at(-1).valori }, { modello: 'true', disco: true, ultimo: { userBubbleFullWidth: true } })
    /* al contrario: d'accordo, lo stesso `set` non lascia niente (nessuna ricevuta nuova, nessuna notifica) */
    const prima = (await s.servizio.ricevute()).length
    await s.metti(true)
    assert.equal((await s.servizio.ricevute()).length, prima, 'già così: niente ricevuta')
    await s.ferma()
  })
})

test('MIG-26b (giro 7, K2b) · `set` MISTO (tema + questa voce uguale) mentre aspetta: la CARTA elenca anche questa voce, la ricevuta ha i due cambi, l Annulla li rimette tutti e due', async () => {
  await zitto(async () => {
    const d = cartella()
    await maiToccata020(d)
    nascondiRicevute(d)
    const s = avvia(d)
    const fn = s.servizio.perLaSessione({ sessionId: null })
    const argomenti = { action: 'set', expected_revision: (await s.leggi()).rev, changes: [{ key: 'appearance.theme', value: 'calm' }, { key: CHIAVE, value: false }] }
    const anteprima = await fn('app_settings', argomenti, { fase: 'anteprima', toolCallId: 'k2b' })
    assert.equal(anteprima.carta, true, 'una carta sola, come prima (0 carte in più)')
    assert.deepEqual(anteprima.azione.cambi.map((c) => [c.chiave, c.prima, c.dopo]), [['appearance.theme', 'paper', 'calm'], [CHIAVE, true, false]], 'la persona approva ciò che vedrà cambiare')
    assert.deepEqual((await s.servizio.finestra.leggi()).nonConfermati, { userBubbleFullWidth: false }, 'la carta non decide niente')
    const set = await fn('app_settings', argomenti, { fase: 'esegui', toolCallId: 'k2b' })
    assert.match(set.testo, /appearance\.theme: "paper" → "calm"/u)
    assert.match(set.testo, /appearance\.userBubbleFullWidth: true → false \(/u)
    assert.doesNotMatch(set.testo, /stays/u)
    const [ricevuta] = await s.servizio.ricevute()
    assert.deepEqual(ricevuta.cambi.map((c) => [c.chiave, c.prima, c.dopo]), [['appearance.theme', 'paper', 'calm'], [CHIAVE, true, false]])
    await s.servizio.annullaDallaPersona({ receiptId: ricevuta.id, origine: PERSONA })
    assert.deepEqual({ tema: sulDisco(d).valori.themePreset, piena: sulDisco(d).valori.userBubbleFullWidth, modello: (await s.leggi()).valore }, { tema: 'paper', piena: true, modello: 'true' }, 'l Annulla rimette il tema E le domande larghe')
    await s.ferma()
    /* al contrario (mio mutante K2G): DECISA spenta e d accordo (la scelta del modello della 0.2.0, ricevute leggibili), la stessa
       chiamata non ha niente da mostrare per questa voce: la carta elenca solo il tema, e l esecuzione non la mette nella ricevuta */
    const d2 = cartella()
    await sceltaDelModello020(d2)
    const t = avvia(d2)
    const fn2 = t.servizio.perLaSessione({ sessionId: null })
    const argomenti2 = { action: 'set', expected_revision: (await t.leggi()).rev, changes: [{ key: 'appearance.theme', value: 'calm' }, { key: CHIAVE, value: false }] }
    assert.deepEqual((await fn2('app_settings', argomenti2, { fase: 'anteprima', toolCallId: 'k2g' })).azione.cambi.map((c) => c.chiave), ['appearance.theme'])
    assert.doesNotMatch((await fn2('app_settings', argomenti2, { fase: 'esegui', toolCallId: 'k2g' })).testo, /userBubbleFullWidth/u)
    assert.deepEqual((await t.servizio.ricevute())[0].cambi.map((c) => c.chiave), ['appearance.theme'])
    await t.ferma()
  })
})

/*
 * giro 7 (controllore del giro 6, mutanti X20, X21, X22 vivi): la nota «not confirmed yet» sta SOLO sulla voce che aspetta, anche in
 *   un elenco di sezione e nel `pick` di un'altra voce; e c'è dal primo istante dell'avvio (la copia aspetta la migrazione prima di dirlo).
 */
test('MIG-27 (giro 7; mutanti X20, X21) · la nota «not confirmed yet» solo sulla riga della voce che aspetta: le altre righe della sezione e il `pick` di un altra voce restano quelli di sempre', async () => {
  await zitto(async () => {
    const d = cartella()
    await maiToccata020(d)
    nascondiRicevute(d)
    const s = avvia(d)
    const fn = s.servizio.perLaSessione({ sessionId: null })
    const righe = (await fn('app_settings', { action: 'list', section: 'appearance' }, { fase: 'esegui' })).testo.split('\n').filter((r) => r.startsWith('- '))
    assert.ok(righe.length > 2, 'la sezione ha più voci')
    assert.deepEqual(righe.filter((r) => /not confirmed yet/u.test(r)).map((r) => r.slice(2, 2 + CHIAVE.length)), [CHIAVE])
    assert.doesNotMatch((await fn('app_settings', { action: 'pick', key: 'appearance.theme' }, { fase: 'esegui' })).testo, /not confirmed/iu)
    assert.match((await fn('app_settings', { action: 'pick', key: CHIAVE }, { fase: 'esegui' })).testo, /Not confirmed yet/u)
    await s.ferma()
  })
})

test('MIG-28 (giro 7; mutante X22) · la copia: `nonConfermati` chiesto nel primo istante, prima che la migrazione abbia finito, la aspetta e lo dice', async () => {
  const d = cartella()
  writeFileSync(fileCopia(d), `${JSON.stringify({ schema: 'talos.window-preferences.v1', revisione: 5, valori: { a: false }, aggiornataIl: null }, null, 1)}\n`)
  const copia = creaCopiaFinestra({ file: fileCopia(d) })
  const migrazione = copia.migraUnaVolta('prova-1', async () => { await new Promise((r) => { setImmediate(r) }); throw new Error('not yet') }, { campi: ['a'] })
  const subito = copia.nonConfermati() // nessun `await` prima: l'avvio è ancora a metà
  assert.deepEqual(await subito, { a: false })
  assert.equal(await migrazione, 'non-decisa')
})
