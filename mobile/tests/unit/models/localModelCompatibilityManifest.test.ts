import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface CompatibilityCase {
    id: string
    repository: string
    revision: string
    file: string
    bytes: number
    sha256: string
    family: string
    license: string
    gated: boolean
    prompt: string
}

interface CompatibilityManifest {
    schemaVersion: number
    maxConcurrency: number
    target: {
        packageId: string
        nativeRelativePath: string
        uiRelativeRoot: string
    }
    cases: CompatibilityCase[]
}

function manifest(): CompatibilityManifest {
    return JSON.parse(readFileSync(resolve(
        process.cwd(),
        'tests/fixtures/local-model-compatibility.json',
    ), 'utf8')) as CompatibilityManifest
}

describe('C45-RED-18 sequential local-model compatibility manifest', () => {
    it('pins the single-worker and the only two campaign namespaces', () => {
        const value = manifest()
        expect(value.schemaVersion).toBe(1)
        expect(value.maxConcurrency).toBe(1)
        expect(value.target).toEqual({
            packageId: 'ai.talos.dev',
            nativeRelativePath: 'talos-compat/talos-compat.gguf',
            uiRelativeRoot: 'models/__talos_compat__',
        })
    })

    it('freezes every upstream revision, byte count, hash, family and license', () => {
        const cases = manifest().cases
        expect(cases).toEqual([
            {
                id: 'C1', repository: 'unsloth/SmolLM2-360M-Instruct-GGUF',
                revision: '391ed11137586e383b1be0fab9acf01d282c2e11',
                file: 'SmolLM2-360M-Instruct-Q5_K_M.gguf', bytes: 289944160,
                sha256: '0d3040f47b83cd279fc653877059829cbd6e17f972f82a03f686f7d5f3834440',
                family: 'llama', license: 'Apache-2.0', gated: false,
                prompt: 'Compatibility test C1. Reply with one short English sentence containing TALOS. Do not repeat context labels or memory entries.',
            },
            {
                id: 'C2', repository: 'Qwen/Qwen3-0.6B-GGUF',
                revision: '23749fefcc72300e3a2ad315e1317431b06b590a',
                file: 'Qwen3-0.6B-Q8_0.gguf', bytes: 639446688,
                sha256: '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031',
                family: 'qwen3', license: 'Apache-2.0', gated: false,
                prompt: 'Test compatibilità C2. Rispondi con una frase breve in italiano che contenga TALOS.',
            },
            {
                id: 'C3', repository: 'LiquidAI/LFM2-350M-GGUF',
                revision: '8fdc9d526b7ed346b19257551b05816c7912ecc2',
                file: 'LFM2-350M-Q4_K_M.gguf', bytes: 229309376,
                sha256: 'a4d000c7064bd3b2e42c6845836286a899a4e79cf1791da1a6797b58d575957d',
                family: 'lfm2', license: 'LFM1.0', gated: false,
                prompt: 'Compatibility test C3. Reply with exactly: TALOS is ready.',
            },
            {
                id: 'C4', repository: 'ibm-granite/granite-4.0-350m-GGUF',
                revision: 'b8208a86a58427e1739265318028eb5895b74bf2',
                file: 'granite-4.0-350m-Q4_K_M.gguf', bytes: 236985760,
                sha256: '771c588a49607f274a2bba3185733607ebe6f74b996ab90e2d6bee0d98bcec52',
                family: 'granitehybrid', license: 'Apache-2.0', gated: false,
                prompt: 'Test compatibilità C4. Rispondi con una frase breve in italiano che contenga TALOS.',
            },
            {
                id: 'C5', repository: 'microsoft/Phi-3-mini-4k-instruct-gguf',
                revision: 'a64113399c2f6b8ad3e11c394733a2ddadaa7f33',
                file: 'Phi-3-mini-4k-instruct-q4.gguf', bytes: 2393231072,
                sha256: '8a83c7fb9049a9b2e92266fa7ad04933bb53aa1e85136b7b30f1b8000ff2edef',
                family: 'phi3', license: 'MIT', gated: false,
                prompt: 'Compatibility test C5. Reply with exactly: TALOS is ready.',
            },
            {
                id: 'C6', repository: 'bartowski/Llama-3.2-1B-Instruct-GGUF',
                revision: '067b946cf014b7c697f3654f621d577a3e3afd1c',
                file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf', bytes: 807694464,
                sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
                family: 'llama', license: 'Llama-3.2', gated: false,
                prompt: 'Test compatibilità C6. Rispondi con una frase breve in italiano che contenga TALOS.',
            },
            {
                id: 'C7', repository: 'google/gemma-3-1b-it-qat-q4_0-gguf',
                revision: 'd1be121d36172a4b0b964657e2ee859d61138593',
                file: 'gemma-3-1b-it-q4_0.gguf', bytes: 1003541152,
                sha256: '95e5b8d891cd6a794f66c2a6fb59a41e9562b4660560b854274eceffb628b22a',
                family: 'gemma3', license: 'Gemma', gated: true,
                prompt: 'Test compatibilità C7. Rispondi con una frase breve in italiano che contenga TALOS.',
            },
        ])
    })

    it('rejects mutable refs, duplicate cases and path escape material', () => {
        const value = manifest()
        expect(new Set(value.cases.map((entry) => entry.id)).size).toBe(value.cases.length)
        for (const entry of value.cases) {
            expect(entry.revision).toMatch(/^[0-9a-f]{40}$/)
            expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/)
            expect(entry.bytes).toBeGreaterThan(0)
            expect(entry.repository).toMatch(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/)
            expect(entry.file).toMatch(/^[^/\\]+\.gguf$/i)
            expect(entry.prompt.trim()).not.toBe('')
            expect(`${entry.repository}/${entry.file}`).not.toContain('..')
        }
    })

    it('has no implicit language fallback in the physical runner', () => {
        const source = readFileSync(resolve(
            process.cwd(),
            'scripts/run-local-model-compatibility.mjs',
        ), 'utf8')
        const chatGate = source.slice(source.indexOf('async function exerciseRealChat'))
        expect(source).toContain("invariant(typeof entry.prompt === 'string'")
        expect(chatGate).not.toMatch(/entry\.prompt\s*\?\?/)
    })

    it('keeps runner selection ordered and deletion targets inside the allowlist', async () => {
        // The runner is a Node ESM CLI and deliberately has no browser bundle types.
        // @ts-expect-error exercised as a real module by Vitest, outside the app graph.
        const runner = await import('../../../scripts/run-local-model-compatibility.mjs')
        const value = manifest()

        expect(runner.resolveSelectedCases(value, [])
            .map((entry: CompatibilityCase) => entry.id)).toEqual(value.cases.map((entry) => entry.id))
        expect(runner.resolveSelectedCases(value, ['C3', 'C1'])
            .map((entry: CompatibilityCase) => entry.id)).toEqual(['C1', 'C3'])
        expect(() => runner.assertSafeCampaignRelativePath(value, 'talos-compat/talos-compat.gguf'))
            .not.toThrow()
        expect(() => runner.assertSafeCampaignRelativePath(value, 'models/__talos_compat__/C2/talos-compat.gguf'))
            .not.toThrow()
        for (const unsafe of [
            'models/owner/model.gguf',
            'models/__talos_compat__/../owner.gguf',
            '/sdcard/model.gguf',
            'talos-compat/other.gguf',
        ]) {
            expect(() => runner.assertSafeCampaignRelativePath(value, unsafe)).toThrow()
        }
    })

    it('makes the physical device gate recheck the streamed fixture before native open', () => {
        const source = readFileSync(resolve(
            process.cwd(),
            'android/app/src/androidTest/java/ai/talos/TalosLlamaEngineDeviceTest.java',
        ), 'utf8')

        expect(source).toContain('talosExpectedBytes')
        expect(source).toContain('talosExpectedSha256')
        expect(source).toContain('talosCaseId')
        const gate = source.slice(source.indexOf(
            'public void appliesEmbeddedTemplateAndGeneratesAVisibleReply()',
        ))
        expect(gate).toContain('sha256(file)')
        expect(gate.indexOf('sha256(file)')).toBeLessThan(gate.indexOf('TalosLlamaEngine.tryOpen('))
    })

    it('uses a named ADB reverse and lets target instrumentation own every external mutation', () => {
        const source = readFileSync(resolve(
            process.cwd(),
            'scripts/run-local-model-compatibility.mjs',
        ), 'utf8')
        const deviceTest = readFileSync(resolve(
            process.cwd(),
            'android/app/src/androidTest/java/ai/talos/TalosLlamaEngineDeviceTest.java',
        ), 'utf8')

        expect(source).toContain("'shell', 'readlink', '-f',")
        expect(source).not.toContain("'shell', 'run-as', packageId, 'readlink'")
        expect(source).toContain("'reverse', `tcp:${port}`, `tcp:${port}`")
        expect(source).toContain("'reverse', '--remove', `tcp:${port}`")
        expect(source).not.toMatch(/'run-as'[\s\S]{0,180}'(?:mkdir|dd|mv|rm|rmdir)'/)
        expect(deviceTest).toContain('new Socket("127.0.0.1", port)')
        expect(deviceTest).toContain('public void cleansCompatibilityCampaignFiles()')
    })

    it('opens the model dialog from both compact and expanded composer layouts', () => {
        const source = readFileSync(resolve(
            process.cwd(),
            'scripts/run-local-model-compatibility.mjs',
        ), 'utf8')
        const chatGate = source.slice(source.indexOf('async function exerciseRealChat'))
        expect(chatGate).not.toContain("button[aria-haspopup=\"dialog\"]")
        expect(chatGate).not.toContain("composer.locator('textarea + button')")
        expect(chatGate).toContain('Choose model profile|Scegli profilo modello')
        expect(chatGate).toContain('Send message|Invia messaggio')
        expect(chatGate.indexOf('await textarea.fill(prompt)')).toBeLessThan(
            chatGate.indexOf('await modelTrigger.click()'),
        )
        expect(chatGate.match(/await textarea\.fill\(prompt\)/g)).toHaveLength(2)
        expect(chatGate.lastIndexOf('await textarea.fill(prompt)')).toBeGreaterThan(
            chatGate.indexOf("await drawer.waitFor({ state: 'detached'"),
        )
        expect(chatGate).toContain('await textarea.inputValue() === prompt')
    })

    it('starts every physical compatibility proof in a fresh real chat', () => {
        const source = readFileSync(resolve(
            process.cwd(),
            'scripts/run-local-model-compatibility.mjs',
        ), 'utf8')
        const chatGate = source.slice(source.indexOf('async function exerciseRealChat'))
        expect(chatGate).toContain("page.locator('[data-testid=\"talos-chats-new\"]')")
        expect(chatGate.indexOf('await newChat.click()')).toBeLessThan(
            chatGate.indexOf('await textarea.fill(prompt)'),
        )
    })

    it('isolates every physical proof from owner memory before composing', async () => {
        const source = readFileSync(resolve(
            process.cwd(),
            'scripts/run-local-model-compatibility.mjs',
        ), 'utf8')
        const chatGate = source.slice(source.indexOf('async function exerciseRealChat'))

        expect(chatGate).toContain("page.getByTestId('talos-make-temporary')")
        expect(chatGate).toContain("page.getByTestId('talos-temporary-chat-badge')")
        expect(chatGate.indexOf('await temporaryToggle.click()')).toBeLessThan(
            chatGate.indexOf("await temporaryBadge.waitFor({ state: 'visible'"),
        )
        expect(chatGate.indexOf("await temporaryBadge.waitFor({ state: 'visible'")).toBeLessThan(
            chatGate.indexOf('await textarea.fill(prompt)'),
        )
        expect(chatGate).toContain("page.getByTestId('talos-used-memories')")

        // @ts-expect-error Node ESM runner module intentionally sits outside the app graph.
        const runner = await import('../../../scripts/run-local-model-compatibility.mjs')
        expect(() => runner.validateCompatibilityReply(
            'C3',
            'TALOS talos_MEM_PRESENT: true',
        )).toThrow('TALOS_LOCAL_COMPATIBILITY_CONTEXT_ECHO:C3:TALOS_mem_present')
    })

    it('uses the documented C1 language and rejects internal-context echo as evidence', () => {
        const source = readFileSync(resolve(
            process.cwd(),
            'scripts/run-local-model-compatibility.mjs',
        ), 'utf8')

        expect(manifest().cases[0]?.prompt).toContain('short English sentence')
        expect(source).not.toMatch(/entry\.prompt\s*\?\?/)
        expect(source).toContain("'TALOS_MEMORY_CONTEXT'")
        expect(source).toContain("'MEMORY 1'")
        expect(source).toContain("'USER_TASK'")
        expect(source).toContain("'When asked who you are'")
        expect(source).toContain("\"The user's selected tone preset\"")
        expect(source).toContain('TALOS_LOCAL_COMPATIBILITY_CONTEXT_ECHO')
    })

    it('records the native context actually used by every physical chat proof', () => {
        const source = readFileSync(resolve(
            process.cwd(),
            'scripts/run-local-model-compatibility.mjs',
        ), 'utf8')
        const chatGate = source.slice(source.indexOf('async function exerciseRealChat'))

        expect(chatGate).toContain('Capacitor?.Plugins?.TalosLlama')
        expect(chatGate).toContain('nativeContextProbe?.contextTokens')
        expect(chatGate).toContain('plugin.chatPrompt({')
        expect(chatGate).toContain('contextTokens: nativeContextTokens')
        expect(chatGate.indexOf('nativeContextProbe?.contextTokens')).toBeLessThan(
            chatGate.indexOf("const screenshotName = SCREENSHOTS[entry.id]"),
        )
    })

    it('validates only the model body and requires the advertised TALOS marker', async () => {
        // @ts-expect-error Node ESM runner module intentionally sits outside the app graph.
        const runner = await import('../../../scripts/run-local-model-compatibility.mjs')

        expect(() => runner.validateCompatibilityReply('C3', '')).toThrow(
            'TALOS_LOCAL_COMPATIBILITY_EMPTY_REPLY:C3',
        )
        expect(() => runner.validateCompatibilityReply(
            'C3',
            'TALOS_MEMORY_CONTEXT TALOS',
        )).toThrow('TALOS_LOCAL_COMPATIBILITY_CONTEXT_ECHO:C3:TALOS_MEMORY_CONTEXT')
        expect(runner.validateCompatibilityReply('C3', '  TALOS è operativo.  '))
            .toBe('TALOS è operativo.')

        const source = readFileSync(resolve(
            process.cwd(),
            'scripts/run-local-model-compatibility.mjs',
        ), 'utf8')
        const chatGate = source.slice(source.indexOf('async function exerciseRealChat'))
        expect(chatGate).toContain("lastAssistant.getByTestId('talos-mobile-message-content')")
        expect(chatGate).not.toContain('lastAssistant.innerText()')
        expect(chatGate.indexOf('validateCompatibilityReply')).toBeLessThan(
            chatGate.indexOf("const screenshotName = SCREENSHOTS[entry.id]"),
        )
    })

    /**
     * C45-RED-19C — compatibilita' e obbedienza sono DUE domande.
     *
     * C6 (Llama 3.2 1B) ha caricato, generato in italiano e reso in chat senza
     * crash — poi ha risposto «Scopri l'intero futuro.», ignorando la richiesta
     * di includere `TALOS`. Il banco l'ha chiamato FAIL, cioe' ha detto «TALOS
     * non e' compatibile con Llama 3.2». **Non e' vero**, ed e' la stessa cosa
     * gia' osservata su C2 (Qwen risponde in inglese) e C4 (Granite idem), dove
     * pero' era finita in prosa nel ledger invece che nel verdetto.
     *
     * Quindi il marker smette di essere fatale e diventa **un'osservazione**.
     *
     * ## Perche' questo NON riapre la regressione 18L
     *
     * `18L` era il falso PASS: il runner leggeva `TALOS` dal **footer**
     * dell'assistente invece che dal corpo. Quella regressione e' impedita dal
     * **confine DOM** — si legge solo da `talos-mobile-message-content`, mai da
     * `lastAssistant.innerText()` — che e' asserito qui sopra e resta intatto.
     * Il marker non c'entrava: proteggeva per caso, non per costruzione.
     *
     * ## Cosa resta FATALE, e non si tocca
     *
     * Risposta vuota (il modello non ha prodotto niente) ed **eco di contesto**
     * (`18O`: memorie o prompt di sistema nel testo). Sono integrita' e
     * privacy, non qualita': li' un rosso deve restare rosso.
     */
    it('separa la compatibilita` runtime dall`obbedienza del modello', async () => {
        // @ts-expect-error Node ESM runner module intentionally sits outside the app graph.
        const runner = await import('../../../scripts/run-local-model-compatibility.mjs')

        // Obbedienza: osservata, non imposta.
        expect(runner.compatibilityInstructionMarker('TALOS è operativo.')).toBe(true)
        expect(runner.compatibilityInstructionMarker("Scopri l'intero futuro.")).toBe(false)

        // Una risposta senza marker NON fa piu' fallire il caso...
        expect(() => runner.validateCompatibilityReply(
            'C6',
            "Scopri l'intero futuro.",
        )).not.toThrow()

        // ...ma vuoto ed eco restano fatali.
        expect(() => runner.validateCompatibilityReply('C6', '   ')).toThrow(
            'TALOS_LOCAL_COMPATIBILITY_EMPTY_REPLY:C6',
        )
        expect(() => runner.validateCompatibilityReply(
            'C6',
            'TALOS_MEMORY_CONTEXT qualcosa',
        )).toThrow('TALOS_LOCAL_COMPATIBILITY_CONTEXT_ECHO:C6:TALOS_MEMORY_CONTEXT')
    })

    /**
     * C45-RED-19B — un FAIL deve dire COSA e' stato risposto.
     *
     * C6 (Llama 3.2) e' fallito sul marker e il report ha conservato soltanto
     * `status: FAIL`: niente risposta, niente contesto, niente nativo. Quindi
     * la diagnosi costava un ciclo intero — 800 MB di download e una nuova
     * apertura sul dispositivo — per rileggere una frase che il banco aveva
     * gia' avuto in mano.
     *
     * E' la stessa lacuna di `18K`, su un altro fianco: la prova c'era e non e'
     * stata trattenuta.
     *
     * Il vincolo che rende il caso non ovvio: la risposta **non si puo'
     * conservare sempre**. Quando il fallimento e' un'eco di contesto, quel
     * testo e' esattamente cio' che non deve finire in un artefatto — Codex ha
     * gia' dovuto cancellare a mano un PNG per questo. Quindi: si registra la
     * risposta, **tranne** quando e' proprio lei il problema.
     */
    it('conserva la risposta osservata quando il caso fallisce, ma mai un eco di contesto', async () => {
        // @ts-expect-error Node ESM runner module intentionally sits outside the app graph.
        const runner = await import('../../../scripts/run-local-model-compatibility.mjs')

        const marker = runner.compatibilityFailureDiagnostic(
            'C6',
            'Mi dispiace, non posso aiutarti con questo.',
            new Error('TALOS_LOCAL_COMPATIBILITY_REQUIRED_MARKER:C6'),
        )
        expect(marker.reason).toBe('TALOS_LOCAL_COMPATIBILITY_REQUIRED_MARKER:C6')
        expect(marker.observedReply).toBe('Mi dispiace, non posso aiutarti con questo.')

        const echo = runner.compatibilityFailureDiagnostic(
            'C6',
            'TALOS_MEMORY_CONTEXT il progetto dell utente',
            new Error('TALOS_LOCAL_COMPATIBILITY_CONTEXT_ECHO:C6:TALOS_MEMORY_CONTEXT'),
        )
        expect(echo.observedReply).toBe('[REDACTED_CONTEXT_ECHO]')
        expect(echo.observedReply).not.toContain('utente')

        // Una risposta lunghissima non deve gonfiare il report: si tronca in
        // modo dichiarato, perche' un troncamento silenzioso si legge come la
        // risposta intera.
        const lungo = runner.compatibilityFailureDiagnostic(
            'C6',
            'x'.repeat(4000),
            new Error('TALOS_LOCAL_COMPATIBILITY_REQUIRED_MARKER:C6'),
        )
        expect(lungo.observedReply.length).toBeLessThan(1200)
        expect(lungo.observedReply).toContain('…')
    })
})
