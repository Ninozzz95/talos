/**
 * ROTELLE-01..03 — una sola rotella in tutta l'app, quella della Chat (owner 29/10 sera, mockup «Caricamenti vivi» v6 approvato:
 * D1 «Quella della Chat ovunque»; ledger `LEDGER-CARICAMENTI-VIVI-MOBILE-2026-10-29.md`, emendamento «piano del codice sul mockup v6»).
 *   · A. una pagina che aspetta VUOTA → il velo e la carta della Chat (`TalosAttesaCarta`);
 *   · B. un'attesa dentro un foglio o una carta → la `LoaderCircle` piccola ARANCIONE accanto al testo;
 *   · C. le icone di stato di una riga e i pulsanti «busy» restano come sono: l'elenco qui sotto, esplicito, che non cresce da solo.
 * Prima c'erano quattro modi: grigia, arancione, l'anello a bordo grande e piccolo. Questo cancello impedisce che tornino.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const radice = resolve(__dirname, '../../src')
const sorgenti = readdirSync(radice, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.vue'))
    .map((f) => ({ file: f.replaceAll('\\', '/'), testo: readFileSync(join(radice, f), 'utf8') }))

/** Ogni tag d'apertura che porta `animate-spin`, anche su più righe (gli attributi fra virgolette possono contenere `>`). */
function tagCheGirano(testo: string): string[] {
    const tag = /<[A-Za-z][\w.-]*(?:[^>"']|"[^"]*"|'[^']*')*>/gu
    return [...testo.matchAll(tag)].map((m) => m[0]).filter((t) => t.includes('animate-spin'))
}
const arancione = (tag: string) => tag.includes('text-[var(--talos-accent')

/**
 * Classe C: rotelle che NON prendono l'arancione, per file, col perché. Un file nuovo o una rotella grigia in più fa fallire la prova.
 * ⛔ Il blocco del telefono è un pulsante PIENO d'arancione: una rotella arancione lì sopra sparirebbe (resta del colore del testo).
 */
const GRIGIE_PERMESSE: Record<string, { quante: number; perche: string }> = {
    'components/chat/TalosMobileComposerModelPicker.vue': { quante: 1, perche: 'RefreshCw del pulsante «aggiorna i modelli»' },
    'components/codice/TalosCodiceR4Processi.vue': { quante: 1, perche: 'icona di stato della riga di un processo' },
    'components/security/TalosMobileLockScreen.vue': { quante: 1, perche: 'pulsante «Sblocca» busy, pieno d\'arancione' },
    'components/shell/TalosMobileDeleteChatDialog.vue': { quante: 1, perche: 'pulsante «Elimina» busy' },
    'components/talos/models/TalosMobileDeviceCapacityCard.vue': { quante: 1, perche: 'RefreshCw del pulsante «misura»' },
    'components/talos/settings/TalosMobileSearchSourcePanel.vue': { quante: 1, perche: 'pulsante «Salva chiave» busy' },
    'components/talos/settings/TalosMobileSettingsUpdatesPanel.vue': { quante: 1, perche: 'RefreshCw del pulsante «controlla»' },
    'screens/ChatsScreen.vue': { quante: 1, perche: 'pulsante d\'azione busy del dialogo' },
    'screens/ContextScreen.vue': { quante: 1, perche: 'pulsante d\'azione busy del dialogo' },
}

describe('ROTELLE una sola rotella, quella della Chat', () => {
    it('ROTELLE-01 nessuna rotella grigia fuori dall\'elenco della classe C (icone di stato e pulsanti busy)', () => {
        const grigie: Record<string, number> = {}
        for (const s of sorgenti) {
            const n = tagCheGirano(s.testo).filter((t) => !arancione(t)).length
            if (n) grigie[s.file] = n
        }
        const attese = Object.fromEntries(Object.entries(GRIGIE_PERMESSE).map(([file, v]) => [file, v.quante]))
        expect(grigie).toEqual(attese)
    })

    it('ROTELLE-02 nessun anello a bordo che gira (`rounded-full border… animate-spin`): era un quarto modo', () => {
        const anelli = sorgenti.flatMap((s) => tagCheGirano(s.testo)
            .filter((t) => /\brounded-full\b/u.test(t) && /\bborder(?:-|\b)/u.test(t))
            .map(() => s.file))
        expect(anelli).toEqual([])
    })

    it('ROTELLE-03 le pagine che aspettano vuote mostrano la carta della Chat', () => {
        const classeA = [
            'screens/ChatScreen.vue',
            'screens/ContextScreen.vue',
            'screens/HarnessScreen.vue',
            'components/talos/models/TalosMobileLocalModels.vue',
            'components/talos/settings/voice/TalosMobilePersonalVoiceEnrollment.vue',
        ]
        const senza = classeA.filter((file) => !sorgenti.find((s) => s.file === file)?.testo.includes('<TalosAttesaCarta'))
        expect(senza).toEqual([])
        // e la carta è quella sola: la rotella grande `size-7` non si ricopia a mano altrove
        const copie = sorgenti
            .filter((s) => s.file !== 'components/chat/TalosAttesaCarta.vue')
            .filter((s) => tagCheGirano(s.testo).some((t) => /\bsize-7\b/u.test(t)))
            .map((s) => s.file)
        expect(copie).toEqual([])
    })
})
