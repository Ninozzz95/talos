// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosCodiceR4AlberoSheet from '@/components/codice/TalosCodiceR4AlberoSheet.vue'
import TalosCodiceR4HookSheet from '@/components/codice/TalosCodiceR4HookSheet.vue'

/*
 * ⛔ K3-C2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): i due fogli dell'header del Codice su r4, con i dati veri di r4
 * (forme misurate sul Pad il 15/10). Niente righe finte: senza deleghe o senza hook, lo si dice.
 */
const appunti = vi.hoisted(() => ({ testi: [] as string[] }))
vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: async (testo: string) => { appunti.testi.push(testo) } }))
afterEach(() => { document.body.innerHTML = ''; appunti.testi = [] })
const testo = () => document.body.textContent ?? ''

describe('albero della sessione (K3-C2)', () => {
    it('FOG-01 la sessione principale e le deleghe; toccando una delega si apre', async () => {
        const carica = vi.fn(async () => [
            { sessionId: 'f1', task: 'Leggi i test', conclusa: true, esitoDelega: 'concluso' },
            { sessionId: 'f2', task: 'Scrivi il README', conclusa: false },
        ])
        const w = mount(TalosCodiceR4AlberoSheet, { attachTo: document.body, props: { titolo: 'Leggi NOTA.md', carica } })
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-codice-r4-albero"]')).not.toBeNull()
        expect(testo()).toContain('Leggi NOTA.md')
        expect(testo()).toContain('Main session')
        expect(testo()).toContain('Leggi i test')
        expect(testo()).toContain('Delegation · done')
        expect(testo()).toContain('Delegation · running')
        document.body.querySelector<HTMLElement>('[data-sessione="f1"]')!.click()
        expect(w.emitted('apri')).toEqual([['f1']])
        w.unmount()
    })

    it('FOG-02 senza deleghe lo dice; se il caricamento fallisce lo dice', async () => {
        const vuoto = mount(TalosCodiceR4AlberoSheet, { attachTo: document.body, props: { titolo: 'S', carica: async () => [] } })
        await flushPromises()
        expect(testo()).toContain('Code does not delegate: every step runs in this single session.')
        vuoto.unmount()
        const rotto = mount(TalosCodiceR4AlberoSheet, { attachTo: document.body, props: { titolo: 'S', carica: async () => null } })
        await flushPromises()
        expect(testo()).toContain('Could not load. Try again.')
        rotto.unmount()
    })
})

describe('hook del progetto (K3-C2)', () => {
    it('FOG-03 gli hook con i loro eventi; fidato «Active», non fidato «Trust»', async () => {
        const carica = vi.fn(async () => ({ hooks: [{ id: 'formatta', eventi: ['PostToolUse', 'Stop'], fidato: false }, { id: 'lint', eventi: ['PreToolUse'], fidato: true }], errore: null }))
        const w = mount(TalosCodiceR4HookSheet, { attachTo: document.body, props: { carica, fida: vi.fn() } })
        await flushPromises()
        expect(testo()).toContain('formatta')
        expect(testo()).toContain('PostToolUse, Stop')
        expect(document.body.querySelector('[data-hook="lint"]')!.textContent).toContain('Active')
        expect(document.body.querySelector('[data-hook="formatta"] button')!.textContent).toContain('Trust')
        w.unmount()
    })

    it('FOG-04 «Trust» chiama fida per quell\'hook, è spento mentre lavora, poi la lista si ricarica', async () => {
        let fidato = false
        const carica = vi.fn(async () => ({ hooks: [{ id: 'formatta', eventi: ['Stop'], fidato }], errore: null }))
        let finisci: (v: boolean) => void = () => undefined
        const fida = vi.fn(() => new Promise<boolean>((ok) => { finisci = ok }))
        const w = mount(TalosCodiceR4HookSheet, { attachTo: document.body, props: { carica, fida } })
        await flushPromises()
        const bottone = () => document.body.querySelector<HTMLButtonElement>('[data-hook="formatta"] button')!
        bottone().click()
        await flushPromises()
        expect(fida).toHaveBeenCalledWith('formatta')
        expect(bottone().disabled).toBe(true)
        fidato = true
        finisci(true)
        await flushPromises()
        expect(carica).toHaveBeenCalledTimes(2)
        expect(document.body.querySelector('[data-hook="formatta"]')!.textContent).toContain('Active')
        w.unmount()
    })

    it('FOG-05 file degli hook non valido, nessun hook, caricamento fallito: ognuno detto', async () => {
        const casi: [unknown, string][] = [
            [{ hooks: [], errore: 'Unexpected token' }, 'Unexpected token'],
            [{ hooks: [], errore: null }, 'No hooks declared in this project (.harness-ui-hooks.json).'],
            [null, 'Could not load. Try again.'],
        ]
        for (const [risposta, atteso] of casi) {
            const w = mount(TalosCodiceR4HookSheet, { attachTo: document.body, props: { carica: async () => risposta as never, fida: vi.fn() } })
            await flushPromises()
            expect(testo()).toContain(atteso)
            w.unmount()
            document.body.innerHTML = ''
        }
    })
})

/*
 * ⛔ K3-C2b: il foglio «Doctor» del Codice su r4. Le voci sono quelle di `controlliDoctorR4` (copia fissata del Doctor di r4, provata
 * contro il golden del vero `doctor.js`); qui si prova che il foglio le mostri tutte, ordinate, con la gravità a parole.
 */
describe('il Doctor (K3-C2b)', () => {
    it('FOG-06 esito, voci con gravità e righe, «Check again»; guasto e risposta non valida detti', async () => {
        const { default: TalosCodiceR4DoctorSheet } = await import('@/components/codice/TalosCodiceR4DoctorSheet.vue')
        const risposte: unknown[] = [
            { chiaveApi: true, shell: 'desktop', git: false, naviga: true, cartelleProgetto: { disponibili: true, conteggio: 1 } },
            null,
            { chiaveApi: true, shell: 'android', git: false, naviga: true },
        ]
        const carica = vi.fn(async () => risposte.shift())
        const w = mount(TalosCodiceR4DoctorSheet, { attachTo: document.body, props: { carica } })
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-codice-r4-doctor-foglio"]')).not.toBeNull()
        // 11 controlli, git e i quattro «non osservati» … da rivedere: solo git (warning)
        expect(testo()).toContain('11 checks · 1 to review.')
        const voci = [...document.body.querySelectorAll('[data-doctor-id]')].map((e) => e.getAttribute('data-doctor-id'))
        expect(voci[0]).toBe('git')
        expect(voci).toHaveLength(11)
        expect(testo()).toContain('Warning')
        expect(testo()).toContain('Diagnostic command run directly on the device, not isolated.')
        expect(testo()).toContain('1 folder allowed.')
        const ancora = document.body.querySelector<HTMLButtonElement>('[data-testid="talos-codice-r4-doctor-ancora"]')!
        expect(ancora.textContent).toContain('Check again')
        ancora.click()
        await flushPromises()
        expect(carica).toHaveBeenCalledTimes(2)
        expect(testo()).toContain('Could not load. Try again.')
        ancora.click()
        await flushPromises()
        expect(testo()).toContain('The diagnosis response is not valid.')
        expect(document.body.querySelectorAll('[data-doctor-id]')).toHaveLength(0)
        w.unmount()
    })
})

/*
 * FOG-ATTESA-01 — owner 29/10 sera, mockup «Caricamenti vivi» v6 («Quella della Chat ovunque», classe B): nei fogli del Codice l'attesa
 * è la riga in corso in linea, con la rotella ARANCIONE accanto al testo, e i secondi solo dopo 2 s. Una sola regione `status`.
 */
