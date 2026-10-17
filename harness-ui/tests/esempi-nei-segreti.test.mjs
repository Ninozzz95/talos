/*
 * Owner 14/10/2026 (regola unica per desktop e CLI): «I file con .example, .sample o .template si leggono senza chiedere, ma se
 * dentro c'è qualcosa che sembra una chiave vera, TALOS chiede lo stesso.» Piano e fonti: handoff `LEDGER-ESEMPI-NEI-SEGRETI-2026-10-14.md`.
 * Le forme di una chiave sono quelle della CLI (`cli/src/diagnostics/redact.ts`), in `src/forme-di-segreto.mjs`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cercaNelProgetto } from '../src/kernel/talosHarness.mjs'
import { __perLeProve, eUnFileSegreto, motivoDaChiedere } from '../src/path-policy.mjs'
import { FORME_DI_SEGRETO, formaDiSegretoNelTesto } from '../src/forme-di-segreto.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

/* Valori con la FORMA di una chiave, costruiti a pezzi perché questo file non diventi lui stesso un falso allarme dei rilevatori. */
const SK = ['sk', 'proj', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'].join('-')
const AWS = ['AKIA', 'Z7Q2W8E4R6T1Y3U5'].join('')
const PEM = ['-----BEGIN', 'PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END', 'PRIVATE KEY-----'].join(' ')
const C = 'CANARINOESEMPI'

function progetto(t, file) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-esempi-'))
  t.after(() => rimuoviCartellaDiProva(radice))
  for (const [p, testo] of Object.entries(file)) {
    mkdirSync(join(radice, ...p.split('/').slice(0, -1)), { recursive: true })
    writeFileSync(join(radice, ...p.split('/')), testo)
  }
  return radice
}
const chiede = (radice, percorso, tipo = 'leggi') => motivoDaChiedere(tipo === 'shell' ? { tipo, comando: percorso, cartella: radice } : { tipo, percorso, cartella: radice })

test('ESEMPI-01 un file d\'esempio senza chiave non chiede, anche col segmento IN MEZZO al nome (il falso positivo della CLI 0.5.x)', (t) => {
  const radice = progetto(t, {
    'service-account.example.json': '{"type":"service_account","private_key":"<paste here>"}\n',
    '.env.example': 'OPENAI_API_KEY=sk-your-key-here\nAWS_ACCESS_KEY_ID=\n',
    'config/app.sample.yaml': 'token: CHANGE_ME\n',
    'deploy/secrets.template.toml': 'password = ""\n',
  })
  for (const p of ['service-account.example.json', '.env.example', 'config/app.sample.yaml', 'deploy/secrets.template.toml']) {
    assert.equal(chiede(radice, p), null, `${p} si legge senza domanda`)
    assert.equal(chiede(radice, `cat ${p}`, 'shell'), null, `cat ${p} senza domanda`)
  }
})

test('ESEMPI-02 un file d\'esempio con dentro la FORMA di una chiave vera chiede, con la sua frase, per la lettura e per il comando', (t) => {
  const radice = progetto(t, {
    '.env.example': `OPENAI_API_KEY=${SK}\n`,
    'service-account.example.json': JSON.stringify({ type: 'service_account', private_key: PEM }),
    'aws.sample.ini': `aws_access_key_id = ${AWS}\n`,
  })
  for (const p of ['.env.example', 'service-account.example.json', 'aws.sample.ini']) {
    const lettura = chiede(radice, p)
    assert.equal(lettura?.classe, 'segreto', p)
    assert.equal(lettura.fraseChiave, 'server.approval.read.exampleWithKey', p)
    assert.match(lettura.frase, /example file that holds something that looks like a real key/u)
    const comando = chiede(radice, `type ${p}`, 'shell')
    assert.equal(comando?.fraseChiave, 'server.approval.command.exampleWithKey', p)
  }
  // un elenco non apre i file: non chiede
  assert.equal(chiede(radice, '.env.example', 'elenca'), null)
})

test('ESEMPI-03 AL CONTRARIO: ciò che era segreto per nome resta segreto, e le cartelle segrete non cambiano', (t) => {
  const radice = progetto(t, { '.env': 'A=1\n', 'id_rsa.pub': 'ssh-ed25519 AAAA\n' })
  assert.equal(chiede(radice, '.env')?.fraseChiave, 'server.approval.read.secret', '.env chiede come prima, con la frase di prima')
  assert.equal(chiede(radice, 'id_rsa.pub'), null, 'la chiave pubblica resta pubblica')
  // dentro una cartella segreta l'esempio NON è un'esenzione
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: '~/.aws/credentials.sample', home: radice, cartella: radice })?.classe, 'segreto')
  // e un nome che dice segreto senza essere un esempio resta segreto (non diventa esente per una parola in mezzo)
  assert.equal(chiede(radice, 'keys/gcp-service-account-prod.json')?.classe, 'segreto')
})

