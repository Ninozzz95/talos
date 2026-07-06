# JMP Zod Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Zod validation schemas and `/validate` endpoint for the JMP protocol in the Node.js validator microservice.

**Architecture:** Bottom-up TDD: payload schemas → node discriminated union → mutation commands → context injection → Fastify endpoint. Each layer is tested in isolation before the next builds on it. Context injection via `superRefine` solves the `MUTATE_PAYLOAD` missing `node_type` problem.

**Tech Stack:** TypeScript 6.x, Zod 4.x, Fastify 5.x, Vitest (test runner)

## Global Constraints

- Validator rimane stateless — nessun database, nessuna cache in memoria tra richieste
- Validazione atomica: se una mutazione fallisce, l'intero batch è respinto
- `node_type` assente nel `context` per un `MUTATE_PAYLOAD` → `VALIDATION_FAULT` esplicito
- Endpoint risponde sempre 200 OK (stile RPC)
- `PRUNE_BRANCH`, `SKIPPED` non compaiono negli schemi MVP
- Usare i wrapper `.tools/bin` per node e npm se disponibili

---

### Task 1: Installare Vitest e configurare script di test

**Files:**
- Modify: `validator/package.json`

**Interfaces:**
- Produces: `npm run test` esegue i test TypeScript con Vitest

- [ ] **Step 1: Installare vitest**

```bash
cd validator && npm install --save-dev vitest
```

- [ ] **Step 2: Aggiungere script test a package.json**

In `validator/package.json`, aggiungere nella sezione `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verificare che vitest funzioni**

```bash
cd validator && npx vitest --version
```
Expected: stampa la versione di vitest

- [ ] **Step 4: Verificare che i wrapper .tools funzionino**

```bash
cd validator && ../.tools/bin/node -e "console.log('ok')" && ../.tools/bin/npm test 2>&1 || echo "npm test fallisce (nessun test ancora)"
```
Expected: `ok` da Node, `npm test` può fallire perché non ci sono ancora test

---

### Task 2: Schemi payload esecutivi (foglie)

**Files:**
- Create: `validator/src/schemas/payloads.ts`
- Create: `validator/tests/payloads.test.ts`

**Interfaces:**
- Produces: `HttpRequestPayloadSchema`, `QueryDatabasePayloadSchema` — schemi Zod esportati

- [ ] **Step 1: Scrivere i test per i payload**

Creare `validator/tests/payloads.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { HttpRequestPayloadSchema, QueryDatabasePayloadSchema } from '../src/schemas/payloads';

describe('HttpRequestPayloadSchema', () => {
  it('accepts a valid HTTP request payload', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://api.example.com/data',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
      timeout_ms: 3000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal payload with defaults', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe('GET');
      expect(result.data.timeout_ms).toBe(5000);
    }
  });

  it('accepts body as object', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
      body: { key: 'value' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative timeout', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
      timeout_ms: -100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid method', () => {
    const result = HttpRequestPayloadSchema.safeParse({
      url: 'https://example.com',
      method: 'INVALID',
    });
    expect(result.success).toBe(false);
  });
});

