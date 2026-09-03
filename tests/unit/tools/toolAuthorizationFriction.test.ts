const prefs = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
        set: async ({ key, value }: { key: string; value: string }) => { prefs.set(key, value) },
    },
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    contaDecisioneReale,
    eQuasiSempreSi,
    leggiStatoFrizione,
    registraDecisione,
    riepilogoFrizione,
    salvaStatoFrizione,
    SOGLIA_QUASI_SEMPRE_SI,
    TALOS_FRICTION_VUOTO,
    type TalosFrictionStatoV1,
} from '@/lib/tools/toolAuthorizationFriction'

beforeEach(() => {
    prefs.clear()
})

describe('6.4 — registraDecisione, pura', () => {
    it('la prima decisione su un attrezzo apre la sua voce da zero', () => {
        const dopo = registraDecisione(TALOS_FRICTION_VUOTO, 'leggi', 'allow_once', '2026-08-28T10:00:00.000Z')
        expect(dopo.perAttrezzo.leggi).toEqual({
            tool: 'leggi',
            decisioniTotali: 1,
            siConsecutivi: 1,
            maiUnNo: true,
            ultimaDecisione: 'allow_once',
            ultimaVolta: '2026-08-28T10:00:00.000Z',
        })
    })

    it('allow_once/allow_turn/always_allow contano TUTTI come sì e si accumulano', () => {
        let stato = TALOS_FRICTION_VUOTO
        stato = registraDecisione(stato, 'shell', 'allow_once', 't1')
        stato = registraDecisione(stato, 'shell', 'allow_turn', 't2')
        stato = registraDecisione(stato, 'shell', 'always_allow', 't3')
        expect(stato.perAttrezzo.shell?.decisioniTotali).toBe(3)
        expect(stato.perAttrezzo.shell?.siConsecutivi).toBe(3)
        expect(stato.perAttrezzo.shell?.maiUnNo).toBe(true)
    })

    it('⛔ AL CONTRARIO — un deny azzera siConsecutivi e spegne maiUnNo PER SEMPRE, anche dopo molti sì', () => {
        let stato = TALOS_FRICTION_VUOTO
        for (let i = 0; i < 4; i += 1) stato = registraDecisione(stato, 'shell', 'allow_once', `t${i}`)
        stato = registraDecisione(stato, 'shell', 'deny', 't5')
        expect(stato.perAttrezzo.shell?.siConsecutivi).toBe(0)
        expect(stato.perAttrezzo.shell?.maiUnNo).toBe(false)

        // Anche altri sì dopo il no non riaccendono maiUnNo.
        stato = registraDecisione(stato, 'shell', 'allow_once', 't6')
        expect(stato.perAttrezzo.shell?.siConsecutivi).toBe(1)
        expect(stato.perAttrezzo.shell?.maiUnNo).toBe(false)
    })

    it('attrezzi diversi non si mescolano', () => {
        let stato = TALOS_FRICTION_VUOTO
        stato = registraDecisione(stato, 'leggi', 'deny', 't1')
        stato = registraDecisione(stato, 'scrivi', 'allow_once', 't2')
        expect(stato.perAttrezzo.leggi?.maiUnNo).toBe(false)
        expect(stato.perAttrezzo.scrivi?.maiUnNo).toBe(true)
    })

    it('registraDecisione non muta lo stato che riceve', () => {
        const prima = TALOS_FRICTION_VUOTO
        const congelatoPrima = JSON.stringify(prima)
        registraDecisione(prima, 'leggi', 'allow_once', 't1')
        expect(JSON.stringify(prima)).toBe(congelatoPrima)
    })
})

