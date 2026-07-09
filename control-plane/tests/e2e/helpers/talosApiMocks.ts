import type { Page, Route } from '@playwright/test'

type Json = Record<string, unknown> | unknown[]
type PersistenceMode = 'persistent' | 'temporary'
type InitialSessionMessage = {
    role?: string
    content?: string
    model_profile_id?: string | null
    run_id?: string | null
    metadata?: Record<string, unknown>
}

const now = '2026-07-07T10:00:00.000000Z'

function json(route: Route, payload: Json, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(payload),
    })
}

function emptyData(route: Route) {
    return json(route, { data: [] })
}

function hasSecretPreferenceKey(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
        return false
    }

    if (Array.isArray(value)) {
        return value.some((item) => hasSecretPreferenceKey(item))
    }

    return Object.entries(value).some(([key, nestedValue]) => {
        const normalized = key.toLowerCase()
        if (normalized.includes('api_key')
            || normalized.includes('secret')
            || normalized.includes('password')
            || normalized.endsWith('token')
            || normalized.endsWith('_token')
            || normalized.endsWith('-token')) {
            return true
        }

        return hasSecretPreferenceKey(nestedValue)
    })
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeMetadata(existing: unknown, patch: unknown) {
    const current = isPlainRecord(existing) ? existing : {}
    const next = isPlainRecord(patch) ? patch : {}
    const currentChatState = isPlainRecord(current.chat_state) ? current.chat_state : {}
    const nextChatState = isPlainRecord(next.chat_state) ? next.chat_state : {}

    return {
        ...current,
        ...next,
        ...(isPlainRecord(next.chat_state) ? { chat_state: { ...currentChatState, ...nextChatState } } : {}),
    }
}

function sessionPayload(
    title = 'E2E verified workflow',
    persistenceMode: PersistenceMode = 'persistent',
    id = 'session-e2e',
    metadata: Record<string, unknown> = { surface: 'chat' },
) {
    return {
        id,
        title,
        mode: 'verified_execution',
        persistence_mode: persistenceMode,
        active_model_profile_id: null,
        metadata,
        created_at: now,
        updated_at: now,
    }
}

function messagePayload(body: Record<string, unknown>, sequence: number, sessionId = 'session-e2e') {
    return {
        id: `message-e2e-${sequence}`,
        session_id: sessionId,
        role: body.role ?? 'assistant',
        content: body.content ?? 'E2E response from AVM.',
        model_profile_id: body.model_profile_id ?? null,
        run_id: body.run_id ?? null,
        metadata: body.metadata ?? {},
        created_at: now,
        updated_at: now,
    }
}

function sessionExportPayload(sessionId: string, format = 'json') {
    const base = {
        schema_version: 1,
        export_status: 'complete',
        session_id: sessionId,
        exported_at: now,
    }

    if (format === 'markdown') {
        return {
            ...base,
            report_type: 'talos_session_markdown_export',
            content_type: 'text/markdown',
            content: [
                '# TALOS Session Export',
                '',
                '## Messages',
                '',
                '### USER',
                'Create a replayable export pack.',
                '',
                '### ASSISTANT',
                'E2E response from AVM with replayable evidence.',
            ].join('\n'),
        }
    }

    if (format === 'context_manifest') {
        return {
            ...base,
            report_type: 'talos_context_manifest_export',
            context_manifest: {
                context_set_ids: ['context-set-e2e'],
                context_sets: [
                    {
                        id: 'context-set-e2e',
                        name: 'E2E grounded context',
                        status: 'available',
                        sources: [
                            {
                                id: 'context-source-e2e',
                                source_type: 'file_chunk',
                                file: {
                                    id: 'file-e2e',
                                    original_name: 'workflow.md',
                                    status: 'available',
                                },
                                chunk: {
                                    id: 'chunk-e2e',
                                    preview: 'Workflow file says approve the deployment checklist.',
                                },
                            },
                        ],
                    },
                ],
            },
        }
    }

    if (format === 'benchmark_scenario') {
        return {
            ...base,
            report_type: 'talos_benchmark_scenario_export',
            scenario: {
                schema_version: 1,
                scenario_type: 'talos_session_benchmark_scenario',
                session_id: sessionId,
                source_run_id: 'run-e2e',
                prompt: 'Create a replayable export pack.',
                prompt_hash: 'prompthash-e2e',
                context_hash: 'contexthash-e2e',
                model: 'gpt-e2e',
                provider: 'openai',
                evaluator_version: 'kadmos-core-benchmark-v1',
            },
        }
    }

    return {
        schema_version: 1,
        report_type: 'talos_session_export',
        export_status: 'complete',
        exported_at: now,
        available_formats: ['json', 'markdown', 'context_manifest', 'benchmark_scenario'],
        session: sessionPayload('E2E verified workflow', 'persistent', sessionId),
        messages: [
            {
                id: 'message-e2e-1',
                role: 'user',
                content: 'Create a replayable export pack.',
                model_profile_id: null,
                run_id: null,
                used_context: [],
                used_memories: [],
                metadata: {},
                created_at: now,
                updated_at: now,
            },
            {
                id: 'message-e2e-2',
                role: 'assistant',
                content: 'E2E response from AVM with replayable evidence.',
                model_profile_id: 'profile-e2e',
                model_profile: {
                    id: 'profile-e2e',
                    display_name: 'E2E server-side profile',
                    provider: 'openai',
                    model: 'gpt-e2e',
                    status: 'healthy',
                    has_secret: true,
                },
                run_id: 'run-e2e',
                used_context: [
                    {
                        context_set_id: 'context-set-e2e',
                        file_id: 'file-e2e',
                        chunk_id: 'chunk-e2e',
                        file_name: 'workflow.md',
                        preview: 'Workflow file says approve the deployment checklist.',
                    },
                ],
                used_memories: [],
                metadata: {
                    source: 'talos_chat_proxy',
                },
                created_at: now,
                updated_at: now,
            },
        ],
        runs: [
            {
                id: 'run-e2e',
                status: 'succeeded',
                prompt_hash: 'prompthash-e2e',
                context_hash: 'contexthash-e2e',
                replayability_state: {
                    replayable: true,
                    events_count: 3,
                    artifacts_count: 1,
                },
            },
        ],
        context_manifest: sessionExportPayload(sessionId, 'context_manifest').context_manifest,
        benchmark_readiness: {
            ready: true,
            missing: [],
            scenario: {
                prompt_hash: 'prompthash-e2e',
                context_hash: 'contexthash-e2e',
            },
        },
        markdown_transcript: '# TALOS Session Export\n',
    }
}

function benchmarkGroupPayload(includeResults = false) {
    const group = {
        id: 'benchmark-group-e2e',
        name: 'E2E benchmark export',
        scenario_path: 'benchmark-scenarios/e2e/export.json',
        scenario_hash: 'scenariohash-e2e',
        prompt_hash: 'prompthash-e2e',
        context_hash: 'contexthash-e2e',
        model: 'gpt-e2e',
        evaluator_version: 'kadmos-core-benchmark-v1',
        metadata: { surface: 'e2e' },
        results_count: 2,
        created_at: now,
        updated_at: now,
    }

    if (!includeResults) {
        return group
    }

    return {
        ...group,
        results: [
            {
                id: 'benchmark-result-avm-on',
                benchmark_group_id: 'benchmark-group-e2e',
                mode: 'avm_on',
                label: 'AVM ON',
                status: 'success',
                metrics: { state_match: true, enterprise_risk_score: 0 },
                raw_report: { status: 'success' },
                trace_replayable: true,
                created_at: now,
                updated_at: now,
            },
            {
                id: 'benchmark-result-avm-off',
                benchmark_group_id: 'benchmark-group-e2e',
                mode: 'avm_off_direct',
                label: 'AVM OFF direct',
                status: 'completed_with_risk',
                metrics: { state_match: false, enterprise_risk_score: 42 },
                raw_report: { status: 'completed_with_risk' },
                trace_replayable: false,
                created_at: now,
                updated_at: now,
            },
        ],
    }
}

