export type NodeStatus =
    | 'PENDING'
    | 'VALIDATED'
    | 'RUNNING'
    | 'SUCCESS'
    | 'FAILED'
    | 'BLOCKED_BY_DEPENDENCY'
    | 'RETRYING'
    | 'SKIPPED'
    | 'PRUNED'

export type RunStatus =
    | 'queued'
    | 'planning'
    | 'validating'
    | 'running'
    | 'blocked'
    | 'succeeded'
    | 'failed'
    | 'cancelled'

export type TalosMessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type TalosSessionSurface = 'chat' | 'browse'
export type TalosChatBubbleScale = 'xcompact' | 'compact' | 'balanced' | 'expanded'
export type TalosMessageStyle = 'sections' | 'bubbles'
export type TalosMobileWindowPresentation = 'drawer' | 'fullscreen'
export type TalosChatLayoutPreferences = {
    bubble_scale: TalosChatBubbleScale
    message_style: TalosMessageStyle
    mobile_window_presentation: TalosMobileWindowPresentation
}
export type TalosBrowserModeStatus = 'disconnected' | 'starting' | 'ready' | 'active' | 'awaiting_approval' | 'recovery_required' | 'stopped' | 'failed'
export type TalosBrowserMode = {
    enabled: boolean
    session_id: string | null
    status: TalosBrowserModeStatus
    capabilities: string[]
}
export type TalosBrowserTaskStatus =
    | 'created'
    | 'planning'
    | 'ready'
    | 'running'
    | 'waiting_user'
    | 'recovering'
    | 'completed'
    | 'failed'
    | 'cancelled'
export type TalosBrowserTask = {
    id: string
    talos_session_id: string
    origin_message_id: string | null
    browser_session_id: string | null
    runtime_id: string | null
    active_tab_id: string | null
    goal: string
    status: TalosBrowserTaskStatus
    autonomy_profile: 'observe' | 'assist' | 'act' | 'custom' | string
    budget: Record<string, unknown>
    state_version: number
    requested_at: string | null
    started_at: string | null
    completed_at: string | null
    failed_at: string | null
    cancelled_at: string | null
    reconciled_at: string | null
    created_at: string | null
    updated_at: string | null
}
export type TalosBrowserCurrentPage = {
    host: string
    title: string
    url: string
}
export type TalosBrowserActivity = {
    id: string
    operation: 'session_start' | 'navigate' | 'snapshot' | 'screenshot' | 'read' | string
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'denied' | string
    label: string
    run_id: string | null
    browser_session_id: string
    artifact_ids: string[]
    occurred_at: string
}
export type TalosToolApprovalTarget = {
    ref: string
    role: string
    name: string
    visible: boolean
}

export type TalosToolApprovalFile = {
    file_id: string
    name: string
    mime_type: string
    size_bytes: number
    sha256: string
}

type TalosPendingToolApprovalBase = {
    id: string
    turn_id: string
    run_id: string
    status: 'pending' | 'stale'
    actionable: boolean
    stale_reason: string | null
    plan_hash: string
    browser_session_id: string
    snapshot_artifact_id: string
    snapshot_id: string
    state_version: number
    evidence_hash: string
    expected_effect: string
    target: TalosToolApprovalTarget
    url: string | null
    title: string | null
}

export type TalosPendingBrowserClickApproval = TalosPendingToolApprovalBase & {
    tool_name: 'browser_click'
    risk: 'high'
    capability: 'browser.write'
}

export type TalosPendingBrowserFileUploadApproval = TalosPendingToolApprovalBase & {
    tool_name: 'browser_file_upload'
    risk: 'critical'
    capability: 'browser.upload'
    files: TalosToolApprovalFile[]
}

export type TalosPendingToolApproval = TalosPendingBrowserClickApproval | TalosPendingBrowserFileUploadApproval
export type TalosRunMode = 'avm_on' | 'avm_off_direct' | 'tool_agent'
    | 'avm_off'
    | 'verified_execution'
    | 'answer_only'
export type TalosRunEventSeverity = 'debug' | 'info' | 'warning' | 'error'
export type TalosFileStatus =
    | 'uploaded'
    | 'scanned'
    | 'parsed'
    | 'chunked'
    | 'embedded'
    | 'available'
    | 'quarantined'
    | 'failed'

