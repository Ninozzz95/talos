import { z } from 'zod'

export const HUMAN_JOURNEY_SCHEMA_VERSION = 1 as const
export const HUMAN_JOURNEY_CONTRACT_NAMESPACE = 'talos.human_journey' as const

const contract = <const Name extends string>(name: Name) => (
    z.literal(`${HUMAN_JOURNEY_CONTRACT_NAMESPACE}.${name}` as const)
)
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const scenarioIdentifier = z.string().min(1).max(128).regex(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/)
const regressionIdentifier = z.string().regex(/^HJREG-[0-9]{3,6}$/)
const shortText = z.string().min(1).max(256)
const descriptionText = z.string().min(1).max(2_000)
const messageText = z.string().min(1).max(12_000)
const timestamp = z.iso.datetime()
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const mediaType = z.string().min(3).max(128).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i)
const relativePath = z.string().min(1).max(1_024).superRefine((value, context) => {
    const segments = value.split('/')
    if (
        value.includes('\\')
        || value.startsWith('/')
        || /^[A-Za-z]:/.test(value)
        || /[\u0000-\u001f\u007f]/.test(value)
        || segments.includes('.')
        || segments.includes('..')
        || segments.includes('')
    ) {
        context.addIssue({ code: 'custom', message: 'Path must be relative, slash-normalized and traversal-free.' })
    }
})

function requireUnique<T>(values: T[], context: z.RefinementCtx, key: (value: T) => string, label: string) {
    const seen = new Set<string>()
    for (const value of values) {
        const identity = key(value)
        if (seen.has(identity)) {
            context.addIssue({ code: 'custom', message: `Duplicate ${label}: ${identity}` })
        }
        seen.add(identity)
    }
}

export const HumanActionKindSchema = z.enum([
    'send_message',
    'click_visible_control',
    'attach_fixture',
    'reload_page',
    'wait_for_visible_state',
    'yield_to_simulator',
    'request_director_override',
    'end_trial',
])
export type HumanActionKind = z.infer<typeof HumanActionKindSchema>

export const HumanActorModeSchema = z.enum([
    'seeded_persona',
    'adaptive_simulator',
    'agent_override',
    'frozen_replay',
])
export type HumanActorMode = z.infer<typeof HumanActorModeSchema>

const personaTrait = z.enum(['novice', 'hurried', 'typo_prone', 'expert', 'ambiguous', 'skeptical'])
const graderKind = z.enum([
    'conversation_continuity',
    'browser_mode_persistence',
    'canonical_tool_execution',
    'owned_screenshot_artifact',
    'post_action_evidence',
    'no_duplicate_side_effect',
    'no_raw_fault',
    'reload_persistence',
    'terminal_state',
    'cleanup',
])

const budget = z.strictObject({
    max_turns: z.int().min(1).max(64),
    max_tool_calls: z.int().min(0).max(128),
    max_duration_ms: z.int().min(1_000).max(900_000),
    max_provider_tokens: z.int().min(0).max(2_000_000),
    max_cost_usd: z.number().min(0).max(1_000),
})

const remainingBudget = z.strictObject({
    turns: z.int().min(0).max(64),
    tool_calls: z.int().min(0).max(128),
    duration_ms: z.int().min(0).max(900_000),
    provider_tokens: z.int().min(0).max(2_000_000),
    cost_usd: z.number().min(0).max(1_000),
})

const scenarioCheckpoint = z.strictObject({
    id: identifier,
    description: descriptionText,
    required_visible_outcomes: z.array(descriptionText).min(1).max(16),
    acceptable_alternatives: z.array(descriptionText).max(16),
    timeout_ms: z.int().min(100).max(120_000),
})

const scenarioGrader = z.strictObject({
    id: identifier,
    kind: graderKind,
    expected_outcome: descriptionText,
    required: z.boolean(),
})

