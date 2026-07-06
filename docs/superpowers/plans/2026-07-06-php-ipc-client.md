# PHP IPC Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PHP IPC client that sends JMP mutations to the Node.js validator and returns typed ValidationResult DTOs.

**Architecture:** Bottom-up: DTOs → HTTP interface → client → orchestrator integration. HttpClientInterface enables mock injection for PHPUnit tests without running Node.js. ASTOrchestrator gains `buildContext()` and a `type` field on nodes.

**Tech Stack:** PHP 8.5 CLI, cURL extension, PHPUnit 12.x (già in composer.json)

## Global Constraints

- PHP 8.5+ strict types, namespace `AVM\`
- `HttpClientInterface` consente mock nei test — nessuna dipendenza da Node.js in esecuzione
- `addNode()` guadagna `$type` opzionale con default `'UNKNOWN'` — retrocompatibile
- `buildContext()` popola solo per `MUTATE_PAYLOAD`, ignora nodi assenti
- Nessuna dipendenza esterna oltre a cURL (estensione nativa)
- Usare wrapper `.tools/bin` per PHP e Composer

---

### Task 1: DTO (ValidationFault + ValidationResult)

**Files:**
- Create: `core/src/ValidationFault.php`
- Create: `core/src/ValidationResult.php`

**Interfaces:**
- Produces: `AVM\ValidationFault`, `AVM\ValidationResult` — classi readonly

- [ ] **Step 1: Creare ValidationFault**

```php
<?php

declare(strict_types=1);

namespace AVM;

final readonly class ValidationFault
{
    public function __construct(
        public string $field,
        public string $expected,
        public string $received,
        public string $message,
    ) {}
}
```

- [ ] **Step 2: Creare ValidationResult**

```php
<?php

declare(strict_types=1);

namespace AVM;

final readonly class ValidationResult
{
    /**
     * @param ValidationFault[] $errors
     */
    public function __construct(
        public bool $valid,
        public array $errors = [],
    ) {}
}
```

- [ ] **Step 3: Verificare sintassi PHP**

```bash
cd core && ../.tools/bin/php -l src/ValidationFault.php && ../.tools/bin/php -l src/ValidationResult.php
```
Expected: `No syntax errors detected` per entrambi

---

### Task 2: HTTP Interface + CurlHttpClient

**Files:**
- Create: `core/src/HttpClientInterface.php`
- Create: `core/src/CurlHttpClient.php`

**Interfaces:**
- Produces: `AVM\HttpClientInterface`, `AVM\CurlHttpClient`
- Consumes: (nessuno — foglia)

- [ ] **Step 1: Creare HttpClientInterface**

```php
<?php

declare(strict_types=1);

namespace AVM;

interface HttpClientInterface
{
    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     * @throws \RuntimeException
     */
    public function postJson(string $url, array $body): array;
}
```

- [ ] **Step 2: Creare CurlHttpClient**

```php
<?php

declare(strict_types=1);

namespace AVM;

final class CurlHttpClient implements HttpClientInterface
{
    public function __construct(
        private int $timeoutMs = 5000,
    ) {}

    public function postJson(string $url, array $body): array
    {
        $ch = \curl_init($url);
        \curl_setopt_array($ch, [
            \CURLOPT_RETURNTRANSFER => true,
            \CURLOPT_POST => true,
            \CURLOPT_POSTFIELDS => \json_encode($body),
            \CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            \CURLOPT_TIMEOUT_MS => $this->timeoutMs,
        ]);

        $response = \curl_exec($ch);
        $error = \curl_error($ch);
        \curl_close($ch);

        if ($response === false) {
            throw new \RuntimeException("Validator unreachable: {$error}");
        }

        return \json_decode($response, true, flags: \JSON_THROW_ON_ERROR);
    }
}
```

- [ ] **Step 3: Verificare sintassi PHP**

```bash
cd core && ../.tools/bin/php -l src/HttpClientInterface.php && ../.tools/bin/php -l src/CurlHttpClient.php
```
Expected: `No syntax errors detected`

---

### Task 3: JmpValidatorClient + Test

**Files:**
- Create: `core/src/JmpValidatorClient.php`
- Create: `core/tests/JmpValidatorClientTest.php`

**Interfaces:**
- Consumes: `ValidationResult`, `ValidationFault`, `HttpClientInterface`
- Produces: `AVM\JmpValidatorClient::validate(mutations, context): ValidationResult`

- [ ] **Step 1: Scrivere il test JmpValidatorClientTest**

Creare `core/tests/JmpValidatorClientTest.php`:

```php
<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/ValidationFault.php';
require_once __DIR__ . '/../src/ValidationResult.php';
require_once __DIR__ . '/../src/HttpClientInterface.php';
require_once __DIR__ . '/../src/JmpValidatorClient.php';

