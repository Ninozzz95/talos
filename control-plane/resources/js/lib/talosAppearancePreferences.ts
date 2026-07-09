export type TalosAppearanceGroup = 'chat_area' | 'chat_bar' | 'sidebar'

export type TalosAppearanceVisibility = {
    chat_area: {
        session_header: boolean
        full_width_chat: boolean
        welcome_message: boolean
        incognito: boolean
        text_only_emoji_output: boolean
        thinking_process: boolean
        sensitive_blur: boolean
    }
    chat_bar: {
        web_search: boolean
        document_editor: boolean
        shell: boolean
        more_tools: boolean
        agent_mode_switcher: boolean
        attach_files: boolean
        deep_research: boolean
        personas: boolean
    }
    sidebar: {
        brand_name: boolean
        search: boolean
        new_chat: boolean
        chats: boolean
        email: boolean
        models: boolean
        tools: boolean
        brain: boolean
        calendar: boolean
        compare: boolean
        cookbook: boolean
        deep_research: boolean
        gallery: boolean
        library: boolean
        notes: boolean
        tasks: boolean
        theme: boolean
        user: boolean
        settings_button: boolean
    }
}

export const TALOS_APPEARANCE_DEFAULTS: TalosAppearanceVisibility = {
    chat_area: {
        session_header: true,
        full_width_chat: false,
        welcome_message: true,
        incognito: true,
        text_only_emoji_output: false,
        thinking_process: true,
        sensitive_blur: false,
    },
    chat_bar: {
        web_search: true,
        document_editor: true,
        shell: true,
        more_tools: true,
        agent_mode_switcher: true,
        attach_files: true,
        deep_research: true,
        personas: true,
    },
    sidebar: {
        brand_name: true,
        search: true,
        new_chat: true,
        chats: true,
        email: true,
        models: true,
        tools: true,
        brain: true,
        calendar: true,
        compare: true,
        cookbook: true,
        deep_research: true,
        gallery: true,
        library: true,
        notes: true,
        tasks: true,
        theme: true,
        user: true,
        settings_button: true,
    },
}

export const TALOS_APPEARANCE_GROUPS: Array<{
    id: TalosAppearanceGroup
    label: string
    description: string
    items: Array<{ key: string; label: string }>
}> = [
    {
        id: 'chat_area',
        label: 'Chat Area',
        description: 'Controls the low-noise conversation surface.',
        items: [
            { key: 'session_header', label: 'Session header' },
            { key: 'full_width_chat', label: 'Full-width chat' },
            { key: 'welcome_message', label: 'Welcome message' },
            { key: 'incognito', label: 'Incognito' },
            { key: 'text_only_emoji_output', label: 'Text-only emoji output' },
            { key: 'thinking_process', label: 'Thinking process' },
            { key: 'sensitive_blur', label: 'Sensitive blur' },
        ],
    },
    {
        id: 'chat_bar',
        label: 'Chat Bar',
        description: 'Controls composer tools that exist in the TALOS bar.',
        items: [
            { key: 'web_search', label: 'Web search' },
            { key: 'document_editor', label: 'Document editor' },
            { key: 'shell', label: 'Shell' },
            { key: 'more_tools', label: 'More tools' },
            { key: 'agent_mode_switcher', label: 'Agent/chat mode switcher' },
            { key: 'attach_files', label: 'Attach files' },
            { key: 'deep_research', label: 'Deep research' },
            { key: 'personas', label: 'Personas' },
        ],
    },
    {
        id: 'sidebar',
        label: 'Sidebar',
        description: 'Controls visible rail entries. Hidden modules remain reachable through commands.',
        items: [
            { key: 'brand_name', label: 'Brand name' },
            { key: 'search', label: 'Search' },
            { key: 'new_chat', label: 'New chat' },
            { key: 'chats', label: 'Chats' },
            { key: 'email', label: 'Email' },
            { key: 'models', label: 'Models' },
            { key: 'tools', label: 'Tools' },
            { key: 'brain', label: 'Brain' },
            { key: 'calendar', label: 'Calendar' },
            { key: 'compare', label: 'Compare' },
            { key: 'cookbook', label: 'Cookbook' },
            { key: 'deep_research', label: 'Deep Research' },
            { key: 'gallery', label: 'Gallery' },
            { key: 'library', label: 'Library' },
            { key: 'notes', label: 'Notes' },
            { key: 'tasks', label: 'Tasks' },
            { key: 'theme', label: 'Theme' },
            { key: 'user', label: 'User' },
            { key: 'settings_button', label: 'Settings button' },
        ],
    },
]

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function resolveTalosAppearanceVisibility(value: unknown): TalosAppearanceVisibility {
    const source = record(value)
    const resolved = structuredClone(TALOS_APPEARANCE_DEFAULTS) as TalosAppearanceVisibility

    for (const group of TALOS_APPEARANCE_GROUPS) {
        const groupSource = record(source[group.id])
        for (const item of group.items) {
            const nextValue = groupSource[item.key]
            if (typeof nextValue === 'boolean') {
                ;(resolved[group.id] as Record<string, boolean>)[item.key] = nextValue
            }
        }
    }

    return resolved
}