export type TalosFileAuthorityScope = 'file' | 'folder' | 'session' | 'global'
export type TalosFileAuthorityPermission = 'model.read' | 'browser.upload'
export type TalosFileAuthorityStatus = 'active' | 'revoked' | 'expired'

export type TalosFileAuthorityGrantFile = {
    id: string
    original_name: string
    mime_type: string | null
    size_bytes: number
    checksum: string
    status: TalosFileStatus | string
}

export type TalosFileAuthorityGrant = {
    id: string
    scope: TalosFileAuthorityScope
    label: string
    permissions: TalosFileAuthorityPermission[]
    status: TalosFileAuthorityStatus
    talos_session_id: string | null
    files: TalosFileAuthorityGrantFile[]
    expires_at: string | null
    revoked_at: string | null
    last_used_at: string | null
    created_at: string | null
    updated_at: string | null
}

export type TalosSession = {
    id: string
    user_id?: number | null
    title: string
    surface: TalosSessionSurface
    mode: 'answer_only' | 'verified_execution'
    persistence_mode?: 'persistent' | 'temporary'
    active_model_profile_id?: string | null
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosSessionExportFormat = 'json' | 'markdown' | 'context_manifest' | 'benchmark_scenario'

export type TalosSessionExportPayload = {
    schema_version: number
    report_type: string
    export_status: string
    exported_at?: string
    content_type?: string
    content?: string
    benchmark_readiness?: {
        ready: boolean
        missing?: string[]
        scenario?: Record<string, unknown>
    }
    context_manifest?: Record<string, unknown>
    scenario?: Record<string, unknown>
    [key: string]: unknown
}

export type TalosModelProfileStatus = 'untested' | 'healthy' | 'degraded' | 'failed' | 'disabled'

// Canonical reasoning-effort ladder (locked, FV2-06.0 spec §3):
// off < minimal < low < medium < high < xhigh < max.
// `off` is a request-layer concept (send no reasoning param), not a catalog level.
export type TalosEffortLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const TALOS_EFFORT_ORDER: readonly TalosEffortLevel[] = [
    'off',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
] as const

export type TalosModelProfile = {
    id: string
    user_id?: number | null
    provider: 'anthropic' | 'deepseek' | 'gemini' | 'ollama' | 'openai' | 'openrouter'
    model: string
    display_name: string
    base_url?: string | null
    timeout_seconds: number
    status: TalosModelProfileStatus
    capabilities?: Record<string, unknown> | null
    probe_result?: Record<string, unknown> | null
    has_secret: boolean
    effort_levels: string[]
    supports_thinking: boolean
    show_in_composer: boolean
    created_at: string
    updated_at: string
}

export type TalosModelCatalogChatCompatibility = 'supported' | 'unsupported' | 'unknown'
export type TalosModelCatalogLifecycle = 'stable' | 'preview' | 'experimental' | 'deprecated' | 'unknown'

export type TalosProviderModelCatalogCapabilities = {
    text: boolean | null
    vision: boolean | null
    tools: boolean | null
    reasoning: boolean | null
    embeddings: boolean | null
    image_output: boolean | null
    audio_output: boolean | null
}

export type TalosProviderModelCatalogItem = {
    id: string
    display_name: string
    provider: TalosModelProfile['provider']
    owned_by: string | null
    chat_compatibility: TalosModelCatalogChatCompatibility
    capabilities: TalosProviderModelCatalogCapabilities
    context_window: number | null
    max_output_tokens: number | null
    lifecycle: TalosModelCatalogLifecycle
    canonical_slug: string | null
    local_digest: string | null
    metadata: Record<string, unknown>
}

export type TalosProviderModelCatalog = {
    profile_id: string | null
    provider: TalosModelProfile['provider']
    models: TalosProviderModelCatalogItem[]
    complete: boolean
    page_count: number
    fetched_at: string
    warnings: string[]
}

export type TalosModelCatalogFaultCode =
    | 'MODEL_CATALOG_SECRET_MISSING'
    | 'MODEL_CATALOG_AUTH_FAILED'
    | 'MODEL_CATALOG_RATE_LIMITED'
    | 'MODEL_CATALOG_POLICY_BLOCKED'
    | 'MODEL_CATALOG_CONNECTION_FAILED'
    | 'MODEL_CATALOG_CONNECTED_IP_MISMATCH'
    | 'MODEL_CATALOG_REDIRECT_BLOCKED'
    | 'MODEL_CATALOG_RESPONSE_TOO_LARGE'
    | 'MODEL_CATALOG_RESPONSE_INVALID'
    | 'MODEL_CATALOG_PAGINATION_INVALID'
    | 'MODEL_CATALOG_LIMIT_EXCEEDED'

export type TalosModelCatalogFault = {
    code: TalosModelCatalogFaultCode | string
    message: string
    retryable: boolean
    retry_after_seconds: number | null
    provider: TalosModelProfile['provider'] | string
}

export type TalosModelRoutingLane = {
    model_profile_id: string
    role: string
    weight: number
    position: number
    model?: Pick<TalosModelProfile, 'id' | 'display_name' | 'provider' | 'model' | 'status' | 'has_secret'> | null
}

export type TalosModelRoutingProfile = {
    id: string
    user_id?: number | null
    name: string
    task_type: 'chat' | 'agent' | 'search' | 'research'
    status: 'enabled' | 'disabled'
    lanes: TalosModelRoutingLane[]
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosGoogleAccountStatus = 'connected' | 'revoked' | 'error' | string

export type TalosGoogleAccount = {
    id: string
    provider: 'google' | string
    provider_account_id: string
    email?: string | null
    display_name?: string | null
    scopes: string[]
    status: TalosGoogleAccountStatus
    has_access_token?: boolean
    has_refresh_token?: boolean
    token_expires_at?: string | null
    connected_at?: string | null
    last_used_at?: string | null
    last_error?: string | null
    metadata?: Record<string, unknown> | null
    created_at?: string | null
    updated_at?: string | null
}

export type TalosGoogleDriveFile = {
    id: string
    name: string
    mime_type: string
    modified_time?: string | null
    can_download: boolean
    web_view_link?: string | null
    size_bytes?: number | null
}

export type TalosGoogleDriveFilesResponse = {
    files: TalosGoogleDriveFile[]
    next_page_token?: string | null
}

export type TalosGoogleCalendar = {
    id: string
    summary: string
    description?: string | null
    primary: boolean
    selected: boolean
    access_role?: string | null
    timezone?: string | null
}

export type TalosGoogleCalendarListResponse = {
    calendars: TalosGoogleCalendar[]
}

export type TalosGoogleCalendarSyncResponse = {
    calendar_id: string
    synced_count: number
    next_sync_token?: string | null
    events: TalosCalendarDraft[]
}

export type TalosCookbookRuntimeKind = 'ollama' | 'llama_cpp' | 'vllm' | string
export type TalosCookbookRuntimeStatus = 'available' | 'missing' | 'degraded' | 'unknown' | string

export type TalosCookbookGpu = {
    vendor?: string | null
    model?: string | null
    vram_mb?: number | null
    [key: string]: unknown
}

export type TalosCookbookHardwareProfile = {
    id: string
    host_fingerprint?: string | null
    os?: string | null
    cpu_model?: string | null
    cpu_cores?: number | null
    ram_total_mb?: number | null
    ram_free_mb?: number | null
    gpus?: TalosCookbookGpu[]
    runtimes?: Record<string, unknown> | unknown[]
    raw_evidence?: Record<string, unknown> | null
    scanned_at?: string | null
    trust_level?: 'local_evidence' | string
    created_at?: string
    updated_at?: string
}

export type TalosCookbookRuntime = {
    id?: string | null
    kind: TalosCookbookRuntimeKind
    name: string
    status: TalosCookbookRuntimeStatus
    version?: string | null
    executable_path?: string | null
    evidence?: Record<string, unknown> | null
    last_checked_at?: string | null
    created_at?: string
    updated_at?: string
}

export type TalosCookbookModelFit = {
    label: 'Perfect' | 'Good' | 'Borderline' | 'Too heavy' | 'Unknown' | string
    score: number
    reasons: string[]
}

export type TalosCookbookModel = {
    id: string
    provider: string
    model_id: string
    display_name: string
    parameters_b?: number | string | null
    quantization?: string | null
    context_window?: number | null
    runtime_modes: TalosCookbookRuntimeKind[]
    estimated_vram_mb?: number | null
    estimated_ram_mb?: number | null
    tags?: string[]
    source_url?: string | null
    status: 'available' | 'disabled' | 'experimental' | string
    fit?: TalosCookbookModelFit | null
    created_at?: string
    updated_at?: string
}

export type TalosCookbookOverview = {
    profile: TalosCookbookHardwareProfile | null
    runtimes: TalosCookbookRuntime[]
    models: TalosCookbookModel[]
}

export type TalosCookbookScanResponse = {
    profile: TalosCookbookHardwareProfile
    runtimes: TalosCookbookRuntime[]
}

export type TalosCookbookCreateModelPayload = {
    provider: string
    model_id: string
    display_name: string
    parameters_b?: number | null
    quantization?: string | null
    context_window?: number | null
    runtime_modes?: TalosCookbookRuntimeKind[]
    estimated_vram_mb?: number | null
    estimated_ram_mb?: number | null
    tags?: string[]
    source_url?: string | null
    status?: 'available' | 'disabled' | 'experimental' | string
}

export type TalosCookbookPreviewRequest = {
    model_id: string
    runtime: TalosCookbookRuntimeKind
}

export type TalosCookbookCommandPreview = {
    mode: 'dry_run' | string
    action?: 'download' | 'serve' | string
    runtime: TalosCookbookRuntimeKind
    model_id: string
    command?: string | string[] | null
    commands?: string[]
    warnings?: string[]
    executed: boolean
    requires_approval: boolean
    message?: string | null
    [key: string]: unknown
}

export type TalosCookbookDependency = {
    runtime: TalosCookbookRuntimeKind
    name: string
    package_manager: string
    install_hint: string
    supports?: string[]
    detected_status: TalosCookbookRuntimeStatus
    detected_version?: string | null
    evidence?: Record<string, unknown> | unknown[]
    install_allowed: boolean
    required_scope: string
    execution_gate: string
}

export type TalosCookbookDependencyPolicy = {
    default_decision: 'deny' | string
    execution_allowed: boolean
    install_execution_enabled: boolean
    serve_execution_enabled: boolean
    required_scope: string
    preview_scope: string
    plain_commands_are_preview_only: boolean
}

export type TalosCookbookDependencyCatalog = {
    policy: TalosCookbookDependencyPolicy
    dependencies: TalosCookbookDependency[]
}

export type TalosCookbookDependencyPreview = {
    mode: 'dry_run' | string
    runtime: TalosCookbookRuntimeKind
    model_id: string
    executed: boolean
    requires_approval: boolean
    install_allowed: boolean
    policy: TalosCookbookDependencyPolicy
    steps: Array<{
        kind: string
        runtime: TalosCookbookRuntimeKind
        description: string
        read_only: boolean
        executed?: boolean
        model_id?: string
        package_manager?: string
    }>
}

export type TalosMessage = {
    id: string
    session_id: string
    role: TalosMessageRole
    content: string
    model_profile_id?: string | null
    run_id?: string | null
    metadata?: Record<string, unknown> | null
    created_at: string
}

export type TalosBrowserClarificationChoice = {
    index: number
    url: string
    host: string
    label: string
}

export type TalosBrowserFollowUpMetadata = {
    schema_version: 'talos_browser_follow_up_v1'
    operation: 'clarify'
    choices: TalosBrowserClarificationChoice[]
    reason?: string | null
}

export type TalosRun = {
    id: string
    session_id?: string | null
    message_id?: string | null
    context_set_id?: string | null
    benchmark_group_id?: string | null
    mode: TalosRunMode
    status: RunStatus
    model_profile_id?: string | null
    provider?: string | null
    model?: string | null
    prompt_hash: string
    context_hash?: string | null
    started_at?: string | null
    finished_at?: string | null
    completed_at?: string | null
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosRunEvent = {
    id: string
    run_id: string
    sequence: number
    event_type: string
    node_id?: string | null
    severity: TalosRunEventSeverity
    payload: Record<string, unknown>
    created_at: string
}

export type TalosRunReplayStep = {
    sequence: number
    kind: 'trace' | 'fault' | 'worker_execution' | 'recovery' | string
    type: string
    node_id: string
    status_after?: NodeStatus | string | null
    node_statuses: Record<string, NodeStatus | string>
    label: string
    event: Record<string, unknown>
}

export type TalosRunReplay = {
    run_id: string
    controls: string[]
    speeds: string[]
    filters: string[]
    steps: TalosRunReplayStep[]
    final_node_statuses: Record<string, NodeStatus | string>
}

export type TalosRecoveryAction =
    | 'retry_node'
    | 'retry_branch'
    | 'edit_payload_and_retry'
    | 'skip_node'
    | 'mark_resolved'

export type TalosRecoveryRequest = {
    action: TalosRecoveryAction
    node_id: string
    reason?: string | null
    payload?: Record<string, unknown>
    capabilities?: string[]
}

export type TalosRecoveryResponse = {
    run: TalosRun
    events: TalosRunEvent[]
}

export type TalosRunNodeStatus = NodeStatus | 'UNKNOWN'

export type TalosRunNodeSummary = {
    id: string
    label?: string | null
    type?: string | null
    status: TalosRunNodeStatus
    event_count: number
    last_event_type: string
    last_severity: TalosRunEventSeverity
    last_sequence: number
    first_seen_at: string
    last_seen_at: string
    payload: Record<string, unknown>
}

export type TalosFile = {
    id: string
    user_id?: string | null
    original_name: string
    mime_type: string
    size_bytes: number
    checksum: string
    status: TalosFileStatus
    parser?: string | null
    failure_reason?: string | null
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosFileChunk = {
    id: string
    file_id: string
    sequence: number
    content?: string | null
    preview?: string | null
    content_hash?: string | null
    start_offset?: number | null
    end_offset?: number | null
    metadata?: Record<string, unknown> | null
    created_at?: string
    updated_at?: string
}

export type TalosFileWithChunks = TalosFile & {
    chunks: TalosFileChunk[]
}

export type TalosContextSetStatus =
    | 'draft'
    | 'available'
    | 'failed'
    | 'archived'

export type TalosContextSource = {
    id: string
    context_set_id?: string | null
    source_type: 'uploaded_file' | 'file_chunk' | string
    file_id?: string | null
    file_chunk_id?: string | null
    metadata?: Record<string, unknown> | null
    file?: TalosFile | null
    file_chunk?: TalosFileChunk | null
    created_at?: string
    updated_at?: string
}

export type TalosContextSet = {
    id: string
    user_id?: string | number | null
    name: string
    status: TalosContextSetStatus | string
    metadata?: Record<string, unknown> | null
    sources_count?: number
    sources?: TalosContextSource[]
    created_at: string
    updated_at: string
}

export type TalosBenchmarkGroup = {
    id: string
    session_id?: string | null
    source_run_id?: string | null
    name: string
    scenario_ref?: string | null
    scenario_hash?: string | null
    prompt_hash: string
    context_hash?: string | null
    model?: string | null
    evaluator_version: string
    metadata?: Record<string, unknown> | null
    results_count?: number
    results?: TalosBenchmarkResult[]
    created_at: string
    updated_at?: string
}

export type TalosBenchmarkResult = {
    id: string
    benchmark_group_id: string
    mode: 'avm_on' | 'avm_off_direct' | 'tool_agent' | 'model_lane_a' | 'model_lane_b' | 'model_lane_c' | string
    label?: string | null
    status: string
    prompt_hash: string
    context_hash: string
    evaluator_version: string
    metrics: Record<string, unknown>
    raw_report: Record<string, unknown>
    raw_log_path?: string | null
    trace_replayable: boolean
    created_at: string
    updated_at: string
}

export type TalosModelComparisonLane = {
    id: string
    comparison_id: string
    display_alias: string
    position: number
    weight: number
    status: 'queued' | 'running' | 'completed' | 'failed' | string
    response_text?: string | null
    latency_ms?: number | null
    cost?: number | null
    run_id?: string | null
    error_code?: string | null
    error_message?: string | null
    metadata?: Record<string, unknown> | null
    model_profile_id?: string
    model_profile?: Pick<TalosModelProfile, 'id' | 'display_name' | 'provider' | 'model' | 'status'> | null
}

export type TalosModelComparison = {
    id: string
    user_id?: number | null
    prompt: string
    mode: 'blind' | 'parallel' | 'shuffle' | string
    task_type: 'chat' | 'agent' | 'search' | 'research' | string
    blind: boolean
    status: string
    timeout_seconds: number
    winner_lane_id?: string | null
    revealed: boolean
    revealed_at?: string | null
    benchmark_group_id?: string | null
    scorecard?: Record<string, unknown> | null
    metadata?: Record<string, unknown> | null
    lanes: TalosModelComparisonLane[]
    created_at: string
    updated_at: string
}

export type TalosConnectorHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'offline'
export type TalosToolRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type TalosConnector = {
    id: string
    key: string
    display_name: string
    description?: string | null
    is_enabled: boolean
    health_status: TalosConnectorHealthStatus | string
    capabilities?: string[] | Record<string, unknown> | null
    policy?: Record<string, unknown> | null
    health_payload?: Record<string, unknown> | null
    last_checked_at?: string | null
    tools_count?: number
    tools?: TalosTool[]
    created_at: string
    updated_at: string
}

export type TalosTool = {
    id: string
    connector_id: string
    name: string
    display_name: string
    description?: string | null
    input_schema: Record<string, unknown>
    risk_level: TalosToolRiskLevel | string
    capability?: string | null
    policy?: Record<string, unknown> | null
    is_enabled: boolean
    planning_enabled: boolean
    connector?: TalosConnector | null
    created_at: string
    updated_at: string
}

export type TalosToolPlanningContext = {
    source: 'talos_tool_registry' | string
    policy: {
        disabled_tools_excluded: boolean
        disabled_connectors_excluded: boolean
        tool_outputs_are_untrusted: boolean
        [key: string]: unknown
    }
    tools: Array<{
        name: string
        display_name: string
        description?: string | null
        input_schema: Record<string, unknown>
        risk_level: string
        capability?: string | null
        connector?: {
            id?: string | null
            key?: string | null
            display_name?: string | null
            health_status?: string | null
        }
    }>
}

export type TalosMemoryStatus = 'active' | 'disabled' | 'quarantined' | 'rejected'
export type TalosMemoryKind = 'preference' | 'project_fact' | 'procedure' | 'policy_note' | 'rejected'
export type TalosMemoryScopeType = 'global' | 'project' | 'session'

export type TalosMemory = {
    id: string
    user_id?: number | null
    scope_type: TalosMemoryScopeType | string
    scope_id?: string | null
    kind: TalosMemoryKind | string
    status: TalosMemoryStatus | string
    title: string
    content_preview: string
    content?: string
    source?: string | null
    metadata?: Record<string, unknown> | null
    trust_level: 'untrusted' | string
    last_used_at?: string | null
    created_at: string
    updated_at: string
}

export type TalosMemoryRetrievalContext = {
    source: 'talos_memory_registry' | string
    trust_level: 'untrusted' | string
    instruction: string
    memories: TalosMemory[]
}

export type TalosSkillRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type TalosSkillReviewStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'quarantined'
export type TalosSkillEvalStatus = 'not_run' | 'passed' | 'failed'

export type TalosSkill = {
    id: string
    name: string
    display_name: string
    description?: string | null
    trigger?: string | null
    content_preview: string
    content?: string
    input_schema?: Record<string, unknown> | null
    output_schema?: Record<string, unknown> | null
    allowed_tools: string[]
    risk_level: TalosSkillRiskLevel | string
    review_status: TalosSkillReviewStatus | string
    eval_status: TalosSkillEvalStatus | string
    eval_result?: Record<string, unknown> | null
    source_type: 'manual' | 'imported' | string
    is_enabled: boolean
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosSkillPlanningContext = {
    source: 'talos_skill_registry' | string
    policy: Record<string, unknown>
    skills: Array<{
        id: string
        name: string
        display_name: string
        trigger?: string | null
        content: string
        input_schema?: Record<string, unknown> | null
        output_schema?: Record<string, unknown> | null
        allowed_tools: string[]
        risk_level: string
        review_status: string
        eval_status: string
    }>
    excluded_skills?: Array<{
        id: string
        name: string
        display_name: string
        reason: string
        review_status: string
        eval_status: string
        risk_level: string
        source_type: string
    }>
}

export type TalosResearchSourceStatus = 'planned' | 'fetched' | 'failed' | 'skipped'
export type TalosResearchClaimStatus = 'pending' | 'verified' | 'conflicting' | 'blocked_by_source' | 'rejected'
export type TalosResearchReportStatus = 'draft' | 'succeeded' | 'blocked' | 'failed'

export type TalosResearchSource = {
    id: string
    research_report_id: string
    client_id: string
    sequence: number
    source_type: string
    url: string
    title?: string | null
    status: TalosResearchSourceStatus | string
    excerpt?: string | null
    content_hash?: string | null
    file_id?: string | null
    file_chunk_id?: string | null
    failure_reason?: string | null
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosResearchClaim = {
    id: string
    research_report_id: string
    sequence: number
    text: string
    status: TalosResearchClaimStatus | string
    confidence?: string | number | null
    metadata?: Record<string, unknown> | null
    sources?: TalosResearchSource[]
    created_at: string
    updated_at: string
}

export type TalosResearchReport = {
    id: string
    run_id?: string | null
    context_set_id?: string | null
    benchmark_group_id?: string | null
    title: string
    query: string
    status: TalosResearchReportStatus | string
    summary?: string | null
    report_markdown?: string | null
    metadata?: Record<string, unknown> | null
    sources_count?: number | null
    claims_count?: number | null
    sources?: TalosResearchSource[]
    claims?: TalosResearchClaim[]
    artifact?: TalosRunArtifact | null
    created_at: string
    updated_at: string
}

export type TalosRunArtifact = {
    id: string
    run_id: string
    artifact_type: string
    uri: string
    mime_type?: string | null
    metadata?: Record<string, unknown> | null
    run?: TalosRun | null
    created_at: string
    updated_at: string
}

export type TalosBrowserSession = {
    id: string
    talos_session_id: string | null
    status: 'ready' | 'active' | 'closed' | 'expired' | 'failed' | string
    mode: 'read_only' | string
    capabilities: string[]
    state_version?: number
    viewport?: { width: number; height: number }
    policy?: Record<string, unknown> | null
    current_url?: string | null
    current_title?: string | null
    last_screenshot_artifact_id?: string | null
    last_snapshot_artifact_id?: string | null
    expires_at?: string | null
    created_at: string
    updated_at: string
}

export type TalosBrowserArtifact = {
    id: string
    browser_session_id?: string
    worker_capture_id?: string | null
    source_command_id?: string | null
    source_state_version?: number | null
    state_version?: number | null
    trust_boundary?: string | null
    type: 'screenshot' | 'snapshot' | string
    mime?: string | null
    sha256?: string | null
    metadata?: Record<string, unknown> | null
    preview_url?: string
    created_at?: string
}

export type TalosBrowserHmiChallenge = {
    approval_id: string
    request_hash: string
    expires_at: string
    action: {
        category: string
        label: string
        origin: string
        consequence: string
    }
}

export type TalosBrowserPointerFrame = {
    browserSessionId: string
    artifact: TalosBrowserArtifact
    normalizedX: number
    normalizedY: number
    clickCount: 1 | 2
}

export type TalosBrowserHmiExecution = {
    interaction: {
        status: 'executed'
        command_id: string
        approval_id?: string
        target?: Record<string, unknown>
    }
    session: TalosBrowserSession
    screenshot: TalosBrowserArtifact
    snapshot: TalosBrowserArtifact
}

export type TalosBrowserEvent = {
    id: string
    type?: string
    event_type?: string
    actor?: string
    severity?: string
    url_before?: string | null
    url_after?: string | null
    payload?: Record<string, unknown>
    created_at: string
}

export type TalosBrowserSnapshotNode = {
    role: string
    name: string
    ref: string
    level?: number
    visible?: boolean
}

export type TalosBrowserSnapshotPreview = {
    preview_available?: boolean
    reason?: string
    snapshot?: {
        untrusted: true
        format?: string
        url?: string
        title?: string
        text_digest?: string
        truncated?: boolean
        nodes: TalosBrowserSnapshotNode[]
    }
}

export type TalosDocument = {
    id: string
    run_id?: string | null
    run_artifact_id?: string | null
    research_report_id?: string | null
    title: string
    document_type: string
    format: string
    status: string
    content_hash: string
    content_preview: string
    content?: string
    metadata?: Record<string, unknown> | null
    provenance?: {
        run_id?: string | null
        artifact_id?: string | null
        prompt_hash?: string | null
        provider?: string | null
        model?: string | null
    }
    created_at: string
    updated_at: string
}

export type TalosArtifactPreview = {
    preview_available: boolean
    preview_type?: 'research_report' | string
    fallback?: 'download' | string
    artifact: TalosRunArtifact
    report?: TalosResearchReport
}

export type TalosNote = {
    id: string
    run_id?: string | null
    scope_type: 'global' | 'project' | 'session' | string
    scope_id?: string | null
    title: string
    content_preview: string
    content?: string
    status: string
    metadata?: Record<string, unknown> | null
    trust_level: 'untrusted' | string
    last_used_at?: string | null
    created_at: string
    updated_at: string
}

export type TalosNoteRetrievalContext = {
    source: 'talos_notes' | string
    trust_level: 'untrusted' | string
    instruction: string
    notes: TalosNote[]
}

export type TalosTask = {
    id: string
    run_id?: string | null
    title: string
    description?: string | null
    status: 'open' | 'in_progress' | 'done' | 'cancelled' | string
    priority: 'low' | 'normal' | 'high' | 'critical' | string
    due_at?: string | null
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosCalendarDraft = {
    id: string
    run_id?: string | null
    source_run_id?: string | null
    title: string
    description?: string | null
    starts_at: string
    ends_at: string
    timezone: string
    attendees: string[]
    status: 'draft' | 'confirmed' | string
    confirmation_required: boolean
    confirmed_at?: string | null
    external_provider?: string | null
    external_account_id?: string | null
    external_calendar_id?: string | null
    external_event_id?: string | null
    trust_level?: string | null
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosEmailConnectorStatus = {
    status: 'healthy' | 'degraded' | 'offline' | string
    read_only: boolean
    send_enabled: boolean
    reason?: string | null
}

export type TalosEmailMessage = {
    id: string
    external_id?: string | null
    from: string
    to: string[]
    cc: string[]
    subject: string
    body_preview: string
    body?: string
    status: string
    trust_level: 'untrusted' | string
    received_at?: string | null
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosEmailContext = {
    source: 'talos_email_messages' | string
    trust_level: 'untrusted' | string
    instruction: string
    policy: {
        read_only: boolean
        send_enabled: boolean
        allowed_actions: string[]
    }
    messages: TalosEmailMessage[]
}

export type TalosEmailDraft = {
    id: string
    referenced_message_ids: string[]
    to: string[]
    cc: string[]
    subject: string
    body: string
    status: 'draft' | string
    send_enabled: boolean
    metadata?: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export type TalosDoctorReport = {
    status: 'healthy' | 'degraded' | 'failed' | string
    checks: Record<string, {
        status: 'healthy' | 'degraded' | 'failed' | string
        detail: string
    }>
}

export type TalosAuditEvent = {
    id: string
    event_type: string
    subject_type?: string | null
    subject_id?: string | null
    actor_type?: string | null
    actor_id?: string | null
    payload: Record<string, unknown>
    created_at: string
    updated_at: string
}

export type TalosPolicyStatus = {
    default_decision: 'deny' | string
    capabilities: string[]
    token: {
        id: string
        name: string
        scopes: string[]
        expires_at?: string | null
        last_used_at?: string | null
        is_disabled: boolean
    }
}

export type TalosShellDecision = {
    allowed: boolean
    decision: 'allow' | 'deny' | string
    reason: string
    required_scope: string
    executed: boolean
    command_hash: string
    command_length: number
    timeout_seconds: number
    use_pty: boolean
    use_tmux: boolean
    policy: Record<string, unknown>
}

export type TalosBackupManifest = {
    schema_version: string
    generated_at: string
    domains: Record<string, { included: boolean }>
    restore_policy: {
        dry_run_required: boolean
        destructive_restore_allowed: boolean
    }
}

export type TalosRestoreValidation = {
    schema_version: string
    dry_run: boolean
    compatible: boolean
}

