// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const azioni = vi.hoisted(() => ({
    riavvia: vi.fn(async () => null as string | null),
    prossimo: vi.fn(async () => undefined),
    permesso: vi.fn(async () => undefined),
    visto: vi.fn(async () => undefined),
    controlla: vi.fn(async () => null),
}))
vi.mock('@/services/appUpdates', async (originale) => ({
    ...(await originale<typeof import('@/services/appUpdates')>()),
    talosRiavviaOra: azioni.riavvia,
    talosAlProssimoAvvio: azioni.prossimo,
    talosApriPermessoAggiornamenti: azioni.permesso,
    talosAggiornamentoVisto: azioni.visto,
    talosControllaOra: azioni.controlla,
}))

import TalosMobileUpdateSheet from '@/components/updates/TalosMobileUpdateSheet.vue'
import { talosApplicaStatoAggiornamenti, talosAzzeraAggiornamentiPerTest } from '@/services/appUpdates'
import { talosSegnaleAggiornamento } from '@/lib/updates/segnaleAggiornamento'

/*
 * Il cassetto dell'aggiornamento (mockup approvato il 22/10/2026, tavole 1-5 e 7). Le azioni stanno una SOTTO l'altra (regola
 * dell'owner), «Riavvia ora» con lavoro in corso chiede conferma come il desktop, la prima volta passa dal permesso di Android.
 */
function monta(chatAlLavoro = false) {
    return mount(TalosMobileUpdateSheet, { props: { chatAlLavoro }, global: { stubs: { teleport: true } } })
}

const pronta = {
    fase: 'PRONTA' as const, installata: '0.1.43', versione: '0.1.44', permessoConcesso: true,
    note: { en: ['Faster local engine.'], it: ['Motore locale più veloce.'] },
    pagina: 'https://github.com/Ninozzz95/talos/releases/tag/v0.1.44',
}

afterEach(() => {
    talosAzzeraAggiornamentiPerTest()
    talosSegnaleAggiornamento.codiceAlLavoro = false
    for (const f of Object.values(azioni)) f.mockClear()
})

