import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RADICE = resolve(__dirname, '../../..')
const leggi = (percorso: string): string => readFileSync(resolve(RADICE, percorso), 'utf8')

describe('VOICE-BARGE-IN-03 e VOICE-LOCKSCREEN-04', () => {
    it('ferma la lettura TTS prima di chiedere il microfono', () => {
        const dettatura = leggi('src/composables/useTalosMobileDictation.ts')
        const stopVoce = dettatura.indexOf('await options.zittisci?.()')
        const permesso = dettatura.indexOf('const granted = await engine.requestPermission()')

        expect(stopVoce).toBeGreaterThan(-1)
        expect(permesso).toBeGreaterThan(-1)
        expect(stopVoce).toBeLessThan(permesso)

        const barra = leggi('src/components/barra/TalosBarraRoot.vue')
        expect(barra).toContain("zittisci: () => lettura.stop('la barra apre il microfono')")
        expect(barra).toContain('barra: barge-in, il TTS viene fermato prima dell ascolto')
    })

    it('la wake-word usa un intent esplicito di barge-in quando la barra è davanti', () => {
        const parola = leggi('android/app/src/main/java/ai/talos/parola/TalosParola.kt')
        expect(parola).toContain('TalosBarraActivity.eDavanti()')
        expect(parola).toContain('talos://barra?voce=1&nodi=0&immagine=0&barge=1')
    })

    it('una chiamata da lockscreen resta muta fino al callback di sblocco', () => {
        const activity = leggi('android/app/src/main/java/ai/talos/TalosBarraActivity.java')
        const blocco = activity.indexOf('private boolean preparaRisveglioDaBlocco(Intent intent)')
        const callback = activity.indexOf('onDismissSucceeded()')
        const dopoSblocco = activity.indexOf('avviaAscoltoDopoSblocco()')

        expect(blocco).toBeGreaterThan(-1)
        expect(callback).toBeGreaterThan(blocco)
        expect(dopoSblocco).toBeGreaterThan(callback)
        expect(activity).toContain('TalosOrecchioAnticipato.INSTANCE.spegni()')
        expect(activity).toContain(
            'if (blocco != null && (blocco.isDeviceLocked() || blocco.isKeyguardLocked()))',
        )
        expect(activity).toContain('return blocco != null && blocco.isDeviceLocked()')
        expect(activity).toContain('sblocco riuscito: consegno l\'assistente e apro l\'ascolto')
    })

    it('anche una activity gia viva applica il gate del keyguard e non si chiude', () => {
        const activity = leggi('android/app/src/main/java/ai/talos/TalosBarraActivity.java')
        const nuovoIntent = activity.slice(
            activity.indexOf('protected void onNewIntent(Intent intent)'),
            activity.indexOf('protected void onDestroy()'),
        )
        expect(nuovoIntent).toContain('preparaRisveglioDaBlocco(getIntent())')
        expect(activity).toContain('if (inAttesaDiSblocco || dispositivoBloccato())')
        expect(activity).toContain('sblocco in corso: onUserLeaveHint non chiude la barra')

        const barra = leggi('src/components/barra/TalosBarraRoot.vue')
        expect(barra).toContain('() => props.modo.bloccata')
        expect(barra).toContain("lettura.stop('dispositivo bloccato')")
        expect(barra).toContain("fermaLAscolto(null)")
    })

    it('separa il keyguard visibile dallo stato realmente bloccato del dispositivo', () => {
        const parola = leggi('android/app/src/main/java/ai/talos/parola/TalosParola.kt')
        expect(parola).toContain('val chiuso = blocco?.isDeviceLocked == true')
        expect(parola).not.toContain('val chiuso = blocco?.isKeyguardLocked == true')

        const activity = leggi('android/app/src/main/java/ai/talos/TalosBarraActivity.java')
        expect(activity).toContain('private boolean dispositivoBloccato()')
        expect(activity).toContain('blocco != null && blocco.isDeviceLocked()')
    })

    it('non mostra mai TALOS sopra il lockscreen prima dello sblocco', () => {
        const activity = leggi('android/app/src/main/java/ai/talos/TalosBarraActivity.java')
        const gate = activity.slice(
            activity.indexOf('private boolean preparaRisveglioDaBlocco(Intent intent)'),
            activity.indexOf('private boolean dispositivoBloccato()'),
        )

        expect(gate).not.toContain('setShowWhenLocked(true)')
        expect(gate).not.toContain('FLAG_SHOW_WHEN_LOCKED')
        expect(gate).toContain('setTurnScreenOn(true)')
        expect(gate).toContain('FLAG_TURN_SCREEN_ON')
        expect(gate).toContain('requestDismissKeyguard')
    })

    it('non apre il riconoscitore durante la transizione visuale del keyguard', () => {
        const activity = leggi('android/app/src/main/java/ai/talos/TalosBarraActivity.java')
        const gate = activity.slice(
            activity.indexOf('private boolean preparaRisveglioDaBlocco(Intent intent)'),
            activity.indexOf('private boolean dispositivoBloccato()'),
        )
        const dopoSblocco = activity.slice(
            activity.indexOf('private void avviaAscoltoDopoSblocco()'),
            activity.indexOf('/**', activity.indexOf('private void avviaAscoltoDopoSblocco()')),
        )

        expect(gate).toContain('!blocco.isDeviceLocked() && !blocco.isKeyguardLocked()')
        expect(dopoSblocco).toContain('blocco.isDeviceLocked() || blocco.isKeyguardLocked()')
    })
})

