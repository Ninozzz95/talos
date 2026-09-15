import { describe, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { NodeTypes, parse, type RootNode, type TemplateChildNode } from '@vue/compiler-dom'
import { parse as parseSfc } from '@vue/compiler-sfc'
import ts from 'typescript'

function vueFiles(root: string): string[] {
    return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
        const path = join(root, entry.name)
        if (entry.isDirectory()) return vueFiles(path)
        return entry.name.endsWith('.vue') ? [path] : []
    })
}

const ACCESSIBLE_TEXT_ATTRIBUTES = new Set(['aria-label', 'placeholder', 'title', 'alt'])
const CANONICAL_NON_LANGUAGE_TEXT = new Set([
    'TALOS',
    'HTTP',
])

function normalize(value: string): string {
    return value.replace(/\s+/g, ' ').trim()
}

function isUntranslated(value: string): boolean {
    const normalized = normalize(value)
    return /[A-Za-z]{2}/.test(normalized) && !CANONICAL_NON_LANGUAGE_TEXT.has(normalized)
}

function inspectNode(
    node: RootNode | TemplateChildNode,
    relativeFile: string,
    uncovered: string[],
): void {
    if (node.type === NodeTypes.TEXT && isUntranslated(node.content)) {
        uncovered.push(`${relativeFile}:${node.loc.start.line} text="${normalize(node.content)}"`)
    }

    if (node.type === NodeTypes.ELEMENT) {
        for (const prop of node.props) {
            if (
                prop.type === NodeTypes.ATTRIBUTE
                && ACCESSIBLE_TEXT_ATTRIBUTES.has(prop.name)
                && prop.value
                && isUntranslated(prop.value.content)
            ) {
                uncovered.push(
                    `${relativeFile}:${prop.loc.start.line} ${prop.name}="${normalize(prop.value.content)}"`,
                )
            }
        }
    }

    if ('children' in node) {
        for (const child of node.children) {
            inspectNode(child, relativeFile, uncovered)
        }
    }
}

describe('localized Vue chrome', () => {
    it('I18N-05 leaves no static English text or accessible labels outside the catalogs', () => {
        const sourceRoot = resolve(process.cwd(), 'src')
        const uncovered: string[] = []

        for (const file of vueFiles(sourceRoot)) {
            const source = readFileSync(file, 'utf8')
            const rawTemplate = parseSfc(source, { filename: file }).descriptor.template?.content
            if (!rawTemplate) continue
            const relativeFile = relative(sourceRoot, file)
            inspectNode(parse(rawTemplate, { comments: false }), relativeFile, uncovered)
        }

        if (uncovered.length > 0) {
            throw new Error(
                `${uncovered.length} static UI strings are outside the locale catalogs:\n`
                + uncovered.slice(0, 40).join('\n'),
            )
        }
    })

    it('I18N-TS-06 keeps registered TypeScript UI emitters free of direct prose', () => {
        const sourceRoot = resolve(process.cwd(), 'src')
        const strictEmitters = [
            'composables/useTalosMobileAttachments.ts',
            'composables/useTalosMobileComposerDraft.ts',
            'lib/sessionActionRunner.ts',
            'lib/chat/chatCompletion.ts',
            'lib/chat/providerErrors.ts',
            'lib/chat/providerRegistry.ts',
            'services/appLock.ts',
            'services/secureKeyStore.ts',
        ]
        const visibleProperties = new Set(['message', 'title', 'description', 'label'])
        const uncovered: string[] = []
        const naturalLanguage = /[A-Za-z]{2,}\s+[A-Za-z]{2,}/

        function inspectTypeScript(relativeFile: string, strict: boolean): void {
            const file = resolve(sourceRoot, relativeFile)
            const source = readFileSync(file, 'utf8')
            const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

            function inspect(node: ts.Node): void {
                if (
                    (ts.isStringLiteral(node)
                        || ts.isNoSubstitutionTemplateLiteral(node)
                        || ts.isTemplateExpression(node))
                    && naturalLanguage.test(node.getText(tree))
                ) {
                    const visibleProperty = ts.isPropertyAssignment(node.parent)
                        && visibleProperties.has(node.parent.name.getText(tree))
                    if (strict || visibleProperty) {
                        const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1
                        uncovered.push(`${relativeFile}:${line} ${normalize(node.getText(tree)).slice(0, 100)}`)
                    }
                }
                ts.forEachChild(node, inspect)
            }
            inspect(tree)
        }

        for (const file of strictEmitters) inspectTypeScript(file, true)
        inspectTypeScript('stores/chat.ts', false)
        inspectTypeScript('stores/chatController.ts', false)
        /*
         * ⛔ La sonda del kernel, iscritta il 2026-08-20 DOPO che questa
         * guardia l'ha mancata. Il difetto: quattro righe del Doctor con
         * `label:` scritta a mano in italiano, dentro una superficie che
         * `Copia diagnostica` spedisce in un rapporto condivisibile.
         *
         * ⛔ La regola c'era ed era GIUSTA — `visibleProperties` contiene
         * gia `label`, e in modo non-strict avrebbe preso tutte e quattro.
         * Ha taciuto perche i .ts si ispezionano per ELENCO SCRITTO A MANO,
         * mentre i .vue si ispezionano TUTTI, sempre, per ricorsione.
         * Un file nuovo non entra mai in quell'elenco da solo.
         *
         * ⇒ Misurato prima di proporre di allargarla a tutto `src`:
         * 465 file, e in modo non-strict **62 violazioni su 10 file** con
         * la sola `label` (132 aggiungendo `title`, 210 con `message` e
         * `description`). Non e un allargamento gratuito: la meta grossa
         * e `description` degli attrezzi, che parla al MODELLO e deve
         * restare inglese. La distinzione fra testo per la persona e testo
         * per il modello non esiste ancora in questa guardia, ed e quella
         * che va progettata prima di accendere lo scanner su tutto.
         */
        inspectTypeScript('services/kernelDoctor.ts', false)

        if (uncovered.length > 0) {
            throw new Error(
                `${uncovered.length} TypeScript UI strings are outside the locale catalogs:\n`
                + uncovered.slice(0, 40).join('\n'),
            )
        }
    })
})
