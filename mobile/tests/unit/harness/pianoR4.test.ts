import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    cartaPianoR4, erroreDecisionePianoR4, leggiEventoPianoR4, ricevutaPianoR4, SCELTE_PIANO_R4,
} from '@/lib/harness/r4/pianoR4'
import type { DecisionePianoFattaR4, PropostaPianoR4 } from '@/lib/harness/r4/pianoChiave'
import chatPiano from '@/lib/harness/r4/testi/chat-piano-r4.json'
import appPiano from '@/lib/harness/r4/testi/app-piano-r4.json'
import modelloPermessi from '@/lib/harness/r4/testi/modello-permessi-r4.json'
import erroriPiano from '@/lib/harness/r4/testi/errori-piano-r4.json'

/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`). Golden calcolato dal codice VERO del desktop r4 @ 701c6c0d2 in jsdom
 * (`piano-golden-701c6c0d2.json`, generatore `scratchpad/piano/golden-piano.mjs`): `plan-artifact.js` (`parsePlanEvent`,
 * `createPlanArtifact`, `applicaDecisionePiano`) ed `errori.js` (`testoErroreServer`), sugli eventi `talos.plan` di un flusso vero
 * registrato col fornitore finto (8) più i casi storti (32). L'ora della ricevuta è locale: il golden è in UTC.
 */
process.env.TZ = 'UTC'
// un testo lungo d'una lettera sola è scritto `{ ripeti, volte }` (il golden resta piccolo): qui torna com'era
const espandi = (_k: string, v: unknown) => (v && typeof v === 'object' && 'ripeti' in v && 'volte' in v
    ? String((v as { ripeti: string }).ripeti).repeat((v as { volte: number }).volte) : v)
const golden = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'piano-golden-701c6c0d2.json'), 'utf8'), espandi)
const PIN = '701c6c0d2d711879b53aa21bddad5a06d33538e7'
const LINGUE = ['it', 'en'] as const

describe('la carta del piano come il desktop @ 701c6c0d2', () => {
    it('PIA-00 il golden è del pin, e le scelte sono le sue, nello stesso ordine', () => {
        expect(golden.origine.commit).toBe(PIN)
        expect(golden.origine.tz).toBe('UTC')
        expect(SCELTE_PIANO_R4.map((s) => s.decisione)).toEqual(golden.costanti.SCELTE_PIANO)
    })

    it('PIA-01 `leggiEventoPianoR4` = `parsePlanEvent`, evento per evento (veri e storti)', () => {
        const fatti = golden.eventi.map((v: unknown) => leggiEventoPianoR4(v, golden.origine.sessione))
        expect(fatti).toEqual(golden.fatti)
    })

    it('PIA-02 la carta proposta, approvabile o da leggere o non disponibile: le stesse parole, in italiano e in inglese', () => {
        for (const lingua of LINGUE) {
            const viste = golden.carte[lingua].proposte.map((p: { evento: number }) => {
                const { evento, ...vista } = { evento: p.evento, ...cartaPianoR4(golden.fatti[p.evento] as PropostaPianoR4, lingua) }
                void evento
                return vista
            })
            expect(viste, lingua).toEqual(golden.carte[lingua].proposte.map(({ evento, ...v }: { evento: number }) => { void evento; return v }))
        }
    })

    it('PIA-03 la ricevuta: stato, titolo, frase, correzione, impronta corta, ora e «Apri la conversazione nuova»', () => {
        for (const lingua of LINGUE) {
            for (const r of golden.carte[lingua].ricevute) {
                const atteso = { ...r }
                delete atteso.evento; delete atteso.su; delete atteso.scelteRimaste
                const vista = ricevutaPianoR4(golden.fatti[r.su] as PropostaPianoR4, golden.fatti[r.evento] as DecisionePianoFattaR4, lingua)
                expect(vista, `${lingua} evento ${r.evento}`).toEqual(atteso)
            }
        }
    })

    it('PIA-03b una decisione di un\'altra revisione o richiesta non scrive la ricevuta', () => {
        const proposta = golden.fatti.find((f: PropostaPianoR4 | null) => f?.status === 'proposed' && f.requestId) as PropostaPianoR4
        const decisione = golden.fatti.find((f: DecisionePianoFattaR4 | null) => f?.status === 'approved') as DecisionePianoFattaR4
        expect(ricevutaPianoR4(proposta, { ...decisione, revision: proposta.revision + 1 }, 'it').applicata).toBe(false)
        expect(ricevutaPianoR4(proposta, { ...decisione, revision: proposta.revision, requestId: 'altra' }, 'it').applicata).toBe(false)
    })

    it('PIA-04 l\'errore della scelta: la frase del dizionario solo se l\'inglese del server coincide, poi «riprova.»', () => {
        for (const lingua of LINGUE) {
            const frasi = golden.buste.map((b: { error: Record<string, unknown> }) => erroreDecisionePianoR4(b.error, lingua))
            expect(frasi, lingua).toEqual(golden.errori[lingua].map((e: { frase: string }) => e.frase))
        }
        // r4 irraggiungibile: nessuna busta, «riprova.»
        expect(erroreDecisionePianoR4(null, 'it')).toBe(chatPiano.it['plan.choiceFailed'].replace('{messaggio}', chatPiano.it['plan.tryAgain']))
    })

    it('PIA-05 le aree nuove vengono dal pin e hanno le stesse chiavi nelle due lingue', () => {
        for (const area of [chatPiano, appPiano, modelloPermessi, erroriPiano]) {
            expect(area.origine.commit).toBe(PIN)
            expect(Object.keys(area.it).sort()).toEqual(Object.keys(area.en).sort())
        }
        for (const chiave of ['plan.activeNextTurn', 'plan.updated', 'plan.planFirst', 'plan.workNormally', 'permissions.workModeLabel', 'permissions.modeChangeHint']) {
            expect(Object.hasOwn(appPiano.it, chiave), chiave).toBe(true)
        }
        for (const chiave of ['chat.theNextMessageWill', 'chat.goToThePlan', 'chat.dismiss', 'permissions.howMuchTalosCan', 'permissions.recommended']) {
            expect(Object.hasOwn(modelloPermessi.it, chiave), chiave).toBe(true)
        }
    })
})
