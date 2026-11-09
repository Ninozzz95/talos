/*
 * I luoghi di «Consenti sempre» dalla porta del modello (forma FORMA-LUOGHI-DUE-PORTE, 03/11/2026, OK di Desktop, CLI, Mobile, Performance):
 * `computer_use_places_list` legge senza carta, `computer_use_places_remove` passa dalla carta (tranne in Accesso pieno). Offerti SOLO con
 * l'ospite `onLuoghiFn` (il PC col computer use acceso): la CLI e il telefono non li vedono. Nessuno strumento aggiunge.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, ATTREZZI_LUOGHI, SICUREZZA_PER_ATTREZZO } from '../src/kernel/talosHarness.mjs'
import { STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs'
import { creaRegistroLuoghi } from '../src/computer-use/luoghi-ricordati.mjs'
import { creaOspiteLuoghi } from '../src/computer-use/luoghi-ospite.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-luoghi-k-'))
  t.after(() => rimuoviCartellaDiProva(c))
  return c
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })
async function registroCon(c) {
  let t = Date.parse('2026-11-03T10:00:00.000Z')
  const r = creaRegistroLuoghi({ file: join(c, 'l.json'), adesso: () => (t += 1000) })
  await r.ricorda({ domini: ['luce.example', 'negozio.example'], app: ['Esplora file'] })
  return r
}
async function giro(c, risposte, opzioni = {}) {
  let n = 0
  const offerti = []; const sistemi = []; const domande = []; const ospite = []
  const ospiteVero = opzioni.registro ? creaOspiteLuoghi({ registro: opzioni.registro }) : null
  const r = await talosLavora({
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', strumentiEstesi: [...ATTREZZI_LUOGHI],
    fetchDiRete: async (_url, init) => {
      const corpo = JSON.parse(init?.body ?? '{}')
      offerti.push((corpo.tools ?? []).map((a) => a.function?.name).filter(Boolean))
      sistemi.push(JSON.stringify(corpo.messages ?? []))
      const prossima = risposte[n++]
      const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
    },
    ...(ospiteVero ? { onLuoghiFn: async (nome, argomenti, fase) => { ospite.push([nome, fase.fase]); return ospiteVero(nome, argomenti, fase) } } : {}),
    ...(opzioni.extra ?? {}),
    chiediApprovazioneFn: opzioni.risposta === undefined ? undefined : async (azione) => { domande.push(azione); return opzioni.risposta },
  })
  return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', offerti, sistemi, domande, ospite }
}
const soloLuoghi = (elenco) => elenco.filter((n) => ATTREZZI_LUOGHI.has(n))

test('LUOGHI-K-01: offerti solo con l\'ospite; senza (CLI, telefono) nessuna traccia; a una figlia no; in Piano solo l\'elenco', async (t) => {
  const c = cartella(t); const registro = await registroCon(c)
  assert.deepEqual(soloLuoghi((await giro(c, [], { registro })).offerti[0]), ['computer_use_places_list', 'computer_use_places_remove'])
  const senza = await giro(c, [])
  assert.deepEqual(soloLuoghi(senza.offerti[0]), [])
  assert.doesNotMatch(senza.sistemi[0], /computer_use_places/u, 'nessuna traccia nel testo che riceve il modello')
  assert.deepEqual(soloLuoghi((await giro(c, [], { registro, extra: { agentRole: 'child' } })).offerti[0]), [])
  assert.deepEqual(soloLuoghi((await giro(c, [], { registro, extra: { modalitaOperativa: 'piano' } })).offerti[0]), ['computer_use_places_list'])
  assert.ok(STRUMENTI_ESTESI_PREDEFINITI.includes('computer_use_places_list') && STRUMENTI_ESTESI_PREDEFINITI.includes('computer_use_places_remove'))
  assert.equal(SICUREZZA_PER_ATTREZZO.computer_use_places_list.readsPrivateData, true, 'condizione del Mobile')
})

test('LUOGHI-K-02: l\'elenco non chiede niente; togliere passa dalla carta: sì toglie, no non tocca il registro', async (t) => {
  const c = cartella(t); const registro = await registroCon(c)
  const elenco = await giro(c, [chiama('a', 'computer_use_places_list', {})], { registro, risposta: true })
  assert.deepEqual(elenco.domande, [])
  assert.match(elenco.esito('a'), /site: "luce\.example"/u)
  assert.match(elenco.esito('a'), /program: "Esplora file"/u)
  const no = await giro(c, [chiama('b', 'computer_use_places_remove', { type: 'site', name: 'luce.example' })], { registro, risposta: false })
  assert.deepEqual([no.domande[0].tipo, no.domande[0].luogo], ['computer_use_places_remove', { tipo: 'dominio', nome: 'luce.example' }])
  assert.deepEqual(no.ospite.map(([, f]) => f), ['anteprima'])
  assert.match(no.esito('b'), /^DECLINED\. .*Do not ask again/u) // il no della persona è DECLINED (bccb41ae6, candidata 04/11)
  assert.equal((await registro.perIlCiclo()).domini.length, 2, 'col no niente tolto')
  const si = await giro(c, [chiama('c', 'computer_use_places_remove', { type: 'site', name: 'LUCE.example' })], { registro, risposta: true })
  assert.match(si.esito('c'), /^Removed "luce\.example"/u)
  assert.deepEqual((await registro.perIlCiclo()).domini, ['negozio.example'])
})

test('LUOGHI-K-03: Accesso pieno toglie senza carta e lo dice; argomenti storti o un luogo che non c\'è: nessuna carta, nessuna scrittura', async (t) => {
  const c = cartella(t); const registro = await registroCon(c)
  const pieno = await giro(c, [chiama('a', 'computer_use_places_remove', { type: 'program', name: 'Esplora file' })], { registro, risposta: false, extra: { livelloAccesso: 'accesso-pieno' } })
  assert.deepEqual(pieno.domande, [])
  assert.match(pieno.esito('a'), /Full access: done without asking the person\./u)
  assert.deepEqual((await registro.perIlCiclo()).app, [])
  for (const [id, args] of [['b', {}], ['c', { type: 'dominio', name: 'negozio.example' }], ['d', { type: 'site', name: ' ' }], ['e', { type: 'site', name: 'altro.example' }]]) {
    const storto = await giro(c, [chiama(id, 'computer_use_places_remove', args)], { registro, risposta: true })
    assert.deepEqual(storto.domande, [], JSON.stringify(args))
    assert.match(storto.esito(id), /^REFUSED\./u, JSON.stringify(args))
  }
  assert.deepEqual((await registro.perIlCiclo()).domini, ['luce.example', 'negozio.example'])
})

test('LUOGHI-K-04: nessuno strumento aggiunge; un nome inventato non c\'è', async (t) => {
  const c = cartella(t); const registro = await registroCon(c)
  const g = await giro(c, [], { registro })
  assert.ok(!g.offerti[0].some((n) => /^computer_use_places_(add|allow|create|clear)/u.test(n)))
  const ospite = creaOspiteLuoghi({ registro })
  assert.equal((await ospite('computer_use_places_add', { type: 'site', name: 'x.example' }, { fase: 'esegui' })).ok, false)
  assert.equal((await ospite('computer_use_places_add', { type: 'site', name: 'luce.example' }, { fase: 'esegui' })).ok, false)
  assert.equal((await registro.perIlCiclo()).domini.length, 2, 'un nome sconosciuto non tocca il registro')
  // i programmi col nome esatto, i siti senza badare alle maiuscole
  assert.equal((await ospite('computer_use_places_remove', { type: 'program', name: 'esplora file' }, { fase: 'anteprima' })).ok, false)
  assert.equal((await ospite('computer_use_places_remove', { type: 'program', name: 'Esplora file' }, { fase: 'anteprima' })).ok, true)
  assert.equal((await registro.perIlCiclo()).app.length, 1, 'l\'anteprima non toglie')
  assert.equal((await creaOspiteLuoghi({ registro: null })('computer_use_places_list', {}, { fase: 'esegui' })).ok, false)
})
