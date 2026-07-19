import type { Component } from 'vue'

export const TALOS_WINDOW_IDS = [
    'runtime',
    'search',
    'brain',
    'calendar',
    'compare',
    'model_lab',
    'research',
    'gallery',
    'library',
    'notes',
    'tasks',
    'settings',
    'theme',
    'doctor',
    'tools',
] as const

export type TalosWindowId = typeof TALOS_WINDOW_IDS[number]

export type TalosWindowPosition = {
    x: number
    y: number
}

export type TalosWindowSize = {
    width: number
    height: number
}

export type TalosWindowCapability = 'close' | 'minimize' | 'dock' | 'fullscreen' | 'drag' | 'resize'

export type TalosWindowSection = {
    id: string
    label: string
    description?: string
}

export type TalosWindowDescriptor = {
    id: TalosWindowId
    title: string
    stationCode: string
    description: string
    sections: readonly TalosWindowSection[]
    defaultSection?: string
    minDesktopSize: TalosWindowSize
    defaultDesktopSize: TalosWindowSize
    capabilities: readonly TalosWindowCapability[]
    mobile: {
        presentation: 'sheet'
        draggable: false
        resizable: false
        internalScroll: true
    }
    loader: () => Promise<{ default: Component }>
}

const ALL_DESKTOP_CAPABILITIES = ['close', 'minimize', 'dock', 'fullscreen', 'drag', 'resize'] as const
const MOBILE_SHEET = {
    presentation: 'sheet',
    draggable: false,
    resizable: false,
    internalScroll: true,
} as const

function descriptor(value: Omit<TalosWindowDescriptor, 'mobile' | 'capabilities'> & {
    capabilities?: readonly TalosWindowCapability[]
}): TalosWindowDescriptor {
    return {
        ...value,
        capabilities: value.capabilities ?? ALL_DESKTOP_CAPABILITIES,
        mobile: MOBILE_SHEET,
    }
}

const contextSections = [
    { id: 'context', label: 'Context Vault', description: 'Files and bounded context sets.' },
    { id: 'documents', label: 'Documents', description: 'Generated documents and exports.' },
] as const

