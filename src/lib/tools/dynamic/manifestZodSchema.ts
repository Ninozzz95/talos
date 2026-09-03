import { z } from 'zod'
import type { ForgeInlineNode, ForgeNode, JsonSchemaSubset, TalosLocalToolManifestV1 } from './contracts'

/**
 * ⛔⛔ Owner 2026-08-27 — parsing strutturale PRIMA, semantico dopo.
 *
 * `validator.ts` (prima di questo file) leggeva campi nidificati assumendo
 * la forma dichiarata da `contracts.ts` — un tipo TypeScript, che sparisce
 * a compile-time e non protegge niente da un JSON arrivato da fuori (un
 * `.talostool` importato, o un manifest scritto a mano). Due bug
 * riprodotti a mano lo confermano:
 *
 *   - `requirement.outboundScope` mancante ⇒ `for (const domain of
 *     requirement.outboundScope)` lanciava `TypeError: undefined is not
 *     iterable`, non un diagnostico.
 *   - `network.domains` non-array (es. una stringa) ⇒ nessun crash, ma
 *     `"evil.com".entries()` itera CARATTERI come se fossero domini — un
 *     falso negativo silenzioso, peggio di un crash.
 *
 * Ricerca 2026: ajv gira in strict mode di default proprio per questo
 * (fallisce sulla compilazione invece di ignorare in silenzio); Zod
 * `.strict()`/`z.strictObject()` scarta le chiavi non dichiarate, incluse
 * `__proto__`/`constructor` — la stessa difesa allowlist di `expr.ts`,
 * applicata qui all'INTERO manifest, non solo ai path.
 *
 * Questo schema PARSA la forma. Non conosce ancora il significato (un
 * `network.mode: 'forbidden'` con `domains` non vuoto resta un errore
 * SEMANTICO, controllato da `validator.ts` dopo, non qui) — le due fasi
 * restano separate di proposito: uno schema che provasse a fare entrambe
 * le cose diventerebbe illeggibile, e la struttura sbagliata di un JSON
 * esterno va sempre rifiutata per prima.
 */

const forgeModelRequirementsSchema = z.strictObject({
    structuredOutput: z.boolean().optional(),
    minContext: z.number().optional(),
    privacy: z.enum(['local-only', 'local-preferred', 'remote-allowed']).optional(),
    reasoning: z.enum(['off', 'low', 'medium', 'high']).optional(),
    maxInputTokens: z.number().optional(),
    maxOutputTokens: z.number().optional(),
    fallback: z.strictObject({ allowed: z.boolean() }).optional(),
})

const forgeCredentialRequirementSchema = z.strictObject({
    id: z.string(),
    kind: z.enum(['api_profile', 'oauth_profile', 'oauth_or_api_profile']),
    purpose: z.string(),
    outboundScope: z.array(z.string()),
})

const forgeRetryPolicySchema = z.strictObject({
    maxAttempts: z.number(),
    backoffMs: z.number().optional(),
})

const forgeCompensationSchema = z.strictObject({
    capability: z.string(),
    input: z.unknown(),
})

const llmOp = z.enum(['classify', 'extract', 'summarize', 'generate', 'rank'])

/**
 * Ogni schema ricorsivo qui sotto è annotato col tipo REALE di
 * `contracts.ts` (`z.ZodType<ForgeNode>` ecc.), non `z.ZodType<unknown>`:
 * se lo schema Zod e l'interfaccia TypeScript divergessero, l'assegnazione
 * non compilerebbe più — un controllo a compile-time che le due
 * rappresentazioni restino d'accordo, invece di un `as` che le farebbe
 * solo sembrare d'accordo.
 */
const forgeInlineNodeSchema: z.ZodType<ForgeInlineNode> = z.lazy(() => z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('set'), target: z.string(), value: z.unknown() }),
    z.strictObject({
        type: z.literal('capability'), capability: z.string(), input: z.unknown(),
        target: z.string().optional(), retry: forgeRetryPolicySchema.optional(),
        compensation: forgeCompensationSchema.optional(),
    }),
    z.strictObject({
        type: z.literal('llm'), op: llmOp, input: z.unknown(), target: z.string(),
        requirements: forgeModelRequirementsSchema.optional(),
        // Riferimento a `jsonSchemaSubsetSchema`, dichiarato più sotto nel
        // file: sicuro perché siamo già dentro la closure `z.lazy()` di
        // `forgeInlineNodeSchema` — esegue solo al primo parse vero, non al
        // caricamento del modulo, quando il binding è già inizializzato.
        outputSchema: jsonSchemaSubsetSchema.optional(),
    }),
]))

