<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testMainCliRunsContractTests(): void
{
    $cli = (string) file_get_contents(__DIR__ . '/../kadmos');

    foreach ([
        'NamespaceContractTest.php',
        'AutoloadContractTest.php',
        'CliBenchmarkCommandTest.php',
        'BenchmarkThresholdTest.php',
        'BenchmarkNoDeprecationTest.php',
        'CliGuidedShellTest.php',
        'CliEvidenceRendererTest.php',
        'CliConsoleTest.php',
        'CliDoctorCommandTest.php',
        'ValidatorImplementationsTest.php',
        'MainLoopValidatorInterfaceContractTest.php',
        'ValidatorHealthCheckTest.php',
        'CliValidateFailClosedTest.php',
        'CliStartFailClosedTest.php',
        'ValidatorFactoryTest.php',
        'ValidatorBypassContractTest.php',
        'CurlNoDeprecatedCloseTest.php',
        'Security/SslVerificationTest.php',
        'Security/ExecutionPolicyTest.php',
        'AgentOperatingModelContractTest.php',
    ] as $testFile) {
        assertTrue(str_contains($cli, $testFile), "kadmos test should include {$testFile}.");
    }
}

$tests = [
    'testMainCliRunsContractTests',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI test suite contract tests passed" . PHP_EOL;
