import { z } from 'zod';
export const BrowserContractVersions = {
    task: 'talos.browser.task.v1',
    intent: 'talos.browser.intent.v1',
    action: 'talos.browser.action.v1',
    artifact: 'talos.browser.artifact.v1',
    evidence: 'talos.browser.evidence.v1',
    checkpoint: 'talos.browser.checkpoint.v1',
    capabilities: 'talos.browser.capabilities.v1',
    lease: 'talos.browser.lease.v1',
    workerProtocol: 'talos.browser.worker.v2',
};
const IdentifierSchema = z.union([z.uuid(), z.ulid()]);
const TimestampSchema = z.iso.datetime({ offset: true });
const JsonSafeIntegerSchema = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
const PositiveJsonSafeIntegerSchema = z.int().min(1).max(Number.MAX_SAFE_INTEGER);
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const JsonValueSchema = z.lazy(() => z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
]));
const CanonicalJsonObjectSchema = z.record(z.string(), JsonValueSchema);
const BrowserTaskStatusSchema = z.enum([
    'created',
    'planning',
    'ready',
    'running',
    'waiting_user',
    'recovering',
    'completed',
    'failed',
    'cancelled',
]);
const BrowserActionKindSchema = z.enum([
    'navigate',
    'snapshot',
    'screenshot',
    'read',
    'click',
    'type',
    'select',
    'check',
    'scroll',
    'hover',
    'key',
    'drag',
    'upload',
    'download',
    'tab',
    'history',
    'dialog',
]);
const BrowserCapabilitySchema = z.enum([
    'navigate',
    'snapshot',
    'screenshot',
    'read',
    'click',
    'type',
    'select',
    'check',
    'scroll',
    'hover',
    'key',
    'drag',
    'upload',
    'download',
    'tabs',
    'history',
    'dialogs',
    'interactive_frame',
    'semantic_locator',
]);
const BudgetSchema = z.strictObject({
    max_actions: z.int().min(1).max(10_000),
    max_elapsed_ms: z.int().min(1).max(86_400_000),
    max_bytes: z.int().min(1).max(10_737_418_240),
    max_tabs: z.int().min(1).max(128),
    max_domains: z.int().min(1).max(128).optional(),
    max_tokens: z.int().min(1).max(10_000_000).optional(),
});
export const BrowserTaskSchema = z.strictObject({
    schema_version: z.literal(BrowserContractVersions.task),
    task_id: IdentifierSchema,
    conversation_id: IdentifierSchema,
    origin_message_id: IdentifierSchema,
    goal: z.string().min(1).max(8192),
    status: BrowserTaskStatusSchema,
    autonomy_profile: z.enum(['observe', 'assist', 'act', 'custom']),
    budget: BudgetSchema,
    runtime_id: z.string().min(1).max(256).nullable(),
    active_tab_id: z.string().min(1).max(256).nullable(),
    state_version: JsonSafeIntegerSchema,
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});
export const BrowserActionIntentSchema = z.strictObject({
    schema_version: z.literal(BrowserContractVersions.intent),
    intent_id: IdentifierSchema,
    task_id: IdentifierSchema,
    source_message_id: IdentifierSchema,
    kind: BrowserActionKindSchema,
    arguments: CanonicalJsonObjectSchema,
    target_tab_id: z.string().min(1).max(256).nullable(),
    requested_capabilities: z.array(BrowserCapabilitySchema).max(32),
    created_at: TimestampSchema,
}).superRefine((value, context) => {
    if (new Set(value.requested_capabilities).size !== value.requested_capabilities.length) {
        context.addIssue({ code: 'custom', path: ['requested_capabilities'], message: 'Browser capabilities must be unique.' });
    }
});
const BrowserPreconditionSchema = z.strictObject({
    kind: z.string().min(1).max(128),
    value: JsonValueSchema,
});
export const BrowserActionSchema = z.strictObject({
    schema_version: z.literal(BrowserContractVersions.action),
    action_id: IdentifierSchema,
    task_id: IdentifierSchema,
    intent_id: IdentifierSchema,
    sequence: PositiveJsonSafeIntegerSchema,
    kind: BrowserActionKindSchema,
    arguments: CanonicalJsonObjectSchema,
    expected_state_version: JsonSafeIntegerSchema,
    risk: z.enum(['read', 'reversible', 'sensitive', 'irreversible']),
    idempotency_key: Sha256Schema,
    preconditions: z.array(BrowserPreconditionSchema).max(32),
    status: z.enum([
        'proposed',
        'policy_checked',
        'authorized',
        'dispatched',
        'observed',
        'evidence_committed',
        'verified',
        'denied',
        'failed',
        'ambiguous',
    ]),
    created_at: TimestampSchema,
});
export const BrowserArtifactReferenceSchema = z.strictObject({
    schema_version: z.literal(BrowserContractVersions.artifact),
    artifact_id: IdentifierSchema,
    kind: z.enum(['snapshot', 'screenshot', 'download', 'upload', 'trace']),
    mime: z.string().max(255).regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/),
    sha256: Sha256Schema,
    byte_size: JsonSafeIntegerSchema,
    width: z.int().min(1).max(32_768).nullable(),
    height: z.int().min(1).max(32_768).nullable(),
    redaction_status: z.enum(['none', 'redacted', 'quarantined']),
}).superRefine((value, context) => {
    if ((value.width === null) !== (value.height === null)) {
        context.addIssue({ code: 'custom', path: ['width'], message: 'Artifact width and height must both be present or both be null.' });
    }
});
const BrowserFrameSchema = z.strictObject({
    frame_id: z.string().min(1).max(256),
    viewport_width: z.int().min(1).max(32_768),
    viewport_height: z.int().min(1).max(32_768),
    device_pixel_ratio: z.number().positive().max(16),
    scroll_x: z.number().min(0).max(1_000_000_000),
    scroll_y: z.number().min(0).max(1_000_000_000),
});
const BrowserClaimSchema = z.strictObject({
    claim_id: z.string().min(1).max(256),
    kind: z.string().min(1).max(128),
    value: z.string().max(16_384),
    source_artifact_id: IdentifierSchema,
});
export const BrowserEvidenceBundleSchema = z.strictObject({
    schema_version: z.literal(BrowserContractVersions.evidence),
    evidence_id: IdentifierSchema,
    task_id: IdentifierSchema,
    action_id: IdentifierSchema,
    worker_state_version: JsonSafeIntegerSchema,
    url: z.url().max(8192).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
    title: z.string().max(4096),
    captured_at: TimestampSchema,
    frame: BrowserFrameSchema,
    snapshot_artifact_id: IdentifierSchema.nullable(),
    screenshot_artifact_id: IdentifierSchema.nullable(),
    before_evidence_id: IdentifierSchema.nullable(),
    integrity_sha256: Sha256Schema,
    claims: z.array(BrowserClaimSchema).max(1000),
}).superRefine((value, context) => {
    if (value.snapshot_artifact_id === null && value.screenshot_artifact_id === null && value.claims.length === 0) {
        context.addIssue({ code: 'custom', message: 'Evidence requires an artifact or at least one claim.' });
    }
});
const BrowserTabSchema = z.strictObject({
    tab_id: z.string().min(1).max(256),
    url: z.url().max(8192).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
    title: z.string().max(4096),
    is_active: z.boolean(),
});
export const BrowserCheckpointSchema = z.strictObject({
    schema_version: z.literal(BrowserContractVersions.checkpoint),
    checkpoint_id: IdentifierSchema,
    task_id: IdentifierSchema,
    task_state_version: JsonSafeIntegerSchema,
    task_status: BrowserTaskStatusSchema,
    tab_inventory: z.array(BrowserTabSchema).max(128),
    budget: BudgetSchema,
    action_frontier: z.array(IdentifierSchema).max(10_000),
    evidence_frontier: z.array(IdentifierSchema).max(10_000),
    runtime_reconciliation_token: z.string().min(1).max(1024).nullable(),
    created_at: TimestampSchema,
}).superRefine((value, context) => {
    if (value.tab_inventory.filter((tab) => tab.is_active).length > 1) {
        context.addIssue({ code: 'custom', path: ['tab_inventory'], message: 'At most one Browser tab may be active.' });
    }
    if (new Set(value.action_frontier).size !== value.action_frontier.length) {
        context.addIssue({ code: 'custom', path: ['action_frontier'], message: 'Action frontier identifiers must be unique.' });
    }
    if (new Set(value.evidence_frontier).size !== value.evidence_frontier.length) {
        context.addIssue({ code: 'custom', path: ['evidence_frontier'], message: 'Evidence frontier identifiers must be unique.' });
    }
});
export const BrowserCapabilityManifestSchema = z.strictObject({
    schema_version: z.literal(BrowserContractVersions.capabilities),
    protocol_version: z.literal(BrowserContractVersions.workerProtocol),
    adapter_name: z.string().min(1).max(128),
    adapter_version: z.string().min(1).max(128),
    capabilities: z.array(BrowserCapabilitySchema).max(32),
    limits: z.strictObject({
        max_tabs: z.int().min(1).max(128),
        max_viewport_width: z.int().min(1).max(32_768),
        max_viewport_height: z.int().min(1).max(32_768),
        max_artifact_bytes: z.int().min(1).max(10_737_418_240),
    }),
    degraded_reason: z.string().min(1).max(1024).nullable(),
}).superRefine((value, context) => {
    if (new Set(value.capabilities).size !== value.capabilities.length) {
        context.addIssue({ code: 'custom', path: ['capabilities'], message: 'Browser capabilities must be unique.' });
    }
});
export const BrowserSessionLeaseSchema = z.strictObject({
    schema_version: z.literal(BrowserContractVersions.lease),
    lease_id: IdentifierSchema,
    task_id: IdentifierSchema,
    owner_type: z.enum(['model', 'human', 'system']),
    owner_id: z.string().min(1).max(256),
    fencing_token: z.string().min(1).max(256),
    status: z.enum(['active', 'released', 'expired']),
    acquired_at: TimestampSchema,
    expires_at: TimestampSchema,
    released_at: TimestampSchema.nullable(),
}).superRefine((value, context) => {
    if (Date.parse(value.expires_at) <= Date.parse(value.acquired_at)) {
        context.addIssue({ code: 'custom', path: ['expires_at'], message: 'Lease expiry must follow acquisition.' });
    }
    if ((value.status === 'released') !== (value.released_at !== null)) {
        context.addIssue({ code: 'custom', path: ['released_at'], message: 'Lease released_at must match released status.' });
    }
    if (value.released_at !== null && Date.parse(value.released_at) < Date.parse(value.acquired_at)) {
        context.addIssue({ code: 'custom', path: ['released_at'], message: 'Lease release cannot precede acquisition.' });
    }
});
export const BrowserContractSchemasByVersion = {
    [BrowserContractVersions.task]: BrowserTaskSchema,
    [BrowserContractVersions.intent]: BrowserActionIntentSchema,
    [BrowserContractVersions.action]: BrowserActionSchema,
    [BrowserContractVersions.artifact]: BrowserArtifactReferenceSchema,
    [BrowserContractVersions.evidence]: BrowserEvidenceBundleSchema,
    [BrowserContractVersions.checkpoint]: BrowserCheckpointSchema,
    [BrowserContractVersions.capabilities]: BrowserCapabilityManifestSchema,
    [BrowserContractVersions.lease]: BrowserSessionLeaseSchema,
};
export function parseBrowserContract(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Browser contract root must be an object.');
    }
    const schemaVersion = Reflect.get(value, 'schema_version');
    if (typeof schemaVersion !== 'string' || BrowserContractSchemasByVersion[schemaVersion] === undefined) {
        throw new Error('Browser contract schema_version is unsupported.');
    }
    return BrowserContractSchemasByVersion[schemaVersion].parse(value);
}
export function verifyBrowserEvidenceAgainstAction(evidence, action) {
    if (evidence.task_id !== action.task_id) {
        throw new Error('Browser evidence task does not match its action.');
    }
    if (evidence.action_id !== action.action_id) {
        throw new Error('Browser evidence action identity does not match.');
    }
    if (evidence.worker_state_version < action.expected_state_version) {
        throw new Error('Browser evidence worker state predates the action expectation.');
    }
    if (!['dispatched', 'observed', 'evidence_committed', 'verified'].includes(action.status)) {
        throw new Error('Browser evidence cannot verify an action that was not dispatched.');
    }
}
//# sourceMappingURL=browserContracts.js.map