function comparisonBenchmarkGroupPayload(includeResults = false) {
    const group = {
        id: 'benchmark-group-compare-e2e',
        name: 'E2E generated compare',
        scenario_path: 'benchmark-scenarios/e2e/generated.json',
        scenario_hash: 'scenariohash-compare-e2e',
        prompt_hash: 'prompthash-compare-e2e',
        context_hash: 'contexthash-compare-e2e',
        model: 'gpt-e2e',
        evaluator_version: 'kadmos-core-benchmark-v1',
        metadata: { surface: 'e2e', source: 'compare' },
        results_count: 2,
        created_at: now,
        updated_at: now,
    }

    if (!includeResults) {
        return group
    }

    return {
        ...group,
        results: [
            {
                id: 'benchmark-result-compare-avm-on',
                benchmark_group_id: 'benchmark-group-compare-e2e',
                mode: 'avm_on',
                label: 'AVM ON generated',
                status: 'success',
                prompt_hash: 'prompthash-compare-e2e',
                context_hash: 'contexthash-compare-e2e',
                evaluator_version: 'kadmos-core-benchmark-v1',
                metrics: { task_completion: 100, trace_replayability: 100, enterprise_risk_score: 0 },
                raw_report: {
                    state_match: true,
                    contract_violation_count: 0,
                    node_statuses: { 'node-compare': 'SUCCESS' },
                    notes: 'Generated AVM lane preserved node evidence.',
                },
                trace_replayable: true,
                created_at: now,
                updated_at: now,
            },
            {
                id: 'benchmark-result-compare-avm-off',
                benchmark_group_id: 'benchmark-group-compare-e2e',
                mode: 'avm_off_direct',
                label: 'AVM OFF generated',
                status: 'completed_with_risk',
                prompt_hash: 'prompthash-compare-e2e',
                context_hash: 'contexthash-compare-e2e',
                evaluator_version: 'kadmos-core-benchmark-v1',
                metrics: { task_completion: 70, trace_replayability: 0, enterprise_risk_score: 47 },
                raw_report: {
                    state_match: false,
                    contract_violation_count: 2,
                    node_statuses: { 'node-compare': 'UNKNOWN' },
                    notes: 'Direct lane completed without replayable node evidence.',
                },
                trace_replayable: false,
                created_at: now,
                updated_at: now,
            },
        ],
    }
}

function runBenchmarkGroupPayload(includeResults = false) {
    const group = {
        id: 'benchmark-group-from-run-e2e',
        name: 'E2E benchmark from chat run',
        source_run_id: 'run-e2e',
        scenario_path: 'benchmark-scenarios/e2e/from-run.json',
        scenario_hash: 'scenariohash-from-run-e2e',
        prompt_hash: 'runprompthash-e2e',
        context_hash: 'contexthash-from-run-e2e',
        model: 'gpt-e2e',
        evaluator_version: 'kadmos-core-benchmark-v1',
        metadata: { surface: 'e2e', source: 'chat_run' },
        results_count: 2,
        created_at: now,
        updated_at: now,
    }

    if (!includeResults) {
        return group
    }

    return {
        ...group,
        results: [
            {
                id: 'benchmark-result-from-run-avm-on',
                benchmark_group_id: 'benchmark-group-from-run-e2e',
                mode: 'avm_on',
                label: 'AVM ON from chat run',
                status: 'success',
                prompt_hash: 'runprompthash-e2e',
                context_hash: 'contexthash-from-run-e2e',
                evaluator_version: 'kadmos-core-benchmark-v1',
                metrics: { trace_replayability: 100, enterprise_risk_score: 0 },
                raw_report: { notes: 'Chat run benchmark preserved replayable AVM evidence.' },
                trace_replayable: true,
                created_at: now,
                updated_at: now,
            },
            {
                id: 'benchmark-result-from-run-avm-off',
                benchmark_group_id: 'benchmark-group-from-run-e2e',
                mode: 'avm_off_direct',
                label: 'AVM OFF from chat run',
                status: 'completed_with_risk',
                prompt_hash: 'runprompthash-e2e',
                context_hash: 'contexthash-from-run-e2e',
                evaluator_version: 'kadmos-core-benchmark-v1',
                metrics: { trace_replayability: 0, enterprise_risk_score: 51 },
                raw_report: { notes: 'Direct chat-run lane completed without replayable node evidence.' },
                trace_replayable: false,
                created_at: now,
                updated_at: now,
            },
        ],
    }
}

function filePayload() {
    return {
        id: 'file-e2e',
        original_name: 'workflow.md',
        storage_path: 'talos/files/workflow.md',
        mime_type: 'text/markdown',
        size_bytes: 42,
        checksum: 'filehash-e2e',
        status: 'available',
        failure_reason: null,
        metadata: { source: 'e2e' },
        created_at: now,
        updated_at: now,
    }
}

function fileDetailsPayload() {
    return {
        ...filePayload(),
        chunks: [
            {
                id: 'chunk-e2e',
                file_id: 'file-e2e',
                sequence: 1,
                token_count: 12,
                preview: 'Workflow file says approve the deployment checklist.',
                metadata: { source: 'e2e' },
                created_at: now,
                updated_at: now,
            },
        ],
    }
}

function contextSetPayload() {
    return {
        id: 'context-set-e2e',
        name: 'E2E grounded context',
        status: 'available',
        metadata: { source: 'e2e' },
        sources_count: 1,
        sources: [
            {
                id: 'context-source-e2e',
                context_set_id: 'context-set-e2e',
                file_id: 'file-e2e',
                chunk_id: null,
                metadata: { source: 'e2e' },
                created_at: now,
                updated_at: now,
            },
        ],
        created_at: now,
        updated_at: now,
    }
}

function runPayload() {
    return {
        id: 'run-e2e',
        session_id: 'session-e2e',
        model_profile_id: 'profile-e2e',
        context_set_id: 'context-set-e2e',
        mode: 'verified_execution',
        status: 'failed',
        prompt_hash: 'runprompthash-e2e',
        prompt: 'Replay this failed workflow.',
        provider: 'openai',
        model: 'gpt-e2e',
        metadata: { source: 'e2e' },
        started_at: now,
        completed_at: now,
        created_at: now,
        updated_at: now,
    }
}

function runEventsPayload() {
    return [
        {
            id: 'event-e2e-1',
            run_id: 'run-e2e',
            sequence: 1,
            event_type: 'node_started',
            severity: 'info',
            node_id: 'node-e2e',
            node_type: 'HTTP_REQUEST',
            status_before: 'PENDING',
            status_after: 'RUNNING',
            payload: {
                node_type: 'HTTP_REQUEST',
                url: 'https://api.example.test/health',
                policy_decision: {
                    allowed: true,
                    capability: 'net.http.request',
                },
            },
            occurred_at: now,
            created_at: now,
            updated_at: now,
        },
        {
            id: 'event-e2e-2',
            run_id: 'run-e2e',
            sequence: 2,
            event_type: 'node_failed',
            severity: 'error',
            node_id: 'node-e2e',
            node_type: 'HTTP_REQUEST',
            status_before: 'RUNNING',
            status_after: 'FAILED',
            payload: {
                node_type: 'HTTP_REQUEST',
                reason: 'HTTP 503',
                validation_faults: [
                    { code: 'UPSTREAM_UNAVAILABLE', field: 'url' },
                ],
                worker_output: {
                    http_status: 503,
                    retryable: true,
                },
            },
            occurred_at: now,
            created_at: now,
            updated_at: now,
        },
        {
            id: 'event-e2e-3',
            run_id: 'run-e2e',
            sequence: 3,
            event_type: 'node_blocked',
            severity: 'warning',
            node_id: 'node-child-e2e',
            node_type: 'SUMMARIZE',
            status_before: 'PENDING',
            status_after: 'BLOCKED_BY_DEPENDENCY',
            payload: {
                node_type: 'SUMMARIZE',
                reason: 'Parent node node-e2e failed before this branch could run.',
                dependency_node_id: 'node-e2e',
                blocked_by: ['node-e2e'],
            },
            occurred_at: now,
            created_at: now,
            updated_at: now,
        },
    ]
}

