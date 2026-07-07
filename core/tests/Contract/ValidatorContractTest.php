<?php

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

use Kadmos\CurlHttpClient;
use Kadmos\Validator\HttpJmpValidator;
use Kadmos\Validator\ValidatorHealthCheck;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(
            $message . PHP_EOL .
            'Expected: ' . var_export($expected, true) . PHP_EOL .
            'Actual:   ' . var_export($actual, true)
        );
    }
}

$baseUrl = rtrim(getenv('KADMOS_CONTRACT_VALIDATOR_URL') ?: 'http://127.0.0.1:3010', '/');
$health = new ValidatorHealthCheck($baseUrl . '/health', 1000);

assertTrue(
    $health->isHealthy(),
    "Validator is not healthy at {$baseUrl}. Start it with scripts/test-contract.ps1."
);

$validator = new HttpJmpValidator(new CurlHttpClient(2000), $baseUrl . '/validate');

function testRealValidatorAcceptsValidBatch(HttpJmpValidator $validator): void
{
    $result = $validator->validate([
        ['action' => 'SPAWN_NODE', 'node_id' => 'n_1', 'node_type' => 'HTTP_REQUEST'],
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'n_1', 'payload' => ['url' => 'https://example.com']],
        ['action' => 'YIELD_EXECUTION'],
    ], ['n_1' => 'HTTP_REQUEST']);

    assertTrue($result->valid, 'Real validator should accept a valid HTTP_REQUEST batch.');
}

function testRealValidatorRejectsGhostNode(HttpJmpValidator $validator): void
{
    $result = $validator->validate([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'ghost', 'payload' => ['url' => 'https://example.com']],
    ], []);

    assertTrue(!$result->valid, 'Real validator should reject MUTATE_PAYLOAD for a ghost node.');
    assertSameValue('mutations[0].node_id', $result->errors[0]->field, 'Ghost node fault field should match contract.');
}

function testRealValidatorRejectsInvalidHttpUrl(HttpJmpValidator $validator): void
{
    $result = $validator->validate([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'n_1', 'payload' => ['url' => 'not-a-url']],
    ], ['n_1' => 'HTTP_REQUEST']);

    assertTrue(!$result->valid, 'Real validator should reject invalid HTTP URLs.');
    assertTrue(
        str_contains($result->errors[0]->field, 'payload.url'),
        'Invalid URL fault should identify payload.url. Actual: ' . $result->errors[0]->field
    );
}

function testRealValidatorRejectsSqlPayloadWithHttpFields(HttpJmpValidator $validator): void
{
    $result = $validator->validate([
        ['action' => 'MUTATE_PAYLOAD', 'node_id' => 'n_sql', 'payload' => ['url' => 'https://example.com']],
    ], ['n_sql' => 'QUERY_DATABASE']);

    assertTrue(!$result->valid, 'Real validator should reject HTTP payload fields on SQL nodes.');
}

$tests = [
    'testRealValidatorAcceptsValidBatch',
    'testRealValidatorRejectsGhostNode',
    'testRealValidatorRejectsInvalidHttpUrl',
    'testRealValidatorRejectsSqlPayloadWithHttpFields',
];

foreach ($tests as $test) {
    $test($validator);
    echo $test . " passed" . PHP_EOL;
}

echo "All PHP-Node validator contract tests passed" . PHP_EOL;