describe('le attese dei fogli del Codice (FOG-ATTESA-01)', () => {
    afterEach(() => { vi.useRealTimers() })
    const giroArancione = () => {
        const giro = document.body.querySelector('[data-testid="talos-riga-in-corso-giro"]')
        expect(giro?.getAttribute('class')).toContain('text-[var(--talos-accent)]')
    }
    const durata = () => document.body.querySelector('[data-testid="talos-riga-in-corso-durata"]')?.textContent ?? null

    it('FOG-ATTESA-01 Albero, Hook e Doctor: rotella arancione, niente secondi prima di 2 s, «· 2s» dopo; uno status solo', async () => {
        vi.useFakeTimers()
        const { default: TalosCodiceR4DoctorSheet } = await import('@/components/codice/TalosCodiceR4DoctorSheet.vue')
        const fogli = [
            () => mount(TalosCodiceR4AlberoSheet, { attachTo: document.body, props: { titolo: 'S', carica: () => new Promise<never>(() => {}) } }),
            () => mount(TalosCodiceR4HookSheet, { attachTo: document.body, props: { carica: () => new Promise<never>(() => {}), fida: vi.fn() } }),
            () => mount(TalosCodiceR4DoctorSheet, { attachTo: document.body, props: { carica: () => new Promise<never>(() => {}) } }),
        ]
        for (const monta of fogli) {
            const w = monta()
            await vi.advanceTimersByTimeAsync(0)
            const riga = document.body.querySelector('[data-testid="talos-riga-in-corso"]')
            expect(riga).not.toBeNull()
            expect(riga!.getAttribute('class')).not.toContain('min-h-8')
            expect(riga!.closest('.talos-codice-r4-nota')?.getAttribute('role')).toBeNull()
            giroArancione()
            await vi.advanceTimersByTimeAsync(1_900)
            expect(durata()).toBeNull()
            await vi.advanceTimersByTimeAsync(100)
            expect(durata()).toBe('· 2s')
            w.unmount()
            expect(vi.getTimerCount()).toBe(0)
        }
    })

    it('FOG-ATTESA-01 Doctor «Check again»: l\'attesa ricomincia da zero', async () => {
        vi.useFakeTimers()
        const { default: TalosCodiceR4DoctorSheet } = await import('@/components/codice/TalosCodiceR4DoctorSheet.vue')
        let rispondi: (v: unknown) => void = () => {}
        const carica = vi.fn(() => new Promise((r) => { rispondi = r }))
        const w = mount(TalosCodiceR4DoctorSheet, { attachTo: document.body, props: { carica } })
        await vi.advanceTimersByTimeAsync(3_000)
        expect(durata()).toBe('· 3s')
        rispondi({ chiaveApi: true, shell: 'android', git: true, naviga: true })
        await vi.advanceTimersByTimeAsync(0)
        expect(document.body.querySelector('[data-testid="talos-riga-in-corso"]')).toBeNull()
        document.body.querySelector<HTMLButtonElement>('[data-testid="talos-codice-r4-doctor-ancora"]')!.click()
        await vi.advanceTimersByTimeAsync(500)
        expect(document.body.querySelector('[data-testid="talos-riga-in-corso"]')).not.toBeNull()
        expect(durata()).toBeNull()
        await vi.advanceTimersByTimeAsync(1_500)
        expect(durata()).toBe('· 2s')
        w.unmount()
    })
})

/*
 * ⛔ K3-C2b, visto sul Pad (15/10): tutte le icone ambra e tutte le gravità grigie, perché `.talos-codice-r4-azione-icona` e
 * `.talos-codice-r4-azione-testo > small` pesano più delle classi di colore. Il colore della gravità sta nel CSS, per `data-gravita`.
 */
describe('i colori della gravità del Doctor (K3-C2b)', () => {
    it('FOG-07 icona e parola della gravità prendono il colore dalla gravità, non dalle righe comuni', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const css = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'components', 'codice', 'codiceR4.css'), 'utf8')
        for (const [gravita, colore] of [['danger', 'danger'], ['warning', 'warning'], ['info', 'muted'], ['success', 'success']]) {
            // la regola di quella gravità, e dentro il suo colore (senza regex: niente da sfuggire)
            const inizio = css.indexOf(`.talos-codice-r4-voce-doctor[data-gravita="${gravita}"]`)
            expect(inizio, gravita).toBeGreaterThanOrEqual(0)
            const regola = css.slice(inizio, css.indexOf('}', inizio))
            expect(regola, gravita).toContain('.talos-codice-r4-doctor-icona')
            expect(regola, gravita).toContain('.talos-codice-r4-doctor-gravita')
            expect(regola, gravita).toContain(`color: var(--talos-${colore})`)
        }
        const { default: TalosCodiceR4DoctorSheet } = await import('@/components/codice/TalosCodiceR4DoctorSheet.vue')
        const w = mount(TalosCodiceR4DoctorSheet, { attachTo: document.body, props: { carica: async () => ({ chiaveApi: false, shell: 'none', git: true, naviga: true }) } })
        await flushPromises()
        const voce = document.body.querySelector('[data-doctor-id="shell"]')!
        expect(voce.getAttribute('data-gravita')).toBe('danger')
        expect(voce.querySelector('.talos-codice-r4-doctor-icona')).not.toBeNull()
        expect(voce.querySelector('.talos-codice-r4-doctor-gravita')!.textContent).toBe('Failure')
        w.unmount()
    })
})

/*
 * ⛔ K3-C3b-1: il contenuto del pannello ▤ con i dati VERI (golden di una sessione r4 che scrive un file, politica del Pad).
 */
describe('il pannello ▤ (K3-C3b-1)', () => {
    it('FOG-08 Contesto: ambiente, finestra sul limite «~200k» col suo perché, indice dei giri; File: +4 −1', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const { leggiFlussoSse } = await import('@/lib/harness/r4/eventiR4')
        const { applicaEventoPannelloR4, creaPannelloR4 } = await import('@/lib/harness/r4/pannelloR4')
        const { default: TalosCodiceR4Pannello } = await import('@/components/codice/TalosCodiceR4Pannello.vue')
        const sse = readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'r4-fc5e25d62-scrittura-vivo.sse'), 'utf8')
        const pannello = leggiFlussoSse(sse).map((e) => e.dati).reduce(applicaEventoPannelloR4, creaPannelloR4())
        const caricaPolitica = vi.fn(async () => ({ triggerTokens: 200000, windowTokens: null, source: 'fallback' }))
        const caricaCache = vi.fn(async () => null)
        const w = mount(TalosCodiceR4Pannello, { attachTo: document.body, props: { pannello, caricaPolitica, caricaCache, giriFiniti: 3, azioneProcesso: vi.fn(), caricaRisorse: vi.fn(async () => null), caricaSessioni: vi.fn(async () => []), caricaFigli: vi.fn(async () => []) } })
        await flushPromises()
        expect(testo()).toContain('Environment')
        expect(testo()).toContain('Context window')
        expect(w.get('[data-testid="talos-codice-r4-finestra"]').text()).toContain('~200k')
        expect(testo()).toContain('Model window not verified')
        expect(testo()).toContain('0.1k · 0.0%')
        expect(testo()).toContain('Turn index')
        expect(testo()).toContain('6 · Fatto: slugify.mjs ora toglie gli')
        expect(testo()).toContain('2 tools')
        await w.get('[data-scheda="file"]').trigger('click')
        expect(w.get('[data-file="slugify.mjs"]').text()).toContain('+4 −1')
        expect(testo()).toContain('1 file changed · +4 −1')
        // a ogni giro finito rilegge politica e cache
        await w.setProps({ giriFiniti: 4 })
        await flushPromises()
        expect(caricaPolitica).toHaveBeenCalledTimes(2)
        w.unmount()
    })
})

/*
 * ⛔ K3-C3b-2a: la scheda «Processi» del pannello ▤. Righe dal golden VERO di r4 (comando fermato con lo Stop, uno che esce 2, uno
 * riuscito) e da eventi nella forma di r4 per i comandi vivi; le parole sono quelle del desktop (`processi-scheda-r4.json`).
 */