use AVM\JmpValidatorClient;
use AVM\HttpClientInterface;
use AVM\ValidationResult;
use AVM\ValidationFault;

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new \RuntimeException(
            $message . PHP_EOL .
            'Expected: ' . var_export($expected, true) . PHP_EOL .
            'Actual:   ' . var_export($actual, true)
        );
    }
}

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new \RuntimeException($message);
    }
}

// Stub HTTP client per i test
final class StubHttpClient implements HttpClientInterface
{
    /** @var array<string, mixed> */
    public array $lastBody = [];
    /** @var string */
    public string $lastUrl = '';

    /**
     * @param array<string, mixed> $returnValue
     */
    public function __construct(
        private array $returnValue,
    ) {}

    public function postJson(string $url, array $body): array
    {
        $this->lastUrl = $url;
        $this->lastBody = $body;
        return $this->returnValue;
    }
}

// Scenario 1: validazione positiva
function testValidBatchReturnsSuccess(): void
{
    $stub = new StubHttpClient(['valid' => true]);
    $client = new JmpValidatorClient($stub);

    $result = $client->validate(
        [['action' => 'YIELD_EXECUTION']],
        []
    );

    assertTrue($result->valid, 'Result should be valid.');
    assertSameValue(0, count($result->errors), 'Should have zero errors.');
}

// Scenario 2: validazione negativa con errori
function testInvalidBatchReturnsErrors(): void
{
    $stub = new StubHttpClient([
        'valid' => false,
        'errors' => [
            ['field' => 'payload.url', 'expected' => 'valid URL', 'received' => 'not-a-url', 'message' => 'Invalid url'],
        ],
    ]);
    $client = new JmpValidatorClient($stub);

    $result = $client->validate(
        [['action' => 'MUTATE_PAYLOAD', 'node_id' => 'n_1', 'payload' => ['url' => 'not-a-url']]],
        ['n_1' => 'HTTP_REQUEST']
    );

    assertTrue(!$result->valid, 'Result should be invalid.');
    assertSameValue(1, count($result->errors), 'Should have one error.');
    assertSameValue('payload.url', $result->errors[0]->field, 'Field should match.');
    assertSameValue('valid URL', $result->errors[0]->expected, 'Expected should match.');
    assertSameValue('not-a-url', $result->errors[0]->received, 'Received should match.');
    assertSameValue('Invalid url', $result->errors[0]->message, 'Message should match.');
}

// Scenario 3: envelope contiene mutations e context corretti
function testEnvelopeContainsMutationsAndContext(): void
{
    $stub = new StubHttpClient(['valid' => true]);
    $client = new JmpValidatorClient($stub, 'http://test:3000/validate');

    $mutations = [['action' => 'SPAWN_NODE', 'node_id' => 'n_1', 'node_type' => 'HTTP_REQUEST']];
    $context = ['n_1' => 'HTTP_REQUEST'];

    $client->validate($mutations, $context);

    assertSameValue('http://test:3000/validate', $stub->lastUrl, 'URL should match.');
    assertTrue(isset($stub->lastBody['mutations']), 'Body should contain mutations.');
    assertTrue(isset($stub->lastBody['context']), 'Body should contain context.');
    assertSameValue($mutations, $stub->lastBody['mutations'], 'Mutations should be forwarded.');
    assertSameValue($context, $stub->lastBody['context'], 'Context should be forwarded.');
}

// Scenario 4: risposta malformata (senza 'valid')
function testMalformedResponseThrowsException(): void
{
    $stub = new StubHttpClient(['unexpected' => 'shape']);
    $client = new JmpValidatorClient($stub);

    $threw = false;
    try {
        $client->validate([], []);
    } catch (\RuntimeException $e) {
        $threw = true;
        assertTrue(str_contains($e->getMessage(), 'valid'), 'Exception should mention missing valid field.');
    }
    assertTrue($threw, 'Should throw RuntimeException for malformed response.');
}

