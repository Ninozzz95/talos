/**
 * U-14 — i token del movimento «Calm», scritti sulla RADICE DEL DOCUMENTO.
 *
 * Un solo posto, e due difetti che si chiudono insieme.
 *
 * ## 1. Le durate erano la metà di quelle del mockup
 *
 * Il motore risolve `spec × duration_scale/100 × tuning`, e `duration_scale`
 * vale **50** di serie. Gli spec U-14 sono dichiarati nella scala del mockup e
 * convertiti da `mockupMs()`, così che il valore risolto alle preferenze di
 * serie sia il numero misurato sul mockup, al millisecondo. Il perché per
 * esteso sta in `useTalosCalmMotion.ts`.
 *
 * ## 2. Il menu di riga usciva a `0ms | linear` col movimento ACCESO
 *
 * Non era una preferenza: `TalosRowActions` **teleporta** il suo pannello fuori
 * dalla radice della shell (`Teleport to="body"`, perché dentro un `<dialog>`
 * modale il `body` sta sotto il top layer). I token del motore vivono sul
 * `<div>` radice di `App.vue`; fuori da quel sottoalbero non si ereditano, e
 * ogni `var(--talos-motion-…, 0ms)` cadeva sul proprio ripiego.
 * `0ms | linear` è la firma esatta di quel ripiego: `0ms` dal fallback della
 * `var()`, `linear` dal fallback dell'easing.
 *
 * ⇒ Questi token stanno su `document.documentElement`. Da lì si vedono ovunque:
 * dentro la shell, dentro un `Teleport`, e dentro il top layer di un `<dialog>`.
 *
 * ⛔ NON SOSTITUISCONO I TOKEN DEL MOTORE. Li affiancano, e li attraversano: il
 * valore lo calcola `resolveTalosInteractionMotion`, quindi i quattro
 * spegnimenti (riduzione di sistema, «Movimento interfaccia», profilo, la
 * categoria di quell'intento) e la scala di durata scelta dall'utente decidono
 * esattamente come prima. Quando il motore spegne, questi vanno a `0ms`, e a
 * `0ms` ogni animazione si assesta sullo stato finale nello stesso fotogramma.
 *
 * Fonti (lette l'11/09/2026):
 * - https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
 * - https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
 */

import { watchEffect } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useTalosMotionEnvironment } from './useTalosMotionEnvironment'
import { talosCalmMotionTokens } from './useTalosCalmMotion'

let avviato = false

/**
 * Scrive (e tiene aggiornati) i token U-14 sulla radice del documento.
 *
 * Idempotente: la prima chiamata installa l'osservatore, le successive non
 * fanno niente. Serve perché il posto giusto da cui chiamarla è il guscio, ma
 * nessuna superficie deve rompersi se ci finisce chiamata due volte.
 *
 * ⛔ L'osservatore NON si ferma allo smontaggio, di proposito: i token sono una
 * proprietà del documento, non di un componente, e toglierli mentre una
 * superficie sta ancora uscendo la lascerebbe a metà strada. Costano una
 * manciata di stringhe, e si riscrivono solo quando le preferenze cambiano.
 */
export function useTalosCalmMotionTokens(): void {
    if (avviato || typeof document === 'undefined') return
    avviato = true

    const settings = useSettingsStore()
    const { prefersReducedMotion, documentHidden } = useTalosMotionEnvironment()

    watchEffect(() => {
        const preferences = settings.state.motion_v6
        if (!preferences) return
        const token = talosCalmMotionTokens({
            preferences,
            reducedMotion: prefersReducedMotion.value,
            // «Pausa quando nascosta»: se l'utente l'ha chiesto e la finestra è
            // in secondo piano, il movimento non si calcola. È la stessa
            // condizione che `runtimePolicy` applica agli sfondi; qui vale per
            // le superfici, e l'effetto è che tornando in primo piano non parte
            // una raffica di animazioni per cose successe mentre non si
            // guardava.
            paused: preferences.pause_when_hidden === true && documentHidden.value,
        })
        const radice = document.documentElement
        for (const [nome, valore] of Object.entries(token)) {
            radice.style.setProperty(nome, valore)
        }
    })
}

/** Solo per le prove: fa dimenticare l'installazione già avvenuta. */
export function talosCalmMotionTokensReset(): void {
    avviato = false
}