describe('la scheda Processi (K3-C3b-2a)', () => {
    const vivo = (id: string, comando: string) => [
        { type: 'RunStarted', input: { consegna: 'x' } },
        { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell' },
        { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando }) },
    ]
    async function monta(eventi: Record<string, unknown>[], azioneProcesso = vi.fn(async () => ({ ok: true as const })), caricaRisorse = vi.fn(async () => null as never)) {
        const { applicaEventoPannelloR4, creaPannelloR4 } = await import('@/lib/harness/r4/pannelloR4')
        const { default: TalosCodiceR4Pannello } = await import('@/components/codice/TalosCodiceR4Pannello.vue')
        const pannello = eventi.reduce((p, e) => applicaEventoPannelloR4(p, e), creaPannelloR4())
        const w = mount(TalosCodiceR4Pannello, { attachTo: document.body, props: {
            pannello, caricaPolitica: async () => null, caricaCache: async () => null, giriFiniti: 0, azioneProcesso, caricaRisorse,
            caricaSessioni: async () => [], caricaFigli: async () => [], sessioneId: 's1',
        } })
        await flushPromises()
        await w.get('[data-scheda="processi"]').trigger('click')
        return w
    }

    it('FOG-09 dal flusso registrato: tre righe con descrizione, stato, chi e uscita; il dettaglio si apre a tocco', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const { leggiFlussoSse } = await import('@/lib/harness/r4/eventiR4')
        const sse = readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'r4-fc5e25d62-comando-vivo.sse'), 'utf8')
        const w = await monta(leggiFlussoSse(sse).map((e) => e.dati as Record<string, unknown>))
        expect(w.get('[data-scheda="processi"]').text()).toBe('Processes')
        expect(w.find('[data-testid="talos-codice-r4-processi-numero"]').exists()).toBe(false)
        const righe = w.findAll('[data-processo]')
        expect(righe.map((r) => r.attributes('data-stato'))).toEqual(['riuscito', 'fallito', 'annullato'])
        expect(righe[0].text()).toContain('Mostra la versione di Node')
        expect(righe[0].text()).toContain('Succeeded')
        expect(righe[0].text()).toContain('agent · turn 3')
        expect(righe[2].text()).toContain('Cancelled')
        expect(righe[2].text()).toContain('exit 130')
        expect(righe[2].find('[data-azione="menu"]').exists()).toBe(true)
        await righe[1].get('[data-azione="dettaglio"]').trigger('click')
        expect(w.get('[data-processo="comando1"] dl').text()).toContain('node -e "process.exit(2)"')
        expect(w.get('[data-processo="comando1"] dl').text()).toContain('Command')
        // visto sul Pad (15/10): «Descrizion/e» spezzata e la descrizione in monospazio. I valori lunghi hanno la loro classe (come
        // `CLASSI_DETTAGLIO_PROCESSO` del desktop): a capo, a sinistra, l'etichetta intera; il monospazio solo per il comando.
        const righeDettaglio = w.findAll('[data-processo="comando1"] dl > div')
        const lunghe = righeDettaglio.filter((r) => r.attributes('data-classe') === 'lungo').map((r) => r.get('dt').text())
        expect(lunghe).toEqual(['Command', 'Description'])
        expect(righeDettaglio[0].get('dd').classes()).toContain('font-mono')
        expect(righeDettaglio.at(-1)!.get('dd').classes()).not.toContain('font-mono')
        const { readFileSync: leggi } = await import('node:fs')
        const css = leggi(resolve(__dirname, '..', '..', '..', 'src', 'components', 'codice', 'codiceR4.css'), 'utf8')
        const regola = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)))
        expect(regola('.talos-codice-r4-kv[data-classe="lungo"] > dt')).toContain('flex: none')
        expect(regola('.talos-codice-r4-kv[data-classe="lungo"] > dd')).toContain('text-align: left')
        // e la «Cartella» (non lunga per il desktop, ma un percorso): visto sul Pad, l'etichetta a una lettera per riga
        expect(regola('.talos-codice-r4-processo-dettaglio .talos-codice-r4-kv > dt')).toContain('flex: none')
        expect(regola('.talos-codice-r4-processo-dettaglio .talos-codice-r4-kv > dd')).toContain('overflow-wrap: anywhere')
        w.unmount()
    })

    it('FOG-10 riga viva: numero sulla scheda, «…» con Sfonda e Ferma; un rifiuto dice il perché sotto la riga', async () => {
        const azione = vi.fn(async () => ({ ok: false as const, motivo: 'This command is no longer running' }))
        const w = await monta(vivo('c1', 'npm run dev'), azione)
        expect(w.get('[data-testid="talos-codice-r4-processi-numero"]').text()).toBe('1')
        const riga = () => w.get('[data-processo="c1"]')
        expect(riga().attributes('data-stato')).toBe('in-corso')
        expect(riga().get('[data-tipo="eseguibile"]').text()).toBe('npm')
        await riga().get('[data-azione="menu"]').trigger('click')
        expect(riga().findAll('.talos-codice-r4-processo-azioni button').map((b) => b.attributes('data-azione'))).toEqual(['sfonda', 'ferma'])
        expect(riga().get('[data-azione="ferma"]').text()).toBe('Stop this command')
        await riga().get('[data-azione="ferma"]').trigger('click')
        await flushPromises()
        expect(azione).toHaveBeenCalledWith('ferma', 'c1')
        expect(riga().get('[role="status"]').text()).toBe('Not stopped: This command is no longer running')
        w.unmount()
    })

    it('FOG-11 «Ferma tutti» con più vivi: chiede conferma, poi ferma ognuno', async () => {
        const azione = vi.fn(async () => ({ ok: true as const }))
        const w = await monta([...vivo('c1', 'sleep 30'), ...vivo('c2', 'sleep 40').slice(1)], azione)
        await w.get('[data-testid="talos-codice-r4-processi-ferma-tutti"]').trigger('click')
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-confirm-dialog"]')!.textContent).toContain('Stop the 2 commands that are running now?')
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-processi-ferma-tutti-conferma"]')!.click()
        await flushPromises()
        expect(azione.mock.calls.map((c) => c[1]).sort()).toEqual(['c1', 'c2'])
        expect(w.get('[data-processo="c1"] [role="status"]').text()).toBe('Stopping the command…')
        w.unmount()
    })

    it('FOG-12 filtro per testo e per stato, frasi del vuoto, «Carica altri» oltre 40', async () => {
        const eventi: Record<string, unknown>[] = [{ type: 'RunStarted', input: { consegna: 'x' } }]
        for (let i = 0; i < 45; i++) {
            eventi.push({ type: 'ToolCallStart', toolCallId: `c${i}`, toolCallName: 'shell' }, { type: 'ToolCallArgs', toolCallId: `c${i}`, delta: JSON.stringify({ comando: `echo ${i}` }) },
                { type: 'ToolCallResult', toolCallId: `c${i}`, content: 'x', exitCode: i === 7 ? 2 : 0, durataMs: 10 })
        }
        eventi.push({ type: 'RunFinished' })
        const w = await monta(eventi)
        expect(w.findAll('[data-processo]')).toHaveLength(40)
        expect(w.text()).toContain('Load more · showing 40 of 45')
        await w.get('[data-testid="talos-codice-r4-processi-altri"]').trigger('click')
        expect(w.findAll('[data-processo]')).toHaveLength(45)
        await w.get('.talos-codice-r4-stati [data-stato="fallito"]').trigger('click')
        expect(w.findAll('[data-processo]').map((r) => r.attributes('data-processo'))).toEqual(['c7'])
        // gli stati rari non ci sono finché non ci sono nei dati
        expect(w.find('.talos-codice-r4-stati [data-stato="in-sfondo"]').exists()).toBe(false)
        await w.get('.talos-codice-r4-stati [data-stato="tutti"]').trigger('click')
        await w.get('[data-testid="talos-codice-r4-processi-filtro"]').setValue('nessuno-così')
        expect(w.get('[data-testid="talos-codice-r4-processi-vuoto"]').text()).toBe('No command matches the filter.')
        w.unmount()
        const vuota = await monta([])
        expect(vuota.get('[data-testid="talos-codice-r4-processi-vuoto"]').text()).toContain('No commands run in this session.')
        expect(vuota.find('[data-testid="talos-codice-r4-processi-filtro"]').exists()).toBe(false)
        vuota.unmount()
    })

    it('FOG-13 CPU e memoria solo con un comando vivo: la prima lettura dopo 1,5 s, poi ogni 5 s; «CPU —» se non misurate', async () => {
        vi.useFakeTimers()
        try {
            const letture: (Map<string, { cpuPercento: number | null; memoriaByte: number | null }> | null)[] = [
                new Map([['c1', { cpuPercento: null, memoriaByte: null }]]),
                new Map([['c1', { cpuPercento: 12, memoriaByte: 52_428_800 }]]),
            ]
            const caricaRisorse = vi.fn(async () => letture.shift() ?? null)
            const w = await monta(vivo('c1', 'npm run dev'), undefined, caricaRisorse as never)
            expect(caricaRisorse).not.toHaveBeenCalled()
            await vi.advanceTimersByTimeAsync(1_500)
            expect(caricaRisorse).toHaveBeenCalledTimes(1)
            expect(w.get('[data-processo="c1"]').text()).toContain('CPU —')
            await vi.advanceTimersByTimeAsync(5_000)
            expect(caricaRisorse).toHaveBeenCalledTimes(2)
            expect(w.get('[data-processo="c1"]').text()).toContain('CPU 12% · 50 MB')
            w.unmount()
            const finita = await monta([{ type: 'RunStarted', input: { consegna: 'x' } }, { type: 'ToolCallStart', toolCallId: 'c9', toolCallName: 'shell' },
                { type: 'ToolCallResult', toolCallId: 'c9', content: 'x', exitCode: 0 }], undefined, caricaRisorse as never)
            await vi.advanceTimersByTimeAsync(20_000)
            expect(caricaRisorse).toHaveBeenCalledTimes(2)
            finita.unmount()
        } finally {
            vi.useRealTimers()
        }
    })
})

