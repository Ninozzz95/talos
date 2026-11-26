#!/usr/bin/env node
// ⛔ Riga 28 (giudice 18/11 11:48, decisione 402): il telefono esce solo col nucleo del PC uscito, byte per byte. Confronta le impronte
// dei file comuni (harness-ui/scripts/cancello/nucleo-condiviso.json) fra il telefono e il commit scritto in UN posto solo,
// mobile/nucleo-del-pc-uscito.json. La colonna «cli» prende anch'essa il PC: le eccezioni della CLI non scusano il telefono.
// Uso:  node mobile/scripts/guardia-nucleo-pc.mjs [--telefono git:HEAD|cartella] [--riferimento <json>]
// Esce: 0 uguale · 1 file diversi o assenti · 2 riferimento sbagliato o commit del PC non presente nel deposito.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEPOSITO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const RIFERIMENTO = join(DEPOSITO, 'mobile', 'nucleo-del-pc-uscito.json')

export function leggiRiferimento(testo) {
  const r = JSON.parse(testo)
  if (r?.schema !== 'talos.nucleo-del-pc-uscito.v1' || !/^[0-9a-f]{40}$/u.test(r.commit ?? '')) throw Error('riferimento non valido: serve lo schema talos.nucleo-del-pc-uscito.v1 e «commit» intero (40 cifre esadecimali)')
  return r
}

export function guardia({ telefono = 'git:HEAD', riferimento = RIFERIMENTO, deposito = DEPOSITO } = {}) {
  let pc
  try { pc = `git:${leggiRiferimento(readFileSync(riferimento, 'utf8')).commit}` } catch (e) { return { codice: 2, testo: `⛔ ${e.message}` } }
  const cancello = join(deposito, 'harness-ui', 'scripts', 'cancello', 'impronte-nucleo.mjs')
  const e = spawnSync(process.execPath, [cancello, '--pc', pc, '--cli', pc, '--telefono', telefono, '--deposito', deposito], { encoding: 'utf8' })
  return { codice: e.status ?? 2, testo: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const a = process.argv.slice(2)
  const o = {}
  for (let i = 0; i < a.length; i += 2) if (['--telefono', '--riferimento'].includes(a[i]) && a[i + 1]) o[a[i].slice(2)] = a[i + 1]; else { console.error('uso: guardia-nucleo-pc.mjs [--telefono git:HEAD|cartella] [--riferimento <json>]'); process.exit(2) }
  const { codice, testo } = guardia(o)
  if (codice) console.error(`${testo}\n⛔ il nucleo del telefono non è quello del PC uscito: niente uscita.`); else console.log(testo)
  process.exitCode = codice
}