describe('QueryDatabasePayloadSchema', () => {
  it('accepts a valid query with params', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'SELECT * FROM users WHERE id = :id',
      params: { id: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts query without params', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'SELECT 1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts params with string, number, boolean, null', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'INSERT INTO t VALUES (:a, :b, :c, :d)',
      params: { a: 'text', b: 42, c: true, d: null },
    });
    expect(result.success).toBe(true);
  });

  it('rejects params with object values', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'SELECT 1',
      params: { bad: { nested: 'obj' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty query', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects query shorter than 5 chars', () => {
    const result = QueryDatabasePayloadSchema.safeParse({
      query: 'X',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

```bash
cd validator && npx vitest run tests/payloads.test.ts
```
Expected: FAIL — modulo `../src/schemas/payloads` non trovato

- [ ] **Step 3: Implementare gli schemi payload**

Creare `validator/src/schemas/payloads.ts`:

```typescript
import { z } from 'zod';

export const HttpRequestPayloadSchema = z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    timeout_ms: z.number().int().positive().default(5000),
});

export const QueryDatabasePayloadSchema = z.object({
    query: z.string().min(5),
    params: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()])
    ).optional(),
});
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

```bash
cd validator && npx vitest run tests/payloads.test.ts
```
Expected: tutti i test passano

---

### Task 3: Discriminated Union sui nodi

**Files:**
- Create: `validator/src/schemas/nodes.ts`
- Create: `validator/tests/nodes.test.ts`

**Interfaces:**
- Consumes: `HttpRequestPayloadSchema`, `QueryDatabasePayloadSchema` da `./payloads`
- Produces: `NodeDefinitionSchema` — discriminated union su `node_type` con payload corrispondente

- [ ] **Step 1: Scrivere i test per NodeDefinitionSchema**

Creare `validator/tests/nodes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { NodeDefinitionSchema } from '../src/schemas/nodes';

describe('NodeDefinitionSchema', () => {
  it('accepts HTTP_REQUEST node with valid payload', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'HTTP_REQUEST',
      payload: {
        url: 'https://example.com',
        method: 'GET',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts QUERY_DATABASE node with valid payload', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'QUERY_DATABASE',
      payload: {
        query: 'SELECT 1',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown node_type', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'UNKNOWN_TYPE',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects HTTP_REQUEST payload on QUERY_DATABASE node_type', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'QUERY_DATABASE',
      payload: {
        url: 'https://example.com',
        method: 'GET',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects QUERY_DATABASE payload on HTTP_REQUEST node_type', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'HTTP_REQUEST',
      payload: {
        query: 'SELECT 1',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects node without payload', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'HTTP_REQUEST',
    });
    expect(result.success).toBe(false);
  });

  it('rejects HTTP_REQUEST with invalid payload (bad URL)', () => {
    const result = NodeDefinitionSchema.safeParse({
      node_type: 'HTTP_REQUEST',
      payload: {
        url: 'not-a-url',
      },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

```bash
cd validator && npx vitest run tests/nodes.test.ts
```
Expected: FAIL — modulo `../src/schemas/nodes` non trovato

- [ ] **Step 3: Implementare NodeDefinitionSchema**

Creare `validator/src/schemas/nodes.ts`:

```typescript
import { z } from 'zod';
import { HttpRequestPayloadSchema, QueryDatabasePayloadSchema } from './payloads';

export const NodeDefinitionSchema = z.discriminatedUnion('node_type', [
    z.object({
        node_type: z.literal('HTTP_REQUEST'),
        payload: HttpRequestPayloadSchema,
    }),
    z.object({
        node_type: z.literal('QUERY_DATABASE'),
        payload: QueryDatabasePayloadSchema,
    }),
]);
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

```bash
cd validator && npx vitest run tests/nodes.test.ts
```
Expected: tutti i test passano

---

### Task 4: Comandi JMP (radice)

**Files:**
- Create: `validator/src/schemas/mutations.ts`
- Create: `validator/tests/mutations.test.ts`

**Interfaces:**
- Consumes: `NodeDefinitionSchema` da `./nodes`
- Produces: `JmpMutationSchema` — discriminated union su `action` (SPAWN_NODE, MUTATE_PAYLOAD, YIELD_EXECUTION)

- [ ] **Step 1: Scrivere i test per JmpMutationSchema**

Creare `validator/tests/mutations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { JmpMutationSchema } from '../src/schemas/mutations';

describe('JmpMutationSchema', () => {
  describe('SPAWN_NODE', () => {
    it('accepts a valid SPAWN_NODE', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_id: 'n_001',
        parent_id: 'n_root',
        node_type: 'HTTP_REQUEST',
        dependencies: ['n_dep1'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts SPAWN_NODE with minimal fields', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_id: 'n_001',
        node_type: 'QUERY_DATABASE',
      });
      expect(result.success).toBe(true);
    });

    it('rejects SPAWN_NODE without node_id', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_type: 'HTTP_REQUEST',
      });
      expect(result.success).toBe(false);
    });

    it('rejects SPAWN_NODE with invalid node_type', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_id: 'n_001',
        node_type: 'UNKNOWN',
      });
      expect(result.success).toBe(false);
    });

    it('rejects SPAWN_NODE with empty node_id', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'SPAWN_NODE',
        node_id: '',
        node_type: 'HTTP_REQUEST',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('MUTATE_PAYLOAD', () => {
    it('accepts a valid MUTATE_PAYLOAD with any payload structure', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'MUTATE_PAYLOAD',
        node_id: 'n_001',
        payload: { url: 'https://example.com', method: 'GET' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts MUTATE_PAYLOAD with empty payload', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'MUTATE_PAYLOAD',
        node_id: 'n_001',
        payload: {},
      });
      expect(result.success).toBe(true);
    });

    it('rejects MUTATE_PAYLOAD without node_id', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'MUTATE_PAYLOAD',
        payload: { url: 'https://example.com' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('YIELD_EXECUTION', () => {
    it('accepts YIELD_EXECUTION', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'YIELD_EXECUTION',
      });
      expect(result.success).toBe(true);
    });

    it('rejects YIELD_EXECUTION with extra fields', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'YIELD_EXECUTION',
        extra: 'field',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('unknown action', () => {
    it('rejects unknown action', () => {
      const result = JmpMutationSchema.safeParse({
        action: 'UNKNOWN_ACTION',
      });
      expect(result.success).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

```bash
cd validator && npx vitest run tests/mutations.test.ts
```
Expected: FAIL — modulo `../src/schemas/mutations` non trovato

- [ ] **Step 3: Implementare JmpMutationSchema**

Creare `validator/src/schemas/mutations.ts`:

```typescript
import { z } from 'zod';

export const JmpMutationSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('SPAWN_NODE'),
        node_id: z.string().min(1),
        parent_id: z.string().min(1).optional(),
        node_type: z.enum(['HTTP_REQUEST', 'QUERY_DATABASE']),
        dependencies: z.array(z.string().min(1)).optional(),
    }),
    z.object({
        action: z.literal('MUTATE_PAYLOAD'),
        node_id: z.string().min(1),
        payload: z.record(z.string(), z.any()),
    }),
    z.object({
        action: z.literal('YIELD_EXECUTION'),
    }),
]);
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

```bash
cd validator && npx vitest run tests/mutations.test.ts
```
Expected: tutti i test passano

---

### Task 5: Funzione di validazione con context injection

**Files:**
- Create: `validator/src/schemas/validate.ts`
- Create: `validator/tests/validate.test.ts`

**Interfaces:**
- Consumes: `JmpMutationSchema` da `./mutations`, `NodeDefinitionSchema` da `./nodes`
- Produces: `validateMutations(mutations: unknown[], context: Record<string, string>) => {valid: boolean, errors?: ValidationFault[]}`
- Produces: `ValidationFault` type `{field: string, expected: string, received: string, message: string}`

- [ ] **Step 1: Scrivere i test per validateMutations**

Creare `validator/tests/validate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateMutations } from '../src/schemas/validate';

describe('validateMutations', () => {
  it('returns valid for a batch of correct mutations', () => {
    const result = validateMutations(
      [
        { action: 'SPAWN_NODE', node_id: 'n_1', node_type: 'HTTP_REQUEST' },
        { action: 'MUTATE_PAYLOAD', node_id: 'n_1', payload: { url: 'https://example.com' } },
        { action: 'YIELD_EXECUTION' },
      ],
      { n_1: 'HTTP_REQUEST' }
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('rejects unknown action', () => {
    const result = validateMutations(
      [{ action: 'UNKNOWN' }],
      {}
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('rejects SPAWN_NODE with missing node_id', () => {
    const result = validateMutations(
      [{ action: 'SPAWN_NODE', node_type: 'HTTP_REQUEST' }],
      {}
    );
    expect(result.valid).toBe(false);
  });

  it('rejects MUTATE_PAYLOAD with missing node_id in context', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_missing', payload: { url: 'https://example.com' } }],
      {}
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].field).toContain('n_missing');
  });

  it('rejects MUTATE_PAYLOAD with wrong payload type (HTTP body on SQL node)', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_sql', payload: { url: 'https://example.com' } }],
      { n_sql: 'QUERY_DATABASE' }
    );
    expect(result.valid).toBe(false);
  });

  it('accepts MUTATE_PAYLOAD with correct context and valid payload', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_http', payload: { url: 'https://example.com' } }],
      { n_http: 'HTTP_REQUEST' }
    );
    expect(result.valid).toBe(true);
  });

  it('accepts SQL MUTATE_PAYLOAD with correct context', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_sql', payload: { query: 'SELECT 1' } }],
      { n_sql: 'QUERY_DATABASE' }
    );
    expect(result.valid).toBe(true);
  });

  it('rejects entire batch if one mutation fails (atomicity)', () => {
    const result = validateMutations(
      [
        { action: 'SPAWN_NODE', node_id: 'n_1', node_type: 'HTTP_REQUEST' },
        { action: 'MUTATE_PAYLOAD', node_id: 'n_bad', payload: { invalid: true } },
      ],
      {}
    );
    expect(result.valid).toBe(false);
    // La prima era valida, ma il batch è atomico — tutto respinto
  });

  it('returns errors in VALIDATION_FAULT format', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_1', payload: { url: 'not-a-url' } }],
      { n_1: 'HTTP_REQUEST' }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    for (const err of result.errors!) {
      expect(err).toHaveProperty('field');
      expect(err).toHaveProperty('expected');
      expect(err).toHaveProperty('received');
      expect(err).toHaveProperty('message');
      expect(typeof err.field).toBe('string');
      expect(typeof err.expected).toBe('string');
      expect(typeof err.received).toBe('string');
      expect(typeof err.message).toBe('string');
    }
  });

  it('accepts YIELD_EXECUTION without context', () => {
    const result = validateMutations(
      [{ action: 'YIELD_EXECUTION' }],
      {}
    );
    expect(result.valid).toBe(true);
  });

  it('rejects unknown node_type in context for MUTATE_PAYLOAD', () => {
    const result = validateMutations(
      [{ action: 'MUTATE_PAYLOAD', node_id: 'n_1', payload: {} }],
      { n_1: 'UNKNOWN_TYPE' }
    );
    expect(result.valid).toBe(false);
  });

  it('accepts empty mutations array', () => {
    const result = validateMutations([], {});
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

```bash
cd validator && npx vitest run tests/validate.test.ts
```
Expected: FAIL — modulo `../src/schemas/validate` non trovato

- [ ] **Step 3: Implementare validateMutations e ValidationFault**

Creare `validator/src/schemas/validate.ts`:

```typescript
import { ZodError } from 'zod';
import { JmpMutationSchema } from './mutations';
import { NodeDefinitionSchema } from './nodes';

export interface ValidationFault {
    field: string;
    expected: string;
    received: string;
    message: string;
}

export interface ValidationResult {
    valid: boolean;
    errors?: ValidationFault[];
}

function mapZodError(error: ZodError): ValidationFault[] {
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        expected: String(issue.expected ?? 'unknown'),
        received: String(issue.received ?? 'undefined'),
        message: issue.message,
    }));
}

function makeFault(field: string, expected: string, received: string, message: string): ValidationFault {
    return { field, expected, received, message };
}

export function validateMutations(
    mutations: unknown[],
    context: Record<string, string>
): ValidationResult {
    const allFaults: ValidationFault[] = [];

    // Step 1: Validate each mutation against JmpMutationSchema (action-level)
    for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        const parsed = JmpMutationSchema.safeParse(mutation);

        if (!parsed.success) {
            const faults = mapZodError(parsed.error).map((f) => ({
                ...f,
                field: `mutations[${i}].${f.field}`,
            }));
            allFaults.push(...faults);
            continue;
        }

        // Step 2: For MUTATE_PAYLOAD, inject node_type from context and validate payload
        if (parsed.data.action === 'MUTATE_PAYLOAD') {
            const nodeId = parsed.data.node_id;
            const nodeType = context[nodeId];

            if (!nodeType) {
                allFaults.push(
                    makeFault(
                        `mutations[${i}].node_id`,
                        'node_id present in context',
                        nodeId,
                        `Node "${nodeId}" not found in context. Cannot validate payload without node_type.`
                    )
                );
                continue;
            }

            // Build object with node_type injected for discriminated union validation
            const enriched = {
                node_type: nodeType,
                payload: parsed.data.payload,
            };

            const nodeParsed = NodeDefinitionSchema.safeParse(enriched);

            if (!nodeParsed.success) {
                const faults = mapZodError(nodeParsed.error).map((f) => ({
                    ...f,
                    field: `mutations[${i}].payload.${f.field}`,
                }));
                allFaults.push(...faults);
            }
        }
        // SPAWN_NODE and YIELD_EXECUTION are fully validated at step 1
    }

    if (allFaults.length > 0) {
        return { valid: false, errors: allFaults };
    }

    return { valid: true };
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

```bash
cd validator && npx vitest run tests/validate.test.ts
```
Expected: tutti i test passano

---

### Task 6: Endpoint Fastify POST /validate

**Files:**
- Modify: `validator/src/server.ts`

**Interfaces:**
- Consumes: `validateMutations` da `./schemas/validate`
- Produces: `POST /validate` route con contratto API come da spec

- [ ] **Step 1: Scrivere il test di integrazione per l'endpoint**

Modificare `validator/src/server.ts` per esportare il server (per testing). Poi creare `validator/tests/server.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { buildServer } from '../src/server';

describe('POST /validate', () => {
  const server = buildServer();

  afterAll(async () => {
    await server.close();
  });

  it('returns 200 with valid:true for a correct batch', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        mutations: [
          { action: 'SPAWN_NODE', node_id: 'n_1', node_type: 'HTTP_REQUEST' },
          { action: 'MUTATE_PAYLOAD', node_id: 'n_1', payload: { url: 'https://example.com' } },
          { action: 'YIELD_EXECUTION' },
        ],
        context: { n_1: 'HTTP_REQUEST' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(true);
    expect(body.errors).toBeUndefined();
  });

  it('returns 200 with valid:false and errors for invalid payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        mutations: [
          { action: 'MUTATE_PAYLOAD', node_id: 'n_bad', payload: { url: 'not-a-url' } },
        ],
        context: { n_bad: 'HTTP_REQUEST' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(false);
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('returns 200 even for completely malformed JSON', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: { not: 'valid' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(false);
  });

  it('returns 200 with valid:false for missing node_id in context', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        mutations: [
          { action: 'MUTATE_PAYLOAD', node_id: 'n_missing', payload: {} },
        ],
        context: {},
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
cd validator && npx vitest run tests/server.test.ts
```
Expected: FAIL — `buildServer` non esportato o endpoint non esiste

- [ ] **Step 3: Rifattorizzare server.ts esportando buildServer e aggiungendo la route**

Sostituire `validator/src/server.ts` con:

```typescript
import Fastify from 'fastify';
import { validateMutations } from './schemas/validate';

export function buildServer() {
  const server = Fastify({ logger: false });

  server.get('/health', async () => ({
    status: 'ok',
    service: 'avm-validator',
  }));

  server.post('/validate', async (request, reply) => {
    const { mutations, context } = request.body as {
      mutations?: unknown[];
      context?: Record<string, string>;
    };

    if (!Array.isArray(mutations) || !context || typeof context !== 'object') {
      return { valid: false, errors: [{ field: 'body', expected: '{mutations: array, context: object}', received: typeof request.body, message: 'Request body must contain mutations array and context object' }] };
    }

    const result = validateMutations(mutations, context);
    return result;
  });

  return server;
}

// Avvio standalone solo se eseguito direttamente
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.js')
);

if (isMainModule) {
  const server = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';

  server.listen({ port, host }).catch((error: unknown) => {
    server.log.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Eseguire i test di integrazione**

```bash
cd validator && npx vitest run tests/server.test.ts
```
Expected: tutti i test passano

---

### Task 7: Verifica completa e test run globale

**Files:**
- Nessuna modifica, solo verifica

- [ ] **Step 1: Eseguire l'intera suite di test**

```bash
cd validator && npx vitest run
```
Expected: tutti i test (payloads, nodes, mutations, validate, server) passano

- [ ] **Step 2: Verificare che la build TypeScript funzioni**

```bash
cd validator && npx tsc --noEmit
```
Expected: nessun errore di compilazione

- [ ] **Step 3: Avviare il server e testare /health**

```bash
cd validator && npx tsx src/server.ts &
sleep 2
curl -s http://127.0.0.1:3000/health
kill %1 2>/dev/null
```
Expected: `{"status":"ok","service":"avm-validator"}`

- [ ] **Step 4: Testare POST /validate via curl**

```bash
cd validator && npx tsx src/server.ts &
sleep 2
curl -s -X POST http://127.0.0.1:3000/validate \
  -H "Content-Type: application/json" \
  -d '{"mutations":[{"action":"YIELD_EXECUTION"}],"context":{}}'
kill %1 2>/dev/null
```
Expected: `{"valid":true}`

---

### Self-Review

- **Spec coverage:**
  - Payload schemas (HTTP + SQL): Task 2 ✅
  - Discriminated union node_type: Task 3 ✅
  - JMP commands (SPAWN_NODE, MUTATE_PAYLOAD, YIELD_EXECUTION): Task 4 ✅
  - State context injection: Task 5 ✅
  - VALIDATION_FAULT error mapping: Task 5 ✅
  - Atomic batch validation: Task 5 (test) ✅
  - Endpoint POST /validate 200 OK: Task 6 ✅
  - MUTATE_PAYLOAD missing node_id in context → explicit fault: Task 5 ✅
  - File structure as per spec: Tasks 2-6 ✅

- **Placeholder scan:** Nessun TBD, TODO, "implement later", o riferimento ad altro task. ✅

- **Type consistency:**
  - `HttpRequestPayloadSchema` / `QueryDatabasePayloadSchema`: definiti in Task 2, consumati in Task 3 ✅
  - `NodeDefinitionSchema`: definito in Task 3, consumato in Task 5 ✅
  - `JmpMutationSchema`: definito in Task 4, consumato in Task 5 ✅
  - `validateMutations()`: definito in Task 5, consumato in Task 6 ✅
  - `buildServer()`: definito in Task 6 ✅
  - `ValidationFault` / `ValidationResult`: definiti in Task 5, usati in Task 5,6 ✅
