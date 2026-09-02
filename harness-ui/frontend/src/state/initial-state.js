export function createInitialState() {
  return {
    runtime: {
      phase: 'booting',
      connection: 'connecting',
      capabilities: {},
      error: null,
      observedAt: null,
    },
    layout: {
      route: 'chat',
      navigation: 'open',
      navigationWidth: 264,
      context: 'open',
      contextWidth: 380,
      activeDockTab: 'preview',
      density: 'comfortable',
      theme: 'dark',
      transcriptMode: 'comfortable',
    },
    projects: { status: 'idle', items: [], activeId: null, error: null },
    sessions: { status: 'idle', items: [], activeId: null, generation: 0, pendingCreation: null, error: null },
    conversation: {
      messages: [],
      reasoning: {},
      queue: [],
      composer: { text: '', attachments: [], mode: 'follow-up' },
      streamingMessageId: null,
    },
    execution: { status: 'idle', runId: null, toolRuns: [], checkpoints: [], error: null },
    approvals: { pending: {}, resolved: {} },
    review: { files: {}, order: [], activePath: null, mode: 'unified', comments: {}, tests: null, risks: [] },
    files: { status: 'idle', root: null, nodes: {}, openPaths: [], activePath: null, preview: null, error: null },
    terminal: { status: 'disconnected', tabs: [], activeId: null, processCount: 0, error: null },
    browser: { status: 'idle', url: null, history: [], permission: null, error: null },
    automations: { status: 'idle', items: [], activeId: null, error: null },
    modelLab: { status: 'idle', capacity: null, runtimes: [], catalog: [], installed: [], downloads: [], activeTrial: null, error: null },
    settings: { section: 'appearance', values: {}, validation: {}, dirty: false },
    extensions: { hooks: [], mcp: [], skills: [], plugins: [], library: [], notes: [], activity: [], memory: [], research: [], tools: [], doctor: null },
    notifications: { toasts: [], announcement: '' },
  };
}

