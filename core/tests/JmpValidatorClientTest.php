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

final class StubHttpClient implements HttpClientInterface
{
    /** @var array<string, mixed> */
    public array $lastBody = [];
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

function testErrorMissingFieldsUseDefaults(): void
{
    $stub = new StubHttpClient([
        'valid' => false,
        'errors' => [
            [],
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
