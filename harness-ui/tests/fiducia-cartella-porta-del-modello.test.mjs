/*
 * Decisioni 173, 189 e 196 (owner 04/11/2026), la SECONDA PORTA (regola fissa delle due porte): la fiducia della cartella anche dal
 *   modello, dietro la carta. Forma `FORMA-PERMESSI-2-E-173-2026-11-04.md` §5: nessun attrezzo nuovo del nucleo, una voce del catalogo
 *   di `app_settings`, `conversation.folderTrust` (trusted / notTrusted), gruppo `sicurezza` ⇒ la carta c'è sempre, anche in Accesso
 *   pieno. Scrive la STESSA fonte della domanda e della pillola (`fiducia-cartelle.mjs`) e riapplica la fiducia alle conversazioni vive
 *   (`riapplicaFiducia`), come la rotta `/api/v1/folder-trust`.
 *   · PORTA-01: la voce, il suo gruppo e i suoi valori; la descrizione del nucleo dice che la fiducia di ganci e connettori resta fuori;
 *   · PORTA-02: set dal modello ⇒ carta (gruppo sicurezza), poi la fonte scritta e la fiducia riapplicata; l'Annulla la rimette com'era;
 *   · PORTA-03 AL CONTRARIO: senza la fonte della fiducia (il telefono) la voce non c'è.
 * Nessuna chiave, nessun dato vero: archivio della fiducia in una cartella temporanea.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { DEFINIZIONE_IMPOSTAZIONI, cartaAncheInAccessoPieno } from '../src/kernel/impostazioni-app.mjs'
import { voceDelCatalogo, catalogoPubblico } from '../src/impostazioni/catalogo-impostazioni.mjs'
import { creaFontiDelServer } from '../src/impostazioni/fonti-impostazioni.mjs'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'
import { creaFiduciaCartelle } from '../src/fiducia-cartelle.mjs'

const revisione = (testo) => Number(/Revision (\d+)/u.exec(testo)?.[1])

function banco({ conFiducia = true } = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-porta-fiducia-'))
  const cartella = join(radice, 'progetto')
  const fiduciaCartelle = conFiducia ? creaFiduciaCartelle({ file: join(radice, 'fiducia', 'fiducia-cartelle.json'), avvisa: () => {} }) : null
  const riapplicate = []
  const registro = {
    impostazioniCorrenti: (id) => (id === 'sess-1' ? { modello: 'm', permessi: 'Full access', permessiPerAttrezzo: {} } : null),
    cartellaPerLaFiducia: ({ sessionId }) => (sessionId === 'sess-1' ? { ok: true, cartella } : { erroreAvvio: 'Session not found', code: 'NOT_FOUND' }),
    riapplicaFiducia: () => { riapplicate.push(fiduciaCartelle?.stato(cartella)); return { cambiate: ['sess-1'] } },
  }
  const fonti = creaFontiDelServer({ fiduciaCartelle, registroFn: () => registro })
  const s = creaServizioImpostazioni({ fonti, copiaFinestra: creaCopiaFinestra(), attesaFinestraMs: 50 })
  return { s, fonti, fiduciaCartelle, cartella, riapplicate }
}

test('PORTA-01: la voce conversation.folderTrust, gruppo sicurezza, trusted/notTrusted; il nucleo tiene fuori la fiducia di ganci e connettori', () => {
  const v = voceDelCatalogo('conversation.folderTrust')
  assert.ok(v, 'la voce esiste')
  assert.equal(v.ambito, 'conversazione')
  assert.equal(v.gruppo, 'sicurezza')
  assert.deepEqual([...v.valori], ['trusted', 'notTrusted'])
  assert.deepEqual({ en: v.testo.en, it: v.testo.it }, { en: 'Trust this folder', it: 'Fidati di questa cartella' }, 'il nome della voce della pillola')
  assert.equal(cartaAncheInAccessoPieno({ cambi: [{ gruppo: v.gruppo }] }), true, 'la carta anche in Accesso pieno')
  assert.match(DEFINIZIONE_IMPOSTAZIONI.description, /Secrets, accounts, hook and connector trust, and destructive actions are not settings here\.$/u)
  const pubblica = catalogoPubblico().find((p) => p.key === 'conversation.folderTrust')
  assert.equal(pubblica.scope, 'conversation')
  assert.equal(pubblica.group, 'sicurezza')
})

test('PORTA-02: set dal modello con la carta, scrive la fonte della pillola e riapplica la fiducia; l\'Annulla la rimette', async () => {
  const { s, fiduciaCartelle, cartella, riapplicate } = banco()
  const fn = s.perLaSessione({ sessionId: 'sess-1' })
  const lista = await fn('app_settings', { action: 'list', query: 'conversation.folderTrust' }, { fase: 'esegui' })
  assert.match(lista.testo, /^- conversation\.folderTrust = null; one of trusted, notTrusted; conversation, security$/mu, lista.testo)
  const arg = { action: 'set', expected_revision: revisione(lista.testo), reason: 'the person said they do not trust it', changes: [{ key: 'conversation.folderTrust', value: 'notTrusted' }] }
  const anteprima = await fn('app_settings', arg, { fase: 'anteprima', toolCallId: 'f1' })
  assert.equal(anteprima.carta, true, 'la carta')
  assert.deepEqual(anteprima.azione.cambi.map((c) => [c.chiave, c.dopo, c.gruppo]), [['conversation.folderTrust', 'notTrusted', 'sicurezza']])
  const fatto = await fn('app_settings', arg, { fase: 'esegui', toolCallId: 'f1' })
  assert.equal(fatto.ok, true, JSON.stringify(fatto))
  assert.equal(fiduciaCartelle.stato(cartella), false, 'la stessa fonte della domanda e della pillola')
  assert.deepEqual(riapplicate, [false], 'riapplicata dopo la scrittura, una volta')
  const [ricevuta] = await s.ricevute()
  const annulla = await fn('app_settings', { action: 'undo', receipt_id: ricevuta.id }, { fase: 'esegui', toolCallId: 'f2' })
  assert.equal(annulla.ok, true, JSON.stringify(annulla))
  assert.equal(fiduciaCartelle.stato(cartella), null, 'l\'Annulla la rimette «mai chiesta»')
  assert.deepEqual(riapplicate, [false, null])
})

test('PORTA-03 AL CONTRARIO: senza la fonte della fiducia (il server dell\'app del telefono) la voce non si offre', async () => {
  const { s } = banco({ conFiducia: false })
  const fn = s.perLaSessione({ sessionId: 'sess-1' })
  const lista = await fn('app_settings', { action: 'list', query: 'conversation.folderTrust' }, { fase: 'esegui' })
  assert.doesNotMatch(lista.testo, /folderTrust/u)
})
