import { describe, expect, it } from 'vitest'
import {
    TALOS_TOOL_ICONS,
    TALOS_TOOL_LABELS,
    TALOS_TOOL_LABEL_KEYS,
    TALOS_TOOL_CONSENT_KEYS,
    talosToolConsentCopy,
    talosToolIconName,
    talosToolActivityDetail,
    talosToolActivityLabel,
} from '@/lib/tools/toolLabels'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * Owner testing 2026-07-26, the first real run of the web tools: the chat showed
 * four identical rows reading `web_read...` — the wire name, repeated, with no
 * hint of which page. Two failures at once: the label map still only knew the
 * original six tools, and the activity carried no detail at all.
 *
 * The coverage tests are the ones that matter. They fail when a tool is ADDED
 * without a face, rather than when somebody happens to look at the screen —
 * which is how this shipped in the first place.
 *
 * ## ⛔ Perché non si enumerano più le FABBRICHE a mano
 *
 * Questa funzione costruiva ogni famiglia di tool chiamandone la fabbrica, e
 * l'elenco delle fabbriche era scritto a mano. È andato stantìo **tre volte**:
 * mancavano i documenti (e proprio il documento aveva l'icona sbagliata), poi i
 * modelli, e infine — trovato dall'owner il 2026-08-07 — **tutti e otto i tool
 * della Ricerca**, che mostravano `research_start` sulla scheda di consenso.
 *
 * Tre volte lo stesso difetto è un difetto della guardia, non di chi scrive i
 * tool. Ora si legge da `TALOS_AGENT_TOOL_IDS`, che è l'autorità unica: altri
 * due test (`toolSecurityDeclared`) provano che il catalogo dei permessi e
 * quello della sicurezza le corrispondono id per id, quindi un tool che nasce
 * senza volto **non ha più nessun elenco in cui nascondersi**.
 */
function everyToolName(): readonly string[] {
    return TALOS_AGENT_TOOL_IDS
}

describe('tool activity labels', () => {
    it('P1-LIB-LABEL-01 owns a human label and icon for Library browsing', () => {
        expect(TALOS_TOOL_LABELS).toHaveProperty('library_list', 'Browsing your Library')
        expect(TALOS_TOOL_ICONS).toHaveProperty('library_list', 'library')
    })

    it('C45-RED-09D gives memory_write a natural localized activity boundary', () => {
        expect(TALOS_TOOL_LABELS).toHaveProperty('memory_write', 'Saving something to memory')
        expect(TALOS_TOOL_LABEL_KEYS).toHaveProperty('memory_write', 'toolActivity.memoryWrite')
        expect(TALOS_TOOL_ICONS).toHaveProperty('memory_write', 'memory')
        expect(talosToolActivityLabel(
            { name: 'memory_write', detail: null },
            talosTestT('it')('toolActivity.memoryWrite'),
        )).toBe('Salvataggio nella memoria')
    })

    it('EVERY tool the app can run has a human label', () => {
        const missing = everyToolName().filter((name) => !(name in TALOS_TOOL_LABELS))
        expect(missing, `no label for: ${missing.join(', ')}`).toEqual([])
    })

    it('EVERY tool has its OWN icon', () => {
        // Owner 2026-07-26: making a document showed the web-search globe,
        // because the view hardcoded one icon for every row. A tool wearing
        // another tool's mark is worse than a generic one — it says something
        // false about what is happening.
        const missing = everyToolName().filter((name) => !(name in TALOS_TOOL_ICONS))
        expect(missing, `no icon for: ${missing.join(', ')}`).toEqual([])
    })

    it('TOOL-CONSENT-I18N-01 every offered tool owns localized consent keys', () => {
        const missing = everyToolName().filter((name) => !(name in TALOS_TOOL_CONSENT_KEYS))

        expect(missing, `no consent copy for: ${missing.join(', ')}`).toEqual([])
    })

    it('EVERY tool has a localized activity key too', () => {
        const missing = everyToolName().filter((name) => !(name in TALOS_TOOL_LABEL_KEYS))
        expect(missing, `no activity key for: ${missing.join(', ')}`).toEqual([])
    })

    /**
     * ⛔ Il difetto più insidioso di questa superficie: la chiave c'è nella
     * mappa, ma la frase manca nel dizionario. Allora la scheda mostra
     * `toolConsent.researchStart.title` — che è PEGGIO del nome interno del
     * tool, perché almeno quello era una parola.
     *
     * Il traduttore di prova restituisce la chiave quando non la trova, quindi
     * «tradotto diverso dalla chiave» è la prova che la frase esiste davvero.
     */
    it('e OGNI chiave risolve in una frase vera, in tutte e due le lingue', () => {
        const rotte: string[] = []
        for (const locale of ['it', 'en'] as const) {
            const t = talosTestT(locale)
            for (const nome of everyToolName()) {
                const chiavi = [
                    TALOS_TOOL_CONSENT_KEYS[nome]?.title,
                    TALOS_TOOL_CONSENT_KEYS[nome]?.description,
                    TALOS_TOOL_LABEL_KEYS[nome],
                ]
                for (const chiave of chiavi) {
                    if (!chiave) continue
                    const frase = t(chiave)
                    if (frase === chiave || frase.trim() === '') {
                        rotte.push(`${locale}: ${chiave}`)
                    }
                }
            }
        }
        expect(rotte, `chiavi senza frase: ${rotte.join(', ')}`).toEqual([])
    })

    /**
     * Una scheda di consenso non deve MAI mostrare il nome sul filo. Owner
     * 2026-08-07: `research_start` compariva come titolo, perché il fallback
     * di `talosToolConsentCopy` restituisce il titolo dello schema — inglese,
     * e a volte proprio l'id.
     */
    it('nessuna scheda di consenso mostra un nome sul filo', () => {
        const t = talosTestT('it')
        const colpevoli: string[] = []
        for (const nome of everyToolName()) {
            const copia = talosToolConsentCopy(
                { name: nome, title: nome, description: nome },
                t,
            )
            if (copia.title === nome || /^[a-z0-9]+_[a-z0-9_]+$/.test(copia.title)) {
                colpevoli.push(nome)
            }
        }
        expect(colpevoli, `mostrano il nome interno: ${colpevoli.join(', ')}`).toEqual([])
    })

    it('TOOL-CONSENT-I18N-02 resolves Italian human copy without changing protocol input', () => {
        const tool = {
            name: 'document_create',
            title: 'Create a document',
            description: 'Provider-facing schema prose.',
        }

        expect(talosToolConsentCopy(tool, talosTestT('it'))).toEqual({
            title: 'Crea un documento',
            description: 'Crea un file reale e lo salva nella Libreria cifrata su questo dispositivo.',
        })
        expect(tool).toEqual({
            name: 'document_create',
            title: 'Create a document',
            description: 'Provider-facing schema prose.',
        })
    })

    it('keeps custom consent copy when no canonical tool name exists', () => {
        expect(talosToolConsentCopy({
            title: 'Salvare “report.md” nella Libreria',
            description: 'Testo già localizzato.',
        }, talosTestT('it'))).toEqual({
            title: 'Salvare “report.md” nella Libreria',
            description: 'Testo già localizzato.',
        })
    })

    it('two different tools never share the web mark by accident', () => {
        expect(talosToolIconName('document_create')).toBe('document')
        expect(talosToolIconName('web_search')).toBe('web')
        expect(talosToolIconName('document_create')).not.toBe(talosToolIconName('web_search'))
        expect(talosToolIconName('generate_image')).toBe('image')
        expect(talosToolIconName('library_export')).toBe('download')
    })

    it('an unknown tool gets the generic mark, not the last one used', () => {
        expect(talosToolIconName('future_tool')).toBe('tool')
    })

    it('an unknown tool falls back to its name, not to nothing', () => {
        // A mystery row is worse than a technical one.
        expect(talosToolActivityLabel({ name: 'future_tool', detail: null })).toBe('future_tool')
    })

    it('says WHICH page is being read, which is the whole point', () => {
        expect(talosToolActivityLabel({
            name: 'web_read',
            detail: talosToolActivityDetail('web_read', '{"url":"https://www.agenziaentrate.gov.it/portale/x"}'),
        })).toBe('Reading a web page: agenziaentrate.gov.it')
    })

    it('says WHAT is being searched', () => {
        expect(talosToolActivityLabel({
            name: 'web_search',
            detail: talosToolActivityDetail('web_search', '{"query":"fatturazione elettronica 2026"}'),
        })).toBe('Searching the web: fatturazione elettronica 2026')
    })

    it('says WHICH file is being saved without exposing the whole tool input', () => {
        const detail = talosToolActivityDetail(
            'library_export',
            '{"reference":"Quarterly Report.pdf","internal":"do-not-show"}',
        )
        expect(detail).toBe('Quarterly Report.pdf')
        expect(detail).not.toContain('do-not-show')
    })

    it('ends a long file-save detail with one canonical Unicode ellipsis', () => {
        const reference = `Quarterly-${'x'.repeat(80)}.pdf`
        const detail = talosToolActivityDetail(
            'library_export',
            JSON.stringify({ reference }),
        )

        expect(detail).toBe(`${reference.slice(0, 48)}…`)
        expect(detail).not.toContain('â')
    })

    it('keeps the detail short — this sits on screen while the model works', () => {
        const detail = talosToolActivityDetail('web_search', JSON.stringify({ query: 'x'.repeat(200) }))
        expect(detail!.length).toBeLessThanOrEqual(50)
        expect(detail).toMatch(/…$/)
    })

    it('never spills the whole argument object onto the screen', () => {
        // It would be noise, and for a document read it could show more of the
        // content than the row intends.
        const detail = talosToolActivityDetail('library_read', '{"id":"vault-1","secret":"do-not-show"}')
        expect(detail).not.toContain('do-not-show')
    })

    it('survives arguments that are not valid JSON', () => {
        expect(talosToolActivityDetail('web_read', '{ broken')).toBeNull()
        expect(talosToolActivityLabel({ name: 'web_read', detail: null })).toBe('Reading a web page')
    })

    it('I18N-07 accepts a localized label without translating protocol details', () => {
        const activity = {
            name: 'web_read',
            detail: talosToolActivityDetail(
                'web_read',
                '{"url":"https://www.agenziaentrate.gov.it/portale/x"}',
            ),
        }

        expect(talosToolActivityLabel(activity, 'Lettura di una pagina web'))
            .toBe('Lettura di una pagina web: agenziaentrate.gov.it')
    })

    it('falls back to the raw value when a url cannot be parsed', () => {
        expect(talosToolActivityDetail('web_read', '{"url":"not a url"}')).toBe('not a url')
    })
})