function runArtifactsPayload() {
    return [
        {
            id: 'artifact-run-e2e',
            run_id: 'run-e2e',
            artifact_type: 'evidence_report',
            uri: 'local://reports/run-e2e.json',
            mime_type: 'application/json',
            metadata: {
                sha256: 'artifacthash-e2e',
                label: 'Run evidence report',
            },
            created_at: now,
            updated_at: now,
        },
    ]
}

function cookbookHardwareProfilePayload() {
    return {
        id: 'hardware-profile-e2e',
        host_fingerprint: 'host-e2e',
        os: 'Windows',
        cpu_model: 'Ryzen E2E',
        cpu_cores: 16,
        ram_total_mb: 65536,
        ram_free_mb: 32768,
        gpus: [
            {
                vendor: 'NVIDIA',
                model: 'RTX E2E',
                vram_mb: 24576,
            },
        ],
        runtimes: {
            ollama: {
                kind: 'ollama',
                name: 'Ollama',
                status: 'available',
            },
        },
        raw_evidence: {
            source: 'e2e',
        },
        scanned_at: now,
        created_at: now,
        updated_at: now,
        trust_level: 'local_evidence',
    }
}

function cookbookRuntimePayload() {
    return {
        id: 'runtime-ollama-e2e',
        kind: 'ollama',
        name: 'Ollama',
        status: 'available',
        version: '0.9.0',
        executable_path: null,
        evidence: {
            command: 'ollama --version',
            source: 'e2e',
        },
        last_checked_at: now,
        created_at: now,
        updated_at: now,
    }
}

function cookbookModelPayload(overrides: Record<string, unknown> = {}) {
    return {
        id: overrides.id ?? 'catalog-model-e2e',
        provider: overrides.provider ?? 'huggingface',
        model_id: overrides.model_id ?? 'meta-llama/Llama-3.1-8B-Instruct',
        display_name: overrides.display_name ?? 'Llama 3.1 8B Instruct',
        parameters_b: overrides.parameters_b ?? 8,
        quantization: overrides.quantization ?? 'Q4_K_M',
        context_window: overrides.context_window ?? 8192,
        runtime_modes: overrides.runtime_modes ?? ['ollama', 'llama_cpp'],
        estimated_vram_mb: overrides.estimated_vram_mb ?? 6144,
        estimated_ram_mb: overrides.estimated_ram_mb ?? 8192,
        tags: overrides.tags ?? ['chat', 'local'],
        source_url: overrides.source_url ?? 'https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct',
        status: overrides.status ?? 'available',
        fit: overrides.fit ?? {
            label: 'Good',
            score: 88,
            reasons: [
                'Fits available VRAM with quantized weights.',
                'Ollama runtime is available.',
            ],
        },
        created_at: now,
        updated_at: now,
    }
}

function cookbookPreviewPayload(modelId = 'meta-llama/Llama-3.1-8B-Instruct', runtime = 'ollama', action = 'download') {
    const command = action === 'serve'
        ? `${runtime} run ${modelId}`
        : `${runtime} pull ${modelId}`

    return {
        mode: 'dry_run',
        action,
        runtime,
        model_id: modelId,
        commands: [command],
        executed: false,
        requires_approval: true,
        warnings: [
            'Preview only. TALOS Cookbook V1 does not execute local model commands.',
        ],
        message: 'No host command has been executed.',
    }
}

function cookbookDependencyPolicyPayload() {
    return {
        default_decision: 'deny',
        execution_allowed: false,
        install_execution_enabled: false,
        serve_execution_enabled: false,
        required_scope: 'talos.shell.exec',
        preview_scope: 'talos.shell.preview',
        plain_commands_are_preview_only: true,
    }
}

function cookbookDependencyCatalogPayload() {
    return {
        policy: cookbookDependencyPolicyPayload(),
        dependencies: [
            {
                runtime: 'ollama',
                name: 'Ollama',
                package_manager: 'official_installer',
                install_hint: 'Install Ollama from the official package before enabling local serving.',
                supports: ['pull', 'serve'],
                detected_status: 'available',
                detected_version: '0.9.0',
                evidence: { source: 'e2e' },
                install_allowed: false,
                required_scope: 'talos.shell.exec',
                execution_gate: 'host_shell_execution_disabled',
            },
        ],
    }
}

function cookbookDependencyPreviewPayload(modelId = 'meta-llama/Llama-3.1-8B-Instruct', runtime = 'ollama') {
    return {
        mode: 'dry_run',
        runtime,
        model_id: modelId,
        executed: false,
        requires_approval: true,
        install_allowed: false,
        policy: cookbookDependencyPolicyPayload(),
        steps: [
            {
                kind: 'dependency_check',
                runtime,
                description: 'Inspect runtime readiness from TALOS local evidence.',
                read_only: true,
            },
            {
                kind: 'install_preview',
                runtime,
                package_manager: 'official_installer',
                description: 'Preview install only; no host command is executed.',
                read_only: true,
                executed: false,
            },
        ],
    }
}

function researchReportPayload(overrides: Record<string, unknown> = {}) {
    const reportId = String(overrides.id ?? 'research-report-e2e')
    const status = String(overrides.status ?? 'draft')

    return {
        id: reportId,
        run_id: overrides.run_id ?? 'research-run-e2e',
        context_set_id: overrides.context_set_id ?? null,
        benchmark_group_id: overrides.benchmark_group_id ?? null,
        title: overrides.title ?? 'E2E AVM research report',
        query: overrides.query ?? 'Map AVM evidence to claims.',
        status,
        summary: overrides.summary ?? 'Draft research plan stored as TALOS evidence.',
        report_markdown: overrides.report_markdown ?? '# E2E AVM research report\n\nQueued research draft.',
        metadata: overrides.metadata ?? {
            queue_status: 'queued',
            rounds: 2,
            format: 'briefing',
            search_engine: 'searxng',
            endpoint: 'local',
            model_profile_id: 'profile-e2e',
        },
        sources_count: 1,
        claims_count: 1,
        sources: [
            {
                id: 'research-source-e2e',
                research_report_id: reportId,
                client_id: 'src-1',
                sequence: 1,
                source_type: 'web',
                url: 'https://example.com/avm-evidence',
                title: 'AVM evidence source',
                status: 'planned',
                excerpt: null,
                content_hash: null,
                file_id: null,
                file_chunk_id: null,
                failure_reason: null,
                metadata: { source: 'e2e' },
                created_at: now,
                updated_at: now,
            },
        ],
        claims: [
            {
                id: 'research-claim-e2e',
                research_report_id: reportId,
                sequence: 1,
                text: 'AVM research claims stay pending until fetched evidence exists.',
                status: 'pending',
                confidence: null,
                metadata: { source_refs: ['src-1'] },
                sources: [
                    {
                        id: 'research-source-e2e',
                        research_report_id: reportId,
                        client_id: 'src-1',
                        sequence: 1,
                        source_type: 'web',
                        url: 'https://example.com/avm-evidence',
                        title: 'AVM evidence source',
                        status: 'planned',
                        excerpt: null,
                        content_hash: null,
                        file_id: null,
                        file_chunk_id: null,
                        failure_reason: null,
                        metadata: { source: 'e2e' },
                        created_at: now,
                        updated_at: now,
                    },
                ],
                created_at: now,
                updated_at: now,
            },
        ],
        artifact: {
            id: 'research-artifact-e2e',
            run_id: 'research-run-e2e',
            artifact_type: 'research_report',
            uri: `talos://research-reports/${reportId}`,
            mime_type: 'application/json',
            metadata: {
                research_report_id: reportId,
                source_count: 1,
                claim_count: 1,
                sha256: 'researchhash-e2e',
            },
            created_at: now,
            updated_at: now,
        },
        created_at: now,
        updated_at: now,
    }
}