test('ESEMPI-04 non legge dove non deve: un file che non c\'è, un percorso relativo senza cartella, un percorso di rete', () => {
  let letture = 0
  const leggiTesta = () => { letture += 1; return SK }
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: '.env.example', leggiTesta }), null, 'senza cartella non si sa dove sia')
  // un percorso di rete chiede già per la sua regola (cartella nascosta fuori dal progetto): qui conta che il file NON si apra
  motivoDaChiedere({ tipo: 'leggi', percorso: '\\\\server\\share\\.env.example', cartella: tmpdir(), leggiTesta })
  assert.equal(letture, 0, 'nessuna lettura: niente cartella, una condivisione di rete')
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'non-esiste.example', cartella: tmpdir() }), null, 'un file che non c\'è non chiede')
  // AL CONTRARIO: con la cartella la testa del file si legge (una volta) e decide
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: '.env.example', cartella: tmpdir(), leggiTesta })?.classe, 'segreto')
  assert.equal(letture, 1)
})

test('ESEMPI-05 le forme: chiavi vere di forma sì, segnaposto e nomi no', () => {
  for (const vero of [SK, AWS, PEM, `ghp_${'a1'.repeat(18)}`, `AIza${'B'.repeat(35)}`]) assert.ok(formaDiSegretoNelTesto(`x = ${vero}`), vero.slice(0, 12))
  for (const finto of ['sk-your-key-here', 'sk-learn-compatible-estimator-thing', 'AKIA_EXAMPLE', 'ghp_short', `X${SK}`]) assert.equal(formaDiSegretoNelTesto(`x = ${finto}`), null, finto.slice(0, 16))
  // le 9 forme della CLI (redact.ts:24-36, il PEM in una), `Bearer` (redact.ts:39) e tre di Hermes (redact.py): nessuna inventata
  assert.equal(FORME_DI_SEGRETO.length, 13)
  // le chiavi d'esempio della documentazione non fanno chiedere (AWS, jwt.io)
  assert.equal(formaDiSegretoNelTesto('aws_access_key_id = AKIAIOSFODNN7EXAMPLE'), null)
  assert.equal(formaDiSegretoNelTesto('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'), null)
  // ma una seconda chiave vera nello stesso testo sì
  assert.ok(formaDiSegretoNelTesto(`AKIAIOSFODNN7EXAMPLE ${AWS}`))
})

for (const strada of ['ripgrep', 'camminata JS']) {
  test(`ESEMPI-06 (${strada}) la ricerca toglie un file d'esempio con una chiave vera (righe e nome) e tiene quello senza`, async (t) => {
    const radice = progetto(t, { '.env.example': `KEY=${SK} ${C}\n`, 'config.sample.json': `{"x":"${C}"}\n`, 'a.txt': `${C}\n` })
    const disco = {
      async elenca(dentro = '') {
        const { readdir, stat } = await import('node:fs/promises')
        const voci = await readdir(dentro ? join(radice, dentro) : radice, { withFileTypes: true })
        return Promise.all(voci.map(async (v) => ({ nome: v.name, cartella: v.isDirectory(), byte: v.isDirectory() ? 0 : (await stat(join(radice, dentro, v.name))).size })))
      },
      async leggi(percorso) { const { readFile } = await import('node:fs/promises'); return readFile(join(radice, ...percorso.split('/')), 'utf8') },
    }
    const prima = process.env.TALOS_RG_PATH
    if (strada === 'camminata JS') process.env.TALOS_RG_PATH = join(tmpdir(), 'rg-inesistente-per-esempi.exe')
    try {
      const esito = await cercaNelProgetto(disco, { testo: C }, { radice })
      assert.ok(!esito.includes('.env.example'), `né righe né nome del file con la chiave:\n${esito}`)
      assert.ok(!esito.includes(SK), esito)
      assert.ok(esito.includes('config.sample.json') && esito.includes('a.txt'), esito)
      assert.match(esito, /1 file\(s\) omitted because they hold secrets/u)
      // e la ricerca per NOME (l'altra strada di rg): il nome del file con la chiave non esce, quello senza sì
      const perNome = await cercaNelProgetto(disco, { nome: 'example' }, { radice })
      assert.ok(!perNome.includes('.env.example'), perNome)
      assert.match(perNome, /1 file\(s\) omitted because they hold secrets/u)
      const pulito = await cercaNelProgetto(disco, { nome: 'sample' }, { radice })
      assert.ok(pulito.includes('config.sample.json'), pulito)
    } finally { if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima }
  })
}

test('ESEMPI-07 `eUnFileSegreto` senza la cartella resta lessicale (com\'era); con la cartella guarda il contenuto', (t) => {
  const radice = progetto(t, { '.env.example': `KEY=${SK}\n` })
  assert.equal(eUnFileSegreto('.env.example'), false)
  assert.equal(eUnFileSegreto('.env.example', { cartella: radice }), true)
})