const forgeConditionSchema = z.strictObject({
    left: z.unknown(),
    op: z.enum(['eq', 'neq', 'truthy', 'exists', 'contains', 'gt', 'gte', 'lt', 'lte']),
    right: z.unknown().optional(),
})

const forgeNodeSchema: z.ZodType<ForgeNode> = z.lazy(() => z.discriminatedUnion('type', [
    z.strictObject({ id: z.string(), type: z.literal('set'), target: z.string(), value: z.unknown(), next: z.string() }),
    z.strictObject({
        id: z.string(), type: z.literal('capability'), capability: z.string(), input: z.unknown(),
        target: z.string().optional(), retry: forgeRetryPolicySchema.optional(),
        compensation: forgeCompensationSchema.optional(), next: z.string(),
    }),
    z.strictObject({
        id: z.string(), type: z.literal('llm'), op: llmOp, input: z.unknown(), target: z.string(),
        requirements: forgeModelRequirementsSchema.optional(),
        outputSchema: jsonSchemaSubsetSchema.optional(), next: z.string(),
    }),
    z.strictObject({ id: z.string(), type: z.literal('if'), condition: forgeConditionSchema, then: z.string(), else: z.string() }),
    z.strictObject({
        id: z.string(), type: z.literal('foreach'), source: z.unknown(), itemVar: z.string(),
        indexVar: z.string().optional(), maxItems: z.number(), body: z.array(forgeInlineNodeSchema), next: z.string(),
    }),
    z.strictObject({ id: z.string(), type: z.literal('return'), value: z.unknown() }),
    z.strictObject({ id: z.string(), type: z.literal('fail'), code: z.string(), message: z.string() }),
]))

// ⛔ 2026-08-27 — esportati (erano privati al modulo): `forgeCreateTool.ts`
// li riusa TALI E QUALI per lo schema d'ingresso del tool che crea tool,
// invece di duplicare la grammatica del DSL una seconda volta. Se il DSL
// cambia, cambia in un solo posto e i due schemi non possono divergere.
export const forgeFlowSchema = z.strictObject({
    entry: z.string(),
    maxTransitions: z.number(),
    nodes: z.array(forgeNodeSchema),
})

export const jsonSchemaSubsetSchema: z.ZodType<JsonSchemaSubset> = z.lazy(() => z.strictObject({
    type: z.enum(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']).optional(),
    properties: z.record(z.string(), jsonSchemaSubsetSchema).optional(),
    required: z.array(z.string()).optional(),
    items: jsonSchemaSubsetSchema.optional(),
    enum: z.array(z.unknown()).optional(),
    additionalProperties: z.boolean().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
}))

const forgeTriggerSchema = z.strictObject({
    id: z.string(),
    type: z.enum(['manual', 'schedule', 'app-resume', 'task-changed']),
    enabled: z.boolean(),
    schedule: z.union([
        z.strictObject({ kind: z.literal('daily'), hour: z.number(), minute: z.number() }),
        z.strictObject({ kind: z.literal('interval'), minutes: z.number() }),
    ]).optional(),
})

const forgeResultCardSpecSchema = z.strictObject({
    kind: z.literal('summary'),
    title: z.string(),
    primaryRef: z.string().optional(),
    detailRefs: z.array(z.string()).optional(),
})

export const talosLocalToolManifestV1Schema: z.ZodType<TalosLocalToolManifestV1> = z.strictObject({
    schema: z.literal('talos.local-tool.v1'),
    id: z.string(),
    version: z.number(),
    title: z.string(),
    description: z.string(),
    createdAt: z.string(),
    parentVersion: z.number().nullable(),
    execution: z.literal('declarative-flow'),
    installScope: z.literal('device'),
    network: z.strictObject({ mode: z.enum(['forbidden', 'allowlist']), domains: z.array(z.string()) }),
    credentialRequirements: z.array(forgeCredentialRequirementSchema),
    modelDefaults: forgeModelRequirementsSchema.optional(),
    inputSchema: jsonSchemaSubsetSchema.optional(),
    outputSchema: jsonSchemaSubsetSchema.optional(),
    flow: forgeFlowSchema,
    state: z.strictObject({
        schemaVersion: z.number(),
        maxBytes: z.number(),
        fields: z.record(z.string(), jsonSchemaSubsetSchema),
    }).optional(),
    triggers: z.array(forgeTriggerSchema).optional(),
    ui: forgeResultCardSpecSchema.optional(),
})