function calendarDraftPayload(overrides: Record<string, unknown> = {}) {
    return {
        id: overrides.id ?? 'calendar-draft-e2e',
        run_id: overrides.run_id ?? null,
        source_run_id: overrides.source_run_id ?? overrides.run_id ?? null,
        title: overrides.title ?? 'Crew muster',
        description: overrides.description ?? null,
        starts_at: overrides.starts_at ?? '2026-07-09T10:00:00.000000Z',
        ends_at: overrides.ends_at ?? '2026-07-09T10:30:00.000000Z',
        timezone: overrides.timezone ?? 'Europe/Rome',
        attendees: overrides.attendees ?? [],
        status: overrides.status ?? 'draft',
        confirmation_required: overrides.confirmation_required ?? true,
        confirmed_at: overrides.confirmed_at ?? null,
        external_provider: overrides.external_provider ?? null,
        external_event_id: overrides.external_event_id ?? null,
        metadata: overrides.metadata ?? { quick_add_raw: 'crew muster 10am daily' },
        created_at: now,
        updated_at: now,
    }
}

function googleAccountPayload(overrides: Record<string, unknown> = {}) {
    return {
        id: overrides.id ?? 'google-account-e2e',
        provider: 'google',
        provider_account_id: overrides.provider_account_id ?? 'google-user-e2e',
        email: overrides.email ?? 'operator@example.test',
        display_name: overrides.display_name ?? 'Operator',
        scopes: overrides.scopes ?? [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/calendar.events.readonly',
        ],
        status: overrides.status ?? 'connected',
        has_access_token: overrides.has_access_token ?? true,
        has_refresh_token: overrides.has_refresh_token ?? true,
        token_expires_at: overrides.token_expires_at ?? '2026-07-09T11:00:00.000000Z',
        connected_at: overrides.connected_at ?? now,
        last_used_at: overrides.last_used_at ?? now,
        last_error: overrides.last_error ?? null,
        metadata: overrides.metadata ?? {
            picture: null,
        },
        created_at: now,
        updated_at: now,
    }
}

function googleDriveFilesPayload() {
    return {
        files: [
            {
                id: 'drive-file-notes',
                name: 'Drive Notes.md',
                mime_type: 'text/markdown',
                modified_time: '2026-07-09T10:00:00Z',
                can_download: true,
                web_view_link: 'https://drive.google.test/file/drive-file-notes',
                size_bytes: 128,
            },
        ],
        next_page_token: null,
    }
}

function googleImportedFilePayload() {
    return {
        id: 'file-google-drive-e2e',
        original_name: 'Drive Notes.md',
        storage_path: 'talos/files/google-drive-notes.md',
        mime_type: 'text/markdown',
        size_bytes: 128,
        checksum: 'drivefilehash-e2e',
        status: 'available',
        failure_reason: null,
        metadata: {
            source_provider: 'google_drive',
            trust_level: 'untrusted',
            google_drive_file_id: 'drive-file-notes',
            google_drive_modified_time: '2026-07-09T10:00:00Z',
            google_drive_account_id: 'google-account-e2e',
            google_drive_account_email: 'operator@example.test',
            imported_at: now,
        },
        created_at: now,
        updated_at: now,
    }
}

function googleCalendarListPayload() {
    return {
        calendars: [
            {
                id: 'primary',
                summary: 'Operator Calendar',
                description: 'Primary Google Calendar',
                primary: true,
                selected: true,
                access_role: 'owner',
                timezone: 'Europe/Rome',
            },
        ],
    }
}

function googleSyncedCalendarDraftPayload(overrides: Record<string, unknown> = {}) {
    return calendarDraftPayload({
        id: overrides.id ?? 'google-calendar-draft-e2e',
        title: overrides.title ?? 'AVM sync review',
        description: overrides.description ?? 'Review synced from Google Calendar.',
        starts_at: overrides.starts_at ?? '2026-07-10T10:00:00.000000Z',
        ends_at: overrides.ends_at ?? '2026-07-10T11:00:00.000000Z',
        timezone: overrides.timezone ?? 'Europe/Rome',
        attendees: overrides.attendees ?? ['ops@example.test'],
        status: overrides.status ?? 'synced',
        confirmation_required: overrides.confirmation_required ?? false,
        external_provider: 'google_calendar',
        external_event_id: 'google-event-e2e',
        metadata: {
            external_provider: 'google_calendar',
            external_account_id: 'google-account-e2e',
            external_calendar_id: 'primary',
            external_event_id: 'google-event-e2e',
            external_event_link: 'https://calendar.google.test/event/google-event-e2e',
            trust_level: 'untrusted',
            synced_at: now,
        },
    })
}

function googleCalendarSyncPayload() {
    const event = googleSyncedCalendarDraftPayload()

    return {
        calendar_id: 'primary',
        synced_count: 1,
        next_sync_token: 'google-sync-token-e2e',
        events: [event],
    }
}

function modelProfilePayload(overrides: Record<string, unknown> = {}) {
    return {
        id: overrides.id ?? 'profile-e2e',
        display_name: overrides.display_name ?? 'E2E server-side profile',
        provider: overrides.provider ?? 'openai',
        model: overrides.model ?? 'gpt-e2e',
        base_url: overrides.base_url ?? null,
        timeout_seconds: overrides.timeout_seconds ?? 60,
        status: overrides.status ?? 'healthy',
        capabilities: overrides.capabilities ?? {
            json: true,
            tools: true,
            vision: false,
            embeddings: true,
            local: false,
            remote: true,
        },
        probe_result: overrides.probe_result ?? {
            ok: true,
            http_status: 200,
            latency_ms: 118,
            policy: {
                public_url: true,
            },
        },
        has_secret: overrides.has_secret ?? true,
        created_at: now,
        updated_at: now,
    }
}

function modelComparisonPayload(revealed = false) {
    const lanes = [
        {
            id: 'model-comparison-lane-a-e2e',
            comparison_id: 'model-comparison-e2e',
            display_alias: 'Model A',
            position: 1,
            weight: 100,
            status: 'completed',
            response_text: 'Model A chat response: Compare recovery options for a blocked DAG.',
            latency_ms: 320,
            cost: 0.0015,
            run_id: 'run-model-comparison-a-e2e',
            error_code: null,
            error_message: null,
            metadata: {
                trace_replayable: true,
                context_coverage: 'not_measured',
            },
        },
        {
            id: 'model-comparison-lane-b-e2e',
            comparison_id: 'model-comparison-e2e',
            display_alias: 'Model B',
            position: 2,
            weight: 100,
            status: 'completed',
            response_text: 'Model B chat response: Compare recovery options for a blocked DAG.',
            latency_ms: 395,
            cost: 0.0022,
            run_id: 'run-model-comparison-b-e2e',
            error_code: null,
            error_message: null,
            metadata: {
                trace_replayable: true,
                context_coverage: 'not_measured',
            },
        },
    ]

    if (revealed) {
        return {
            id: 'model-comparison-e2e',
            prompt: 'Compare recovery options for a blocked DAG.',
            mode: 'blind',
            task_type: 'chat',
            blind: true,
            status: 'completed',
            timeout_seconds: 60,
            winner_lane_id: 'model-comparison-lane-a-e2e',
            revealed: true,
            revealed_at: now,
            benchmark_group_id: null,
            scorecard: {
                reason: 'Selected from TALOS scorecard.',
            },
            metadata: { source: 'e2e' },
            lanes: lanes.map((lane, index) => ({
                ...lane,
                model_profile_id: index === 0 ? 'profile-e2e' : 'profile-alt-e2e',
                model_profile: index === 0
                    ? {
                        id: 'profile-e2e',
                        display_name: 'E2E server-side profile',
                        provider: 'openai',
                        model: 'gpt-e2e',
                        status: 'healthy',
                    }
                    : {
                        id: 'profile-alt-e2e',
                        display_name: 'E2E alternate profile',
                        provider: 'anthropic',
                        model: 'claude-e2e',
                        status: 'healthy',
                    },
            })),
            created_at: now,
            updated_at: now,
        }
    }

    return {
        id: 'model-comparison-e2e',
        prompt: 'Compare recovery options for a blocked DAG.',
        mode: 'blind',
        task_type: 'chat',
        blind: true,
        status: 'completed',
        timeout_seconds: 60,
        winner_lane_id: null,
        revealed: false,
        revealed_at: null,
        benchmark_group_id: null,
        scorecard: null,
        metadata: { source: 'e2e' },
        lanes: lanes.map(({ run_id: _runId, ...lane }) => lane),
        created_at: now,
        updated_at: now,
    }
}

