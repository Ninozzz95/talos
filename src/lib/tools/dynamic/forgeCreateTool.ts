import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { validateTalosLocalTool } from './validator'
import { installForgeTool } from './forgeRegistryRepository'
import { defaultForgeCapabilities } from './capabilityCatalog'
import type { TalosLocalToolManifestV1 } from './contracts'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — «un utente finale, che magari non ha idea di cosa
 * sia un JSON, come fa a creare un tool da solo?». Non ci arriva: fino a
 * qui, l'UNICA via per un tool nuovo era il foglio d'importazione di Fase 6
 * — incollare (o scegliere) un `.talostool`, cioè JSON scritto a mano.
 * Perfetto per un test, impraticabile per chiunque altro.
 *
 * ## Perché è sicuro per costruzione, non nonostante il vincolo — grazie al
 * vincolo
 *
 * ADR-001 del Forge (mai eseguire codice generato dal modello, solo un DAG
 * dichiarativo bounded — confermato dalle CVE vm2 2026 già in questa
 * sessione) NON si allarga di un millimetro per fare spazio a questo tool:
 * il modello propone la STESSA identica forma — un manifest
 * `talos.local-tool.v1` — che un umano incollerebbe a mano nel foglio
 * d'importazione. Zero superficie nuova: stessa validazione
 * (`validateTalosLocalTool`), stessa scrittura (`installForgeTool`), stesso
 * registro, stessa scheda di consenso, stesso "installato ma disabilitato
 * di default" di ogni altro tool forgiato.
 *
 * ## Cosa il modello NON deve inventare
 *
 * `talosLocalToolManifestV1Schema` (validator.ts) ha ~15 campi; la metà
 * sono meccanici — `schema`, `execution`, `installScope` sono literal
 * costanti, `network`/`credentialRequirements` sono fissi finché il Forge
 * non ha un resolver di credenziali vero (Fase 4), `version`/`createdAt`/
 * `parentVersion` li decide QUESTA funzione, non il modello. Chiedere al
 * modello di ripeterli ogni volta è solo un modo in più di sbagliarli.
 * L'input qui sotto porta SOLO ciò che è davvero una decisione del
 * richiedente: id, titolo, descrizione, la forma dell'input, il flow.
 *
 * ## La scheda di consenso resta leggibile — non un'eccezione, la STESSA
 * riparazione di oggi
 *
 * Titolo e descrizione restano campi piatti in cima all'oggetto: la scheda
 * (righe per campo, non più "tutto o niente" — vedi
 * `TalosMobileToolConsentSheet.vue`, riparato lo stesso giorno) li mostra
 * come righe leggibili, e il `flow` tecnico — dove appiattire perderebbe
 * davvero informazione — resta JSON dentro la SUA riga, non al posto
 * dell'intera scheda.
 */

const CAPABILITY_IDS = defaultForgeCapabilities().map((entry) => entry.id)

/**
 * ⛔⛔ Owner 2026-08-27 — «SE ACCORCIARE AZZOPPA LA FUNZIONALITÀ, ALZA IL
 * TETTO». Una prima stesura riduceva il DAG offerto al modello a soli
 * "capability"/"if"/"return" per stare sotto il tetto di
 * `pesoDegliSchemi.test.ts` — cioè TOGLIEVA `foreach` (che `bulk-tasks` usa
 * davvero, verificato dal vivo) e `set`/`llm`/retry/compensation per un
 * vincolo di peso, non per un motivo proprio. Esattamente la scorciatoia
 * vietata: si azzoppa la funzione per far quadrare un numero. Ripristinato,
 * tetto alzato — vedi `pesoDegliSchemi.test.ts`.
 *
 * ⛔⛔⛔ E poi, DAL DISPOSITIVO, un secondo difetto: `forgeFlowSchema`/
 * `jsonSchemaSubsetSchema` (riusati da `manifestZodSchema.ts`) sono
 * genuinamente RICORSIVI (`z.lazy()` — un flow che contiene nodi che
 * contengono flow; uno schema-di-schema per `inputSchema`), e Zod 4 non ha
 * altro modo di rappresentare la ricorsione in JSON Schema che `$ref`/
 * `$defs`. Gemini la rifiuta: `PROVIDER_HTTP_400`, riprodotto sul Pad
 * chiedendo la creazione di un tool via chat — non un limite di peso, un
 * limite di FORMA del payload. Ricerca 2026: Gemini non supporta `$ref`
 * ricorsivi nei function-calling schema (confermato, non un'ipotesi).
 *
 * ⇒ Lo schema qui sotto è un albero SCRITTO PER ESTESO, non uno importato:
 * stessi 7 tipi di nodo del DSL reale (capability con retry/compensation,
 * if, foreach, set, llm, return, fail) — nessuna capacità tolta — ma senza
 * `z.lazy()` da nessuna parte, perché nessun tipo qui referenzia se stesso.
 * L'UNICA vera riduzione, onesta e minima: l'`outputSchema` del nodo llm
 * (un JSON-schema-per-descrivere-uno-schema, l'ALTRA genuina ricorsione)
 * non è esposto — un dettaglio di configurazione avanzata per un tipo di
 * nodo che fallisce comunque sempre oggi (`FORGE_MODEL_UNAVAILABLE`,
 * nessun runtime di modello collegato), non funzionalità realmente
 * disponibile a cui si rinuncia.
 */