// Scenario 5: campi mancanti negli errori vengono gestiti con default
function testErrorMissingFieldsUseDefaults(): void
{
    $stub = new StubHttpClient([
        'valid' => false,
        'errors' => [
            [], // oggetto vuoto
        ],
    ]);
    $client = new JmpValidatorClient($stub);

    $result = $client->validate([], []);

    assertTrue(!$result->valid, 'Result should be invalid.');
    assertSameValue(1, count($result->errors), 'Should have one error.');
    assertSameValue('', $result->errors[0]->field, 'Missing field defaults to empty string.');
    assertSameValue('', $result->errors[0]->expected, 'Missing expected defaults to empty string.');
    assertSameValue('', $result->errors[0]->received, 'Missing received defaults to empty string.');
    assertSameValue('', $result->errors[0]->message, 'Missing message defaults to empty string.');
}

$tests = [
    'testValidBatchReturnsSuccess',
    'testInvalidBatchReturnsErrors',
    'testEnvelopeContainsMutationsAndContext',
    'testMalformedResponseThrowsException',
    'testErrorMissingFieldsUseDefaults',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All JmpValidatorClient tests passed" . PHP_EOL;
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
cd core && ../.tools/bin/php tests/JmpValidatorClientTest.php
```
Expected: FAIL — `JmpValidatorClient` non trovato

- [ ] **Step 3: Implementare JmpValidatorClient**

Creare `core/src/JmpValidatorClient.php`:

```php
<?php

declare(strict_types=1);

namespace AVM;

final class JmpValidatorClient
{
    public function __construct(
        private HttpClientInterface $http,
        private string $validatorUrl = 'http://127.0.0.1:3000/validate',
    ) {}

    /**
     * @param list<array<string, mixed>> $mutations
     * @param array<string, string> $context  node_id => node_type
     */
    public function validate(array $mutations, array $context): ValidationResult
    {
        $body = [
            'mutations' => $mutations,
            'context' => $context,
        ];

        $response = $this->http->postJson($this->validatorUrl, $body);

        if (!isset($response['valid']) || !\is_bool($response['valid'])) {
            throw new \RuntimeException('Invalid response from validator: missing "valid" field');
        }

        $errors = [];
        if (!$response['valid'] && isset($response['errors']) && \is_array($response['errors'])) {
            foreach ($response['errors'] as $error) {
                \assert(\is_array($error));
                $errors[] = new ValidationFault(
                    field: (string) ($error['field'] ?? ''),
                    expected: (string) ($error['expected'] ?? ''),
                    received: (string) ($error['received'] ?? ''),
                    message: (string) ($error['message'] ?? ''),
                );
            }
        }

        return new ValidationResult(
            valid: $response['valid'],
            errors: $errors,
        );
    }
}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

```bash
cd core && ../.tools/bin/php tests/JmpValidatorClientTest.php
```
Expected: tutti i test passano

---

### Task 4: buildContext() in ASTOrchestrator + aggiornamento test esistenti

**Files:**
- Modify: `core/src/ASTOrchestrator.php`
- Modify: `core/tests/ASTOrchestratorTest.php`

**Interfaces:**
- Consumes: `NodeStatus`
- Produces: `ASTOrchestrator::addNode()` con parametro `$type`, `ASTOrchestrator::buildContext()`

- [ ] **Step 1: Modificare ASTOrchestrator**

In `core/src/ASTOrchestrator.php`, modificare la firma di `addNode()` e aggiungere `buildContext()`:

```php
// Modifica: parametro $type aggiunto
public function addNode(string $nodeId, array $dependencies = [], string $type = 'UNKNOWN'): void
{
    if (isset($this->nodes[$nodeId])) {
        throw new InvalidArgumentException("Node already exists: {$nodeId}");
    }

    foreach ($dependencies as $dependencyId) {
        $this->assertNodeExists($dependencyId);
    }

    $this->nodes[$nodeId] = [
        'id' => $nodeId,
        'status' => NodeStatus::PENDING,
        'type' => $type,
    ];
    $this->dependencies[$nodeId] = array_values($dependencies);
    $this->children[$nodeId] ??= [];

    foreach ($dependencies as $dependencyId) {
        $this->children[$dependencyId] ??= [];
        $this->children[$dependencyId][] = $nodeId;
    }
}

// Nuovo metodo:
/**
 * Costruisce il context {node_id => node_type} per l'envelope IPC.
 *
 * @param list<array<string, mixed>> $mutations
 * @return array<string, string>
 */
public function buildContext(array $mutations): array
{
    $context = [];
    foreach ($mutations as $mutation) {
        if (($mutation['action'] ?? '') === 'MUTATE_PAYLOAD' && isset($mutation['node_id'])) {
            $nodeId = (string) $mutation['node_id'];
            if (isset($this->nodes[$nodeId])) {
                $context[$nodeId] = $this->nodes[$nodeId]['type'];
            }
        }
    }
    return $context;
}
```

- [ ] **Step 2: Aggiungere test per buildContext**

In `core/tests/ASTOrchestratorTest.php`, aggiungere dopo i test esistenti (prima dell'array `$tests`):

```php
function testBuildContextReturnsTypeMapping(): void
{
    $orchestrator = new ASTOrchestrator();
    $orchestrator->addNode('A', [], 'HTTP_REQUEST');
    $orchestrator->addNode('B', ['A'], 'QUERY_DATABASE');

    $context = $orchestrator->buildContext([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'A', 'payload' => []],
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'B', 'payload' => []],
    ]);

    assertSameValue(['A' => 'HTTP_REQUEST', 'B' => 'QUERY_DATABASE'], $context, 'buildContext should return correct type mapping.');
}

function testBuildContextIgnoresNonMutateActions(): void
{
    $orchestrator = new ASTOrchestrator();
    $orchestrator->addNode('A', [], 'HTTP_REQUEST');

    $context = $orchestrator->buildContext([
        ['action' => 'SPAWN_NODE', 'node_id' => 'A'],
        ['action' => 'YIELD_EXECUTION'],
    ]);

    assertSameValue([], $context, 'buildContext should ignore non-MUTATE_PAYLOAD actions.');
}

function testBuildContextIgnoresUnknownNodes(): void
{
    $orchestrator = new ASTOrchestrator();

    $context = $orchestrator->buildContext([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'GHOST', 'payload' => []],
    ]);

    assertSameValue([], $context, 'buildContext should ignore nodes not in the AST.');
}

function testBuildContextWithDefaultType(): void
{
    $orchestrator = new ASTOrchestrator();
    $orchestrator->addNode('A'); // type default = UNKNOWN

    $context = $orchestrator->buildContext([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'A', 'payload' => []],
    ]);

    assertSameValue(['A' => 'UNKNOWN'], $context, 'buildContext should return UNKNOWN for nodes without explicit type.');
}
```

E aggiornare l'array `$tests`:

```php
$tests = [
    'testFailureCascadesToLinearDescendants',
    'testFailureBlocksSharedChildUntilAllParentsSucceed',
    'testHmiRetryRestoresBlockedDescendants',
    'testBuildContextReturnsTypeMapping',
    'testBuildContextIgnoresNonMutateActions',
    'testBuildContextIgnoresUnknownNodes',
    'testBuildContextWithDefaultType',
];
```

- [ ] **Step 3: Eseguire tutti i test**

```bash
cd core && ../.tools/bin/php tests/ASTOrchestratorTest.php && ../.tools/bin/php tests/JmpValidatorClientTest.php
```
Expected: tutti i test passano in entrambi i file

---

### Self-Review

- **Spec coverage:**
  - ValidationFault DTO: Task 1 ✅
  - ValidationResult DTO: Task 1 ✅
  - HttpClientInterface: Task 2 ✅
  - CurlHttpClient: Task 2 ✅
  - JmpValidatorClient: Task 3 ✅
  - buildContext in ASTOrchestrator: Task 4 ✅
  - addNode con $type opzionale: Task 4 ✅
  - Testing con stub HTTP: Task 3 ✅

- **Placeholder scan:** Nessun TBD, TODO o riferimento ambiguo. ✅

- **Type consistency:**
  - `ValidationFault` definito in Task 1, consumato in Task 3 ✅
  - `ValidationResult` definito in Task 1, consumato in Task 3 ✅
  - `HttpClientInterface` definito in Task 2, consumato in Task 3 ✅
  - `addNode` firma aggiornata in Task 4, compatibile con Task 3 call ✅