function modelComparisonBenchmarkGroupPayload(includeResults = false) {
    const group = {
        id: 'benchmark-group-model-comparison-e2e',
        name: 'Model comparison V4',
        source_run_id: 'run-model-comparison-a-e2e',
        scenario_path: 'talos://model-comparisons/model-comparison-e2e',
        scenario_hash: 'scenariohash-model-comparison-e2e',
        prompt_hash: 'prompthash-model-comparison-e2e',
        context_hash: 'contexthash-model-comparison-e2e',
        model: 'model-comparison',
        evaluator_version: 'talos-model-comparison-v1',
        metadata: {
            comparison_type: 'model_profile_blind_compare',
            model_comparison_id: 'model-comparison-e2e',
        },
        results_count: 2,
        created_at: now,
        updated_at: now,
    }

    if (!includeResults) {
        return group
    }

    return {
        ...group,
        results: [
            {
                id: 'benchmark-result-model-lane-a',
                benchmark_group_id: 'benchmark-group-model-comparison-e2e',
                mode: 'model_lane_a',
                label: 'Model Lane A',
                status: 'complete',
                prompt_hash: 'prompthash-model-comparison-e2e',
                context_hash: 'contexthash-model-comparison-e2e',
                evaluator_version: 'talos-model-comparison-v1',
                metrics: { latency_ms: 320, cost: 0.0015 },
                raw_report: { lane_id: 'model-comparison-lane-a-e2e', response_text: 'Model A chat response: Compare recovery options for a blocked DAG.' },
                trace_replayable: true,
                created_at: now,
                updated_at: now,
            },
            {
                id: 'benchmark-result-model-lane-b',
                benchmark_group_id: 'benchmark-group-model-comparison-e2e',
                mode: 'model_lane_b',
                label: 'Model Lane B',
                status: 'complete',
                prompt_hash: 'prompthash-model-comparison-e2e',
                context_hash: 'contexthash-model-comparison-e2e',
                evaluator_version: 'talos-model-comparison-v1',
                metrics: { latency_ms: 395, cost: 0.0022 },
                raw_report: { lane_id: 'model-comparison-lane-b-e2e', response_text: 'Model B chat response: Compare recovery options for a blocked DAG.' },
                trace_replayable: true,
                created_at: now,
                updated_at: now,
            },
        ],
    }
}

export type InstallTalosApiMocksOptions = {
    initialSessions?: Array<{
        id: string
        title: string
        persistence_mode?: PersistenceMode
        metadata?: Record<string, unknown>
        messages?: InitialSessionMessage[]
    }>
}