const PRIMITIVE_TYPES = ['string', 'number', 'integer', 'boolean'] as const
const primitiveFieldSchema = z.strictObject({
    type: z.enum([...PRIMITIVE_TYPES, 'array']),
    description: z.string().optional(),
    items: z.strictObject({ type: z.enum(PRIMITIVE_TYPES) }).optional(),
    enum: z.array(z.unknown()).optional(),
})
const retryPolicySchema = z.strictObject({ maxAttempts: z.number(), backoffMs: z.number().optional() })
const compensationSchema = z.strictObject({ capability: z.string(), input: z.unknown() })
const llmOp = z.enum(['classify', 'extract', 'summarize', 'generate', 'rank'])
const modelRequirementsSchema = z.strictObject({
    structuredOutput: z.boolean().optional(),
    privacy: z.enum(['local-only', 'local-preferred', 'remote-allowed']).optional(),
    reasoning: z.enum(['off', 'low', 'medium', 'high']).optional(),
})
const conditionSchema = z.strictObject({
    left: z.unknown(),
    op: z.enum(['eq', 'neq', 'truthy', 'exists', 'contains', 'gt', 'gte', 'lt', 'lte']),
    right: z.unknown().optional(),
})
// Nessun `z.lazy()`: non referenzia se stesso, non c'è bisogno.
const inlineNodeSchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('set'), target: z.string(), value: z.unknown() }),
    z.strictObject({
        type: z.literal('capability'), capability: z.string(), input: z.unknown(),
        target: z.string().optional(), retry: retryPolicySchema.optional(), compensation: compensationSchema.optional(),
    }),
    z.strictObject({
        type: z.literal('llm'), op: llmOp, input: z.unknown(), target: z.string(),
        requirements: modelRequirementsSchema.optional(),
    }),
])
const nodeSchema = z.discriminatedUnion('type', [
    z.strictObject({ id: z.string(), type: z.literal('set'), target: z.string(), value: z.unknown(), next: z.string() }),
    z.strictObject({
        id: z.string(), type: z.literal('capability'), capability: z.string(), input: z.unknown(),
        target: z.string().optional(), retry: retryPolicySchema.optional(), compensation: compensationSchema.optional(), next: z.string(),
    }),
    z.strictObject({
        id: z.string(), type: z.literal('llm'), op: llmOp, input: z.unknown(), target: z.string(),
        requirements: modelRequirementsSchema.optional(), next: z.string(),
    }),
    z.strictObject({ id: z.string(), type: z.literal('if'), condition: conditionSchema, then: z.string(), else: z.string() }),
    // `body` usa `inlineNodeSchema` (già definito sopra, mai se stesso): un
    // foreach non può contenere un altro foreach in questo schema — la
    // stessa forma di ogni manifest scritto a mano visto finora (nessuno
    // dei sei candidati di Fase 8 annidava un loop dentro l'altro).
    z.strictObject({
        id: z.string(), type: z.literal('foreach'), source: z.unknown(), itemVar: z.string(),
        indexVar: z.string().optional(), maxItems: z.number(), body: z.array(inlineNodeSchema), next: z.string(),
    }),
    z.strictObject({ id: z.string(), type: z.literal('return'), value: z.unknown() }),
    z.strictObject({ id: z.string(), type: z.literal('fail'), code: z.string(), message: z.string() }),
])
const flowSchema = z.strictObject({
    entry: z.string(), maxTransitions: z.number(), nodes: z.array(nodeSchema),
})