/*
 * ⛔ K3 «Non più seguito» (ledger `LEDGER-K3-NON-PIU-SEGUITO-2026-10-17.md`): un comando partito in sfondo prima di un riavvio di r4
 * non lo segue più nessuno. Dati VERI di r4 @ 701c6c0d2: la rigiocata del server riavviato e il suo elenco delle sessioni, che dice
 * `sequenzaAlRipristino` (`session-registry.mjs:9611`); il desktop lo passa ai Processi (`legacy/app.js:11970-11972`).
 */
describe('i comandi in sfondo dopo un riavvio di r4 (K3 «Non più seguito»)', () => {
    const ID = '46eb06ed-7655-4bb3-8ed9-817e813cda0f'
    async function montaDopoIlRiavvio(sessioni: Record<string, unknown>[]) {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const { leggiFlussoSse } = await import('@/lib/harness/r4/eventiR4')
        const { applicaEventoPannelloR4, creaPannelloR4 } = await import('@/lib/harness/r4/pannelloR4')
        const { default: TalosCodiceR4Pannello } = await import('@/components/codice/TalosCodiceR4Pannello.vue')
        const sse = readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'r4-701c6c0d2-sfondo-rigiocata.sse'), 'utf8')
        const pannello = leggiFlussoSse(sse).map((e) => e.dati as Record<string, unknown>).reduce((p, e) => applicaEventoPannelloR4(p, e), creaPannelloR4())
        const w = mount(TalosCodiceR4Pannello, { attachTo: document.body, props: {
            pannello, caricaPolitica: async () => null, caricaCache: async () => null, giriFiniti: 0, azioneProcesso: vi.fn(async () => ({ ok: true as const })),
            caricaRisorse: vi.fn(async () => null), caricaSessioni: async () => sessioni, caricaFigli: async () => [], sessioneId: ID,
        } })
        await flushPromises()
        await w.get('[data-scheda="processi"]').trigger('click')
        return w
    }
    const elencoVero = async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        return JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'r4-701c6c0d2-sfondo-sessioni.json'), 'utf8')).data.items as Record<string, unknown>[]
    }

    it('FOG-27 l\'elenco del server riavviato dice fin dove: la riga è «No longer tracked», non conta, si può togliere', async () => {
        const sessioni = await elencoVero()
        expect(sessioni.find((s) => s.sessionId === ID)?.sequenzaAlRipristino).toBe(61)
        const w = await montaDopoIlRiavvio(sessioni)
        const riga = w.get('[data-processo="sfondo0"]')
        expect(riga.attributes('data-stato')).toBe('perso')
        expect(riga.text()).toContain('No longer tracked')
        expect(w.find('[data-testid="talos-codice-r4-processi-numero"]').exists()).toBe(false)
        await riga.get('[data-azione="menu"]').trigger('click')
        expect(w.get('[data-processo="sfondo0"]').findAll('.talos-codice-r4-processo-azioni button').map((b) => b.attributes('data-azione'))).toEqual(['togli'])
        w.unmount()
    })

    it('FOG-28 senza `sequenzaAlRipristino` (sessione di questo server) il comando resta «In sfondo» e conta', async () => {
        const sessioni = (await elencoVero()).map((s) => (s.sessionId === ID ? { ...s, sequenzaAlRipristino: null } : s))
        const w = await montaDopoIlRiavvio(sessioni)
        expect(w.get('[data-processo="sfondo0"]').attributes('data-stato')).toBe('in-sfondo')
        expect(w.get('[data-testid="talos-codice-r4-processi-numero"]').text()).toBe('1')
        w.unmount()
    })
})

/*
 * ⛔ K3-C3b-2b: la scheda «Agenti» del pannello ▤. Dati VERI di r4 (sessione con due richieste che delegano: due figlie, poi una 21 s
 * dopo): gli eventi, l'elenco delle sessioni e i figli registrati; parole del desktop (`agenti-scheda-r4.json`, `processi-scheda-r4.json`).
 */