/**
 * ⛔ VOICE-BARRA-ASCOLTA-SE-STESSA — owner 13/10/2026 sul Pad: «se premo il pulsante per riprodurre ad alta voce la
 * risposta, l'ascolto del microfono non si spegne, cioè ascolta la risposta ad alta voce». Aprire il microfono zittiva
 * già la voce; il contrario mancava. Quando TALOS comincia a leggere, da qualunque porta, il microfono si chiude e la
 * frase a metà non parte; alla fine della lettura l'ascolto torna com'era.
 */
describe('VOICE-BARRA-ASCOLTA-SE-STESSA', () => {
    it('quando una lettura comincia la barra chiude il microfono, senza mandare niente, e il turno resta di voce', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')
        const inizio = barra.indexOf('() => lettura.speakingId.value,')
        expect(inizio).toBeGreaterThan(-1)
        const corpo = barra.slice(inizio, inizio + 2400)
        // vale anche nel «respiro»: microfono chiuso in quell'istante, ma ascolto ancora voluto
        expect(corpo).toContain('if (!ascoltava && !ascoltoVoluto.value) return')
        expect(corpo).toContain("annullaLaGrazia('TALOS legge')")
        expect(corpo).toContain('ascoltoVoluto.value = false')
        expect(corpo).toContain('dettatura.cancel()')
        expect(corpo.indexOf('ascoltoVoluto.value = false')).toBeLessThan(corpo.indexOf('dettatura.cancel()'))
        expect(corpo).toContain('if (ascoltoVoluto.value) turnoNatoDiVoce = true')
        // la riapertura la fa la regola di «TALOS ha finito di parlare», che vale per i turni di voce
        expect(corpo.indexOf('if (ascoltoVoluto.value) turnoNatoDiVoce = true')).toBeLessThan(corpo.indexOf('ascoltoVoluto.value = false'))
    })
})

/**
 * VOICE-BARRA-SUBITO — owner 13/10/2026: «Via l'attesa di sicurezza». Quando il turno l'ha chiuso il motore locale il testo
 * giusto è già nel campo: la barra manda subito, senza i 900 ms di grazia e senza riaprire il microfono «nel dubbio».
 */
describe('VOICE-BARRA-SUBITO', () => {
    it('turno chiuso dal motore locale ⇒ invio immediato, prima della grazia; col riconoscitore di sistema la grazia resta', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')
        const subito = barra.indexOf('if (dettatura.chiusaDalMotore.value) {')
        const grazia = barra.indexOf('        aspettaPrimaDiMandare()\n')
        expect(subito).toBeGreaterThan(-1)
        expect(grazia).toBeGreaterThan(subito)
        const ramo = barra.slice(subito, grazia)
        expect(ramo).toContain('void invia()')
        expect(ramo).toContain('return')
        expect(barra).toContain('const GRAZIA_MS = 900')
    })
})