const toolCreateInputSchema = z.strictObject({
    id: z.string().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]{2,63}$/)
        .describe('Lowercase slug, e.g. "log-water-intake". Becomes the permanent id.'),
    title: z.string().min(1).max(80).describe('Short human title, e.g. "Log water intake".'),
    description: z.string().min(1).max(400)
        .describe('One sentence explaining what it does — shown on the consent card.'),
    inputSchema: z.strictObject({
        type: z.literal('object'),
        properties: z.record(z.string(), primitiveFieldSchema),
        required: z.array(z.string()).optional(),
    }).optional().describe('Flat named fields the new tool asks for. Omit if none.'),
    flow: flowSchema.describe([
        `The DAG this tool runs. Capabilities: ${CAPABILITY_IDS.join(', ')} — no others.`,
        'Node types: capability (call one id; "input"/"target" are $ref paths like "$.input.x"/"$.state.y"), '
        + 'if (branch, "then"/"else" point elsewhere), foreach (loop a $ref array into "itemVar"), '
        + 'set (write a literal into state), return (end — "value" is the result), fail (end with an error).',
        'Every node has a unique id and "next" to the following node, except if/foreach (then/else, or loop back via next) and return/fail (end the flow).',
        'llm nodes are accepted but will fail today (no model runtime wired yet) — avoid them unless asked for explicitly.',
    ].join(' ')),
})

function readableIssues(diagnostics: ReadonlyArray<{ level: string; code: string; path: string; message: string }>): string {
    return diagnostics
        .filter((entry) => entry.level === 'error')
        .map((entry) => `${entry.path}: ${entry.message} (${entry.code})`)
        .join('; ')
}

export function createTalosForgeCreateTool(): TalosToolDefinition<never> {
    return defineTalosTool({
        name: 'tool_create',
        title: 'Create a custom tool',
        description: [
            'Create a brand-new tool that TALOS can call from now on, described in plain terms instead of hand-written JSON.',
            'Use this when the user asks for a repeatable action that no existing tool covers — "every time I say X, do Y and Z" — not for a one-off request.',
            `It can only chain together the built-in capabilities already available: ${CAPABILITY_IDS.join(', ')}. It cannot reach the network, run arbitrary code, or call an external API.`,
            'The created tool is installed but stays DISABLED until the user turns it on, exactly like one imported by hand — this call only proposes it.',
        ].join(' '),
        action: 'write',
        input: toolCreateInputSchema,
        async run(input) {
            const manifest: TalosLocalToolManifestV1 = {
                schema: 'talos.local-tool.v1',
                id: input.id,
                version: 1,
                title: input.title,
                description: input.description,
                createdAt: new Date().toISOString(),
                parentVersion: null,
                execution: 'declarative-flow',
                installScope: 'device',
                // ⛔ Fase 8/vincolo del piano, invariato: nessun tool forgiato
                // raggiunge la rete finché il Forge non ha un resolver di
                // credenziali vero. Un tool creato da qui non fa eccezione.
                network: { mode: 'forbidden', domains: [] },
                credentialRequirements: [],
                inputSchema: input.inputSchema,
                flow: input.flow,
            }
            const validazione = validateTalosLocalTool(manifest)
            if (!validazione.ok) {
                return {
                    ok: false,
                    content: `That tool could not be created: ${readableIssues(validazione.diagnostics) || 'the manifest is invalid'}.`,
                    evidence: { error_code: 'TALOS_FORGE_CREATE_INVALID', diagnostics: validazione.diagnostics },
                }
            }
            try {
                await installForgeTool(manifest)
            } catch (failure) {
                const code = failure instanceof Error ? failure.message : String(failure)
                const spoken = code === 'TALOS_FORGE_REGISTRY_FULL'
                    ? 'the tool registry on this device is full — remove an unused tool first'
                    : code === 'TALOS_FORGE_VERSION_NOT_NEWER'
                        ? `a tool with id "${manifest.id}" already exists — pick a different id`
                        : 'the tool could not be saved on this device'
                return {
                    ok: false,
                    content: `That tool could not be created: ${spoken}.`,
                    evidence: { error_code: code },
                }
            }
            return {
                ok: true,
                content: `Created "${manifest.title}" — it stays off until the user enables it in Tool Forge.`,
                evidence: { id: manifest.id, title: manifest.title, capabilities: validazione.capabilities, risk: validazione.risk },
            }
        },
    }) as TalosToolDefinition<never>
}
