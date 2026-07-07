<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\MainLoopController;
use Kadmos\Validator\JmpValidatorInterface;

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

function testMainLoopDependsOnValidatorInterface(): void
{
    $constructor = new ReflectionMethod(MainLoopController::class, '__construct');
    $parameters = $constructor->getParameters();
    $validatorParameter = $parameters[2] ?? null;

    assertSameValue(
        JmpValidatorInterface::class,
        $validatorParameter?->getType()?->getName(),
        'MainLoopController should depend on JmpValidatorInterface, not a concrete validator client.'
    );
}

$tests = [
    'testMainLoopDependsOnValidatorInterface',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All MainLoop validator interface contract tests passed" . PHP_EOL;