describe('la scheda Agenti (K3-C3b-2b)', () => {
    async function monta({ eventi = null as Record<string, unknown>[] | null, sessioni = undefined as unknown, figli = undefined as unknown, sessioneId = undefined as string | undefined } = {}) {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const { leggiFlussoSse } = await import('@/lib/harness/r4/eventiR4')
        const { applicaEventoPannelloR4, creaPannelloR4 } = await import('@/lib/harness/r4/pannelloR4')
        const { default: TalosCodiceR4Pannello } = await import('@/components/codice/TalosCodiceR4Pannello.vue')
        const fx = (n: string) => readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', n), 'utf8')
        const ev = eventi ?? leggiFlussoSse(fx('r4-fc5e25d62-delega-vivo.sse')).map((e) => e.dati as Record<string, unknown>)
        const pannello = ev.reduce((p, e) => applicaEventoPannelloR4(p, e), creaPannelloR4())
        const caricaSessioni = vi.fn(async () => (sessioni === undefined ? JSON.parse(fx('r4-fc5e25d62-delega-sessioni.json')).data.items : sessioni))
        const caricaFigli = vi.fn(async () => (figli === undefined ? JSON.parse(fx('r4-fc5e25d62-delega-figli.json')).data.figli : figli))
        const w = mount(TalosCodiceR4Pannello, { attachTo: document.body, props: {
            pannello, caricaPolitica: async () => null, caricaCache: async () => null, giriFiniti: 0, azioneProcesso: vi.fn(),
            caricaRisorse: vi.fn(async () => null), caricaSessioni, caricaFigli,
            sessioneId: sessioneId ?? JSON.parse(fx('agenti-4cee78f33.json')).ingressi.id,
        } as never })
        await flushPromises()
        await w.get('[data-scheda="agenti"]').trigger('click')
        return { w, caricaSessioni, caricaFigli }
    }

    it('FOG-17 L3-15: una delega fallita è terminata ma da controllare, una incerta solo da controllare (come il diagramma)', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const fx = (n: string) => JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', n), 'utf8'))
        const esiti: Record<string, string> = { 'cabd4999-286a-4b99-9b14-e617e1d1cf80': 'fallito', '7c917933-5e31-4efa-bfff-e2f7eaca0f13': 'incerto' }
        const cambia = (a: Record<string, unknown>) => (esiti[a.sessionId as string] ? { ...a, esitoDelega: esiti[a.sessionId as string] } : a)
        const { leggiFlussoSse } = await import('@/lib/harness/r4/eventiR4')
        // anche le istantanee dal vivo (`talos.agenti`), che il pannello mette sopra l'elenco letto
        const eventi = leggiFlussoSse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'r4-fc5e25d62-delega-vivo.sse'), 'utf8')).map((e) => {
            const d = e.dati as Record<string, any>
            return d.type === 'CUSTOM' && d.name === 'talos.agenti' ? { ...d, value: { ...d.value, agent: cambia(d.value.agent) } } : d
        })
        const { w } = await monta({
            eventi,
            sessioni: fx('r4-fc5e25d62-delega-sessioni.json').data.items.map(cambia),
            figli: fx('r4-fc5e25d62-delega-figli.json').data.figli.map(cambia),
        })
        const teste = w.findAll('[data-richiesta-id]')
        expect(teste[0].text()).toContain('1 agent · all finished')
        // prima di L3-15 qui c'era «all finished»: un `ultimoEsito` buono nascondeva la delega fallita, e l'incerta contava riuscita
        expect(teste[1].text()).toContain('2 agents · 1 of 2 finished · 2 to check')
        w.unmount()
    })

    it('FOG-14 due gruppi per richiesta: la più recente in cima e aperta, l\'altra ripiegata; il tocco apre la delega', async () => {
        const { w } = await monta()
        const ordine = w.findAll('[data-scheda]').map((b) => b.attributes('data-scheda'))
        expect(ordine).toEqual(['contesto', 'file', 'agenti', 'processi'])
        expect(w.get('[data-scheda="agenti"]').text()).toBe('Agents')
        const teste = w.findAll('[data-richiesta-id]')
        expect(teste).toHaveLength(2)
        expect(teste[0].text()).toContain('This request · Delega ancora un controllo')
        expect(teste[0].text()).toContain('1 agent · all finished')
        expect(teste[0].attributes('aria-expanded')).toBe('true')
        expect(teste[1].text()).toContain('Delega i compiti a due agenti')
        expect(teste[1].text()).toContain('2 agents · all finished')
        expect(teste[1].attributes('aria-expanded')).toBe('false')
        expect(w.findAll('[data-sessione-figlia]').map((r) => r.text())).toEqual([expect.stringContaining('Controlla la data di consegna in NOTA.md')])
        expect(w.get('[data-sessione-figlia]').text()).toContain('Done')
        await teste[1].trigger('click')
        expect(w.findAll('[data-sessione-figlia]')).toHaveLength(3)
        const riga = w.findAll('[data-sessione-figlia]')[1]
        expect(riga.attributes('aria-label')).toMatch(/^Open the conversation of: /u)
        await riga.trigger('click')
        expect(w.emitted('apriDelega')).toEqual([[riga.attributes('data-sessione-figlia')]])
        // con 3 agenti niente ricerca né filtro (scelta dell'owner: solo oltre 10)
        expect(w.find('[data-testid="talos-codice-r4-agenti-cerca"]').exists()).toBe(false)
        w.unmount()
    })

    it('FOG-15 oltre 10 agenti: ricerca e filtro per stato (gli stati rari solo se ci sono), conto «di … · tutti i livelli»', async () => {
        const radice = 's-radice'
        const sessioni = [{ sessionId: radice, conclusa: true }, ...Array.from({ length: 12 }, (_, i) => ({
            sessionId: `f${i}`, padreId: radice, taskCorto: `Compito ${i}`, conclusa: i !== 3, avviataAlle: new Date(1_792_000_000_000 + i).toISOString(),
        }))]
        const { w } = await monta({ eventi: [{ type: 'RunStarted', threadId: 'filo', input: { consegna: 'x' }, _sequenza: 1 }], sessioni, figli: [], sessioneId: radice })
        expect(w.findAll('[data-sessione-figlia]')).toHaveLength(12)
        expect(w.get('[data-testid="talos-codice-r4-agenti-numero"]').text()).toBe('1')
        expect(w.get('[data-testid="talos-codice-r4-agenti-conto"]').text()).toBe('12 of 12 agents · all levels')
        expect(w.find('.talos-codice-r4-stati [data-stato="interrotta"]').exists()).toBe(false)
        await w.get('.talos-codice-r4-stati [data-stato="in-corso"]').trigger('click')
        expect(w.findAll('[data-sessione-figlia]').map((r) => r.attributes('data-sessione-figlia'))).toEqual(['f3'])
        await w.get('.talos-codice-r4-stati [data-stato="tutti"]').trigger('click')
        await w.get('[data-testid="talos-codice-r4-agenti-cerca"]').setValue('Compito 1')
        expect(w.findAll('[data-sessione-figlia]').map((r) => r.attributes('data-sessione-figlia')).sort()).toEqual(['f1', 'f10', 'f11'])
        await w.get('[data-testid="talos-codice-r4-agenti-cerca"]').setValue('niente così')
        expect(w.text()).toContain('No agent')
        w.unmount()
    })

    it('FOG-16 senza deleghe lo dice; una lettura non riuscita lascia gli agenti di prima e lo dice', async () => {
        const vuota = await monta({ eventi: [{ type: 'RunStarted', threadId: 'filo', input: { consegna: 'x' } }], sessioni: [{ sessionId: 'r' }], figli: [], sessioneId: 'r' })
        expect(vuota.w.get('[data-testid="talos-codice-r4-agenti-vuoto"]').text()).toContain('Sub-agents')
        expect(vuota.w.find('[data-testid="talos-codice-r4-agenti-numero"]').exists()).toBe(false)
        vuota.w.unmount()
        const rotta = await monta({ sessioni: null, figli: null })
        expect(rotta.w.get('[data-testid="talos-codice-r4-agenti-conto"]').text()).toBe('Data not updated: try again.')
        // senza l'elenco restano le istantanee dal vivo: le tre figlie ci sono comunque
        expect(rotta.w.findAll('[data-richiesta-id]')).toHaveLength(2)
        rotta.w.unmount()
    })

    /*
     * ⛔ Pin r4 701c6c0d2, L3-17 del desktop («un nome solo ovunque», `disegnaAgenti` @ 701): la riga si chiama col NOME dell'agente
     * (`nomeDellAgente`), la ricerca guarda anche il nome, la descrizione è il compito anche quando il server toglie `task` uguale a
     * `taskCorto`, e un nome fatto solo di caratteri invisibili ripiega sul compito (`a680d311c`).
     */
    it('FOG-18 L3-17: il nome del server sulla riga e nell\'etichetta; ricerca sul nome; descrizione dal compito; nome invisibile → compito', async () => {
        const radice = 's-radice'
        const sessioni = [{ sessionId: radice, conclusa: true },
            { sessionId: 'f1', padreId: radice, nome: 'Lettore dei test-2', taskCorto: 'Leggi i test della cartella', conclusa: true, avviataAlle: '2026-10-16T10:00:00.000Z' },
            { sessionId: 'f2', padreId: radice, nome: '\u200B\u200C', taskCorto: 'Conta le righe di NOTA.md', conclusa: true, avviataAlle: '2026-10-16T10:00:01.000Z' }]
        const { w } = await monta({ eventi: [{ type: 'RunStarted', threadId: 'filo', input: { consegna: 'x' }, _sequenza: 1 }], sessioni, figli: [], sessioneId: radice })
        const riga = (id: string) => w.get(`[data-sessione-figlia="${id}"]`)
        expect(riga('f1').get('b').text()).toBe('Lettore dei test-2')
        expect(riga('f1').attributes('aria-label')).toBe('Open the conversation of: Lettore dei test-2')
        expect(riga('f1').get('.talos-codice-r4-agente-compito').text()).toBe('Leggi i test della cartella')
        expect(riga('f2').get('b').text()).toBe('Conta le righe di NOTA.md')
        w.unmount()
        // la ricerca (oltre 10 agenti) guarda anche il nome
        const molti = [{ sessionId: radice, conclusa: true }, ...Array.from({ length: 11 }, (_, i) => ({
            sessionId: `g${i}`, padreId: radice, nome: i === 4 ? 'Revisore-3' : `Agente ${i}`, taskCorto: `Compito ${i}`, conclusa: true,
            avviataAlle: new Date(1_792_000_000_000 + i).toISOString(),
        }))]
        const cerca = await monta({ eventi: [{ type: 'RunStarted', threadId: 'filo', input: { consegna: 'x' }, _sequenza: 1 }], sessioni: molti, figli: [], sessioneId: radice })
        await cerca.w.get('[data-testid="talos-codice-r4-agenti-cerca"]').setValue('revisore')
        expect(cerca.w.findAll('[data-sessione-figlia]').map((r) => r.attributes('data-sessione-figlia'))).toEqual(['g4'])
        cerca.w.unmount()
    })
})