export const HumanJourneyScenarioSchema = z.strictObject({
    contract: contract('scenario'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    id: scenarioIdentifier,
    title: shortText,
    goal: z.string().min(1).max(4_000),
    user_facts: z.array(z.string().min(1).max(1_000)).max(32),
    persona: z.strictObject({
        id: identifier,
        language: z.string().min(2).max(16).regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
        traits: z.array(personaTrait).min(1).max(6),
    }).superRefine((value, context) => requireUnique(value.traits, context, (trait) => trait, 'persona trait')),
    initial_state: z.strictObject({
        route: z.string().min(1).max(512).regex(/^\/[^\s]*$/),
        authenticated: z.boolean(),
        browse_enabled: z.boolean(),
        conversation: z.array(z.strictObject({
            role: z.enum(['user', 'assistant', 'system']),
            content: messageText,
        })).max(16),
        fixture_ids: z.array(identifier).max(16),
    }).superRefine((value, context) => requireUnique(value.fixture_ids, context, (id) => id, 'fixture ID')),
    allowed_actions: z.array(HumanActionKindSchema).min(1).max(8),
    checkpoints: z.array(scenarioCheckpoint).min(1).max(32),
    forbidden_outcomes: z.array(z.strictObject({
        id: identifier,
        description: descriptionText,
    })).min(1).max(32),
    budgets: budget,
    perturbations: z.array(z.strictObject({
        id: identifier,
        kind: z.enum(['reload', 'browse_disabled', 'stale_frame', 'worker_restart', 'provider_malformed', 'provider_unavailable']),
        at_checkpoint: identifier,
        recovery_expectation: descriptionText,
    })).max(16),
    graders: z.array(scenarioGrader).min(1).max(16),
    semantic_rubric: z.strictObject({
        criteria: z.array(descriptionText).min(1).max(8),
        minimum_score: z.number().min(0).max(1),
    }).nullable(),
    cleanup: z.strictObject({
        strategy: z.literal('isolated_run'),
        preserve_failure_evidence: z.boolean(),
        max_retention_days: z.int().min(1).max(30),
    }),
}).superRefine((value, context) => {
    requireUnique(value.allowed_actions, context, (action) => action, 'allowed action')
    requireUnique(value.checkpoints, context, (checkpoint) => checkpoint.id, 'checkpoint ID')
    requireUnique(value.forbidden_outcomes, context, (outcome) => outcome.id, 'forbidden outcome ID')
    requireUnique(value.perturbations, context, (perturbation) => perturbation.id, 'perturbation ID')
    requireUnique(value.graders, context, (grader) => grader.id, 'grader ID')
    const checkpointIds = new Set(value.checkpoints.map((checkpoint) => checkpoint.id))
    for (const perturbation of value.perturbations) {
        if (!checkpointIds.has(perturbation.at_checkpoint)) {
            context.addIssue({ code: 'custom', message: `Unknown perturbation checkpoint: ${perturbation.at_checkpoint}` })
        }
    }
})
export type HumanJourneyScenario = z.infer<typeof HumanJourneyScenarioSchema>

const turnBase = {
    contract: contract('turn'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    turn_id: identifier,
    checkpoint_id: identifier,
    source: HumanActorModeSchema,
    created_at: timestamp,
}

const visibleControl = z.strictObject({
    role: z.enum(['button', 'link', 'menuitem', 'tab', 'checkbox', 'switch']),
    name: shortText,
    exact: z.literal(true),
})

export const HumanTurnSchema = z.discriminatedUnion('action', [
    z.strictObject({ ...turnBase, action: z.literal('send_message'), message: messageText }),
    z.strictObject({ ...turnBase, action: z.literal('click_visible_control'), control: visibleControl }),
    z.strictObject({ ...turnBase, action: z.literal('attach_fixture'), fixture_id: identifier }),
    z.strictObject({ ...turnBase, action: z.literal('reload_page') }),
    z.strictObject({ ...turnBase, action: z.literal('wait_for_visible_state'), description: descriptionText, timeout_ms: z.int().min(100).max(120_000) }),
    z.strictObject({ ...turnBase, action: z.literal('yield_to_simulator'), reason: descriptionText }),
    z.strictObject({ ...turnBase, action: z.literal('request_director_override'), reason: descriptionText }),
    z.strictObject({ ...turnBase, action: z.literal('end_trial'), outcome: z.enum(['goal_reached', 'blocked', 'aborted']), reason: descriptionText }),
])
export type HumanTurn = z.infer<typeof HumanTurnSchema>

const availableAction = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('send_message'), label: shortText }),
    z.strictObject({ kind: z.literal('click_visible_control'), label: shortText, control: visibleControl }),
    z.strictObject({ kind: z.literal('attach_fixture'), label: shortText, fixture_ids: z.array(identifier).min(1).max(16) }),
    z.strictObject({ kind: z.literal('reload_page'), label: shortText }),
    z.strictObject({ kind: z.literal('wait_for_visible_state'), label: shortText }),
    z.strictObject({ kind: z.literal('yield_to_simulator'), label: shortText }),
    z.strictObject({ kind: z.literal('request_director_override'), label: shortText }),
    z.strictObject({ kind: z.literal('end_trial'), label: shortText }),
])

