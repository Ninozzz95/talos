/*
 * ⛔ REVISIONE AVVERSARIA di d9ca9998e «i file d'esempio si leggono liberi, salvo una chiave vera dentro» (bugfixer, 14/10/2026 sera).
 *
 * Prove ROSSE apposta sul codice di `feat/esempi-nei-segreti` (testa `d9ca9998e`): ognuna mostra un difetto; la cura non è qui.
 * Le prove «AL CONTRARIO» sono verdi e restano verdi dopo la cura.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-ESEMPI-NEI-SEGRETI-2026-10-14.md`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { motivoDaChiedere } from '../src/path-policy.mjs'
import { formaDiSegretoNelTesto } from '../src/forme-di-segreto.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

/* Valori con la FORMA di una chiave, costruiti a pezzi perché questo file non diventi lui stesso un falso allarme dei rilevatori. */
const SK = ['sk', 'proj', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'].join('-')

function progetto(t, file) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-rev-esempi-'))
  t.after(() => rimuoviCartellaDiProva(radice))
  for (const [p, testo] of Object.entries(file)) {
    mkdirSync(join(radice, ...p.split('/').slice(0, -1)), { recursive: true })
    writeFileSync(join(radice, ...p.split('/')), testo)
  }
  return radice
}
const leggi = (radice, percorso) => motivoDaChiedere({ tipo: 'leggi', percorso, cartella: radice, home: radice })
const esegui = (radice, comando) => motivoDaChiedere({ tipo: 'shell', comando, cartella: radice, home: radice })

test('REV-ESEMPI-01 (S3) — il segno d’esempio IN MEZZO al nome toglie la protezione per nome a file che PRIMA erano segreti', (t) => {
  /* `eEsempioPerNome` accetta `.example.`/`.sample.`/`.dist.`/`.template.` ovunque nel nome, anche quando ciò che segue è l'estensione
     che rende il file segreto. Misurato con `eUnFileSegreto` lessicale, prima (r4 6a9bc981f) e dopo: `.env.example.local`,
     `.env.sample.production`, `.env.dist.local`, `prod.sample.key`, `server.dist.pem`, `id_rsa.template.bak` erano segreti e ora no.
     Resta solo il controllo del contenuto, che conosce le forme dei fornitori: una password qualunque passa senza domanda. */
  const radice = progetto(t, {
    '.env.sample.production': 'DATABASE_URL=postgres://app:Pr0d-p4ssw0rd@db.internal/app\n',
    '.env.example.local': 'SESSION_SECRET=9f8e7d6c5b4a39281706f5e4d3c2b1a0\n',
  })
  for (const p of ['.env.sample.production', '.env.example.local']) {
    assert.equal(leggi(radice, p)?.classe, 'segreto', `${p}: a read must ask, as before d9ca9998e`)
    assert.equal(esegui(radice, `cat ${p}`)?.classe, 'segreto', `cat ${p}: must ask, as before`)
  }
})

test('REV-ESEMPI-01b AL CONTRARIO — il falso positivo che la regola curava resta curato: `service-account.example.json` senza chiave non chiede', (t) => {
  const radice = progetto(t, { 'service-account.example.json': '{"type":"service_account","private_key":"<paste here>"}\n' })
  assert.equal(leggi(radice, 'service-account.example.json'), null)
})

test('REV-ESEMPI-02 (S3) — un GLOB che prende un file d’esempio con una chiave non lo apre: `cat *.example` stampa la chiave senza domanda', (t) => {
  /* Il controllo del contenuto legge il pezzo LETTERALE (`*.example` non è un file: la lettura fallisce ⇒ nessuna domanda). La cura
     C-005 espande già i glob sui file veri, ma poi giudica solo il NOME, che per un esempio è esente. */
  const radice = progetto(t, { 'app.env.example': `OPENAI_API_KEY=${SK}\n` })
  assert.equal(esegui(radice, 'cat app.env.example')?.classe, 'segreto', 'premise: by its name, it asks')
  for (const comando of ['cat *.example', 'cat app.env.ex*', 'type app.env.exampl?']) {
    assert.equal(esegui(radice, comando)?.classe, 'segreto', `${comando} prints the key`)
  }
})

test('REV-ESEMPI-03 (S3) — un file d’esempio in UTF-16 (quello che scrive `>` di Windows PowerShell 5.1) non si riconosce', (t) => {
  /* `leggiTestaDalDisco` decodifica sempre in UTF-8: in UTF-16LE ogni carattere ha un NUL accanto e nessuna forma combacia. */
  const radice = progetto(t, { '.env.example': Buffer.from(`﻿OPENAI_API_KEY=${SK}\r\n`, 'utf16le') })
  assert.equal(leggi(radice, '.env.example')?.classe, 'segreto')
})

test('REV-ESEMPI-03b AL CONTRARIO — UTF-8 col BOM si riconosce già', (t) => {
  const radice = progetto(t, { '.env.example': `﻿OPENAI_API_KEY=${SK}\n` })
  assert.equal(leggi(radice, '.env.example')?.classe, 'segreto')
})

test('REV-ESEMPI-04 (S4) — una chiave oltre i primi 256 KB di un file d’esempio passa senza domanda', (t) => {
  /* `TESTA_DA_CONTROLLARE = 256 KB`: la lettura vera del file (`read` con offset) la mostra lo stesso. Cura: leggere a pezzi fino in
     fondo (con un tetto di TEMPO, non di byte), oppure chiedere per un file d'esempio più grande del tetto. */
  const radice = progetto(t, { 'big.env.example': 'A=1\n'.repeat(70_000) + `KEY=${SK}\n` })
  assert.equal(leggi(radice, 'big.env.example')?.classe, 'segreto')
})

test('REV-ESEMPI-05 (S4) — un comando su un percorso con SPAZI fra virgolette non guarda il contenuto (la lettura sì)', (t) => {
  /* `pezziDelComando` spezza anche sulle virgolette e sugli spazi: `"my dir/.env.example"` diventa `my` e `dir/.env.example`, che
     non esiste ⇒ nessuna lettura ⇒ nessuna domanda. */
  const radice = progetto(t, { 'my dir/.env.example': `OPENAI_API_KEY=${SK}\n` })
  assert.equal(leggi(radice, 'my dir/.env.example')?.classe, 'segreto', 'premise: the read asks')
  assert.equal(esegui(radice, 'cat "my dir/.env.example"')?.classe, 'segreto')
})

test('REV-ESEMPI-06 (S4) — «le forme della CLI senza cambiarne una»: manca `Bearer <token>`, che `redact.ts` ha (BEARER)', () => {
  /* `cli/src/diagnostics/redact.ts` (a17f270d2, 08/10): oltre alle 10 forme di `SECRET_VALUE_PATTERNS` c'è `BEARER` — 20+ caratteri
     token68 con una cifra. Il port l'ha lasciato fuori: un `requests.example.http` con `Authorization: Bearer <token vero>` passa. */
  const token = ['Zx9', 'Qw8Er7Ty6Ui5Op4As3Df2'].join('')
  assert.ok(formaDiSegretoNelTesto(`Authorization: Bearer ${token}`), 'a bearer credential with a digit, as in redact.ts')
  assert.equal(formaDiSegretoNelTesto('the bearer of bad news'), null, 'and the prose stays readable (as in redact.ts)')
})