describe('TalosMobileUpdateSheet', () => {
    it('UPD-SHEET-01 pronta: versione, novità nella lingua dell\'app, Riavvia ora sopra Al prossimo avvio', () => {
        talosApplicaStatoAggiornamenti(pronta)
        const w = monta()
        expect(w.get('[data-testid="talos-update-version"]').text()).toBe('TALOS 0.1.44')
        expect(w.findAll('[data-testid="talos-update-note"]').map((n) => n.text())).toEqual(['Faster local engine.'])
        expect(w.get('[data-testid="talos-update-all-notes"]').attributes('href')).toBe(pronta.pagina)
        const riavvia = w.get('[data-testid="talos-update-restart"]')
        const prossimo = w.get('[data-testid="talos-update-next-launch"]')
        // mai affiancate: lo stesso contenitore in colonna
        expect(riavvia.element.parentElement).toBe(prossimo.element.parentElement)
        expect(riavvia.element.parentElement?.className).toContain('flex-col')
    })

    it('UPD-SHEET-02 Riavvia ora senza lavori installa subito', async () => {
        talosApplicaStatoAggiornamenti(pronta)
        const w = monta()
        await w.get('[data-testid="talos-update-restart"]').trigger('click')
        await flushPromises()
        expect(azioni.riavvia).toHaveBeenCalledTimes(1)
    })

    it('UPD-SHEET-03 con la chat che scrive e il Codice al lavoro chiede conferma, poi «Riavvia lo stesso»', async () => {
        talosApplicaStatoAggiornamenti(pronta)
        talosSegnaleAggiornamento.codiceAlLavoro = true
        const w = monta(true)
        await w.get('[data-testid="talos-update-restart"]').trigger('click')
        expect(azioni.riavvia).not.toHaveBeenCalled()
        expect(w.get('[data-testid="talos-update-busy"]').text()).toBe('2 tasks are working: restarting will interrupt them.')
        expect(w.get('[data-testid="talos-update-restart"]').text()).toBe('Restart anyway')
        await w.get('[data-testid="talos-update-restart"]').trigger('click')
        await flushPromises()
        expect(azioni.riavvia).toHaveBeenCalledTimes(1)
    })

    it('UPD-SHEET-04 senza permesso: passo del permesso, e tornati con il permesso riparte da solo', async () => {
        talosApplicaStatoAggiornamenti({ ...pronta, permessoConcesso: false })
        const w = monta()
        await w.get('[data-testid="talos-update-restart"]').trigger('click')
        expect(azioni.riavvia).not.toHaveBeenCalled()
        expect(w.find('[data-update-view="permesso"]').exists()).toBe(true)
        await w.get('[data-testid="talos-update-open-permission"]').trigger('click')
        expect(azioni.permesso).toHaveBeenCalledTimes(1)
        talosApplicaStatoAggiornamenti({ permessoConcesso: true })
        await nextTick()
        await flushPromises()
        expect(azioni.riavvia).toHaveBeenCalledTimes(1)
    })

    it('UPD-SHEET-05 Al prossimo avvio lo segna e chiude', async () => {
        talosApplicaStatoAggiornamenti(pronta)
        const w = monta()
        await w.get('[data-testid="talos-update-next-launch"]').trigger('click')
        await flushPromises()
        expect(azioni.prossimo).toHaveBeenCalledTimes(1)
        expect(w.emitted('close')).toHaveLength(1)
    })

    it('UPD-SHEET-06 scartata per la firma: lo dice, la versione installata resta, Riprova e Chiudi in colonna', () => {
        talosApplicaStatoAggiornamenti({ ...pronta, fase: 'FALLITA', motivo: 'firma' })
        const w = monta()
        expect(w.text()).toContain('The file is not signed by TALOS')
        expect(w.get('[data-testid="talos-update-failed-body"]').text()).toContain('0.1.43 stays on the device, untouched.')
        expect(w.get('[data-testid="talos-update-retry"]').element.parentElement?.className).toContain('flex-col')
    })

    // ⛔ D-UPD-1: uno scaricamento abbandonato per sempre (release tolta, rinvio da non seguire) diventava un giro infinito senza
    // parole; ora è FALLITA col motivo `scaricamento:…`, e il cassetto non dice «installare» per un file mai arrivato
    it('UPD-SHEET-09 scaricamento fallito: lo dice come scaricamento, e la versione installata resta', () => {
        talosApplicaStatoAggiornamenti({ ...pronta, fase: 'FALLITA', motivo: 'scaricamento:gone' })
        const w = monta()
        expect(w.text()).toContain('The update could not be downloaded')
        expect(w.text()).not.toContain('could not be installed')
        // owner 26/10 (b): «scartato» solo per un file arrivato e rifiutato; uno mai arrivato «non arrivato»
        expect(w.text()).toContain('Update didn’t arrive')
        expect(w.text()).not.toContain('Update discarded')
        expect(w.get('[data-testid="talos-update-failed-body"]').text())
            .toBe('GitHub didn’t hand over the file. TALOS tries again at the next check. 0.1.43 stays on the device, untouched.')
    })

    /*
     * D-0147-UPD-a (Pad, 26/10/2026, candidata vc301 contro GitHub vero): ogni `apk-*` diventava «non è firmato da TALOS … non
     * corrisponde alla firma pubblicata», anche quando il file è un'altra app o una versione non più nuova. Come Obtainium
     * (`assets/translations/en.json` @ fcd1807c8f: `appIdMismatch`, `cantInstallOlderVersion`), ogni caso ha la sua frase.
     */
    it('UPD-SHEET-11 un\'altra app (apk-pacchetto_diverso): lo dice come tale, non come firma', () => {
        talosApplicaStatoAggiornamenti({ ...pronta, fase: 'FALLITA', motivo: 'apk-pacchetto_diverso' })
        const w = monta()
        expect(w.text()).toContain('The file is a different app')
        expect(w.text()).not.toContain('not signed by TALOS')
        expect(w.get('[data-testid="talos-update-failed-body"]').text())
            .toBe('The file downloaded for 0.1.44 is not TALOS. It was not installed and has been deleted. 0.1.43 stays on the device, untouched.')
    })

    it('UPD-SHEET-12 una versione non più nuova (apk-non_piu_nuova): niente da installare, niente «Riprova»', () => {
        talosApplicaStatoAggiornamenti({ ...pronta, fase: 'FALLITA', motivo: 'apk-non_piu_nuova' })
        const w = monta()
        expect(w.text()).toContain('Nothing newer to install')
        expect(w.text()).not.toContain('not signed by TALOS')
        expect(w.get('[data-testid="talos-update-failed-body"]').text())
            .toBe('0.1.44 is not newer than 0.1.43 on this device, so there is nothing to install. The downloaded file has been deleted.')
        expect(w.find('[data-testid="talos-update-retry"]').exists()).toBe(false)
        expect(w.find('[data-testid="talos-update-close"]').exists()).toBe(true)
    })

    it('UPD-SHEET-13 ⛔ verso contrario: certificato diverso, file illeggibile, impronta e manifesto restano «non firmato da TALOS»', () => {
        for (const motivo of ['apk-firma_diversa', 'apk-illeggibile', 'impronta', 'firma', 'manifesto-dimensione', 'versione-del-tag']) {
            talosApplicaStatoAggiornamenti({ ...pronta, fase: 'FALLITA', motivo })
            const w = monta()
            expect(w.text(), motivo).toContain('The file is not signed by TALOS')
            w.unmount()
        }
    })

    // «riprova al prossimo controllo» è vero solo con gli aggiornamenti automatici: spenti, il controllo giornaliero non c'è
    // (`programmaControllo`), quindi la frase dice cosa fare (revisione del Desktop, 26/10)
    it('UPD-SHEET-10 scaricamento fallito con gli aggiornamenti automatici spenti: dice di riprovare, non promette un controllo', () => {
        talosApplicaStatoAggiornamenti({ ...pronta, fase: 'FALLITA', motivo: 'scaricamento:gone', automatici: false })
        const w = monta()
        expect(w.get('[data-testid="talos-update-failed-body"]').text())
            .toBe('GitHub didn’t hand over the file. Try again later. 0.1.43 stays on the device, untouched.')
    })

    it('UPD-SHEET-07 aggiornata: lo dice una volta, e chiudendo lo segna visto', async () => {
        talosApplicaStatoAggiornamenti({ ...pronta, fase: 'AGGIORNATA', appenaAggiornata: '0.1.44', installata: '0.1.44' })
        const w = monta()
        expect(w.text()).toContain('Updated to 0.1.44')
        await w.get('[data-testid="talos-update-close"]').trigger('click')
        expect(azioni.visto).toHaveBeenCalledTimes(1)
    })

    it('UPD-SHEET-08 in italiano: parole e novità italiane', async () => {
        const { createTalosI18n } = await import('@/i18n')
        const { TALOS_IT_MESSAGES } = await import('@/i18n/locales/it')
        const globale = (await createTalosI18n()).global as unknown as { mergeLocaleMessage(l: string, m: object): void, locale: { value: string } }
        globale.mergeLocaleMessage('it', TALOS_IT_MESSAGES)
        const prima = globale.locale.value
        globale.locale.value = 'it'
        try {
            talosApplicaStatoAggiornamenti(pronta)
            const w = monta()
            expect(w.findAll('[data-testid="talos-update-note"]').map((n) => n.text())).toEqual(['Motore locale più veloce.'])
            expect(w.get('[data-testid="talos-update-restart"]').text()).toBe('Riavvia ora')
            expect(w.get('[data-testid="talos-update-next-launch"]').text()).toBe('Al prossimo avvio')
        } finally {
            globale.locale.value = prima
        }
    })

    // revisione del Desktop su D-0147-UPD-a: la frase italiana tiene la voce impersonale dell'inglese, non la prima persona
    it('UPD-SHEET-14 in italiano: un\'altra app lo dice con la stessa voce dell\'inglese', async () => {
        const { createTalosI18n } = await import('@/i18n')
        const { TALOS_IT_MESSAGES } = await import('@/i18n/locales/it')
        const globale = (await createTalosI18n()).global as unknown as { mergeLocaleMessage(l: string, m: object): void, locale: { value: string } }
        globale.mergeLocaleMessage('it', TALOS_IT_MESSAGES)
        const prima = globale.locale.value
        globale.locale.value = 'it'
        try {
            talosApplicaStatoAggiornamenti({ ...pronta, fase: 'FALLITA', motivo: 'apk-pacchetto_diverso' })
            const w = monta()
            expect(w.text()).toContain('Il file è un’altra app')
            expect(w.get('[data-testid="talos-update-failed-body"]').text())
                .toBe('Il file scaricato per la 0.1.44 non è TALOS: non è stato installato ed è stato cancellato. Sul dispositivo resta la 0.1.43, intatta.')
            // a differenza di «niente di più nuovo», qui «Riprova» resta: un file sbagliato da una copia in cache può essere passeggero
            expect(w.find('[data-testid="talos-update-retry"]').exists()).toBe(true)
        } finally {
            globale.locale.value = prima
        }
    })
})
