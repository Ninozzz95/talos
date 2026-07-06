# PHP IPC Client — Design Specification

> **Status:** Approved  
> **Date:** 2026-07-06  
> **Scope:** Client PHP per comunicazione IPC con il validator Node.js, DTO di risposta, interfaccia HTTP, context injection lato orchestratore

## Architecture Overview

Il `JmpValidatorClient` è il ponte tra l'orchestratore PHP e il microservizio Node.js. Riceve mutazioni JMP e context pre-compilato, serializza l'envelope, chiama `POST /validate` e restituisce un `ValidationResult` tipizzato.

```
ASTOrchestrator → buildContext() → [mutations, context]
                                        ↓
JmpValidatorClient → HttpClientInterface → POST /validate → Node.js
                                        ↓
                              ValidationResult {valid, errors: ValidationFault[]}
```

### Confini

- **Dentro lo scope:** DTO `ValidationResult`/`ValidationFault`, `HttpClientInterface`, `CurlHttpClient`, `JmpValidatorClient`, `ASTOrchestrator::buildContext()`, test PHPUnit
- **Fuori scope:** modifica della logica di orchestrazione DAG, Worker esecutivi, integrazione LLM

---

## Component Design

### 1. Data Transfer Objects

#### 1.1 ValidationFault

Rappresenta un singolo errore di validazione nel formato `VALIDATION_FAULT` definito dal doc #2.

```php
// core/src/ValidationFault.php
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

#### 1.2 ValidationResult

Risultato completo della validazione. `valid: true` se il batch è passato; `valid: false` con array `errors` popolato altrimenti.

```php
// core/src/ValidationResult.php
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

### 2. HTTP Transport Layer

#### 2.1 HttpClientInterface

Interfaccia minima per disaccoppiare il trasporto. Un solo metodo: `postJson`.

```php
// core/src/HttpClientInterface.php
namespace AVM;

interface HttpClientInterface
{
    /**
     * Invia una richiesta POST con body JSON e restituisce il body decodificato.
     *
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     * @throws \RuntimeException in caso di errore di rete
     */
    public function postJson(string $url, array $body): array;
}
```

#### 2.2 CurlHttpClient

Implementazione reale basata su cURL (estensione nativa PHP). Gestisce timeout, errori di rete e decodifica JSON.

```php
// core/src/CurlHttpClient.php
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

        /** @var array<string, mixed> */
        return \json_decode($response, true, flags: \JSON_THROW_ON_ERROR);
    }
}
```

### 3. JmpValidatorClient

Coordina la chiamata IPC: serializza envelope, invia, deserializza risposta in `ValidationResult`.

```php
// core/src/JmpValidatorClient.php
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

### 4. buildContext() in ASTOrchestrator

L'Orchestratore è l'unico proprietario del DAG — è sua responsabilità estrarre i `node_type` per costruire il `context` prima di chiamare il validator.

**Nota:** `ASTOrchestrator` attualmente memorizza i nodi come `array{id: string, status: string}`. Per supportare `buildContext`, serve aggiungere il campo `type` allo storage del nodo. Questo è l'unico cambiamento strutturale all'orchestratore esistente.

```php
// In ASTOrchestrator — aggiungere/modificare:

// Il campo 'type' viene aggiunto a addNode():
public function addNode(string $nodeId, array $dependencies = [], string $type = 'UNKNOWN'): void
{
    // ... validazione esistente ...
    $this->nodes[$nodeId] = [
        'id' => $nodeId,
        'status' => NodeStatus::PENDING,
        'type' => $type,  // ← nuovo campo
    ];
    // ... resto invariato ...
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

---

## File Structure

```
core/src/
├── NodeStatus.php              # esistente, invariato
├── ASTOrchestrator.php         # MODIFY: +campo type in addNode(), +buildContext()
├── ValidationFault.php         # CREATE
├── ValidationResult.php        # CREATE
├── HttpClientInterface.php     # CREATE
├── CurlHttpClient.php          # CREATE
├── JmpValidatorClient.php      # CREATE
core/tests/
├── ASTOrchestratorTest.php     # esistente, MODIFY: aggiornare addNode() con type
├── JmpValidatorClientTest.php  # CREATE
```

---

## Testing Strategy

Test PHPUnit con mock di `HttpClientInterface`:

1. **Validazione positiva** — mock restituisce `{valid: true}`, il client restituisce `ValidationResult{valid: true, errors: []}`
2. **Validazione negativa con errori** — mock restituisce `{valid: false, errors: [{field, expected, received, message}]}`, il client mappa correttamente in `ValidationFault[]`
3. **Errore di rete** — mock lancia `\RuntimeException`, il client propaga l'eccezione
4. **Risposta malformata** — mock restituisce array senza `valid`, il client lancia `\RuntimeException`
5. **Costruzione envelope** — verifica che il body inviato a `postJson` contenga `mutations` e `context` corretti
6. **buildContext** (in ASTOrchestratorTest) — dato un DAG con nodi tipizzati, verifica che `buildContext` restituisca il mapping corretto solo per `MUTATE_PAYLOAD`

---

## Constraints

- PHP 8.5+ (già dichiarato in `core/composer.json`)
- Nessuna dipendenza esterna oltre a cURL (estensione PHP nativa)
- `addNode()` mantiene compatibilità all'indietro: il parametro `$type` è opzionale con default `'UNKNOWN'`
- `buildContext()` restituisce solo i `node_id` che esistono effettivamente nell'AST — nodi sconosciuti vengono ignorati silenziosamente (sarà il validator Node.js a segnalare l'errore quando riceve `MUTATE_PAYLOAD` senza context)
