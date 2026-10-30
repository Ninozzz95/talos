import { describe, expect, it } from 'vitest'
import { corpoAttrezzoR4, fallimentiDelGruppoR4, RIGHE_ESITO_R4 } from '@/lib/harness/r4/corpoAttrezzoR4'
import appAttivita from '@/lib/harness/r4/testi/app-attivita-r4.json'

/**
 * ⛔ T8 (censimento «Avvisi ed errori», punto c; ledger `LEDGER-T8-CORPO-DELLA-RIGA-2026-10-27.md`): il corpo della riga d'attrezzo
 * come lo disegna il PC @ r4 79ea996de (`legacy/app.js:16177` gli argomenti, `:23425-23636` il risultato; `errori.js:925` la frase
 * del NO; `esito-comando.js` verdetto e posto). Qui i PEZZI, nell'ordine del PC; il disegno è del componente.
 */
describe('T8 — il corpo della riga d’attrezzo, come il PC', () => {
    it('CORPO-01 un NO del kernel: la sua frase nella lingua dell’app, poi il testo del kernel com’è', () => {
        const pezzi = corpoAttrezzoR4({ nome: 'scrivi', argomenti: '', risultato: { contenuto: 'REFUSED. Empty html: nothing was created.' } }, 'it')
        expect(pezzi[0]).toEqual({ tipo: 'no', frase: expect.stringMatching(/\S/u) })
        expect(pezzi[0]!.tipo === 'no' && pezzi[0]!.frase).not.toMatch(/REFUSED|errori\./u)
        expect(pezzi.at(-1)).toEqual({ tipo: 'blocco', testo: 'REFUSED. Empty html: nothing was created.' })
        const en = corpoAttrezzoR4({ nome: 'scrivi', argomenti: '', risultato: { contenuto: 'REFUSED. Empty html: nothing was created.' } }, 'en')
        expect(en[0]).toEqual({ tipo: 'no', frase: 'The HTML was empty: nothing was created.' })
        // NOT FOUND senza un motivo noto: la frase generica di quel no
        const nf = corpoAttrezzoR4({ nome: 'leggi', argomenti: '', risultato: { contenuto: 'NOT FOUND. src/x.ts' } }, 'en')
        expect(nf[0]!.tipo).toBe('no')
    })

    it('CORPO-02 un comando fallito: la riga d’esito nelle parole di casa, poi l’output senza l’intestazione del kernel', () => {
        const pezzi = corpoAttrezzoR4({ nome: 'shell', argomenti: '', risultato: { contenuto: 'exit 1 [sandbox: none (cmd.exe nativo)]\nnpm ERR! missing script' } }, 'en')
        expect(pezzi).toEqual([
            { tipo: 'esito', riga: 'Failed · code 1 · on Windows, without isolation' },
            { tipo: 'blocco', testo: 'npm ERR! missing script' },
        ])
    })

    it('CORPO-03 un comando riuscito non dice la riga d’esito; un output vuoto si dice', () => {
        expect(corpoAttrezzoR4({ nome: 'shell', argomenti: '', risultato: { contenuto: 'exit 0 [sandbox: wsl2]\nciao' } }, 'it'))
            .toEqual([{ tipo: 'blocco', testo: 'ciao' }])
        const vuoto = corpoAttrezzoR4({ nome: 'shell', argomenti: '', risultato: { contenuto: 'exit 0 [sandbox: wsl2]\n' } }, 'en')
        expect(vuoto).toEqual([{ tipo: 'blocco', testo: 'No output.' }])
    })

    it('CORPO-04 ⛔ una lettura che comincia con «exit 1» è il contenuto del file: nessun verdetto, nessuna riga tolta', () => {
        const file = 'exit 1\nseconda riga'
        expect(corpoAttrezzoR4({ nome: 'leggi', argomenti: '', risultato: { contenuto: file } }, 'en')).toEqual([{ tipo: 'blocco', testo: file }])
    })

    it('CORPO-05 i due flussi quando ci sono: «Output» e «Diagnostics», stesso tono; uno vuoto non si disegna', () => {
        const pezzi = corpoAttrezzoR4({ nome: 'shell', argomenti: '', risultato: { contenuto: 'exit 2 [sandbox: wsl2]\nx', stdout: 'compilato', stderr: 'warning: y' } }, 'en')
        expect(pezzi).toEqual([
            { tipo: 'esito', riga: 'Failed · code 2 · in Linux (WSL), not on Windows' },
            { tipo: 'flusso', etichetta: 'Output', testo: 'compilato' },
            { tipo: 'flusso', etichetta: 'Diagnostics', testo: 'warning: y' },
        ])
        const solo = corpoAttrezzoR4({ nome: 'shell', argomenti: '', risultato: { contenuto: 'exit 0\nx', stdout: '', stderr: 'w' } }, 'it')
        expect(solo.map((p) => p.tipo)).toEqual(['flusso'])
    })

    it('CORPO-06 oltre 200 righe si taglia e si dice quante mancano, col plurale giusto', () => {
        const righe = Array.from({ length: RIGHE_ESITO_R4 + 1 }, (_, i) => `r${i}`)
        const [blocco] = corpoAttrezzoR4({ nome: 'leggi', argomenti: '', risultato: { contenuto: righe.join('\n') } }, 'en')
        expect(blocco).toEqual({ tipo: 'blocco', testo: righe.slice(0, RIGHE_ESITO_R4).join('\n'), tagliato: `One more line is not shown here (${RIGHE_ESITO_R4 + 1} in total).` })
        const [due] = corpoAttrezzoR4({ nome: 'leggi', argomenti: '', risultato: { contenuto: [...righe, 'x'].join('\n') } }, 'en')
        expect(due!.tipo === 'blocco' && due!.tagliato).toBe(`Another 2 lines are not shown here (${RIGHE_ESITO_R4 + 2} in total).`)
    })

    it('CORPO-07 gli argomenti: chiave e valore, la descrizione saltata, un valore lungo chiuso con i caratteri, uno multiriga in un blocco', () => {
        const lungo = 'a'.repeat(401)
        const pezzi = corpoAttrezzoR4({ nome: 'scrivi', argomenti: JSON.stringify({ descrizione: 'Scrivo', percorso: 'a.txt', contenuto: 'riga1\nriga2', html: lungo, n: 3 }) }, 'en')
        expect(pezzi.map(({ etichetta: _, ...p }) => p)).toEqual([
            { tipo: 'argomento', chiave: 'percorso', valore: 'a.txt', forma: 'riga' },
            { tipo: 'argomento', chiave: 'contenuto', valore: 'riga1\nriga2', forma: 'blocco' },
            { tipo: 'argomento', chiave: 'html', valore: lungo, forma: 'lungo', caratteri: '401 characters' },
            { tipo: 'argomento', chiave: 'n', valore: '3', forma: 'riga' },
        ])
        // argomenti storti: il testo grezzo, mai un crash
        expect(corpoAttrezzoR4({ nome: 'scrivi', argomenti: '{"percorso": "a' }, 'it')).toEqual([{ tipo: 'argomentiGrezzi', testo: '{"percorso": "a' }])
    })

    it('CORPO-08 senza argomenti né risultato il corpo è vuoto: la riga non si apre (`nonApribileSeVuota`)', () => {
        expect(corpoAttrezzoR4({ nome: 'shell', argomenti: '' }, 'it')).toEqual([])
        expect(corpoAttrezzoR4({ nome: 'shell', argomenti: '{}' }, 'it')).toEqual([])
    })

    it('CORPO-09 l’avviso del canale combinato e il riferimento all’output conservato parlano al modello: non si mostrano', () => {
        const grezzo = '[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]\nexit 0 [sandbox: wsl2]\n'
            + '[TALOS output reference: 0123abcd-0123-4567-89ab-0123456789ab; retained 10 of 10 bytes.]\nok'
        expect(corpoAttrezzoR4({ nome: 'shell', argomenti: '', risultato: { contenuto: grezzo } }, 'it')).toEqual([{ tipo: 'blocco', testo: 'ok' }])
    })

    it('CORPO-11 il nome del campo: la voce `app.activity.arg.<campo>` del desktop; senza voce il nome com’è, mai una chiave grezza', () => {
        const [campo] = corpoAttrezzoR4({ nome: 'mcp__x__fai', argomenti: '{"zz_mai_visto":"v"}' }, 'it')
        expect(campo).toMatchObject({ chiave: 'zz_mai_visto', etichetta: 'zz_mai_visto' })
        const dizionario = appAttivita as unknown as { it: Record<string, string>; en: Record<string, string> }
        // `descrizione` no: è già l'etichetta della riga e il corpo la salta, come il PC
        const campi = Object.entries(dizionario.en).filter(([k]) => k.startsWith('activity.arg.') && k !== 'activity.arg.descrizione')
        expect(campi.length).toBeGreaterThan(100)
        expect(corpoAttrezzoR4({ nome: 'scrivi', argomenti: '{"percorso":"a"}' }, 'it')[0]).toMatchObject({ etichetta: 'percorso' })
        expect(corpoAttrezzoR4({ nome: 'scrivi', argomenti: '{"percorso":"a"}' }, 'en')[0]).toMatchObject({ etichetta: 'path' })
        for (const [chiave, en] of campi) {
            const nome = chiave.slice('activity.arg.'.length)
            expect(corpoAttrezzoR4({ nome: 'scrivi', argomenti: JSON.stringify({ [nome]: 'v' }) }, 'en')[0]).toMatchObject({ etichetta: en })
            expect(corpoAttrezzoR4({ nome: 'scrivi', argomenti: JSON.stringify({ [nome]: 'v' }) }, 'it')[0]).toMatchObject({ etichetta: dizionario.it[chiave] ?? en })
        }
    })

    it('CORPO-12 il gruppo dice i fallimenti con le frasi della testa del PC: errore se uno è fallito, attenzione se solo interrotti', () => {
        expect(fallimentiDelGruppoR4([undefined, 'errore', 'errore'], 'en')).toEqual({ testo: '2 steps failed', tono: 'errore' })
        expect(fallimentiDelGruppoR4(['errore', 'interrotta'], 'en')).toEqual({ testo: '1 step failed · 1 step interrupted', tono: 'errore' })
        expect(fallimentiDelGruppoR4(['interrotta', undefined], 'en')).toEqual({ testo: '1 step interrupted', tono: 'avviso' })
        expect(fallimentiDelGruppoR4(['non-eseguita', 'doppione', undefined], 'it')).toBeNull()
        expect(fallimentiDelGruppoR4(['errore'], 'it')!.testo).toMatch(/non riuscit/u)
    })

    it('CORPO-10 comando fermato: «Cancelled» per 130, «Force-stopped» per 137, nessun codice per null', () => {
        const riga = (c: string) => corpoAttrezzoR4({ nome: 'shell', argomenti: '', risultato: { contenuto: `exit ${c}\n` } }, 'en')[0]
        expect(riga('130')).toEqual({ tipo: 'esito', riga: 'Cancelled · code 130' })
        expect(riga('137')).toEqual({ tipo: 'esito', riga: 'Force-stopped · code 137' })
        expect(riga('null')).toEqual({ tipo: 'esito', riga: 'Stopped: the command did not return an exit code' })
    })
})
