import type { Page, Route } from '@playwright/test'

type Json = Record<string, unknown> | unknown[]
type PersistenceMode = 'persistent' | 'temporary'

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

function sessionPayload(title = 'E2E verified workflow', persistenceMode: PersistenceMode = 'persistent', id = 'session-e2e') {
    return {
        id,
        title,
        mode: 'verified_execution',
        persistence_mode: persistenceMode,
        active_model_profile_id: null,
        metadata: { surface: 'chat' },
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
            payload: { url: 'https://api.example.test/health' },
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
            payload: { reason: 'HTTP 503' },
            occurred_at: now,
            created_at: now,
            updated_at: now,
        },
    ]
}

export type InstallTalosApiMocksOptions = {
    initialSessions?: Array<{
        id: string
        title: string
        persistence_mode?: PersistenceMode
    }>
}

export async function installTalosApiMocks(page: Page, options: InstallTalosApiMocksOptions = {}) {
    let messageSequence = 0
    let fileUploaded = false
    let contextSetCreated = false
    let comparisonCreated = false
    let sessions = (options.initialSessions ?? []).map((session) => sessionPayload(
        session.title,
        session.persistence_mode ?? 'persistent',
        session.id,
    ))
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
                data: [
                    {
                        id: 'profile-e2e',
                        display_name: 'E2E server-side profile',
                        provider: 'openai',
                        model: 'gpt-e2e',
                        base_url: null,
                        status: 'healthy',
                        capabilities: {
                            json: true,
                            tools: true,
                            vision: false,
                            embeddings: true,
                            local: false,
                            remote: true,
                        },
                        probe_result: {
                            ok: true,
                            http_status: 200,
                            latency_ms: 118,
                            policy: {
                                public_url: true,
                            },
                        },
                        has_secret: true,
                        created_at: now,
                        updated_at: now,
                    },
                ],
            })
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
            const session = sessionPayload(String(body.title ?? 'E2E verified workflow'), activeSessionPersistenceMode, 'session-e2e')
            sessions = [session, ...sessions.filter((item) => item.id !== session.id)]
            return json(route, { data: session }, 201)
        }

        const sessionPatchMatch = path.match(/^\/api\/talos\/sessions\/([^/]+)$/)
        if (sessionPatchMatch && method === 'PATCH') {
            const body = request.postDataJSON() as Record<string, unknown>
            const sessionId = sessionPatchMatch[1]
            const existing = sessions.find((item) => item.id === sessionId)
            const persistenceMode = existing?.persistence_mode === 'temporary' ? 'temporary' : activeSessionPersistenceMode
            const session = sessionPayload(String(body.title ?? existing?.title ?? 'E2E verified workflow'), persistenceMode, sessionId)
            sessions = [session, ...sessions.filter((item) => item.id !== session.id)]
            return json(route, { data: session })
        }

        const sessionMessagesMatch = path.match(/^\/api\/talos\/sessions\/([^/]+)\/messages$/)
        if (sessionMessagesMatch && method === 'GET') {
            return json(route, { data: [] })
        }

        if (sessionMessagesMatch && method === 'POST') {
            const body = request.postDataJSON() as Record<string, unknown>
            messageSequence += 1
            return json(route, { data: messagePayload(body, messageSequence, sessionMessagesMatch[1]) }, 201)
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
            return json(route, { data: fileUploaded ? [filePayload()] : [] })
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
                ],
                final_node_statuses: {
                    'node-e2e': 'FAILED',
                },
            })
        }

        if (path === '/api/talos/runs/run-e2e/benchmark' && method === 'POST') {
            return json(route, {
                report_type: 'benchmark_evidence',
                benchmark_group: runBenchmarkGroupPayload(false),
                benchmark_results: runBenchmarkGroupPayload(true).results,
                evidence_summary: { source: 'run-e2e' },
            })
        }

        if (path === '/api/talos/benchmark-groups' && method === 'GET') {
            return json(route, {
                data: comparisonCreated
                    ? [comparisonBenchmarkGroupPayload(false), benchmarkGroupPayload(false)]
                    : [benchmarkGroupPayload(false)],
            })
        }

        if (path === '/api/talos/benchmark-groups/benchmark-group-e2e' && method === 'GET') {
            return json(route, { data: benchmarkGroupPayload(true) })
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
            '/api/talos/research-reports',
            '/api/talos/email/messages',
            '/api/talos/email/drafts',
            '/api/talos/connectors',
            '/api/talos/tools',
            '/api/talos/memories',
            '/api/talos/memories/retrieval-context',
            '/api/talos/skills',
            '/api/talos/notes',
            '/api/talos/tasks',
            '/api/talos/calendar-drafts',
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

        if (path === '/api/talos/tools/planning-context' || path === '/api/talos/skills/planning-context') {
            return json(route, { data: [] })
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
