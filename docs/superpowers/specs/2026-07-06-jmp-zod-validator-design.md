# JMP Zod Validator — Design Specification

> **Status:** Approved  
> **Date:** 2026-07-06  
> **Scope:** Schemi Zod e contratto API del microservizio Node.js di validazione JMP

## Architecture Overview

Il validator Node.js (Fastify + Zod) è il gatekeeper sintattico dell'AVM. Definisce le regole rigide di validazione per il JSON Mutation Protocol prima che qualsiasi stringa tocchi l'ecosistema PHP. È un microservizio **puramente funzionale e stateless** — non mantiene cache, sessioni o stato del DAG.

### Confini

```
LLM → [stringa JMP] → PHP (envelope) → POST /validate → Node.js (Zod) → {valid, errors?}
                                                                              ↓
                                                                        PHP (applica o rigetta)
```

- **Dentro lo scope:** schemi Zod per payload, nodi, comandi JMP; endpoint `/validate`; envelope IPC; formato `VALIDATION_FAULT`
- **Fuori scope:** state persistence, WebSocket, HMI, client PHP (IPC consumer), LLM integration

---

## Component Design

### 1. Payload Esecutivi (Foglie)

Sono gli schemi più annidati. Non referenziano nient'altro. Definiscono cosa è "legale" per ciascun tipo di operazione fisica.

#### 1.1 HttpRequestPayloadSchema

```typescript
export const HttpRequestPayloadSchema = z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    timeout_ms: z.number().int().positive().default(5000)
});
```

#### 1.2 QueryDatabasePayloadSchema

```typescript
export const QueryDatabasePayloadSchema = z.object({
    query: z.string().min(5),
    params: z.record(z.string(), z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null()
    ])).optional()
});
```

**Motivazione `query` raw**: L'LLM "parla" SQL nativamente. Costringerlo a un DSL JSON aumenterebbe overhead cognitivo e consumo token. La sicurezza anti-iniezione è delegata ai prepared statement PDO nel Worker PHP, non allo schema Zod.

### 2. Discriminated Union sui Nodi

Separa `node_type` (metadato di orchestrazione) dal `payload` (parametri esecutivi). Allineato con `NodeWorkerInterface::execute(array $payload)` in PHP.

```typescript
export const NodeDefinitionSchema = z.discriminatedUnion('node_type', [
    z.object({
        node_type: z.literal('HTTP_REQUEST'),
        payload: HttpRequestPayloadSchema
    }),
    z.object({
        node_type: z.literal('QUERY_DATABASE'),
        payload: QueryDatabasePayloadSchema
    })
]);
```

### 3. Comandi JMP (Radice)

Discriminated union su `action`. Un solo punto di ingresso per la validazione.

```typescript
export const JmpMutationSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('SPAWN_NODE'),
        node_id: z.string().min(1),
        parent_id: z.string().min(1).optional(),
        node_type: z.enum(['HTTP_REQUEST', 'QUERY_DATABASE']),
        dependencies: z.array(z.string().min(1)).optional()
    }),
    z.object({
        action: z.literal('MUTATE_PAYLOAD'),
        node_id: z.string().min(1),
        payload: z.record(z.string(), z.any()) // validato in un secondo momento via context injection
    }),
    z.object({
        action: z.literal('YIELD_EXECUTION')
    })
]);
```

**Nota su `MUTATE_PAYLOAD`**: Il campo `payload` ha schema generico `z.record(z.string(), z.any())` a questo livello. La validazione specifica (HTTP vs SQL) avviene nel passaggio successivo tramite State Context Injection — è qui che viene applicata la `NodeDefinitionSchema`.

### 4. State Context Injection

**Problema**: `MUTATE_PAYLOAD` non contiene `node_type` — l'LLM non lo invia né deve conoscerlo. Solo PHP, che detiene il DAG in memoria, sa che tipo è il nodo `n_5f8e2`.

**Soluzione**: Envelope IPC. PHP raccoglie i `node_type` dall'AST, li inserisce in un dizionario `context`, e li invia insieme alle mutazioni.