export async function installTalosApiMocks(page: Page, options: InstallTalosApiMocksOptions = {}) {
    let messageSequence = 0
    let fileUploaded = false
    let contextSetCreated = false
    let comparisonCreated = false
    let modelComparisonPromoted = false
    let currentModelComparison: Record<string, unknown> | null = null
    let researchReports: Record<string, unknown>[] = []
    let calendarDrafts: Record<string, unknown>[] = []
    let importedDriveFiles: Record<string, unknown>[] = []
    let googleAccounts: Record<string, unknown>[] = [googleAccountPayload()]
    let cookbookHardwareProfile: Record<string, unknown> | null = cookbookHardwareProfilePayload()
    let cookbookRuntimes: Record<string, unknown>[] = [cookbookRuntimePayload()]
    let cookbookModels: Record<string, unknown>[] = [cookbookModelPayload()]
    let modelProfiles = [
        modelProfilePayload(),
        modelProfilePayload({
            id: 'profile-alt-e2e',
            display_name: 'E2E alternate profile',
            provider: 'anthropic',
            model: 'claude-e2e',
        }),
    ]
    let createdSessionCount = 0
    const messagesBySession = new Map<string, Record<string, unknown>[]>()
    let sessions = (options.initialSessions ?? []).map((session) => sessionPayload(
        session.title,
        session.persistence_mode ?? 'persistent',
        session.id,
        session.metadata ?? { surface: 'chat' },
    ))
    for (const session of options.initialSessions ?? []) {
        if (!session.messages?.length) {
            continue
        }

        messagesBySession.set(session.id, session.messages.map((message) => {
            messageSequence += 1

            return messagePayload(message, messageSequence, session.id)
        }))
    }
    let activeSessionPersistenceMode: PersistenceMode = 'persistent'
    let workspaceSettings: {
        id: string
        default_model_profile_id: string | null
        default_context_set_id: string | null
        preferences: Record<string, unknown>
        created_at: string
        updated_at: string
    } = {
        id: 'default',
        default_model_profile_id: 'profile-e2e',
        default_context_set_id: null as string | null,
        preferences: {
            theme: 'forge',
            reduced_motion: false,
            theme_customization: {},
            ai_defaults: {
                utility_model_mode: 'same_as_chat',
                vision_enabled: true,
                research_model_mode: 'same_as_chat',
            },
            search: {
                provider: 'searxng',
                results_per_query: 5,
                url: '',
                fallback: 'duckduckgo',
                deep_research: {
                    max_tokens: 16384,
                    extract_timeout: 90,
                    extract_parallel: 3,
                    timeout: 1800,
                },
            },
            agent_tools: {
                tool_call_limit: 0,
                max_steps_per_message: 20,
            },
            reminders: {
                channel: 'browser',
                ai_synthesis: false,
                public_app_url: '',
            },
        },
        created_at: now,
        updated_at: now,
    }

    await page.route('**/api/**', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const path = url.pathname
        const method = request.method()

        if (path === '/api/talos/model-profiles' && method === 'GET') {
            return json(route, {
                data: modelProfiles,
            })
        }

        if (path === '/api/talos/model-profiles/probe-draft' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>

            return json(route, {
                data: {
                    status: 'healthy',
                    result: {
                        ok: true,
                        provider: body.provider,
                        http_status: 200,
                        latency_ms: 96,
                        json: true,
                    },
                },
            })
        }

        if (path === '/api/talos/model-profiles' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            const provider = String(body.provider ?? 'openai')
            const defaults: Record<string, { display_name: string, model: string, base_url: string | null }> = {
                openai: { display_name: 'OpenAI', model: 'gpt-4.1-mini', base_url: 'https://api.openai.com/v1' },
                deepseek: { display_name: 'DeepSeek', model: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1' },
                anthropic: { display_name: 'Anthropic', model: 'claude-sonnet', base_url: 'https://api.anthropic.com/v1' },
                gemini: { display_name: 'Google Gemini', model: 'gemini-2.5-flash', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
                openrouter: { display_name: 'OpenRouter', model: 'openai/gpt-4.1-mini', base_url: 'https://openrouter.ai/api/v1' },
                ollama: { display_name: 'Ollama Local', model: 'llama3.1', base_url: 'http://127.0.0.1:11434/v1' },
            }
            const preset = defaults[provider] ?? defaults.openai
            const profile = modelProfilePayload({
                id: `profile-${provider}-quick-add`,
                provider,
                display_name: body.display_name || `${preset.display_name} quick profile`,
                model: body.model || preset.model,
                base_url: body.base_url ?? preset.base_url,
                timeout_seconds: body.timeout_seconds ?? 60,
                status: String(body.status ?? 'untested'),
                has_secret: provider !== 'ollama',
                probe_result: {
                    ok: true,
                    http_status: 200,
                    latency_ms: 96,
                    provider,
                },
            })
            modelProfiles = [profile, ...modelProfiles]

            return json(route, { data: profile }, 201)
        }

        if (path.match(/^\/api\/talos\/model-profiles\/[^/]+\/probe$/) && method === 'POST') {
            const profileId = path.split('/').at(-2)
            modelProfiles = modelProfiles.map((profile) => profile.id === profileId
                ? {
                    ...profile,
                    status: 'healthy',
                    probe_result: {
                        ok: true,
                        http_status: 200,
                        latency_ms: 92,
                    },
                }
                : profile)
            const profile = modelProfiles.find((candidate) => candidate.id === profileId)

            return json(route, { data: profile ?? modelProfilePayload({ id: profileId }) })
        }

        if (path === '/api/talos/model-comparisons' && method === 'POST') {
            currentModelComparison = modelComparisonPayload(false)

            return json(route, { data: currentModelComparison }, 201)
        }

        const modelComparisonVoteMatch = path.match(/^\/api\/talos\/model-comparisons\/([^/]+)\/vote$/)
        if (modelComparisonVoteMatch && method === 'POST') {
            currentModelComparison = modelComparisonPayload(true)

            return json(route, { data: currentModelComparison })
        }

        const modelComparisonBenchmarkMatch = path.match(/^\/api\/talos\/model-comparisons\/([^/]+)\/benchmark$/)
        if (modelComparisonBenchmarkMatch && method === 'POST') {
            modelComparisonPromoted = true
            if (currentModelComparison) {
                currentModelComparison = {
                    ...currentModelComparison,
                    benchmark_group_id: 'benchmark-group-model-comparison-e2e',
                }
            }

            return json(route, { data: modelComparisonBenchmarkGroupPayload(true) }, 201)
        }

        const modelComparisonMatch = path.match(/^\/api\/talos\/model-comparisons\/([^/]+)$/)
        if (modelComparisonMatch && method === 'GET') {
            return json(route, { data: currentModelComparison ?? modelComparisonPayload(false) })
        }

        if (path === '/api/talos/settings' && method === 'GET') {
            return json(route, {
                data: workspaceSettings,
            })
        }

        if (path === '/api/talos/settings' && method === 'PATCH') {
            const body = request.postDataJSON() as Record<string, unknown>
            if ('api_key' in body || 'secret' in body || 'encrypted_secret' in body || hasSecretPreferenceKey(body.preferences)) {
                return json(route, { error: 'SECRET_FIELDS_REJECTED' }, 422)
            }

            workspaceSettings = {
                ...workspaceSettings,
                default_model_profile_id: typeof body.default_model_profile_id === 'string' ? body.default_model_profile_id : workspaceSettings.default_model_profile_id,
                default_context_set_id: typeof body.default_context_set_id === 'string' || body.default_context_set_id === null
                    ? body.default_context_set_id as string | null
                    : workspaceSettings.default_context_set_id,
                preferences: {
                    ...workspaceSettings.preferences,
                    ...(body.preferences && typeof body.preferences === 'object' && !Array.isArray(body.preferences) ? body.preferences : {}),
                },
                updated_at: now,
            }

            return json(route, {
                data: workspaceSettings,
            })
        }

        if (path === '/api/talos/context-sets' && method === 'GET') {
            return json(route, { data: contextSetCreated ? [contextSetPayload()] : [] })
        }

        if (path === '/api/talos/sessions' && method === 'GET') {
            return json(route, { data: sessions })
        }

        if (path === '/api/talos/sessions' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            activeSessionPersistenceMode = body.persistence_mode === 'temporary' ? 'temporary' : 'persistent'
            createdSessionCount += 1
            const sessionId = createdSessionCount === 1 ? 'session-e2e' : `session-e2e-${createdSessionCount}`
            const session = {
                ...sessionPayload(
                    String(body.title ?? 'E2E verified workflow'),
                    activeSessionPersistenceMode,
                    sessionId,
                    mergeMetadata({ surface: 'chat' }, body.metadata),
                ),
                active_model_profile_id: typeof body.active_model_profile_id === 'string' ? body.active_model_profile_id : null,
            }
            sessions = [session, ...sessions.filter((item) => item.id !== session.id)]
            return json(route, { data: session }, 201)
        }

        const sessionPatchMatch = path.match(/^\/api\/talos\/sessions\/([^/]+)$/)
        if (sessionPatchMatch && method === 'PATCH') {
            const body = request.postDataJSON() as Record<string, unknown>
            const sessionId = sessionPatchMatch[1]
            const existing = sessions.find((item) => item.id === sessionId)
            const persistenceMode = existing?.persistence_mode === 'temporary' ? 'temporary' : activeSessionPersistenceMode
            const session = {
                ...(existing ?? sessionPayload(String(body.title ?? 'E2E verified workflow'), persistenceMode, sessionId)),
                title: String(body.title ?? existing?.title ?? 'E2E verified workflow'),
                mode: body.mode === 'answer_only' ? 'answer_only' : existing?.mode ?? 'verified_execution',
                persistence_mode: persistenceMode,
                active_model_profile_id: typeof body.active_model_profile_id === 'string' ? body.active_model_profile_id : existing?.active_model_profile_id ?? null,
                metadata: mergeMetadata(existing?.metadata, body.metadata),
                updated_at: now,
            }
            sessions = [session, ...sessions.filter((item) => item.id !== session.id)]
            return json(route, { data: session })
        }

        if (sessionPatchMatch && method === 'DELETE') {
            const sessionId = sessionPatchMatch[1]
            sessions = sessions.filter((item) => item.id !== sessionId)
            messagesBySession.delete(sessionId)

            return route.fulfill({ status: 204 })
        }

        const sessionExportMatch = path.match(/^\/api\/talos\/sessions\/([^/]+)\/export$/)
        if (sessionExportMatch && method === 'GET') {
            const format = url.searchParams.get('format') ?? 'json'
            return json(route, sessionExportPayload(sessionExportMatch[1], format))
        }

        const sessionMessagesMatch = path.match(/^\/api\/talos\/sessions\/([^/]+)\/messages$/)
        if (sessionMessagesMatch && method === 'GET') {
            return json(route, { data: messagesBySession.get(sessionMessagesMatch[1]) ?? [] })
        }

        if (sessionMessagesMatch && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            messageSequence += 1
            const sessionId = sessionMessagesMatch[1]
            const message = messagePayload(body, messageSequence, sessionId)
            messagesBySession.set(sessionId, [...(messagesBySession.get(sessionId) ?? []), message])
            return json(route, { data: message }, 201)
        }

        if (path === '/api/talos/chat' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            const contextSetId = typeof body.context_set_id === 'string' ? body.context_set_id : null

            return json(route, {
                text: contextSetId
                    ? 'E2E response from AVM with replayable evidence and grounded file context.'
                    : 'E2E response from AVM with replayable evidence.',
                mutations: [
                    { action: 'SPAWN_NODE', node_id: 'node-e2e', node_type: 'HTTP_REQUEST' },
                ],
                errors: [],
                used_context: contextSetId ? [
                    {
                        context_set_id: contextSetId,
                        file_id: 'file-e2e',
                        chunk_id: 'chunk-e2e',
                        file_name: 'workflow.md',
                        preview: 'Workflow file says approve the deployment checklist.',
                    },
                ] : [],
                run: {
                    id: 'run-e2e',
                    session_id: 'session-e2e',
                    mode: 'verified_execution',
                    status: 'succeeded',
                    provider: 'openai',
                    model: 'gpt-e2e',
                    created_at: now,
                    updated_at: now,
                },
            })
        }

        if (path === '/api/talos/prompts/enhance' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            if ('api_key' in body || 'secret' in body || 'encrypted_secret' in body) {
                return json(route, { error: 'SECRET_FIELDS_REJECTED' }, 422)
            }

            const prompt = String(body.prompt ?? '').trim()
            return json(route, {
                data: {
                    model_profile_id: body.model_profile_id ?? 'profile-e2e',
                    enhancement_mode: 'deterministic_template',
                    original_prompt: prompt,
                    enhanced_prompt: `Objective:\n\n${prompt}\n\nClarify output, constraints, context, and acceptance checks before execution.`,
                },
            })
        }

        if (path === '/api/talos/admin/doctor') {
            return json(route, {
                status: 'degraded',
                checks: [
                    { name: 'validator', status: 'degraded', message: 'TALOS_VALIDATOR_HEALTH_URL is not configured.' },
                    { name: 'database', status: 'healthy', message: 'SQLite reachable.' },
                ],
            })
        }

        if (path === '/api/files/ingest' && method === 'POST') {
            fileUploaded = true
            return json(route, {
                data: {
                    ...filePayload(),
                    benchmark_scenario: {
                        category: 'file_ingestion',
                        storage_path: 'benchmark-scenarios/e2e/workflow-file.json',
                    },
                },
            }, 201)
        }

        if (path === '/api/talos/files' && method === 'GET') {
            return json(route, { data: fileUploaded ? [filePayload(), ...importedDriveFiles] : importedDriveFiles })
        }

        if (path === '/api/talos/files/file-e2e' && method === 'GET') {
            return json(route, { data: fileDetailsPayload() })
        }

        if (path === '/api/talos/context-sets' && method === 'POST') {
            contextSetCreated = true
            return json(route, { data: contextSetPayload() }, 201)
        }

        if (path === '/api/talos/context-sets/context-set-e2e' && method === 'GET') {
            return json(route, { data: contextSetPayload() })
        }

        if (path === '/api/talos/runs' && method === 'GET') {
            return json(route, { data: [runPayload()] })
        }

        if (path === '/api/talos/runs/run-e2e' && method === 'GET') {
            return json(route, { data: runPayload() })
        }

        if (path === '/api/talos/runs/run-e2e/events' && method === 'GET') {
            return json(route, { data: runEventsPayload() })
        }

        if (path === '/api/talos/runs/run-e2e/replay' && method === 'GET') {
            return json(route, {
                run_id: 'run-e2e',
                replayable: true,
                controls: ['play', 'pause', 'step', 'filter'],
                speeds: ['0.5x', '1x', '2x'],
                filters: ['all', 'fault'],
                steps: [
                    { sequence: 1, type: 'node_started', label: 'Node started', kind: 'state', node_id: 'node-e2e', status_after: 'RUNNING' },
                    { sequence: 2, type: 'node_failed', label: 'HTTP 503 failure', kind: 'fault', node_id: 'node-e2e', status_after: 'FAILED' },
                    { sequence: 3, type: 'node_blocked', label: 'Blocked by node-e2e', kind: 'fault', node_id: 'node-child-e2e', status_after: 'BLOCKED_BY_DEPENDENCY' },
                ],
                final_node_statuses: {
                    'node-e2e': 'FAILED',
                    'node-child-e2e': 'BLOCKED_BY_DEPENDENCY',
                },
            })
        }

        if (path === '/api/talos/runs/run-e2e/artifacts' && method === 'GET') {
            return json(route, { data: runArtifactsPayload() })
        }

        if (path === '/api/talos/runs/run-e2e/recover' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>

            return json(route, {
                data: {
                    run: {
                        ...runPayload(),
                        status: 'queued',
                        metadata: {
                            source: 'e2e',
                            last_recovery: {
                                action: body.action,
                                node_id: body.node_id,
                                target_status: 'RETRYING',
                                requested_at: now,
                            },
                        },
                    },
                    events: [
                        {
                            id: 'event-e2e-recovery-1',
                            run_id: 'run-e2e',
                            sequence: 4,
                            event_type: 'recovery.requested',
                            severity: 'info',
                            node_id: body.node_id,
                            payload: {
                                action: body.action,
                                reason: body.reason,
                                target_status: 'RETRYING',
                                scope: 'node',
                            },
                            occurred_at: now,
                            created_at: now,
                            updated_at: now,
                        },
                        {
                            id: 'event-e2e-recovery-2',
                            run_id: 'run-e2e',
                            sequence: 5,
                            event_type: 'node.status_changed',
                            severity: 'info',
                            node_id: body.node_id,
                            payload: {
                                status: 'RETRYING',
                                source: 'hmi_recovery',
                                action: body.action,
                            },
                            occurred_at: now,
                            created_at: now,
                            updated_at: now,
                        },
                    ],
                },
            }, 201)
        }

        if (path === '/api/talos/runs/run-e2e/benchmark' && method === 'POST') {
            return json(route, {
                report_type: 'benchmark_evidence',
                benchmark_group: runBenchmarkGroupPayload(false),
                benchmark_results: runBenchmarkGroupPayload(true).results,
                evidence_summary: { source: 'run-e2e' },
            })
        }

        if (path === '/api/talos/cookbook/overview' && method === 'GET') {
            return json(route, {
                data: {
                    profile: cookbookHardwareProfile,
                    runtimes: cookbookRuntimes,
                    models: cookbookModels,
                },
            })
        }

        if (path === '/api/talos/cookbook/hardware-scan' && method === 'POST') {
            cookbookHardwareProfile = cookbookHardwareProfilePayload()
            cookbookRuntimes = [cookbookRuntimePayload()]

            return json(route, {
                data: {
                    profile: cookbookHardwareProfile,
                    runtimes: cookbookRuntimes,
                },
            })
        }

        if (path === '/api/talos/cookbook/models' && method === 'GET') {
            return json(route, { data: cookbookModels })
        }

        if (path === '/api/talos/cookbook/models' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            const model = cookbookModelPayload({
                id: `catalog-model-e2e-${cookbookModels.length + 1}`,
                ...body,
            })
            cookbookModels = [model, ...cookbookModels]

            return json(route, { data: model }, 201)
        }

        if (path === '/api/talos/cookbook/download-preview' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>

            return json(route, {
                data: cookbookPreviewPayload(String(body.model_id ?? 'meta-llama/Llama-3.1-8B-Instruct'), String(body.runtime ?? 'ollama'), 'download'),
            })
        }

        if (path === '/api/talos/cookbook/serve-preview' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>

            return json(route, {
                data: cookbookPreviewPayload(String(body.model_id ?? 'meta-llama/Llama-3.1-8B-Instruct'), String(body.runtime ?? 'ollama'), 'serve'),
            })
        }

        if (path === '/api/talos/cookbook/dependencies' && method === 'GET') {
            return json(route, { data: cookbookDependencyCatalogPayload() })
        }

        if (path === '/api/talos/cookbook/dependencies/preview' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>

            return json(route, {
                data: cookbookDependencyPreviewPayload(String(body.model_id ?? 'meta-llama/Llama-3.1-8B-Instruct'), String(body.runtime ?? 'ollama')),
            })
        }

        if (path === '/api/talos/cookbook/policy' && method === 'GET') {
            return json(route, { data: cookbookDependencyPolicyPayload() })
        }

        if (path === '/api/talos/research-reports' && method === 'GET') {
            return json(route, { data: researchReports })
        }

        if (path === '/api/talos/research-reports' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
                ? body.metadata as Record<string, unknown>
                : {}
            const report = researchReportPayload({
                id: `research-report-e2e-${researchReports.length + 1}`,
                title: body.title,
                query: body.query,
                metadata: {
                    ...metadata,
                    queue_status: metadata.queue_status ?? 'queued',
                },
            })
            researchReports = [report, ...researchReports]

            return json(route, { data: report }, 201)
        }

        const researchReportExportMatch = path.match(/^\/api\/talos\/research-reports\/([^/]+)\/export$/)
        if (researchReportExportMatch && method === 'GET') {
            return json(route, {
                data: {
                    research_report_id: researchReportExportMatch[1],
                    format: 'markdown',
                    mime_type: 'text/markdown',
                    export_status: 'complete',
                    content: '# E2E research report\n\nSource-backed evidence.',
                    generated_at: now,
                },
            })
        }

        const researchReportFollowUpMatch = path.match(/^\/api\/talos\/research-reports\/([^/]+)\/follow-up-session$/)
        if (researchReportFollowUpMatch && method === 'POST') {
            return json(route, {
                data: {
                    id: 'session-research-follow-up-e2e',
                    title: 'Follow-up: AVM evidence review',
                    mode: 'research_follow_up',
                    persistence_mode: 'persistent',
                    metadata: {
                        source: 'research_report_follow_up',
                        research_report_id: researchReportFollowUpMatch[1],
                    },
                    created_at: now,
                    updated_at: now,
                },
            }, 201)
        }

        if (path === '/api/talos/google/accounts' && method === 'GET') {
            return json(route, { data: googleAccounts })
        }

        if (path === '/api/talos/google/disconnect' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            googleAccounts = googleAccounts.map((account) => account.id === body.account_id
                ? {
                    ...account,
                    status: 'revoked',
                    has_access_token: false,
                    has_refresh_token: false,
                    last_used_at: now,
                    last_error: null,
                    updated_at: now,
                }
                : account)

            return json(route, {
                data: googleAccounts.find((account) => account.id === body.account_id)
                    ?? googleAccountPayload({ id: body.account_id, status: 'revoked', has_access_token: false, has_refresh_token: false }),
            })
        }

        if (path === '/api/talos/google/drive/files' && method === 'GET') {
            return json(route, { data: googleDriveFilesPayload() })
        }

        if (path === '/api/talos/google/drive/import' && method === 'POST') {
            const imported = googleImportedFilePayload()
            importedDriveFiles = [imported, ...importedDriveFiles.filter((file) => file.id !== imported.id)]

            return json(route, { data: imported }, 201)
        }

        if (path === '/api/talos/google/calendar/calendars' && method === 'GET') {
            return json(route, { data: googleCalendarListPayload() })
        }

        if (path === '/api/talos/google/calendar/sync' && method === 'POST') {
            const payload = googleCalendarSyncPayload()
            calendarDrafts = [
                ...payload.events,
                ...calendarDrafts.filter((draft) => draft.id !== payload.events[0].id),
            ]

            return json(route, { data: payload })
        }

        const googleCalendarPublishMatch = path.match(/^\/api\/talos\/google\/calendar\/drafts\/([^/]+)\/publish$/)
        if (googleCalendarPublishMatch && method === 'POST') {
            return json(route, {
                code: 'GOOGLE_CALENDAR_WRITE_SCOPE_REQUIRED',
                message: 'Google Calendar write scope is not granted.',
            }, 403)
        }

        if (path === '/api/talos/calendar-drafts' && method === 'GET') {
            return json(route, { data: calendarDrafts })
        }

        if (path === '/api/talos/calendar-drafts' && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            const draft = calendarDraftPayload({
                id: `calendar-draft-e2e-${calendarDrafts.length + 1}`,
                title: body.title,
                description: body.description ?? null,
                starts_at: body.starts_at,
                ends_at: body.ends_at,
                timezone: body.timezone,
                attendees: body.attendees ?? [],
                metadata: body.metadata ?? {},
            })
            calendarDrafts = [draft, ...calendarDrafts]

            return json(route, { data: draft }, 201)
        }

        const calendarConfirmMatch = path.match(/^\/api\/talos\/calendar-drafts\/([^/]+)\/confirm$/)
        if (calendarConfirmMatch && method === 'POST') {
            calendarDrafts = calendarDrafts.map((draft) => draft.id === calendarConfirmMatch[1]
                ? {
                    ...draft,
                    status: 'confirmed',
                    confirmation_required: false,
                    confirmed_at: now,
                }
                : draft)

            return json(route, {
                data: calendarDrafts.find((draft) => draft.id === calendarConfirmMatch[1])
                    ?? calendarDraftPayload({ id: calendarConfirmMatch[1], status: 'confirmed', confirmation_required: false, confirmed_at: now }),
            })
        }

        const researchReportMatch = path.match(/^\/api\/talos\/research-reports\/([^/]+)$/)
        if (researchReportMatch && method === 'GET') {
            const report = researchReports.find((item) => item.id === researchReportMatch[1])

            return json(route, { data: report ?? researchReportPayload({ id: researchReportMatch[1] }) })
        }

        if (path === '/api/talos/benchmark-groups' && method === 'GET') {
            const groups = [
                ...(modelComparisonPromoted ? [modelComparisonBenchmarkGroupPayload(false)] : []),
                ...(comparisonCreated ? [comparisonBenchmarkGroupPayload(false)] : []),
                benchmarkGroupPayload(false),
            ]

            return json(route, {
                data: groups,
            })
        }

        if (path === '/api/talos/benchmark-groups/benchmark-group-e2e' && method === 'GET') {
            return json(route, { data: benchmarkGroupPayload(true) })
        }

        if (path === '/api/talos/benchmark-groups/benchmark-group-model-comparison-e2e' && method === 'GET') {
            return json(route, { data: modelComparisonBenchmarkGroupPayload(true) })
        }

        if (path === '/api/talos/benchmark-groups/benchmark-group-compare-e2e' && method === 'GET') {
            return json(route, { data: comparisonBenchmarkGroupPayload(true) })
        }

        if (path === '/api/talos/benchmark-groups/benchmark-group-from-run-e2e' && method === 'GET') {
            return json(route, { data: runBenchmarkGroupPayload(true) })
        }

        if (path === '/api/talos/benchmark-groups/benchmark-group-e2e/export' && method === 'GET') {
            return json(route, {
                schema_version: 1,
                report_type: 'talos_benchmark_export',
                export_status: 'complete',
                benchmark_group: benchmarkGroupPayload(false),
                fairness_contract: {
                    same_prompt: 'prompthash-e2e',
                    same_context: 'contexthash-e2e',
                    same_evaluator: 'kadmos-core-benchmark-v1',
                },
                results: benchmarkGroupPayload(true).results,
            })
        }

        if ([
            '/api/talos/email/messages',
            '/api/talos/email/drafts',
            '/api/talos/connectors',
            '/api/talos/tools',
            '/api/talos/memories',
            '/api/talos/memories/retrieval-context',
            '/api/talos/skills',
            '/api/talos/notes',
            '/api/talos/tasks',
            '/api/talos/documents',
            '/api/talos/artifacts',
        ].includes(path) && method === 'GET') {
            return emptyData(route)
        }

        if (path === '/api/talos/email/connector-status') {
            return json(route, {
                configured: false,
                read_enabled: false,
                draft_enabled: true,
                send_enabled: false,
                status: 'degraded',
            })
        }

        if (path === '/api/talos/tools/planning-context') {
            return json(route, {
                data: {
                    source: 'talos_tool_registry',
                    policy: {
                        disabled_tools_excluded: true,
                        disabled_connectors_excluded: true,
                        tool_outputs_are_untrusted: true,
                    },
                    tools: [],
                },
            })
        }

        if (path === '/api/talos/skills/planning-context') {
            return json(route, {
                data: {
                    source: 'talos_skill_registry',
                    policy: {
                        approved_only: true,
                        eval_pass_required: true,
                        allowed_tools_are_capability_boundary: true,
                        untrusted_imports_excluded: true,
                        internal_dev_excluded: true,
                        exclusion_reasons_are_reported: true,
                    },
                    skills: [],
                    excluded_skills: [],
                },
            })
        }

        if (path === '/api/benchmarks/compare' && method === 'POST') {
            comparisonCreated = true
            const group = comparisonBenchmarkGroupPayload(true)

            return json(route, {
                report_type: 'benchmark_evidence',
                benchmark_group: {
                    ...group,
                    results: undefined,
                },
                benchmark_results: group.results,
                evidence_summary: { source: 'e2e' },
                scenario: { path: 'benchmark-scenarios/e2e/generated.json' },
                modes: {},
                comparison: {},
            })
        }

        if (path.startsWith('/api/talos/') || path === '/api/files/ingest' || path === '/api/benchmarks/compare') {
            return json(route, {
                error: 'UNHANDLED_E2E_API_MOCK',
                path,
                method,
            }, 501)
        }

        return route.continue()
    })
}
