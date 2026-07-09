export type TalosWelcomePrompt = {
    id: string
    headline: string
    body: string
}

export const talosWelcomePrompts: TalosWelcomePrompt[] = [
    {
        id: 'workflow-handle',
        headline: 'What workflow should TALOS handle?',
        body: 'Type a task, attach a context set when needed, and TALOS will route it through the AVM control plane with replayable evidence.',
    },
    {
        id: 'evidence-not-vibes',
        headline: 'What needs evidence, not vibes?',
        body: 'Describe the outcome. TALOS will ground the run, track decisions, and keep the replay trail available.',
    },
    {
        id: 'avm-start',
        headline: 'Where should the AVM start?',
        body: 'Give TALOS a task, file, or constraint set. The control plane will keep the execution inspectable.',
    },
    {
        id: 'replayable-run',
        headline: 'What should become a replayable run?',
        body: 'Start with the question. TALOS will preserve model, context, validation, and artifact state.',
    },
    {
        id: 'system-building',
        headline: 'What system are we building next?',
        body: 'Use chat for intent, windows for evidence, and AVM runs for decisions that need proof.',
    },
    {
        id: 'incident-triage',
        headline: 'What incident needs a calm operator?',
        body: 'Paste the symptoms, attach the logs, and TALOS will separate facts, hypotheses, and recovery steps.',
    },
    {
        id: 'context-ingestion',
        headline: 'What knowledge should TALOS ingest?',
        body: 'Add files through the Library, then ask from chat with bounded, untrusted context provenance.',
    },
    {
        id: 'benchmark-proof',
        headline: 'What claim should we benchmark?',
        body: 'Turn a prompt into comparable AVM ON/OFF evidence with matching model, context, evaluator, and logs.',
    },
    {
        id: 'research-brief',
        headline: 'What research brief needs sources?',
        body: 'Ask the question here, then open Deep Research when the answer needs source-backed claims.',
    },
    {
        id: 'operator-handoff',
        headline: 'What needs a clean handoff?',
        body: 'TALOS can keep the prompt, run, notes, tasks, and artifacts together for the next operator.',
    },
    {
        id: 'policy-safe',
        headline: 'What action needs policy first?',
        body: 'Describe the desired move. TALOS will keep risky steps gated, visible, and auditable.',
    },
    {
        id: 'artifact-output',
        headline: 'What artifact should this produce?',
        body: 'Start with the target output, then use Gallery, Library, and Compare to inspect the evidence behind it.',
    },
]

const PROMPT_BY_ID = new Map(talosWelcomePrompts.map((prompt) => [prompt.id, prompt]))

function hashString(value: string) {
    let hash = 0
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
    }

    return Math.abs(hash)
}

export function resolveTalosWelcomePrompt(promptId: unknown, fallbackSeed = 'talos'): TalosWelcomePrompt {
    if (typeof promptId === 'string') {
        const prompt = PROMPT_BY_ID.get(promptId)
        if (prompt) {
            return prompt
        }
    }

    return talosWelcomePrompts[hashString(fallbackSeed) % talosWelcomePrompts.length]
}
