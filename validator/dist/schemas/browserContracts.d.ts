import { z } from 'zod';
export declare const BrowserContractVersions: {
    readonly task: "talos.browser.task.v1";
    readonly intent: "talos.browser.intent.v1";
    readonly action: "talos.browser.action.v1";
    readonly artifact: "talos.browser.artifact.v1";
    readonly evidence: "talos.browser.evidence.v1";
    readonly checkpoint: "talos.browser.checkpoint.v1";
    readonly capabilities: "talos.browser.capabilities.v1";
    readonly lease: "talos.browser.lease.v1";
    readonly workerProtocol: "talos.browser.worker.v2";
};
type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export declare const BrowserTaskSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos.browser.task.v1">;
    task_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    conversation_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    origin_message_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    goal: z.ZodString;
    status: z.ZodEnum<{
        created: "created";
        planning: "planning";
        ready: "ready";
        running: "running";
        waiting_user: "waiting_user";
        recovering: "recovering";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
    }>;
    autonomy_profile: z.ZodEnum<{
        custom: "custom";
        observe: "observe";
        assist: "assist";
        act: "act";
    }>;
    budget: z.ZodObject<{
        max_actions: z.ZodInt;
        max_elapsed_ms: z.ZodInt;
        max_bytes: z.ZodInt;
        max_tabs: z.ZodInt;
        max_domains: z.ZodOptional<z.ZodInt>;
        max_tokens: z.ZodOptional<z.ZodInt>;
    }, z.core.$strict>;
    runtime_id: z.ZodNullable<z.ZodString>;
    active_tab_id: z.ZodNullable<z.ZodString>;
    state_version: z.ZodInt;
    created_at: z.ZodISODateTime;
    updated_at: z.ZodISODateTime;
}, z.core.$strict>;
export declare const BrowserActionIntentSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos.browser.intent.v1">;
    intent_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    task_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    source_message_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    kind: z.ZodEnum<{
        type: "type";
        check: "check";
        key: "key";
        snapshot: "snapshot";
        screenshot: "screenshot";
        read: "read";
        navigate: "navigate";
        click: "click";
        select: "select";
        scroll: "scroll";
        hover: "hover";
        drag: "drag";
        upload: "upload";
        download: "download";
        tab: "tab";
        history: "history";
        dialog: "dialog";
    }>;
    arguments: z.ZodRecord<z.ZodString, z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>>;
    target_tab_id: z.ZodNullable<z.ZodString>;
    requested_capabilities: z.ZodArray<z.ZodEnum<{
        type: "type";
        check: "check";
        key: "key";
        snapshot: "snapshot";
        screenshot: "screenshot";
        read: "read";
        navigate: "navigate";
        click: "click";
        select: "select";
        scroll: "scroll";
        hover: "hover";
        drag: "drag";
        upload: "upload";
        download: "download";
        history: "history";
        tabs: "tabs";
        dialogs: "dialogs";
        interactive_frame: "interactive_frame";
        semantic_locator: "semantic_locator";
    }>>;
    created_at: z.ZodISODateTime;
}, z.core.$strict>;
export declare const BrowserActionSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos.browser.action.v1">;
    action_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    task_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    intent_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    sequence: z.ZodInt;
    kind: z.ZodEnum<{
        type: "type";
        check: "check";
        key: "key";
        snapshot: "snapshot";
        screenshot: "screenshot";
        read: "read";
        navigate: "navigate";
        click: "click";
        select: "select";
        scroll: "scroll";
        hover: "hover";
        drag: "drag";
        upload: "upload";
        download: "download";
        tab: "tab";
        history: "history";
        dialog: "dialog";
    }>;
    arguments: z.ZodRecord<z.ZodString, z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>>;
    expected_state_version: z.ZodInt;
    risk: z.ZodEnum<{
        read: "read";
        reversible: "reversible";
        sensitive: "sensitive";
        irreversible: "irreversible";
    }>;
    idempotency_key: z.ZodString;
    preconditions: z.ZodArray<z.ZodObject<{
        kind: z.ZodString;
        value: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    }, z.core.$strict>>;
    status: z.ZodEnum<{
        failed: "failed";
        proposed: "proposed";
        policy_checked: "policy_checked";
        authorized: "authorized";
        dispatched: "dispatched";
        observed: "observed";
        evidence_committed: "evidence_committed";
        verified: "verified";
        denied: "denied";
        ambiguous: "ambiguous";
    }>;
    created_at: z.ZodISODateTime;
}, z.core.$strict>;
export declare const BrowserArtifactReferenceSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos.browser.artifact.v1">;
    artifact_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    kind: z.ZodEnum<{
        snapshot: "snapshot";
        screenshot: "screenshot";
        trace: "trace";
        upload: "upload";
        download: "download";
    }>;
    mime: z.ZodString;
    sha256: z.ZodString;
    byte_size: z.ZodInt;
    width: z.ZodNullable<z.ZodInt>;
    height: z.ZodNullable<z.ZodInt>;
    redaction_status: z.ZodEnum<{
        none: "none";
        redacted: "redacted";
        quarantined: "quarantined";
    }>;
}, z.core.$strict>;
export declare const BrowserEvidenceBundleSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos.browser.evidence.v1">;
    evidence_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    task_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    action_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    worker_state_version: z.ZodInt;
    url: z.ZodURL;
    title: z.ZodString;
    captured_at: z.ZodISODateTime;
    frame: z.ZodObject<{
        frame_id: z.ZodString;
        viewport_width: z.ZodInt;
        viewport_height: z.ZodInt;
        device_pixel_ratio: z.ZodNumber;
        scroll_x: z.ZodNumber;
        scroll_y: z.ZodNumber;
    }, z.core.$strict>;
    snapshot_artifact_id: z.ZodNullable<z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>>;
    screenshot_artifact_id: z.ZodNullable<z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>>;
    before_evidence_id: z.ZodNullable<z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>>;
    integrity_sha256: z.ZodString;
    claims: z.ZodArray<z.ZodObject<{
        claim_id: z.ZodString;
        kind: z.ZodString;
        value: z.ZodString;
        source_artifact_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const BrowserCheckpointSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos.browser.checkpoint.v1">;
    checkpoint_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    task_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    task_state_version: z.ZodInt;
    task_status: z.ZodEnum<{
        created: "created";
        planning: "planning";
        ready: "ready";
        running: "running";
        waiting_user: "waiting_user";
        recovering: "recovering";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
    }>;
    tab_inventory: z.ZodArray<z.ZodObject<{
        tab_id: z.ZodString;
        url: z.ZodURL;
        title: z.ZodString;
        is_active: z.ZodBoolean;
    }, z.core.$strict>>;
    budget: z.ZodObject<{
        max_actions: z.ZodInt;
        max_elapsed_ms: z.ZodInt;
        max_bytes: z.ZodInt;
        max_tabs: z.ZodInt;
        max_domains: z.ZodOptional<z.ZodInt>;
        max_tokens: z.ZodOptional<z.ZodInt>;
    }, z.core.$strict>;
    action_frontier: z.ZodArray<z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>>;
    evidence_frontier: z.ZodArray<z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>>;
    runtime_reconciliation_token: z.ZodNullable<z.ZodString>;
    created_at: z.ZodISODateTime;
}, z.core.$strict>;
export declare const BrowserCapabilityManifestSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos.browser.capabilities.v1">;
    protocol_version: z.ZodLiteral<"talos.browser.worker.v2">;
    adapter_name: z.ZodString;
    adapter_version: z.ZodString;
    capabilities: z.ZodArray<z.ZodEnum<{
        type: "type";
        check: "check";
        key: "key";
        snapshot: "snapshot";
        screenshot: "screenshot";
        read: "read";
        navigate: "navigate";
        click: "click";
        select: "select";
        scroll: "scroll";
        hover: "hover";
        drag: "drag";
        upload: "upload";
        download: "download";
        history: "history";
        tabs: "tabs";
        dialogs: "dialogs";
        interactive_frame: "interactive_frame";
        semantic_locator: "semantic_locator";
    }>>;
    limits: z.ZodObject<{
        max_tabs: z.ZodInt;
        max_viewport_width: z.ZodInt;
        max_viewport_height: z.ZodInt;
        max_artifact_bytes: z.ZodInt;
    }, z.core.$strict>;
    degraded_reason: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export declare const BrowserSessionLeaseSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos.browser.lease.v1">;
    lease_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    task_id: z.ZodUnion<readonly [z.ZodUUID, z.ZodULID]>;
    owner_type: z.ZodEnum<{
        model: "model";
        human: "human";
        system: "system";
    }>;
    owner_id: z.ZodString;
    fencing_token: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        released: "released";
        expired: "expired";
    }>;
    acquired_at: z.ZodISODateTime;
    expires_at: z.ZodISODateTime;
    released_at: z.ZodNullable<z.ZodISODateTime>;
}, z.core.$strict>;
export declare const BrowserContractSchemasByVersion: Record<string, z.ZodType>;
export declare function parseBrowserContract(value: unknown): unknown;
export type BrowserAction = z.infer<typeof BrowserActionSchema>;
export type BrowserEvidenceBundle = z.infer<typeof BrowserEvidenceBundleSchema>;
export declare function verifyBrowserEvidenceAgainstAction(evidence: BrowserEvidenceBundle, action: BrowserAction): void;
export type BrowserTask = z.infer<typeof BrowserTaskSchema>;
export type BrowserActionIntent = z.infer<typeof BrowserActionIntentSchema>;
export type BrowserArtifactReference = z.infer<typeof BrowserArtifactReferenceSchema>;
export type BrowserCheckpoint = z.infer<typeof BrowserCheckpointSchema>;
export type BrowserCapabilityManifest = z.infer<typeof BrowserCapabilityManifestSchema>;
export type BrowserSessionLease = z.infer<typeof BrowserSessionLeaseSchema>;
export {};
//# sourceMappingURL=browserContracts.d.ts.map