describe('il nome delle deleghe nel foglio dell\'albero (pin r4 701c6c0d2, L3-17)', () => {
    it('FOG-19 la delega si chiama col nome dell\'agente (`rigaFiglio` @ 701), il compito se il nome è invisibile, l\'id solo senza niente', async () => {
        const carica = vi.fn(async () => [
            { sessionId: 'f1', nome: 'Lettore dei test-2', task: 'Leggi i test', conclusa: true },
            { sessionId: 'f2', nome: '\u2060', taskCorto: 'Scrivi il README', conclusa: false },
            { sessionId: 'f3', conclusa: false },
        ])
        const w = mount(TalosCodiceR4AlberoSheet, { attachTo: document.body, props: { titolo: 'S', carica } })
        await flushPromises()
        const nome = (id: string) => document.body.querySelector(`[data-sessione="${id}"] strong`)?.textContent
        expect([nome('f1'), nome('f2'), nome('f3')]).toEqual(['Lettore dei test-2', 'Scrivi il README', 'f3'])
        w.unmount()
    })
})

/*
 * ⛔ K3-FILE (owner 15/10 sera «Albero completo»): la scheda File del pannello ▤ guadagna l'albero della cartella, sopra i file toccati
 * che c'erano già. Risposte VERE di r4 @ 2161afb32 registrate sul Pad. Come il desktop: cartelle prima, freccia solo sulle cartelle,
 * il tocco su un file ne apre l'anteprima; la ricerca per nome con gli avvisi del desktop; un livello che non si carica lo dice.
 */
describe('la scheda File con l\'albero (K3-FILE)', () => {
    async function monta(opzioni: { rotte?: Record<string, string>; giu?: boolean } = {}) {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const { creaPannelloR4 } = await import('@/lib/harness/r4/pannelloR4')
        const { vociAlberoR4, riassuntoRicercaR4 } = await import('@/lib/harness/r4/alberoR4')
        const { default: TalosCodiceR4Pannello } = await import('@/components/codice/TalosCodiceR4Pannello.vue')
        const passi = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'albero-701c6c0d2.json'), 'utf8')).passi as { nome: string; risposta: unknown }[]
        const vero = (nome: string) => passi.find((q) => q.nome === nome)!.risposta
        const livelli: Record<string, string> = { '': 'radice', 'prova-albero': 'cartella-di-prova', 'prova-albero/sotto': 'sotto', ...(opzioni.rotte ?? {}) }
        const caricaAlbero = vi.fn(async (percorso: string) => (opzioni.giu || !livelli[percorso] ? { ok: false as const, motivo: 'Operation failed.' } : { ok: true as const, voci: vociAlberoR4(vero(livelli[percorso])) }))
        const cercaFile = vi.fn(async (q: string) => ({ ok: true as const, ...riassuntoRicercaR4(vero(q === 'nota' ? 'cerca' : 'cerca-niente'), q, 'en') }))
        const apriFile = vi.fn(async (percorso: string) => (percorso === 'NOTA.md'
            ? { ok: true as const, contenuto: (vero('anteprima-esistente') as { data: { contenuto: string } }).data.contenuto, dimensione: 128 }
            : { ok: false as const, motivo: 'File not found' }))
        // la radice registrata, più una cartella «prova-albero» per scendere
        livelli[''] = 'radice'
        const radiceVera = vero('radice') as { data: { voci: { nome: string; cartella: boolean }[] } }
        radiceVera.data.voci = [{ nome: 'prova-albero', cartella: true }, ...radiceVera.data.voci.filter((v) => v.nome !== 'prova-albero')]
        const w = mount(TalosCodiceR4Pannello, { attachTo: document.body, props: {
            pannello: creaPannelloR4(), caricaPolitica: async () => null, caricaCache: async () => null, giriFiniti: 0, azioneProcesso: vi.fn(),
            caricaRisorse: vi.fn(async () => null), caricaSessioni: vi.fn(async () => []), caricaFigli: vi.fn(async () => []), sessioneId: 's1',
            caricaAlbero, cercaFile, apriFile,
        } as never })
        await flushPromises()
        await w.get('[data-scheda="file"]').trigger('click')
        await flushPromises()
        return { w, caricaAlbero, cercaFile, apriFile, radice: radiceVera.data.voci }
    }

    it('FOG-18 l\'albero: cartelle prima, la cartella si apre col suo livello, il file apre l\'anteprima e «indietro» torna', async () => {
        const { w, caricaAlbero, radice } = await monta()
        expect(caricaAlbero).toHaveBeenCalledWith('')
        const albero = w.get('[data-testid="talos-codice-r4-albero"]')
        expect(albero.attributes('role')).toBe('tree')
        const righe = () => w.findAll('[data-testid="talos-codice-r4-albero"] [data-percorso]')
        expect(righe().map((r) => r.attributes('data-percorso'))).toEqual(radice.map((v) => v.nome))
        const cartella = righe()[0]
        expect(cartella.attributes('aria-expanded')).toBe('false')
        await cartella.trigger('click')
        await flushPromises()
        expect(caricaAlbero).toHaveBeenCalledWith('prova-albero')
        expect(w.get('[data-percorso="prova-albero"]').attributes('aria-expanded')).toBe('true')
        expect(w.get('[data-percorso="prova-albero/sotto"]').attributes('aria-level')).toBe('2')
        expect(w.get('[data-percorso="prova-albero/nota prova.md"]').attributes('aria-expanded')).toBeUndefined()
        await w.get('[data-percorso="NOTA.md"]').trigger('click')
        await flushPromises()
        const anteprima = w.get('[data-testid="talos-codice-r4-anteprima"]')
        expect(anteprima.text()).toContain('NOTA.md')
        expect(anteprima.get('pre').text().length).toBeGreaterThan(0)
        expect(w.find('[data-testid="talos-codice-r4-albero"]').exists()).toBe(false)
        await anteprima.get('[data-testid="talos-codice-r4-anteprima-indietro"]').trigger('click')
        await flushPromises()
        expect(w.get('[data-percorso="prova-albero"]').attributes('aria-expanded')).toBe('true')
        w.unmount()
    })

    it('FOG-19 la ricerca per nome: risultati con il percorso, «nessun file», e un livello che non si carica lo dice', async () => {
        const { w, cercaFile } = await monta()
        const campo = w.get('[data-testid="talos-codice-r4-file-cerca"]')
        await campo.setValue('nota')
        await new Promise((ok) => setTimeout(ok, 350))
        await flushPromises()
        expect(cercaFile).toHaveBeenCalledWith('nota')
        const trovati = w.findAll('[data-testid="talos-codice-r4-file-risultati"] [data-percorso]').map((r) => r.attributes('data-percorso'))
        expect(trovati).toContain('NOTA.md')
        // accanto al nome la cartella che lo contiene, e niente per la radice (il percorso intero ripeteva il nome: foto del Pad)
        const dove = (p: string) => w.get(`[data-testid="talos-codice-r4-file-risultati"] [data-percorso="${p}"] .talos-codice-r4-file-percorso`).text()
        expect(w.find('[data-testid="talos-codice-r4-file-risultati"] [data-percorso="NOTA.md"] .talos-codice-r4-file-percorso').exists()).toBe(false)
        expect(dove('prova-albero/sotto/nota.md')).toBe('prova-albero/sotto')
        await campo.setValue('zzz')
        await new Promise((ok) => setTimeout(ok, 350))
        await flushPromises()
        expect(w.get('[data-testid="talos-codice-r4-file-risultati"]').text()).toContain('No file with “zzz” in this folder.')
        w.unmount()
        const giu = (await monta({ giu: true })).w
        expect(giu.get('[data-testid="talos-codice-r4-albero-errore"]').text()).toContain('Files did not load.')
        giu.unmount()
    })
})