```json
{
  "mutations": [
    { "action": "MUTATE_PAYLOAD", "node_id": "n_123", "payload": { "url": "https://..." } }
  ],
  "context": {
    "n_123": "HTTP_REQUEST"
  }
}
```

**Implementazione Zod**: Una funzione `validateMutations(mutations, context)` che:
1. Valida ogni mutazione contro `JmpMutationSchema` (action type check)
2. Per ogni `MUTATE_PAYLOAD`, cerca `context[node_id]` e inietta il `node_type` nell'oggetto
3. Valida l'oggetto arricchito contro `NodeDefinitionSchema`
4. Se una qualsiasi mutazione fallisce, l'intero batch è respinto (atomicità)

### 5. Contratto API

```
POST /validate
Content-Type: application/json
```

**Request:**
```typescript
{
  mutations: JmpMutation[],
  context: Record<string, string>  // node_id → node_type
}
```

**Response (200 OK sempre):**
```typescript
// Successo
{ valid: true }

// Fallimento (validazione atomica)
{
  valid: false,
  errors: [{
    field: string,       // es. "mutations[0].payload.url"
    expected: string,    // es. "valid URL string"  
    received: string,    // es. "not-a-url"
    message: string      // es. "URL must be a valid format"
  }]
}
```

**Perché 200 OK sempre**: Stile RPC, non REST. La validazione fallita è un evento di dominio atteso (l'LLM sbaglia spesso), non un errore di rete. Il client PHP non deve gestire eccezioni HTTP per logica applicativa.

**Atomicità**: Se una mutazione fallisce, l'intero batch è respinto. Evita nodi orfani: se `SPAWN_NODE` passa ma `MUTATE_PAYLOAD` fallisce nello stesso tick, applicarne solo uno corromperebbe il DAG.

---

## File Structure

```
validator/src/
├── server.ts                  # Fastify server + POST /validate route
├── schemas/
│   ├── payloads.ts            # HttpRequestPayloadSchema, QueryDatabasePayloadSchema
│   ├── nodes.ts               # NodeDefinitionSchema (discriminatedUnion)
│   ├── mutations.ts           # JmpMutationSchema (discriminatedUnion on action)
│   └── validate.ts            # validateMutations(), context injection, error mapping
└── types.ts                   # TypeScript type exports derivati da Zod
```

---

## Error Mapping (Zod → VALIDATION_FAULT)

Zod produce `ZodError` con array di `ZodIssue`. La mappatura:

| ZodIssue property | VALIDATION_FAULT field |
|-------------------|----------------------|
| `path.join(".")` | `field` |
| `expected` (type) | `expected` (human-readable) |
| `received` (value) | `received` (stringified) |
| `message` | `message` |

**Esempio:**
```
ZodIssue { path: ["mutations", 0, "payload", "url"], message: "Invalid url" }
↓
{ field: "mutations[0].payload.url", expected: "valid URL", received: "not-a-url", message: "Invalid url" }
```

---

## Testing Strategy

Test isolati con Vitest (o Node test runner):

1. **Payload validi** — HTTP_REQUEST e QUERY_DATABASE con valori corretti passano
2. **Payload invalidi** — URL malformato, timeout negativo, query vuota → rigettati
3. **Discriminated Union** — payload HTTP su node_type `QUERY_DATABASE` → rigettato
4. **Comandi JMP** — SPAWN_NODE senza node_id → rigettato
5. **State Context Injection** — MUTATE_PAYLOAD senza context → errore; con context corretto → il payload specifico viene validato
6. **Batch atomico** — 3 mutazioni valide + 1 invalida → tutto il batch rigettato
7. **Mappatura errori** — ZodError → formato VALIDATION_FAULT corretto

---

## Constraints

- Dipendenze: Fastify 5.x, Zod 4.x, TypeScript 6.x (già installati)
- Il validator rimane stateless: nessun database, nessuna cache in memoria tra richieste
- `PRUNE_BRANCH`, `SKIPPED` sono stati futuri del DAG, non compaiono negli schemi JMP MVP
- `node_type` aggiuntivi oltre HTTP_REQUEST e QUERY_DATABASE sono fuori scope per questa iterazione
