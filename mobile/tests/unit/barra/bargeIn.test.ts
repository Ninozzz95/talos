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