describe('6.4 — eQuasiSempreSi / riepilogoFrizione', () => {
    function statoConNSi(tool: string, n: number): TalosFrictionStatoV1 {
        let stato = TALOS_FRICTION_VUOTO
        for (let i = 0; i < n; i += 1) stato = registraDecisione(stato, tool, 'allow_once', `t${i}`)
        return stato
    }

    it(`sotto soglia (${SOGLIA_QUASI_SEMPRE_SI - 1} sì) NON è ancora un candidato`, () => {
        const stato = statoConNSi('leggi', SOGLIA_QUASI_SEMPRE_SI - 1)
        expect(eQuasiSempreSi(stato.perAttrezzo.leggi!)).toBe(false)
        expect(riepilogoFrizione(stato).candidatiDaRivedere).toEqual([])
    })

    it(`alla soglia (${SOGLIA_QUASI_SEMPRE_SI} sì, zero no) DIVENTA un candidato`, () => {
        const stato = statoConNSi('leggi', SOGLIA_QUASI_SEMPRE_SI)
        expect(eQuasiSempreSi(stato.perAttrezzo.leggi!)).toBe(true)
        expect(riepilogoFrizione(stato).candidatiDaRivedere).toEqual(['leggi'])
    })

    it('⛔ AL CONTRARIO — molti sì ma con un no in mezzo NON è mai un candidato, qualunque sia il totale', () => {
        let stato = statoConNSi('shell', SOGLIA_QUASI_SEMPRE_SI + 10)
        stato = registraDecisione(stato, 'shell', 'deny', 'tardi')
        stato = statoConNSiAggiungendo(stato, 'shell', SOGLIA_QUASI_SEMPRE_SI + 10)
        expect(eQuasiSempreSi(stato.perAttrezzo.shell!)).toBe(false)
        expect(riepilogoFrizione(stato).candidatiDaRivedere).toEqual([])

        function statoConNSiAggiungendo(base: TalosFrictionStatoV1, t: string, n: number): TalosFrictionStatoV1 {
            let s = base
            for (let i = 0; i < n; i += 1) s = registraDecisione(s, t, 'allow_once', `dopo-${i}`)
            return s
        }
    })

    it('il riepilogo somma attrezzi visti e decisioni vere su TUTTI, e ordina i candidati', () => {
        let stato = TALOS_FRICTION_VUOTO
        stato = registraDecisione(stato, 'zeta', 'deny', 't1') // mai candidato: un no subito
        stato = statoConNSiSu(stato, 'alfa', SOGLIA_QUASI_SEMPRE_SI)
        stato = statoConNSiSu(stato, 'beta', SOGLIA_QUASI_SEMPRE_SI)
        const r = riepilogoFrizione(stato)
        expect(r.attrezziVisti).toBe(3)
        expect(r.decisioniVereTotali).toBe(1 + SOGLIA_QUASI_SEMPRE_SI + SOGLIA_QUASI_SEMPRE_SI)
        expect(r.candidatiDaRivedere).toEqual(['alfa', 'beta'])

        function statoConNSiSu(base: TalosFrictionStatoV1, t: string, n: number): TalosFrictionStatoV1 {
            let s = base
            for (let i = 0; i < n; i += 1) s = registraDecisione(s, t, 'allow_once', `${t}-${i}`)
            return s
        }
    })
})

describe('6.4 — persistenza (Preferences finto)', () => {
    it('nessun valore salvato torna VUOTO, mai un crash', async () => {
        expect(await leggiStatoFrizione()).toEqual(TALOS_FRICTION_VUOTO)
    })

    it('⛔ AL CONTRARIO — un valore corrotto (non JSON, o senza schema_version) torna VUOTO, mai un crash', async () => {
        prefs.set('talos.decisionFriction.v1', 'non è json{{{')
        expect(await leggiStatoFrizione()).toEqual(TALOS_FRICTION_VUOTO)

        prefs.set('talos.decisionFriction.v1', JSON.stringify({ qualcosa: 'altro' }))
        expect(await leggiStatoFrizione()).toEqual(TALOS_FRICTION_VUOTO)
    })

    it('salvaStatoFrizione + leggiStatoFrizione fanno un giro completo fedele', async () => {
        const stato = registraDecisione(TALOS_FRICTION_VUOTO, 'leggi', 'allow_once', 't1')
        await salvaStatoFrizione(stato)
        expect(await leggiStatoFrizione()).toEqual(stato)
    })

    it('contaDecisioneReale legge, applica e salva in un solo passo', async () => {
        await contaDecisioneReale('leggi', 'allow_once', 't1')
        await contaDecisioneReale('leggi', 'allow_once', 't2')
        const stato = await leggiStatoFrizione()
        expect(stato.perAttrezzo.leggi?.decisioniTotali).toBe(2)
        expect(stato.perAttrezzo.leggi?.siConsecutivi).toBe(2)
    })
})
