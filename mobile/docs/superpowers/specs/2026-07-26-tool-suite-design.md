# Tool suite — design

**Status: design, before implementation.** Owner sequence: probe → the six
defects → **tools**. The six are closed (`ae06e8b`…`e8b7c9d`) and the APK is
approved, so this is next.

Binding decisions already taken (2026-07-25 decision record):
- **Permissions per ACTION TYPE, configured by the user**, with safe defaults:
  reading is free, writing asks, anything leaving the device is refused.
- The completion contract already carries tool calls (debt A1, `15988d7`).
- Retrieval is decided (gte + weighted hybrid), so `library_search` has a shape
  to aim at even before the index ships.

## What the research says

Fresh web pass (2026): the loop itself is identical everywhere — declare
schemas, detect calls, execute, feed results back — and the friction is purely
in wire formats. Anthropic returns `tool_use` blocks whose `input` is already an
object; OpenAI/DeepSeek return `tool_calls` whose arguments are a JSON *string*;
Gemini uses `functionDeclarations` and `functionCall` parts; Ollama follows the
OpenAI shape. The established answer is an adapter layer over one internal
representation, which is exactly the hub-and-spoke the completion contract was
widened for.

On safety the 2026 consensus is blunt: prompt injection is not solved at the
model layer, so the strategy is **containment** — least privilege, typed
parameters validated against a schema (never free-form commands), tool OUTPUT
treated as data and never as instructions, provenance tagging on untrusted
content, and confirmation for anything with consequences. TALOS already tags
untrusted context that way for the Library; tools inherit the same discipline.

## Architecture

```
tool registry (Zod schemas)
        │  z.toJSONSchema()   ← zod 4.4.3 does this natively, no new dependency
        ▼
one internal representation ──► per-provider translation (4 shapes)
        ▲                                   │
        │                                   ▼
   tool executor  ◄── agent loop ◄── parsed tool calls (TalosToolCall)
        │
        ├─ permission gate (per action type, user-configured)
        └─ audit trail (talos_tool_activities — the table already exists)
```

### The registry

```ts
interface TalosToolDefinition<Input> {
    name: string                     // stable wire name, snake_case
    title: string                    // what the consent sheet shows a human
    description: string              // what the MODEL reads
    action: 'read' | 'write' | 'outbound'
    input: ZodType<Input>
    run(input: Input, context: TalosToolContext): Promise<TalosToolResult>
}
```

`action` is the permission axis the owner chose, not a decorative label: it is
what the gate reads, and it is why a new tool cannot accidentally ship with more
authority than its class allows.

### The loop

`finishReason === 'tool_calls'` (or Anthropic's `tool_use` stop reason) →
execute → append `role: 'tool'` turns → complete again. Bounded: at most 5
rounds and 12 calls per send, because an unbounded loop is a way to spend the
owner's tokens without asking. Every round is one durable tool-activity row, so
a run can be explained after the fact.

### Permissions

| action | default | surface |
|---|---|---|
| `read` | allowed | nothing to confirm; the activity row records it |
| `write` | asks every time | consent sheet naming the tool and showing the exact arguments |
| `outbound` | refused | Settings can enable it; until then the model is told the tool exists and is denied |

Refusal is returned to the MODEL as a tool result, not thrown: an agent that is
told "denied by user policy" adapts, while one that gets an exception derails.

## First tool set (read-only)

`library_search` · `library_read` · `notes_list` · `tasks_list` ·
`memory_search` · `time_now`

Read-only on purpose: it proves the loop, the translation across four providers,
the audit trail and the permission gate without a single destructive path. The
write tools (`notes_create`, `tasks_create`, `library_write`) follow once the
consent sheet has been used in anger.

## What must NOT happen

- Tool results are data. They are never concatenated into the system prompt and
  never treated as instructions, and the untrusted boundary that already wraps
  Library documents wraps them too.
- No tool receives free-form text that becomes a command. Every parameter is
  validated against its schema before `run` is reached; a validation failure is
  returned to the model as an error result so it can correct itself.
- The initial JS budget stays a budget: the registry, the translation layer and
  the loop load with the chat, but each tool's implementation is imported when
  it first runs.