test('ESEMPI-08 le codifiche e la misura: UTF-16 senza BOM e big-endian si leggono; un esempio oltre i 4 MB chiede (non si controlla a buon prezzo)', (t) => {
  const be = Buffer.from(`\uFEFFKEY=${SK}\n`, 'utf16le').swap16()
  const radice = progetto(t, {
    'le.env.example': Buffer.from(`KEY=${SK}\n`, 'utf16le'),
    'be.env.example': be,
    'pulito.env.example': Buffer.from('KEY=\n', 'utf16le'),
    'enorme.env.example': Buffer.alloc(4 * 1024 * 1024 + 1, 0x41),
  })
  assert.equal(chiede(radice, 'le.env.example')?.classe, 'segreto', 'UTF-16LE senza BOM')
  assert.equal(chiede(radice, 'be.env.example')?.classe, 'segreto', 'UTF-16BE col BOM')
  assert.equal(chiede(radice, 'pulito.env.example'), null, 'AL CONTRARIO: UTF-16 senza chiave non chiede')
  assert.equal(chiede(radice, 'enorme.env.example')?.fraseChiave, 'server.approval.read.exampleWithKey')
})

test('ESEMPI-09 AL CONTRARIO: un esempio grande ma sotto i 4 MB e senza chiave non chiede; un UTF-16 col BOM pieno di testo non latino si legge lo stesso', (t) => {
  const cjk = '設定の例です。'.repeat(600)
  const radice = progetto(t, {
    'grande.env.example': 'A=1\n'.repeat(80_000),
    'cjk.env.example': Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(`${cjk}\nKEY=${SK}\n`, 'utf16le')]),
  })
  assert.equal(chiede(radice, 'grande.env.example'), null, '320 KB d\'esempio senza chiave: si guarda tutto, e non chiede')
  assert.equal(chiede(radice, 'cjk.env.example')?.classe, 'segreto', 'il BOM dice UTF-16 anche quando i byte a zero sono pochi')
})

test('ESEMPI-10 ogni forma aggiunta e ogni segnaposto, nei due versi (scatta / non scatta), così la CLI li riusa uguali', () => {
  const a = (...p) => p.join('')
  const casi = [
    // [nome, scatta, non scatta]
    ['Bearer', `Authorization: Bearer ${a('Zx9', 'Qw8Er7Ty6Ui5Op4As3Df2')}`, 'the bearer of bad news, Bearer internationalization'],
    ['Groq', `GROQ_API_KEY=${a('gsk_', 'aB3dE5fG7hJ9kL1mN3pQ5r')}`, 'gsk_short'],
    ['Stripe', `STRIPE_KEY=${a('sk_live_', '4eC39HqLyjWDarjtT1zdp7dc')}`, 'sk_live_ and sk_test_x'],
    ['Stripe limitata', `RK=${a('rk_test_', '51Hxyz0123456789abcdef')}`, 'rk_live_'],
    ['xAI', `XAI_API_KEY=${a('xai-', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6')}`, 'xai-short-name'],
  ]
  for (const [nome, scatta, nonScatta] of casi) {
    assert.ok(formaDiSegretoNelTesto(scatta), `${nome}: deve scattare`)
    assert.equal(formaDiSegretoNelTesto(nonScatta), null, `${nome}: non deve scattare`)
  }
  // i segnaposto della documentazione: da soli NON scattano; accanto a una chiave vera, la chiave vera scatta
  for (const segnaposto of ['AKIAIOSFODNN7EXAMPLE', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c']) {
    assert.equal(formaDiSegretoNelTesto(`x = ${segnaposto}`), null, `${segnaposto.slice(0, 12)}: segnaposto, non scatta`)
    assert.ok(formaDiSegretoNelTesto(`x = ${segnaposto}\ny = ${AWS}`), `${segnaposto.slice(0, 12)}: una chiave vera accanto scatta`)
  }
  // un JWT che NON è quello di jwt.io scatta
  assert.ok(formaDiSegretoNelTesto(a('eyJhbGciOiJIUzI1NiJ9', '.eyJ1c2VyIjoiYWxpY2UiLCJyb2xlIjoiYWRtaW4ifQ', '.c2lnbmF0dXJlLWZhbHNhLTEyMzQ1Njc4')))
})

test('ESEMPI-11 il ricordo degli esiti tiene solo l\'esito, mai il testo (Nino2: fino a ~4 GB in memoria); un file cambiato si riguarda', (t) => {
  __perLeProve.dimenticaEsiti()
  t.after(() => __perLeProve.dimenticaEsiti())
  const grande = 'X=1\n'.repeat(750_000) // ~3 MB, sotto il tetto dei 4
  const radice = progetto(t, { 'a.example.json': grande, '.env.example': `${grande}KEY=${SK}\n` })
  assert.equal(chiede(radice, 'a.example.json'), null)
  assert.equal(chiede(radice, '.env.example')?.classe, 'segreto')
  const ricordati = __perLeProve.esitiRicordati()
  assert.deepEqual(ricordati.sort(), [false, true], 'due esiti, due booleani')
  assert.ok(ricordati.every((v) => typeof v === 'boolean'), 'nessun testo trattenuto')
  // AL CONTRARIO: il file cambia (dimensione diversa) ⇒ l'esito vecchio non vale, si riguarda
  writeFileSync(join(radice, 'a.example.json'), `KEY=${SK}\n`)
  assert.equal(chiede(radice, 'a.example.json')?.classe, 'segreto')
})