export const HumanObservationSchema = z.strictObject({
    contract: contract('observation'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    trial_id: identifier,
    scenario_id: scenarioIdentifier,
    checkpoint_id: identifier,
    route: z.string().min(1).max(512).regex(/^\/[^\s]*$/),
    transcript: z.array(z.strictObject({
        role: z.enum(['user', 'assistant', 'system']),
        content: messageText,
        occurred_at: timestamp,
    })).max(64),
    visible_regions: z.array(z.strictObject({
        role: z.enum(['main', 'region', 'dialog', 'navigation', 'status', 'alert', 'form']),
        name: shortText,
        text: z.string().min(1).max(4_000),
    })).max(128),
    available_actions: z.array(availableAction).max(16),
    available_fixtures: z.array(z.strictObject({
        id: identifier,
        name: shortText,
        media_type: mediaType,
        bytes: z.int().min(0).max(100 * 1024 * 1024),
    })).max(16),
    prior_actions: z.array(HumanTurnSchema).max(64),
    remaining_budget: remainingBudget,
    captured_at: timestamp,
    visible_state_sha256: sha256,
}).superRefine((value, context) => {
    requireUnique(value.available_actions, context, (action) => {
        if (action.kind === 'click_visible_control') {
            return `${action.kind}:${action.control.role}:${action.control.name}`
        }
        if (action.kind === 'attach_fixture') {
            return `${action.kind}:${action.fixture_ids.join(',')}`
        }
        return action.kind
    }, 'available action')
    requireUnique(value.available_fixtures, context, (fixture) => fixture.id, 'available fixture ID')
    const availableFixtureIds = new Set(value.available_fixtures.map((fixture) => fixture.id))
    for (const action of value.available_actions) {
        if (action.kind !== 'attach_fixture') continue
        requireUnique(action.fixture_ids, context, (fixtureId) => fixtureId, 'attach action fixture ID')
        for (const fixtureId of action.fixture_ids) {
            if (!availableFixtureIds.has(fixtureId)) {
                context.addIssue({ code: 'custom', message: `Attach action references unavailable fixture: ${fixtureId}` })
            }
        }
    }
})
export type HumanObservation = z.infer<typeof HumanObservationSchema>

const graderResult = z.strictObject({
    grader_id: identifier,
    kind: graderKind,
    passed: z.boolean(),
    reason: descriptionText,
    evidence_refs: z.array(identifier).max(32),
})

export const HumanJourneyTrialResultSchema = z.strictObject({
    contract: contract('trial_result'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    trial_id: identifier,
    scenario_id: scenarioIdentifier,
    seed: z.int().min(0).max(4_294_967_295),
    actor_mode: HumanActorModeSchema,
    classification: z.enum(['deterministic_autonomous', 'adaptive_autonomous', 'discovery_assisted', 'frozen_replay']),
    status: z.enum(['passed', 'failed', 'blocked', 'cancelled']),
    promotion_eligible: z.boolean(),
    started_at: timestamp,
    finished_at: timestamp,
    duration_ms: z.int().min(0).max(900_000),
    turns: z.array(HumanTurnSchema).max(64),
    grader_results: z.array(graderResult).min(1).max(16),
    metrics: z.strictObject({
        turn_count: z.int().min(0).max(64),
        tool_call_count: z.int().min(0).max(128),
        provider_tokens: z.int().min(0).max(2_000_000),
        latency_ms: z.int().min(0).max(900_000),
        cost_usd: z.number().min(0).max(1_000),
    }),
    failure: z.strictObject({
        code: identifier,
        category: z.enum(['product', 'provider', 'worker', 'policy', 'validation', 'harness', 'environment']),
        message: descriptionText,
        replay_command: z.string().min(1).max(2_000),
    }).nullable(),
    evidence_manifest_path: relativePath.nullable(),
}).superRefine((value, context) => {
    const expectedClassification: Record<HumanActorMode, typeof value.classification> = {
        seeded_persona: 'deterministic_autonomous',
        adaptive_simulator: 'adaptive_autonomous',
        agent_override: 'discovery_assisted',
        frozen_replay: 'frozen_replay',
    }
    if (value.classification !== expectedClassification[value.actor_mode]) {
        context.addIssue({ code: 'custom', message: `Actor mode ${value.actor_mode} requires classification ${expectedClassification[value.actor_mode]}.` })
    }
    if (value.actor_mode === 'agent_override') {
        if (!value.turns.some((turn) => turn.source === 'agent_override')) {
            context.addIssue({ code: 'custom', message: 'Agent override mode requires at least one agent_override turn.' })
        }
    } else if (value.turns.some((turn) => turn.source !== value.actor_mode)) {
        context.addIssue({ code: 'custom', message: `Autonomous trial turns must all use actor source ${value.actor_mode}.` })
    }
    const assisted = value.actor_mode === 'agent_override' || value.turns.some((turn) => turn.source === 'agent_override')
    if (assisted && value.classification !== 'discovery_assisted') {
        context.addIssue({ code: 'custom', message: 'Agent-assisted trials must be classified as discovery_assisted.' })
    }
    if (assisted && value.promotion_eligible) {
        context.addIssue({ code: 'custom', message: 'Agent-assisted trials are never promotion eligible.' })
    }
    if (value.promotion_eligible && (value.status !== 'passed' || value.classification === 'discovery_assisted' || value.grader_results.some((grader) => !grader.passed))) {
        context.addIssue({ code: 'custom', message: 'Promotion requires an autonomous passing trial and passing graders.' })
    }
    if (value.status === 'passed' && value.turns.length === 0) {
        context.addIssue({ code: 'custom', message: 'Passing human journey trials require at least one turn.' })
    }
    if (value.promotion_eligible && value.evidence_manifest_path === null) {
        context.addIssue({ code: 'custom', message: 'Promotion requires an evidence manifest.' })
    }
    if ((value.status === 'passed') !== (value.failure === null)) {
        context.addIssue({ code: 'custom', message: 'Passing trials cannot have a failure; non-passing trials require one.' })
    }
    if (Date.parse(value.finished_at) < Date.parse(value.started_at)) {
        context.addIssue({ code: 'custom', message: 'finished_at cannot precede started_at.' })
    }
    if (value.metrics.turn_count !== value.turns.length) {
        context.addIssue({ code: 'custom', message: 'metrics.turn_count must equal the number of recorded turns.' })
    }
    requireUnique(value.turns, context, (turn) => turn.turn_id, 'turn ID')
    requireUnique(value.grader_results, context, (grader) => grader.grader_id, 'grader result ID')
})
export type HumanJourneyTrialResult = z.infer<typeof HumanJourneyTrialResultSchema>

export const HumanJourneyEvidenceManifestSchema = z.strictObject({
    contract: contract('evidence_manifest'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    trial_id: identifier,
    scenario_id: scenarioIdentifier,
    root: relativePath,
    artifacts: z.array(z.strictObject({
        id: identifier,
        kind: z.enum(['playwright_trace', 'screenshot', 'video', 'talos_export', 'worker_evidence', 'artifact', 'report', 'log']),
        relative_path: relativePath,
        media_type: mediaType,
        bytes: z.int().min(0).max(10 * 1024 * 1024 * 1024),
        sha256,
        retained: z.boolean(),
    })).max(256),
    redaction: z.strictObject({
        applied: z.boolean(),
        secret_canary_absent: z.boolean(),
        notes: z.array(z.string().min(1).max(512)).max(16),
    }),
    created_at: timestamp,
}).superRefine((value, context) => {
    requireUnique(value.artifacts, context, (artifact) => artifact.id, 'artifact ID')
    requireUnique(value.artifacts, context, (artifact) => artifact.relative_path, 'artifact path')
})
export type HumanJourneyEvidenceManifest = z.infer<typeof HumanJourneyEvidenceManifestSchema>

export const DirectorCheckpointSchema = z.strictObject({
    contract: contract('director_checkpoint'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    request_id: identifier,
    trial_id: identifier,
    scenario_id: scenarioIdentifier,
    checkpoint_id: identifier,
    observation: HumanObservationSchema,
    allowed_actions: z.array(HumanActionKindSchema).min(1).max(8),
    remaining_budget: remainingBudget,
    observation_sha256: sha256,
    created_at: timestamp,
    expires_at: timestamp,
}).superRefine((value, context) => {
    requireUnique(value.allowed_actions, context, (action) => action, 'director action')
    if (value.trial_id !== value.observation.trial_id) {
        context.addIssue({ code: 'custom', message: 'Director checkpoint trial_id must match its observation.' })
    }
    if (value.scenario_id !== value.observation.scenario_id) {
        context.addIssue({ code: 'custom', message: 'Director checkpoint scenario_id must match its observation.' })
    }
    if (value.checkpoint_id !== value.observation.checkpoint_id) {
        context.addIssue({ code: 'custom', message: 'Director checkpoint checkpoint_id must match its observation.' })
    }
    const budgetFields = ['turns', 'tool_calls', 'duration_ms', 'provider_tokens', 'cost_usd'] as const
    if (budgetFields.some((field) => value.remaining_budget[field] !== value.observation.remaining_budget[field])) {
        context.addIssue({ code: 'custom', message: 'Director checkpoint remaining_budget must match its observation.' })
    }
    const visibleActionKinds = new Set(value.observation.available_actions.map((action) => action.kind))
    for (const action of value.allowed_actions) {
        if (!visibleActionKinds.has(action)) {
            context.addIssue({ code: 'custom', message: `Director action is not available in the observation: ${action}` })
        }
    }
    if (Date.parse(value.expires_at) <= Date.parse(value.created_at)) {
        context.addIssue({ code: 'custom', message: 'Director checkpoint must expire after creation.' })
    }
})
export type DirectorCheckpoint = z.infer<typeof DirectorCheckpointSchema>

export const DirectorDecisionSchema = z.strictObject({
    contract: contract('director_decision'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    decision_id: identifier,
    request_id: identifier,
    observation_sha256: sha256,
    director: z.strictObject({
        provider: identifier,
        model: z.string().min(1).max(256),
        configuration_sha256: sha256,
    }),
    category: z.enum(['rephrase', 'adversarial', 'recovery', 'explore', 'minimize', 'abort', 'return_control']),
    turn: HumanTurnSchema,
    request_sha256: sha256,
    created_at: timestamp,
}).superRefine((value, context) => {
    if (value.turn.source !== 'agent_override') {
        context.addIssue({ code: 'custom', message: 'Director decisions must emit an agent_override turn.' })
    }
})
export type DirectorDecision = z.infer<typeof DirectorDecisionSchema>

export const FrozenRegressionObservationSchema = z.strictObject({
    turn_id: identifier,
    checkpoint_id: identifier,
    visible_state_sha256: sha256,
})
export type FrozenRegressionObservation = z.infer<typeof FrozenRegressionObservationSchema>

export const FrozenRegressionVerificationSchema = z.strictObject({
    red_command: z.string().trim().min(1).max(2_000),
    green_command: z.string().trim().min(1).max(2_000),
    affected_command: z.string().trim().min(1).max(2_000),
    dynamic_rerun_command: z.string().trim().min(1).max(2_000),
})
export type FrozenRegressionVerification = z.infer<typeof FrozenRegressionVerificationSchema>

export const FrozenHumanJourneyRegressionSchema = z.strictObject({
    contract: contract('frozen_regression'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    id: regressionIdentifier,
    scenario_id: scenarioIdentifier,
    source_trial_id: identifier,
    failure_class: identifier,
    turns: z.array(HumanTurnSchema).min(1).max(64),
    observations: z.array(FrozenRegressionObservationSchema).min(1).max(64),
    expected: z.strictObject({
        required_status: z.literal('passed'),
        required_grader_ids: z.array(identifier).min(1).max(16),
        forbidden_error_codes: z.array(identifier).max(32),
    }),
    verification: FrozenRegressionVerificationSchema,
    environment_sha256: sha256,
    created_at: timestamp,
}).superRefine((value, context) => {
    if (value.turns.some((turn) => turn.source !== 'frozen_replay')) {
        context.addIssue({ code: 'custom', message: 'Frozen regressions may contain only frozen_replay turns.' })
    }
    requireUnique(value.turns, context, (turn) => turn.turn_id, 'frozen turn ID')
    requireUnique(value.observations, context, (observation) => observation.turn_id, 'frozen observation turn ID')
    requireUnique(value.expected.required_grader_ids, context, (id) => id, 'required grader ID')
    requireUnique(value.expected.forbidden_error_codes, context, (code) => code, 'forbidden error code')
    if (value.observations.length !== value.turns.length) {
        context.addIssue({ code: 'custom', message: 'Every frozen turn requires exactly one ordered observation binding.' })
        return
    }
    for (let index = 0; index < value.turns.length; index += 1) {
        const turn = value.turns[index]!
        const observation = value.observations[index]!
        if (observation.turn_id !== turn.turn_id || observation.checkpoint_id !== turn.checkpoint_id) {
            context.addIssue({ code: 'custom', message: `Frozen observation ${index} must match its ordered turn and checkpoint.` })
        }
    }
})
export type FrozenHumanJourneyRegression = z.infer<typeof FrozenHumanJourneyRegressionSchema>

export const FrozenHumanJourneyRegressionCorpusSchema = z.strictObject({
    contract: contract('regression_corpus'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    regressions: z.array(FrozenHumanJourneyRegressionSchema).max(1_024),
}).superRefine((value, context) => requireUnique(value.regressions, context, (regression) => regression.id, 'regression ID'))
export type FrozenHumanJourneyRegressionCorpus = z.infer<typeof FrozenHumanJourneyRegressionCorpusSchema>

export const HumanJourneyRegressionCandidateSchema = z.strictObject({
    contract: contract('regression_candidate'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    status: z.literal('unpromoted'),
    source_trial: HumanJourneyTrialResultSchema,
    source_trial_sha256: sha256,
    regression: FrozenHumanJourneyRegressionSchema,
    minimization: z.strictObject({
        algorithm: z.literal('ddmin-v1'),
        original_turn_count: z.int().min(1).max(64),
        minimized_turn_count: z.int().min(1).max(64),
        oracle_evaluations: z.int().min(3).max(512),
        max_oracle_evaluations: z.int().min(4).max(512),
    }),
    created_at: timestamp,
}).superRefine((value, context) => {
    if (value.source_trial.status === 'passed' || value.source_trial.failure === null) {
        context.addIssue({ code: 'custom', message: 'Regression candidates require a failed source trial.' })
        return
    }
    if (value.source_trial.trial_id !== value.regression.source_trial_id) {
        context.addIssue({ code: 'custom', message: 'Regression source_trial_id must match the preserved source trial.' })
    }
    if (value.source_trial.scenario_id !== value.regression.scenario_id) {
        context.addIssue({ code: 'custom', message: 'Regression scenario_id must match the preserved source trial.' })
    }
    if (value.source_trial.failure.code !== value.regression.failure_class) {
        context.addIssue({ code: 'custom', message: 'Regression failure_class must match the preserved source failure code.' })
    }
    if (value.minimization.original_turn_count !== value.source_trial.turns.length) {
        context.addIssue({ code: 'custom', message: 'original_turn_count must match the preserved source trial.' })
    }
    if (value.minimization.minimized_turn_count !== value.regression.turns.length) {
        context.addIssue({ code: 'custom', message: 'minimized_turn_count must match the frozen regression.' })
    }
    if (value.minimization.minimized_turn_count > value.minimization.original_turn_count) {
        context.addIssue({ code: 'custom', message: 'A frozen regression cannot contain more turns than its source trial.' })
    }
    if (value.minimization.oracle_evaluations > value.minimization.max_oracle_evaluations) {
        context.addIssue({ code: 'custom', message: 'Oracle evaluations cannot exceed the configured cap.' })
    }
})
export type HumanJourneyRegressionCandidate = z.infer<typeof HumanJourneyRegressionCandidateSchema>

const tau2Identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
const tau2OwnerIdentifier = z.string().regex(/^hj_[A-Za-z0-9_-]{8,96}$/)
const tau2Sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/)

function tau2BoundedUtf8(field: string, maximumBytes: number) {
    return z.string().superRefine((value, context) => {
        const bytes = Buffer.byteLength(value, 'utf8')
        if (bytes < 1 || bytes > maximumBytes) {
            context.addIssue({ code: 'custom', message: `${field} must contain between 1 and ${maximumBytes} UTF-8 bytes.` })
        }
        if ([...value].some((character) => {
            const codePoint = character.codePointAt(0) ?? 0
            return codePoint < 32 && character !== '\n' && character !== '\t'
        })) {
            context.addIssue({ code: 'custom', message: `${field} contains control characters.` })
        }
    })
}

function tau2Timestamp(field: string) {
    return z.string().superRefine((value, context) => {
        if (!/T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
            context.addIssue({ code: 'custom', message: `${field} must be an ISO-8601 timestamp with timezone.` })
        }
    })
}

export const Tau2PersonaSchema = z.strictObject({
    id: tau2Identifier,
    language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    traits: z.array(tau2BoundedUtf8('trait', 128)).min(1).max(16),
}).superRefine((value, context) => requireUnique(value.traits, context, (trait) => trait, 'tau2 persona trait'))
export type Tau2Persona = z.infer<typeof Tau2PersonaSchema>

export const Tau2TrialBudgetsSchema = z.strictObject({
    max_turns: z.int().min(1).max(64),
    max_provider_tokens: z.int().min(1).max(1_000_000),
    max_cost_usd: z.number().min(0).max(10_000),
    max_duration_ms: z.int().min(1_000).max(3_600_000),
})
export type Tau2TrialBudgets = z.infer<typeof Tau2TrialBudgetsSchema>

export const Tau2HumanScenarioSchema = z.strictObject({
    scenario_id: tau2Identifier,
    goal: tau2BoundedUtf8('goal', 4_000),
    user_facts: z.array(tau2BoundedUtf8('user fact', 1_000)).min(1).max(64),
    persona: Tau2PersonaSchema,
    allowed_actions: z.array(z.enum(['send_message', 'end_trial'])).min(1).max(2),
    budgets: Tau2TrialBudgetsSchema,
}).superRefine((value, context) => {
    requireUnique(value.user_facts, context, (fact) => fact, 'tau2 user fact')
    requireUnique(value.allowed_actions, context, (action) => action, 'tau2 allowed action')
})
export type Tau2HumanScenario = z.infer<typeof Tau2HumanScenarioSchema>

export const Tau2ModelUnderTestSchema = z.strictObject({
    provider_id: tau2Identifier,
    model: z.string().min(1).max(256),
    endpoint_sha256: tau2Sha256,
})
export type Tau2ModelUnderTest = z.infer<typeof Tau2ModelUnderTestSchema>

export const Tau2CreateTrialRequestSchema = z.strictObject({
    contract: z.literal('talos.human_journey.tau2.create_trial'),
    schema_version: z.literal(1),
    owner_id: tau2OwnerIdentifier,
    trial_index: z.int().min(0).max(1_000_000),
    seed: z.int().min(0).max(2_147_483_647),
    scenario: Tau2HumanScenarioSchema,
    model_under_test: Tau2ModelUnderTestSchema,
})
export type Tau2CreateTrialRequest = z.infer<typeof Tau2CreateTrialRequestSchema>

export const Tau2CreateTrialResponseSchema = z.strictObject({
    contract: z.literal('talos.human_journey.tau2.trial_created'),
    schema_version: z.literal(1),
    trial_id: tau2Identifier,
    trial_token: z.string().min(32).max(128),
    status: z.literal('ready'),
    max_turns: z.int().min(1).max(64),
})
export type Tau2CreateTrialResponse = z.infer<typeof Tau2CreateTrialResponseSchema>

export const Tau2NextTurnRequestSchema = z.strictObject({
    contract: z.literal('talos.human_journey.tau2.next_turn'),
    schema_version: z.literal(1),
    checkpoint_id: tau2Identifier,
    assistant_message: tau2BoundedUtf8('assistant_message', 20_000),
    observation_sha256: tau2Sha256,
    created_at: tau2Timestamp('created_at'),
})
export type Tau2NextTurnRequest = z.infer<typeof Tau2NextTurnRequestSchema>

export const Tau2TurnMetricsSchema = z.strictObject({
    prompt_tokens: z.int().min(0).max(1_000_000),
    completion_tokens: z.int().min(0).max(1_000_000),
    cost_usd: z.number().min(0).max(10_000),
    latency_ms: z.int().min(0).max(3_600_000),
})
export type Tau2TurnMetrics = z.infer<typeof Tau2TurnMetricsSchema>

const tau2TurnBase = {
    contract: z.literal('talos.human_journey.tau2.turn_response'),
    schema_version: z.literal(1),
    turn_index: z.int().min(0).max(64),
    metrics: Tau2TurnMetricsSchema,
    provider_response_sha256: tau2Sha256,
}

export const Tau2MessageTurnResponseSchema = z.strictObject({
    ...tau2TurnBase,
    kind: z.literal('message'),
    content: tau2BoundedUtf8('content', 20_000),
})
export type Tau2MessageTurnResponse = z.infer<typeof Tau2MessageTurnResponseSchema>

export const Tau2TerminalTurnResponseSchema = z.strictObject({
    ...tau2TurnBase,
    kind: z.literal('terminal'),
    outcome: z.enum([
        'goal_reached',
        'user_stopped',
        'transfer_requested',
        'out_of_scope',
        'budget_exhausted',
        'cancelled',
    ]),
    reason: tau2BoundedUtf8('reason', 2_000),
})
export type Tau2TerminalTurnResponse = z.infer<typeof Tau2TerminalTurnResponseSchema>

export const Tau2TurnResponseSchema = z.discriminatedUnion('kind', [
    Tau2MessageTurnResponseSchema,
    Tau2TerminalTurnResponseSchema,
])
export type Tau2TurnResponse = z.infer<typeof Tau2TurnResponseSchema>

export const Tau2ErrorResponseSchema = z.strictObject({
    error: z.strictObject({
        code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
        message: z.string().min(1).max(512),
    }),
})
export type Tau2ErrorResponse = z.infer<typeof Tau2ErrorResponseSchema>

const Tau2ConformanceParserSchema = z.enum([
    'create_trial',
    'trial_created',
    'next_turn',
    'turn_response',
])

export const Tau2ConformanceFixtureSchema = z.strictObject({
    contract: z.literal('talos.human_journey.tau2.conformance_fixture'),
    schema_version: z.literal(1),
    valid: z.strictObject({
        create_trial: Tau2CreateTrialRequestSchema,
        trial_created: Tau2CreateTrialResponseSchema,
        next_turn: Tau2NextTurnRequestSchema,
        message_response: Tau2MessageTurnResponseSchema,
        terminal_response: Tau2TerminalTurnResponseSchema,
    }),
    invalid: z.array(z.strictObject({
        name: z.string().min(1).max(256),
        parser: Tau2ConformanceParserSchema,
        value: z.unknown(),
    })).min(1).max(64),
})
export type Tau2ConformanceFixture = z.infer<typeof Tau2ConformanceFixtureSchema>