export const TALOS_WINDOW_REGISTRY = {
    runtime: descriptor({
        id: 'runtime',
        title: 'Cockpit',
        stationCode: 'RUN',
        description: 'Runs, replay and recovery evidence.',
        sections: [],
        minDesktopSize: { width: 840, height: 560 },
        defaultDesktopSize: { width: 900, height: 580 },
        loader: () => import('../components/talos/window/modules/TalosRuntimeWindow.vue'),
    }),
    search: descriptor({
        id: 'search',
        title: 'Vault',
        stationCode: 'VLT',
        description: 'Persisted files, context sets and generated documents.',
        sections: contextSections,
        minDesktopSize: { width: 760, height: 520 },
        defaultDesktopSize: { width: 820, height: 540 },
        loader: () => import('../components/talos/window/modules/TalosKnowledgeWindow.vue'),
    }),
    brain: descriptor({
        id: 'brain',
        title: 'Memory',
        stationCode: 'MEM',
        description: 'Memory, skills and planning context.',
        sections: [
            { id: 'memory', label: 'Memory', description: 'Approved and scoped memories.' },
            { id: 'skills', label: 'Skills', description: 'Approved skills available to planning.' },
            { id: 'skill_audit', label: 'Skill Audit', description: 'Skill selection evidence.' },
        ],
        minDesktopSize: { width: 720, height: 520 },
        defaultDesktopSize: { width: 760, height: 540 },
        loader: () => import('../components/talos/window/modules/TalosBrainWindow.vue'),
    }),
    calendar: descriptor({
        id: 'calendar',
        title: 'Calendar',
        stationCode: 'CAL',
        description: 'Calendar drafts, no external write without confirmation.',
        sections: [],
        minDesktopSize: { width: 860, height: 620 },
        defaultDesktopSize: { width: 900, height: 640 },
        loader: () => import('../components/talos/window/modules/TalosCalendarWindow.vue'),
    }),
    compare: descriptor({
        id: 'compare',
        title: 'Benchmarks',
        stationCode: 'BNC',
        description: 'AVM ON/OFF benchmark workbench.',
        sections: [],
        minDesktopSize: { width: 760, height: 520 },
        defaultDesktopSize: { width: 820, height: 540 },
        loader: () => import('../components/talos/window/modules/TalosCompareWindow.vue'),
    }),
    model_lab: descriptor({
        id: 'model_lab',
        title: 'Model Lab',
        stationCode: 'LAB',
        description: 'Cookbook previews, provider profiles and probes.',
        sections: [
            { id: 'cookbook', label: 'Cookbook', description: 'Local model cookbook and dependency readiness.' },
            { id: 'models', label: 'Models', description: 'Server-side provider profiles and probes.' },
        ],
        defaultSection: 'models',
        minDesktopSize: { width: 720, height: 520 },
        defaultDesktopSize: { width: 760, height: 540 },
        loader: () => import('../components/talos/window/modules/TalosModelLabWindow.vue'),
    }),
    research: descriptor({
        id: 'research',
        title: 'Research',
        stationCode: 'RES',
        description: 'Research reports, sources and claims.',
        sections: [],
        minDesktopSize: { width: 760, height: 520 },
        defaultDesktopSize: { width: 820, height: 540 },
        loader: () => import('../components/talos/window/modules/TalosResearchWindow.vue'),
    }),
    gallery: descriptor({
        id: 'gallery',
        title: 'Artifacts',
        stationCode: 'ART',
        description: 'Run artifacts and previews with provenance.',
        sections: [],
        minDesktopSize: { width: 760, height: 520 },
        defaultDesktopSize: { width: 820, height: 540 },
        loader: () => import('../components/talos/window/modules/TalosGalleryWindow.vue'),
    }),
    library: descriptor({
        id: 'library',
        title: 'Library',
        stationCode: 'LIB',
        description: 'Files, context sets and generated documents.',
        sections: contextSections,
        minDesktopSize: { width: 760, height: 520 },
        defaultDesktopSize: { width: 820, height: 540 },
        loader: () => import('../components/talos/window/modules/TalosLibraryWindow.vue'),
    }),
    notes: descriptor({
        id: 'notes',
        title: 'Notes',
        stationCode: 'NTS',
        description: 'Untrusted notes, never silently injected.',
        sections: [],
        minDesktopSize: { width: 420, height: 360 },
        defaultDesktopSize: { width: 520, height: 420 },
        loader: () => import('../components/talos/window/modules/TalosNotesWindow.vue'),
    }),
    tasks: descriptor({
        id: 'tasks',
        title: 'Tasks',
        stationCode: 'TSK',
        description: 'Persisted tasks and workflow follow-up.',
        sections: [
            { id: 'tasks', label: 'Tasks', description: 'Persisted tasks and workflow follow-up.' },
            { id: 'email', label: 'Email', description: 'Read-only triage and draft review.' },
        ],
        minDesktopSize: { width: 520, height: 420 },
        defaultDesktopSize: { width: 620, height: 460 },
        loader: () => import('../components/talos/window/modules/TalosTasksWindow.vue'),
    }),
    settings: descriptor({
        id: 'settings',
        title: 'Settings',
        stationCode: 'SET',
        description: 'Workspace setup and safe configuration.',
        sections: [],
        minDesktopSize: { width: 760, height: 520 },
        defaultDesktopSize: { width: 820, height: 560 },
        loader: () => import('../components/talos/window/modules/TalosSettingsWindow.vue'),
    }),
    theme: descriptor({
        id: 'theme',
        title: 'Theme',
        stationCode: 'THM',
        description: 'Appearance controls for this workspace.',
        sections: [],
        minDesktopSize: { width: 560, height: 340 },
        defaultDesktopSize: { width: 760, height: 360 },
        loader: () => import('../components/talos/window/modules/TalosThemeWindow.vue'),
    }),
    doctor: descriptor({
        id: 'doctor',
        title: 'Doctor',
        stationCode: 'DOC',
        description: 'Readiness, policy, audit and backup controls.',
        sections: [
            { id: 'doctor', label: 'Doctor', description: 'Readiness diagnostics.' },
            { id: 'policy', label: 'Policy', description: 'Capability boundary and enterprise gates.' },
            { id: 'shell', label: 'Shell', description: 'Shell execution policy.' },
            { id: 'backup', label: 'Backup', description: 'Manifest and dry-run restore checks.' },
            { id: 'audit', label: 'Audit', description: 'Redacted security and policy events.' },
        ],
        minDesktopSize: { width: 760, height: 520 },
        defaultDesktopSize: { width: 820, height: 560 },
        loader: () => import('../components/talos/window/modules/TalosDoctorWindow.vue'),
    }),
    tools: descriptor({
        id: 'tools',
        title: 'Tools',
        stationCode: 'TLS',
        description: 'Connectors and tool registry.',
        sections: [],
        minDesktopSize: { width: 720, height: 520 },
        defaultDesktopSize: { width: 780, height: 540 },
        loader: () => import('../components/talos/window/modules/TalosToolsWindow.vue'),
    }),
} satisfies Record<TalosWindowId, TalosWindowDescriptor>

export const TALOS_WINDOW_MIN_SIZES = Object.fromEntries(
    TALOS_WINDOW_IDS.map((id) => [id, TALOS_WINDOW_REGISTRY[id].minDesktopSize]),
) as Record<TalosWindowId, TalosWindowSize>

export const TALOS_WINDOW_DEFAULT_SIZES = Object.fromEntries(
    TALOS_WINDOW_IDS.map((id) => [id, TALOS_WINDOW_REGISTRY[id].defaultDesktopSize]),
) as Record<TalosWindowId, TalosWindowSize>

export function isTalosWindowId(value: string): value is TalosWindowId {
    return Object.prototype.hasOwnProperty.call(TALOS_WINDOW_REGISTRY, value)
}
