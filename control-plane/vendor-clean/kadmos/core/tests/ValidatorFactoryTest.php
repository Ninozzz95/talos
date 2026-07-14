<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\HttpClientInterface;
use Kadmos\Validator\HttpJmpValidator;
use Kadmos\Validator\MockJmpValidator;
use Kadmos\Validator\ValidatorFactory;
use Kadmos\Validator\ValidatorHealthCheck;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class FactoryHttpClient implements HttpClientInterface
{
    public function postJson(string $url, array $body): array
    {
        return ['valid' => true];
    }
}

function testFactoryCreatesExplicitMockValidator(): void
{
    $factory = new ValidatorFactory(new ValidatorHealthCheck(probe: fn(): bool => false), new FactoryHttpClient());

    assertTrue($factory->create(mock: true) instanceof MockJmpValidator, 'Factory should return mock validator only when mock mode is explicit.');
}

function testFactoryCreatesHttpValidatorWhenHealthy(): void
{
    $factory = new ValidatorFactory(new ValidatorHealthCheck(probe: fn(): bool => true), new FactoryHttpClient());

    assertTrue($factory->create(mock: false) instanceof HttpJmpValidator, 'Factory should return HTTP validator when health check passes.');
}

function testFactoryFailsClosedWhenValidatorIsUnavailable(): void
{
    $factory = new ValidatorFactory(new ValidatorHealthCheck(probe: fn(): bool => false), new FactoryHttpClient());

    $threw = false;
    try {
        $factory->create(mock: false);
    } catch (RuntimeException $e) {
        $threw = str_contains($e->getMessage(), 'Validator unavailable');
    }

    assertTrue($threw, 'Factory should throw a fail-closed validator unavailable error.');
}

$tests = [
    'testFactoryCreatesExplicitMockValidator',
    'testFactoryCreatesHttpValidatorWhenHealthy',
    'testFactoryFailsClosedWhenValidatorIsUnavailable',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All validator factory tests passed" . PHP_EOL;

