/**
 * Il guardiano collegato: guarda al risveglio, e parla se qualcosa si è spento.
 *
 * ## Perché al RISVEGLIO e non a un orologio
 *
 * Le capacità di TALOS non muoiono a caso: muoiono quando il telefono si riavvia
 * (Shizuku vive come shell e non sopravvive), o quando il sistema revoca. Fra
 * l'uno e l'altro c'è sempre un momento in cui l'app torna davanti — ed è
 * l'unico in cui l'avviso serve ancora e non ha ancora fatto danno. Un
 * controllo a tempo consumerebbe batteria per scoprire la stessa cosa più tardi.
 *
 * ⛔ E prima che serva, non quando serve: la persona deve saperlo mentre apre
 * l'app, non dopo aver chiesto una cosa e aver ricevuto un no che sembra un
 * difetto nostro.
 *
 * ## Cosa si conserva, e dove
 *
 * Solo la fotografia precedente, nelle preferenze. Non un registro di eventi:
 * per rispondere a «cosa si è spento?» basta il confronto fra due istanti, e
 * tenere di più vorrebbe dire tenere anche il dovere di sfoltirlo.
 */
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import {
    talosCapabilityLossKey,
    talosCapabilityLossWeight,
    talosCapabilityWatch,
    type TalosCapabilityState,
} from '@/lib/device/capabilityWatch'
import { talosPrivilegedReady } from '@/lib/device/privilegedShell'

const CHIAVE = 'talos.capabilities.snapshot.v1'

export interface TalosCapabilityWatchDeps {
    /** Cosa TALOS può fare adesso. Iniettabile per poterlo provare. */
    leggiStato(): Promise<TalosCapabilityState>
    leggiPrecedente(): Promise<TalosCapabilityState | null>
    scriviPrecedente(stato: TalosCapabilityState): Promise<void>
    avvisa(evento: {
        key: string
        weight: 'log' | 'away' | 'notable' | 'demanding'
        id: string
    }): void
}

/**
 * Un giro solo: leggi, confronta, avvisa, ricorda.
 *
 * ⛔ Al PRIMO avvio non si annuncia niente. Senza un «prima» non esiste una
 * perdita, esiste solo uno stato — e annunciarlo trasformerebbe la normalità di
 * quel telefono in un allarme, che è il modo più veloce per insegnare a
 * ignorare gli allarmi.
 */
export async function talosCheckCapabilities(deps: TalosCapabilityWatchDeps): Promise<void> {
    const adesso = await deps.leggiStato()
    const prima = await deps.leggiPrecedente()

    if (prima === null) {
        await deps.scriviPrecedente(adesso)
        return
    }

    const esito = talosCapabilityWatch(prima, adesso, () => 'bridge-down')
    for (const perdita of esito.lost) {
        deps.avvisa({
            key: talosCapabilityLossKey(perdita),
            weight: talosCapabilityLossWeight(perdita),
            id: perdita.id,
        })
    }
    await deps.scriviPrecedente(esito.next)
}

/** Le dipendenze vere, sul dispositivo. */
export async function talosCapabilityWatchDeps(): Promise<TalosCapabilityWatchDeps> {
    const [{ Preferences }, { talosNotify }, { useTalosI18n }] = await Promise.all([
        import('@capacitor/preferences'),
        import('@/stores/notificationCentre'),
        import('@/i18n'),
    ])
    const { t } = useTalosI18n()

    return {
        async leggiStato() {
            /*
             * ⛔ Si guarda il PONTE, non i singoli strumenti.
             *
             * Wi-Fi, Bluetooth, Non disturbare, impostazioni di sistema e uso
             * delle app passano tutti da lì: se il ponte è caduto sono caduti
             * insieme, e cinque avvisi per una causa sola sarebbero quattro di
             * troppo. Quando avremo capacità che muoiono da sole, si aggiungono
             * qui — la regola del confronto non cambia.
             */
            return { privileged_bridge: await talosPrivilegedReady().catch(() => false) }
        },
        async leggiPrecedente() {
            const { value } = await Preferences.get({ key: CHIAVE })
            if (!value) return null
            try {
                const letto: unknown = JSON.parse(value)
                return letto && typeof letto === 'object'
                    ? (letto as TalosCapabilityState)
                    : null
            }
            catch {
                // Una fotografia illeggibile è come non averla: si riparte, e
                // il primo giro dopo tacerà — meglio di un avviso inventato.
                return null
            }
        },
        async scriviPrecedente(stato) {
            await Preferences.set({ key: CHIAVE, value: JSON.stringify(stato) })
        },
        avvisa(evento) {
            talosNotify({
                key: evento.key,
                channel: 'attention',
                weight: evento.weight,
                title: t('capabilityLost.title'),
                body: t('capabilityLost.privilegedBridge'),
                at: Date.now(),
            })
        },
    }
}

/** Attacca il guardiano al risveglio dell'app. Restituisce come staccarlo. */
export function talosStartCapabilityWatch(): () => void {
    if (!Capacitor.isNativePlatform()) return () => {}

    let vivo = true
    const giro = async (): Promise<void> => {
        if (!vivo) return
        try {
            await talosCheckCapabilities(await talosCapabilityWatchDeps())
        }
        catch { /* un guardiano che inciampa non deve fermare l'app */ }
    }

    void giro()
    const registrazione = App.addListener('appStateChange', (state: { isActive: boolean }) => {
        if (state.isActive) void giro()
    })

    return () => {
        vivo = false
        void registrazione.then((handle) => handle.remove()).catch(() => {})
    }
}
