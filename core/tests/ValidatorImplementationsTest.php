<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\HttpClientInterface;
use Kadmos\Validator\HttpJmpValidator;
use Kadmos\Validator\JmpValidatorInterface;
use Kadmos\Validator\MockJmpValidator;

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

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class CapturingHttpClient implements HttpClientInterface
{
    public string $lastUrl = '';

    /** @var array<string, mixed> */
    public array $lastBody = [];

    /**
     * @param array<string, mixed> $response
     */
    public function __construct(private array $response) {}

    public function postJson(string $url, array $body): array
    {
        $this->lastUrl = $url;
        $this->lastBody = $body;

        return $this->response;
    }
}

function testHttpValidatorImplementsSharedInterfaceAndForwardsEnvelope(): void
{
    $http = new CapturingHttpClient(['valid' => true]);
    $validator = new HttpJmpValidator($http, 'http://validator.local/validate');

    assertTrue($validator instanceof JmpValidatorInterface, 'Http validator should implement JmpValidatorInterface.');

    $mutations = [['action' => 'YIELD_EXECUTION']];
    $context = ['n1' => 'HTTP_REQUEST'];
    $result = $validator->validate($mutations, $context);

    assertTrue($result->valid, 'HTTP validator should parse valid responses.');
    assertSameValue('http://validator.local/validate', $http->lastUrl, 'HTTP validator should post to configured URL.');
    assertSameValue($mutations, $http->lastBody['mutations'] ?? null, 'HTTP validator should forward mutations.');
    assertSameValue($context, $http->lastBody['context'] ?? null, 'HTTP validator should forward context.');
}

function testMockValidatorCanForceValidAndInvalidResults(): void
{
    $validMock = new MockJmpValidator(true);
    assertTrue($validMock instanceof JmpValidatorInterface, 'Mock validator should implement JmpValidatorInterface.');
    assertTrue($validMock->validate([], [])->valid, 'Valid mock should return valid results.');

    $invalidMock = new MockJmpValidator(false);
    $result = $invalidMock->validate([], []);

    assertTrue(!$result->valid, 'Invalid mock should return invalid results.');
    assertSameValue('mock', $result->errors[0]->field, 'Invalid mock should label the synthetic fault.');
}

$tests = [
    'testHttpValidatorImplementsSharedInterfaceAndForwardsEnvelope',
    'testMockValidatorCanForceValidAndInvalidResults',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All validator implementation tests passed" . PHP_EOL;

