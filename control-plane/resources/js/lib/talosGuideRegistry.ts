export type TalosGuideEntry = {
    id: string
    title: string
    summary: string
    details: string
    available: boolean
}

function guide(id: string, title: string, summary: string, details: string): TalosGuideEntry {
    return { id, title, summary, details, available: true }
}

export const TALOS_GUIDE_REGISTRY = {
    'rail.runtime': guide('rail.runtime', 'Cockpit', 'Inspect persisted runs, events and execution evidence.', 'Use Cockpit to review node state, replay a trace, inspect artifacts and request guarded recovery for an existing run.'),
    'rail.calendar': guide('rail.calendar', 'Calendar', 'Review calendar data and TALOS-generated drafts.', 'Calendar keeps external writes behind connector scope, policy checks and explicit confirmation. Drafting does not publish an event.'),
    'rail.compare': guide('rail.compare', 'Benchmarks', 'Compare matched AVM ON and AVM OFF benchmark lanes.', 'Results are meaningful only when prompt, model, context and evaluator match. Open a comparison to inspect metrics and raw evidence.'),
    'rail.model_lab': guide('rail.model_lab', 'Model Lab', 'Manage provider profiles and inspect local-model readiness.', 'Model Lab contains server-side provider probes and Cookbook previews. Browser clients do not receive stored provider secrets.'),
    'rail.research': guide('rail.research', 'Research', 'Inspect research reports, sources and claim status.', 'Research outputs retain source and claim provenance so unsupported or failed claims remain visible instead of being presented as verified.'),
    'rail.gallery': guide('rail.gallery', 'Artifacts', 'Inspect files and media produced by TALOS runs.', 'Artifacts are persisted outputs with run provenance. Availability and preview support depend on the stored artifact type.'),
    'rail.library': guide('rail.library', 'Library', 'Manage uploaded context and generated documents.', 'Uploaded material is treated as untrusted input. Context sets bound what can be injected into a model request.'),
    'rail.browse': guide('rail.browse', 'Browse', 'Enable browser tools inside the current conversation.', 'Browse keeps the normal chat surface while TALOS can navigate, observe and capture evidence through the configured browser worker and policy boundary.'),
    'rail.advanced': guide('rail.advanced', 'Advanced', 'Show less-frequent workspace modules.', 'Expanding Advanced changes only rail visibility. It does not start a tool, modify a run or grant additional capability.'),
    'rail.tasks': guide('rail.tasks', 'Tasks', 'Track persisted follow-up work and email triage.', 'Tasks and email views use control-plane data. External actions remain subject to connector availability and policy.'),
    'rail.notes': guide('rail.notes', 'Notes', 'Store notes with explicit trust boundaries.', 'Notes remain untrusted and are not silently inserted into chat context. Select them through an approved context workflow when needed.'),
    'rail.search': guide('rail.search', 'Vault', 'Inspect Context Vault files, sets and generated documents.', 'Vault exposes persisted ingestion state and bounded context. It does not imply that every uploaded file is ready or selected.'),
    'rail.brain': guide('rail.brain', 'Memory', 'Inspect approved memories, skills and selection evidence.', 'Only approved, policy-eligible memories and skills can enter planning. Skill Audit explains what was selected or excluded.'),
    'rail.tools': guide('rail.tools', 'Tools', 'Inspect connectors, tools and current capability health.', 'A listed tool is usable only when its connector, policy and health gates pass. Unavailable actions remain disabled with a reason.'),
    'rail.doctor': guide('rail.doctor', 'Doctor', 'Diagnose readiness, policy and recovery prerequisites.', 'Doctor reports actionable control-plane health and administrative checks without turning a degraded dependency into a false success.'),
    'rail.settings': guide('rail.settings', 'Settings', 'Configure user-scoped workspace behavior.', 'Settings persist through the control plane. Secret-like values are not accepted as ordinary UI preferences.'),
    'rail.theme': guide('rail.theme', 'Theme', 'Choose and customize the TALOS visual and motion system.', 'Theme controls palette, typography, density and motion through validated presets and user deltas with rollback on failed persistence.'),

    'runtime.timeline': guide('runtime.timeline', 'Timeline', 'Review ordered events for the selected run.', 'Timeline preserves timestamps, severity and node references so execution progress and faults can be inspected in sequence.'),
    'runtime.dag': guide('runtime.dag', 'DAG', 'Inspect node dependencies and current execution state.', 'The graph reflects persisted run events and node status. Select a node to inspect its evidence without mutating the run.'),
    'runtime.replay': guide('runtime.replay', 'Trace replay', 'Reconstruct the selected run from stored trace events.', 'Replay is evidence inspection. It does not silently re-execute external actions or replace the original trace.'),
    'runtime.recovery': guide('runtime.recovery', 'Recovery', 'Request a guarded retry, override or node recovery.', 'Recovery requires a selected run and valid target. Policy, validation and current node state determine which actions are permitted.'),
    'runtime.artifacts': guide('runtime.artifacts', 'Run artifacts', 'Inspect outputs attached to the selected run.', 'Each artifact retains its run association and storage metadata. Missing artifacts are reported rather than replaced with demo content.'),
    'search.context': guide('search.context', 'Context Vault', 'Inspect ingested files, chunks and bounded context sets.', 'Only available files can enter a context set. Uploaded content remains untrusted and server-side limits bound model injection.'),
    'search.documents': guide('search.documents', 'Documents', 'Inspect generated and persisted documents.', 'Documents show real control-plane records and generation state. Empty or failed results remain explicit.'),
    'library.context': guide('library.context', 'Context Vault', 'Inspect ingested files, chunks and bounded context sets.', 'Only available files can enter a context set. Uploaded content remains untrusted and server-side limits bound model injection.'),
    'library.documents': guide('library.documents', 'Documents', 'Inspect generated and persisted documents.', 'Documents show real control-plane records and generation state. Empty or failed results remain explicit.'),
    'brain.memory': guide('brain.memory', 'Memory', 'Review persisted memories and their scopes.', 'Memory entries must remain attributable and policy-eligible before they can influence a model run.'),
    'brain.skills': guide('brain.skills', 'Skills', 'Review skills available to the TALOS planner.', 'Imported skills remain excluded until approval and evaluation gates pass. Availability does not grant unrestricted tools.'),
    'brain.skill_audit': guide('brain.skill_audit', 'Skill Audit', 'Inspect why skills were selected or excluded.', 'Audit evidence records matching, approval and evaluation decisions for the current planning context.'),
    'model_lab.cookbook': guide('model_lab.cookbook', 'Cookbook', 'Inspect hardware fit and preview local-model commands.', 'Cookbook currently scans, scores and previews. It does not install dependencies, download models, serve runtimes or execute host commands.'),
    'model_lab.models': guide('model_lab.models', 'Models', 'Manage server-side provider profiles and health probes.', 'Profiles keep credentials on the server. A successful probe confirms connectivity for that profile, not every possible model operation.'),
    'model_lab.catalog': guide('model_lab.catalog', 'Catalog', 'Browse per-provider models, effort ladders and composer visibility.', 'The catalog lists your configured profiles with their real effort levels and lets you hide or show each model in the composer. Reasoning levels come from provider capabilities, never a hardcoded list.'),
    'tasks.tasks': guide('tasks.tasks', 'Tasks', 'Review and manage persisted workflow follow-up.', 'Task state is stored by the control plane so updates survive reload and remain attributable.'),
    'tasks.email': guide('tasks.email', 'Email', 'Review connected email and draft actions.', 'Email content is untrusted. Sending or other external effects require the configured connector and applicable confirmation policy.'),
    'doctor.doctor': guide('doctor.doctor', 'Doctor', 'Run readiness diagnostics for TALOS dependencies.', 'Diagnostics report degraded and unavailable dependencies with remediation instead of masking them as healthy.'),
    'doctor.policy': guide('doctor.policy', 'Policy', 'Inspect effective capability and enterprise gates.', 'Policy determines which network, file, browser and system actions are permitted for the current deployment and user.'),
    'doctor.shell': guide('doctor.shell', 'Shell', 'Preview shell-policy decisions before execution.', 'Shell actions are capability-gated and audited. A preview is not an execution and cannot be presented as one.'),
    'doctor.backup': guide('doctor.backup', 'Backup', 'Inspect manifests and validate restore plans.', 'Restore validation is a dry run unless an explicitly supported recovery action is available and authorized.'),
    'doctor.audit': guide('doctor.audit', 'Audit', 'Review redacted security and policy events.', 'Audit records preserve attribution while secrets and sensitive values remain redacted.'),

    'theme.presets': guide('theme.presets', 'Theme presets', 'Choose a complete TALOS visual identity.', 'Each preset owns light and dark palette, typography, density and motion defaults. Selecting one does not erase explicit user deltas until saved or reset.'),
    'theme.customize': guide('theme.customize', 'Customize theme', 'Adjust validated visual tokens for the active preset.', 'Only changed values are persisted as user deltas, preventing unrelated edits such as font changes from corrupting palette state.'),
    'theme.library': guide('theme.library', 'Theme library', 'Save, import and export named theme configurations.', 'Imports pass strict versioned validation before replacing any active theme state. Invalid payloads leave the current theme intact.'),
    'theme.motion': guide('theme.motion', 'Motion', 'Control background and interface animation behavior.', 'Background and interface motion are independent. Reduced-motion and explicit Off states override animation while preserving the final UI state.'),
    'theme.advanced': guide('theme.advanced', 'Advanced theme controls', 'Inspect low-level validated theme and motion options.', 'Advanced values remain bounded by the canonical schema and effective runtime policy.'),

    'settings.models': guide('settings.models', 'Models settings', 'Open model profiles and provider readiness.', 'Model credentials stay server-side. Use Model Lab to create, edit and probe real provider profiles.'),
    'settings.ai_defaults': guide('settings.ai_defaults', 'AI defaults', 'Choose default utility, vision and research behavior.', 'Defaults affect future requests and remain subordinate to provider capability, policy and per-run selections.'),
    'settings.search': guide('settings.search', 'Search settings', 'Configure the supported search provider and result limits.', 'Search remains unavailable when the provider endpoint or policy is not healthy; TALOS reports that state explicitly.'),
    'settings.browser': guide('settings.browser', 'Browser settings', 'Configure browser evidence and HMI policy preferences.', 'Browser capability still depends on worker health, authenticated transport and server policy. UI preferences cannot grant capability.'),
    'settings.integrations': guide('settings.integrations', 'Integrations', 'Inspect and configure supported connectors.', 'Connector state and scopes are stored server-side. Tokens and OAuth material are never returned as normal UI preferences.'),
    'settings.email': guide('settings.email', 'Email settings', 'Configure supported email account behavior.', 'Email content is untrusted and external sends remain gated by connector support and policy.'),
    'settings.reminders': guide('settings.reminders', 'Reminders', 'Configure reminder preferences supported by this deployment.', 'Controls without a backend execution path remain unavailable instead of implying that reminders will be delivered.'),
    'settings.appearance': guide('settings.appearance', 'Appearance', 'Control chat layout, visible surfaces and responsive behavior.', 'Appearance preferences are user-scoped, validated and restored from the control plane after reload.'),
    'settings.shortcuts': guide('settings.shortcuts', 'Shortcuts', 'Review and customize keyboard commands.', 'Shortcut conflicts and unavailable commands are surfaced explicitly. A binding does not bypass action policy.'),
    'settings.account': guide('settings.account', 'Account', 'Review the signed-in user and account preferences.', 'Authentication and authorization remain server-owned; appearance or profile preferences cannot elevate privileges.'),
    'settings.agent_tools': guide('settings.agent_tools', 'Agent Tools', 'Configure enabled tool families and execution budgets.', 'Tool visibility does not grant capability. Registry health, policy, risk and per-turn limits still apply.'),
    'settings.system': guide('settings.system', 'System', 'Open operational diagnostics and administration modules.', 'System controls route to real Doctor, backup, policy and audit surfaces when the current user is authorized.'),
    'settings.appearance.chat_area': guide('settings.appearance.chat_area', 'Chat Area', 'Choose which low-noise conversation elements are visible.', 'These controls change presentation only. They do not remove persisted messages, runs or evidence.'),
    'settings.appearance.chat_bar': guide('settings.appearance.chat_bar', 'Chat Bar', 'Choose which supported composer tools are visible.', 'Hidden tools remain subject to capability and policy, and unsupported actions cannot be enabled by appearance settings.'),
    'settings.appearance.sidebar': guide('settings.appearance.sidebar', 'Sidebar', 'Choose which workspace entries appear in the rail.', 'Hiding an entry does not delete its data. Available modules can still be reached through supported commands.'),

    'cookbook.launch': guide('cookbook.launch', 'Cookbook Launch', 'Inspect hardware and runtime readiness.', 'Hardware scans and model fit scores inform planning. Launch remains preview-only in Cookbook V1.'),
    'cookbook.download': guide('cookbook.download', 'Cookbook Download', 'Preview the command needed to obtain a selected model.', 'This tab does not download files or execute host commands. Review the generated command before running it through an authorized operator workflow.'),
    'cookbook.dependencies': guide('cookbook.dependencies', 'Cookbook Dependencies', 'Inspect runtime dependency status and preview remediation.', 'Dependency plans are previews. Missing packages remain explicit and are never reported as installed.'),
    'cookbook.settings': guide('cookbook.settings', 'Cookbook Settings', 'Select a model and runtime for a serve-command preview.', 'The generated command is not executed by Cookbook V1 and does not prove that the runtime is healthy.'),
} as const satisfies Record<string, TalosGuideEntry>

export type TalosGuideId = keyof typeof TALOS_GUIDE_REGISTRY

export function resolveTalosGuideEntry(id: string): TalosGuideEntry {
    if (Object.prototype.hasOwnProperty.call(TALOS_GUIDE_REGISTRY, id)) {
        return TALOS_GUIDE_REGISTRY[id as TalosGuideId]
    }

    return {
        id,
        title: 'Information unavailable',
        summary: 'No canonical guide entry is registered for this control.',
        details: 'The control remains usable, but contextual guidance is disabled until its documentation is added.',
        available: false,
    }
}