/*
 * ⛔ K3-FILE, seconda parte: le azioni sull'albero, come il menu del desktop r4 (`apriMenuAzioniFile`, `legacy/app.js:19725`) — file:
 * Apri, Rinomina, Copia, Elimina; cartella: Nuovo file, Nuova cartella, Rinomina, Copia, Elimina; radice: Nuovo file, Nuova cartella —
 * più «Sposta in…» (sul desktop si trascina). Il nome si controlla PRIMA di mandarlo (r4 risponderebbe «Invalid query»); elimina chiede
 * conferma e dice se porta via una cartella intera; copia no (r4 sceglie «nome (copia)», mai sovrascrive). Esiti nei toast dell'app.
 */
describe('le azioni sui file (K3-FILE)', () => {
    async function monta(azioneFile = vi.fn(async (azione: string, _corpo: Record<string, unknown>) => ({ ok: true as const, percorso: azione === 'elimina' ? null : 'x' }))) {
        const { creaPannelloR4 } = await import('@/lib/harness/r4/pannelloR4')
        const { default: TalosCodiceR4Pannello } = await import('@/components/codice/TalosCodiceR4Pannello.vue')
        const { useTalosMobileToasts } = await import('@/stores/toasts')
        const toasts = useTalosMobileToasts()
        for (const t of [...toasts.items.value]) toasts.dismiss(t.id)
        const livelli: Record<string, { nome: string; cartella: boolean }[]> = {
            '': [{ nome: 'src', cartella: true }, { nome: 'docs', cartella: true }, { nome: 'NOTA.md', cartella: false }],
            src: [{ nome: 'lib', cartella: true }, { nome: 'app.mjs', cartella: false }],
            'src/lib': [],
            docs: [],
        }
        const caricaAlbero = vi.fn(async (percorso: string) => (livelli[percorso] ? { ok: true as const, voci: livelli[percorso] } : { ok: false as const, motivo: 'Operation failed.' }))
        const w = mount(TalosCodiceR4Pannello, { attachTo: document.body, props: {
            pannello: creaPannelloR4(), caricaPolitica: async () => null, caricaCache: async () => null, giriFiniti: 0, azioneProcesso: vi.fn(),
            caricaRisorse: vi.fn(async () => null), caricaSessioni: vi.fn(async () => []), caricaFigli: vi.fn(async () => []), sessioneId: 's1',
            caricaAlbero, cercaFile: vi.fn(async () => ({ ok: true as const, risultati: [], avvisi: [] })),
            apriFile: vi.fn(async () => ({ ok: true as const, contenuto: 'x', dimensione: 1 })), azioneFile,
        } as never })
        await flushPromises()
        await w.get('[data-scheda="file"]').trigger('click')
        await flushPromises()
        const menu = async (percorso: string) => {
            await w.get(`[data-testid="talos-codice-r4-file-azioni-${percorso}"]`).trigger('click')
            await flushPromises()
            return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((e) => e.textContent!.trim())
        }
        const scegli = async (id: string) => {
            document.body.querySelector<HTMLElement>(`[data-testid="talos-codice-r4-file-azione-${id}"]`)!.click()
            await flushPromises()
        }
        const dialogo = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
        const bottone = (testo: string) => [...(dialogo()?.querySelectorAll('button') ?? [])].find((b) => b.textContent!.trim() === testo) as HTMLButtonElement | undefined
        return { w, azioneFile, caricaAlbero, menu, scegli, dialogo, bottone, toasts }
    }

    it('FOG-20 i menu di file, cartella e radice, con le parole del desktop', async () => {
        const m = await monta()
        // K3-C Allegati A1: «Attach to chat» dopo «Open», nell'ordine del desktop (`apriMenuAzioniFile`, `legacy/app.js:19754`)
        expect(await m.menu('NOTA.md')).toEqual(['Open', 'Attach to chat', 'Rename', 'Copy', 'Move to…', 'Delete'])
        document.body.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()
        expect(await m.menu('src')).toEqual(['New file', 'New folder', 'Rename', 'Copy', 'Move to…', 'Delete'])
        document.body.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()
        expect(await m.menu('')).toEqual(['New file', 'New folder'])
        m.w.unmount()
    })

    /*
     * ⛔ K3-C Allegati A1 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`): «Allega alla chat» dal menu di un file e dalla selezione, come il
     * desktop (`allegaFileAllaChat` :20218; la casella `ft-check` e la barra della selezione :18270-18330, «Copia i percorsi», «Deseleziona tutto»).
     */
    it('FOG-25 «Attach to chat» dal menu di un file manda il suo percorso alla schermata', async () => {
        const m = await monta()
        await m.menu('NOTA.md')
        await m.scegli('allega')
        expect(m.w.emitted('allega')).toEqual([[['NOTA.md']]])
        m.w.unmount()
    })

    it('FOG-26 la selezione: casella solo sui file, barra col conteggio, allega tutti e deseleziona; copia i percorsi; deseleziona tutto', async () => {
        const m = await monta()
        await m.w.get('[data-percorso="src"]').trigger('click')
        await flushPromises()
        expect(m.w.find('[data-testid="talos-codice-r4-file-scegli-src"]').exists()).toBe(false) // una cartella non si sceglie
        const casella = m.w.get('[data-testid="talos-codice-r4-file-scegli-NOTA.md"]')
        expect([casella.attributes('role'), casella.attributes('aria-checked'), casella.attributes('aria-label')]).toEqual(['checkbox', 'false', 'Select NOTA.md'])
        expect(m.w.find('[data-testid="talos-codice-r4-file-selezione"]').exists()).toBe(false)
        await casella.trigger('click')
        await flushPromises()
        expect(m.w.get('[data-testid="talos-codice-r4-file-selezione"]').text()).toContain('1 selected')
        // il conteggio al singolare (in inglese «1 file», non «1 files»)
        await m.w.get('[data-testid="talos-codice-r4-file-selezione-azioni"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-file-azione-copia-percorsi"]')!.click()
        await flushPromises()
        expect(m.toasts.items.value.map((t) => t.message)).toContain('Paths copied · 1 file')
        await m.w.get('[data-testid="talos-codice-r4-file-scegli-src/app.mjs"]').trigger('click')
        await flushPromises()
        expect(casella.attributes('aria-checked')).toBe('true')
        expect(m.w.get('[data-testid="talos-codice-r4-file-selezione"]').text()).toContain('2 selected')
        // copia i percorsi, uno per riga
        await m.w.get('[data-testid="talos-codice-r4-file-selezione-azioni"]').trigger('click')
        await flushPromises()
        expect([...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((e) => e.textContent!.trim())).toEqual(['Copy the paths', 'Deselect all'])
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-file-azione-copia-percorsi"]')!.click()
        await flushPromises()
        expect(appunti.testi).toEqual(['NOTA.md', 'NOTA.md\nsrc/app.mjs'])
        expect(m.toasts.items.value.map((t) => t.message)).toContain('Paths copied · 2 files')
        // allega tutti: un percorso per file, poi la selezione si svuota
        await m.w.get('[data-testid="talos-codice-r4-file-selezione-allega"]').trigger('click')
        await flushPromises()
        expect(m.w.emitted('allega')).toEqual([[['NOTA.md', 'src/app.mjs']]])
        expect(m.w.find('[data-testid="talos-codice-r4-file-selezione"]').exists()).toBe(false)
        // deseleziona tutto
        await casella.trigger('click')
        await flushPromises()
        await m.w.get('[data-testid="talos-codice-r4-file-selezione-azioni"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-file-azione-deseleziona"]')!.click()
        await flushPromises()
        expect(m.w.find('[data-testid="talos-codice-r4-file-selezione"]').exists()).toBe(false)
        expect(m.w.emitted('allega')).toHaveLength(1)
        m.w.unmount()
    })

    it('FOG-21 rinomina: il nome che è un percorso si ferma prima, quello buono va a r4 e il livello si rilegge', async () => {
        const m = await monta()
        await m.menu('NOTA.md')
        await m.scegli('rinomina')
        const campo = m.dialogo()!.querySelector<HTMLInputElement>('input')!
        expect(campo.value).toBe('NOTA.md')
        campo.value = 'a/b.md'
        campo.dispatchEvent(new Event('input'))
        await flushPromises()
        m.bottone('Save')!.click()
        await flushPromises()
        expect(m.azioneFile).not.toHaveBeenCalled()
        // misurato sul Pad: qui compariva l'aiuto della CREAZIONE («The file will be empty.»), sbagliato per una rinomina
        expect(m.dialogo()!.querySelector('[role=alert]')!.textContent).toBe('Up to 255 characters. Enter a name, without a path.')
        campo.value = 'LEGGIMI.md'
        campo.dispatchEvent(new Event('input'))
        await flushPromises()
        const letture = m.caricaAlbero.mock.calls.length
        m.bottone('Save')!.click()
        await flushPromises()
        expect(m.azioneFile).toHaveBeenCalledWith('rinomina', { percorso: 'NOTA.md', nuovoNome: 'LEGGIMI.md' })
        expect(m.dialogo()).toBeNull()
        expect(m.caricaAlbero.mock.calls.length).toBeGreaterThan(letture)
        expect(m.toasts.items.value.map((t) => t.message)).toContain('File renamed')
        // un esito riuscito se ne va da solo (5 s come il desktop, `toast.js` TONI.riuscito): sul Pad sette toast restavano in pila
        expect(m.toasts.items.value.find((t) => t.message === 'File renamed')!.durationMs).toBe(5000)
        m.w.unmount()
    })

    it('FOG-22 elimina chiede conferma e dice che una cartella porta via tutto; annulla non tocca niente; un rifiuto lo dice', async () => {
        const rifiuta = vi.fn(async () => ({ ok: false as const, motivo: 'Deletion failed' }))
        const m = await monta(rifiuta)
        await m.menu('src')
        await m.scegli('elimina')
        expect(m.dialogo()!.textContent).toContain('Delete folder')
        expect(m.dialogo()!.textContent).toContain('The folder and everything in it will be deleted from disk.')
        m.bottone('Cancel')!.click()
        await flushPromises()
        expect(rifiuta).not.toHaveBeenCalled()
        await m.menu('src')
        await m.scegli('elimina')
        m.bottone('Delete')!.click()
        await flushPromises()
        expect(rifiuta).toHaveBeenCalledWith('elimina', { percorso: 'src' })
        expect(m.toasts.items.value.map((t) => t.message)).toContain('Deletion failed')
        expect(m.toasts.items.value.find((t) => t.message === 'Deletion failed')!.durationMs).toBe(6000)
        m.w.unmount()
    })

    it('FOG-23 crea un file dentro una cartella (che si apre) e duplica senza conferma', async () => {
        const m = await monta()
        await m.menu('docs')
        await m.scegli('nuovo-file')
        expect(m.dialogo()!.textContent).toContain('New file')
        expect(m.dialogo()!.textContent).toContain('The file will be empty.')
        const campo = m.dialogo()!.querySelector<HTMLInputElement>('input')!
        campo.value = 'piano.md'
        campo.dispatchEvent(new Event('input'))
        await flushPromises()
        m.bottone('Create')!.click()
        await flushPromises()
        expect(m.azioneFile).toHaveBeenCalledWith('crea', { percorsoBase: 'docs', nome: 'piano.md', tipo: 'file' })
        expect(m.w.get('[data-percorso="docs"]').attributes('aria-expanded')).toBe('true')
        // ⛔ dal Pad: la cartella risultava aperta ma il suo livello non si leggeva mai («Carico…» per sempre, il file nuovo invisibile)
        expect(m.caricaAlbero).toHaveBeenCalledWith('docs')
        expect(m.w.text()).not.toContain('Loading…')
        expect(m.toasts.items.value.map((t) => t.message)).toContain('File created')
        await m.menu('NOTA.md')
        await m.scegli('duplica')
        expect(m.azioneFile).toHaveBeenLastCalledWith('duplica', { percorso: 'NOTA.md' })
        expect(m.dialogo()).toBeNull()
        m.w.unmount()
    })

    it('FOG-24 «Sposta in…»: si sceglie la cartella (mai se stessa, i suoi discendenti o dove sta già), poi «Sposta qui»', async () => {
        const m = await monta()
        await m.menu('src')
        await m.scegli('sposta')
        const scelta = m.w.get('[data-testid="talos-codice-r4-sposta"]')
        expect(scelta.text()).toContain('Choose the folder')
        // nella radice (dove «src» sta già): solo «docs», e niente «Sposta qui»
        expect(scelta.findAll('[data-cartella]').map((e) => e.attributes('data-cartella'))).toEqual(['docs'])
        expect(scelta.find('[data-testid="talos-codice-r4-sposta-qui"]').attributes('disabled')).toBeDefined()
        // la radice è un nome a parole, non un percorso: niente carattere a spaziatura fissa (sul Pad lo era)
        expect(scelta.get('[data-testid="talos-codice-r4-sposta-dove"]').text()).toBe('Session folder')
        expect(scelta.get('[data-testid="talos-codice-r4-sposta-dove"]').classes()).not.toContain('font-mono')
        await scelta.get('[data-cartella="docs"]').trigger('click')
        await flushPromises()
        expect(m.w.get('[data-testid="talos-codice-r4-sposta-dove"]').text()).toBe('docs')
        expect(m.w.get('[data-testid="talos-codice-r4-sposta-dove"]').classes()).toContain('font-mono')
        await m.w.get('[data-testid="talos-codice-r4-sposta-qui"]').trigger('click')
        await flushPromises()
        expect(m.azioneFile).toHaveBeenCalledWith('sposta', { percorso: 'src', cartellaDestinazione: 'docs' })
        expect(m.toasts.items.value.map((t) => t.message)).toContain('Moved')
        expect(m.w.find('[data-testid="talos-codice-r4-sposta"]').exists()).toBe(false)
        m.w.unmount()
    })
})
