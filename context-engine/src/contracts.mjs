import { z } from 'zod';

export class ContextEngineError extends Error {
  constructor(message, code = 'CTX_INVALID_INPUT', details) {
    super(message); this.name = 'ContextEngineError'; this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const id = z.string().min(1).max(256);
const text = z.string().refine(value => value.trim().length > 0, 'Testo vuoto');
const revision = z.number().int().nonnegative();
const date = z.iso.datetime({ offset: true });
const model = z.object({ provider: id, model: id }).catchall(z.json());
const toolCall = z.object({ id, type: z.literal('function'), function: z.object({ name: id, arguments: z.string() }).catchall(z.json()) }).catchall(z.json());
const message = z.object({ role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']), content: z.json().optional(), tool_call_id: id.optional(), tool_calls: z.array(toolCall).optional() }).catchall(z.json()).superRefine((value, ctx) => {
  if (value.role === 'tool' && !value.tool_call_id) ctx.addIssue({ code: 'custom', path: ['tool_call_id'], message: 'Identità della chiamata mancante' });
});

export const ContextRecordV1 = z.strictObject({ schema: z.literal('talos.context.record.v1').optional(), id, sessionId: id.optional(), sequence: revision.optional(), message, createdAt: date, origin: z.string().optional(), assetRefs: z.array(id).default([]), sha256: z.string().regex(/^[a-f0-9]{64}$/u).optional() });
export const ContextSettingsV1 = z.strictObject({
  auto: z.boolean().default(true),
  model: z.discriminatedUnion('mode', [z.strictObject({ mode: z.literal('follow-session') }), z.strictObject({ mode: z.literal('explicit'), provider: id, model: id })]).default({ mode: 'follow-session' }),
  triggerRatio: z.number().gt(0).lt(1).default(0.75), targetRatio: z.number().gt(0).lt(1).default(0.55),
  retainRecentTurns: z.number().int().min(0).max(100).default(2), focus: z.string().max(8000).default(''),
  nativeMode: z.enum(['off', 'qualified']).default('off'), semanticSearch: z.boolean().default(true),
}).refine(value => value.targetRatio < value.triggerRatio, { message: 'Obiettivo inferiore alla soglia di avvio richiesto', path: ['targetRatio'] });

export const ContextSourceRefV1 = z.strictObject({ recordId: id, quote: text, start: revision.optional(), end: revision.optional() });
export const ContextSummaryV1 = z.strictObject({ schema: z.literal('talos.context.summary.v1'), text, goal: text, decisions: z.array(z.string()), constraints: z.array(z.string()), completed: z.array(z.string()), pending: z.array(z.string()), resources: z.array(z.string()), sources: z.array(ContextSourceRefV1) });
export const TokenMeasurementV1 = z.strictObject({ schema: z.literal('talos.context.tokens.v1'), inputTokens: revision, windowTokens: z.number().int().positive(), responseReserve: revision, method: z.enum(['runtime', 'provider', 'heuristic']), exact: z.boolean(), requestHash: z.string(), provider: id, model: id, estimatedMarginTokens: revision.optional() }).refine(value => value.method !== 'heuristic' || !value.exact, 'La stima euristica non è esatta');
export const ContextVersionV1 = z.strictObject({ schema: z.literal('talos.context.version.v1'), id, sessionId: id, coveredThrough: revision, sourceIds: z.array(id), sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), summary: ContextSummaryV1, activeMessages: z.array(message), model, measurement: TokenMeasurementV1, createdAt: date, restoredFrom: id.optional() });
export const ContextJobV1 = z.strictObject({ schema: z.literal('talos.context.job.v1'), id, sessionId: id, idempotencyKey: id, requestFingerprint: z.string(), kind: z.enum(['compact', 'regenerate', 'restore']), state: z.enum(['queued', 'preparing', 'summarizing', 'validating', 'ready', 'committed', 'paused', 'cancelled', 'failed']), baseRevision: revision, baseStateRevision: revision, coveredThrough: revision, model, createdAt: date, updatedAt: date, completedSegments: z.array(z.json()), progress: z.strictObject({ completed: revision, total: revision, phase: z.string() }), error: z.strictObject({ code: id, message: z.string() }).optional(), versionId: id.optional() });
export const ContextEventV1 = z.strictObject({ schema: z.literal('talos.context.event.v1'), id, sessionId: id, jobId: id.optional(), versionId: id.optional(), kind: id, state: z.string().optional(), createdAt: date, payload: z.json() });
export const ContextSnapshotV1 = z.object({ schema: z.literal('talos.context.snapshot.v1'), sessionId: id, revision, stateRevision: revision, headSequence: revision, settings: ContextSettingsV1, metadata: z.json(), activeVersion: ContextVersionV1.nullable(), facts: z.array(z.json()), jobs: z.array(ContextJobV1) }).catchall(z.json());

function parse(schema, value, label) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ContextEngineError(`${label} non valido.`, 'CTX_INVALID_INPUT', result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })));
  return result.data;
}
export function parseContextRecord(value) { return parse(ContextRecordV1, value, 'Messaggio'); }
export function parseContextSettings(value) { return parse(ContextSettingsV1, value, 'Impostazioni'); }
export function parseContextSummary(value) { return parse(ContextSummaryV1, value, 'Sintesi'); }
