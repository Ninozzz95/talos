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
        'CliCommandRegistryTest.php',
        'CliCommandRoutingTest.php',
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
        'Security/OpenAIClientPolicyTest.php',
        'OpenAIClientEndpointTest.php',
        'Security/ToolContextPolicyTest.php',
        'ToolContractTest.php',
        'Browser/BrowserContractTest.php',
        'Browser/BrowserContractFixtureTest.php',
        'Browser/BrowserOrchestrationTest.php',
        'Alignment/AlignmentContractFixtureTest.php',
        'Alignment/AlignmentContractDecoderTest.php',
        'Alignment/AlignmentContractValueObjectTest.php',
        'ProceduralToolCompilerTest.php',
        'ProviderInputResourceTest.php',
        'ProviderCapabilitiesTest.php',
        'ProviderTurnAdapterTest.php',
        'OpenAiResponsesTurnAdapterTest.php',
        'AnthropicMessagesTurnAdapterTest.php',
        'GeminiTurnAdapterTest.php',
        'ProviderTurnAdapterFactoryTest.php',
        'Security/PinnedProviderHttpTransportTest.php',
        'Security/AnthropicClientPolicyTest.php',
        'AgentOperatingModelContractTest.php',
        'DeploymentPackagingContractTest.php',
    ] as $testFile) {
        assertTrue(str_contains($cli, $testFile), "kadmos test should include {$testFile}.");
    }
}

function testToolContractTestUsesTheCliRunnerSuccessMarker(): void
{
    $test = (string) file_get_contents(__DIR__ . '/ToolContractTest.php');

    assertTrue(
        str_contains($test, 'All tool contract tests passed'),
        'ToolContractTest must end with the success marker consumed by kadmos test.',
    );
}

function testProceduralCompilerUsesTheCliRunnerSuccessMarker(): void
{
    $test = (string) file_get_contents(__DIR__.'/ProceduralToolCompilerTest.php');

    assertTrue(
        str_contains($test, 'All procedural compiler tests passed'),
        'ProceduralToolCompilerTest must end with the success marker consumed by kadmos test.',
    );
}

function testBrowserContractTestsUseTheCliRunnerSuccessMarker(): void
{
    foreach ([
        'Browser/BrowserContractTest.php' => 'All Browser contract tests passed',
        'Browser/BrowserContractFixtureTest.php' => 'All Browser contract fixture tests passed',
        'Browser/BrowserOrchestrationTest.php' => 'All Browser orchestration tests passed',
    ] as $path => $marker) {
        $test = (string) file_get_contents(__DIR__.'/'.$path);
        assertTrue(
            str_contains($test, $marker),
            "{$path} must end with the success marker consumed by kadmos test.",
        );
    }
}

function testAlignmentContractTestsUseTheCliRunnerSuccessMarker(): void
{
    foreach ([
        'Alignment/AlignmentContractFixtureTest.php' => 'All Alignment contract fixture tests passed',
        'Alignment/AlignmentContractDecoderTest.php' => 'All Alignment contract decoder tests passed',
        'Alignment/AlignmentContractValueObjectTest.php' => 'All Alignment contract value object tests passed',
    ] as $path => $marker) {
        $test = (string) file_get_contents(__DIR__.'/'.$path);
        assertTrue(
            str_contains($test, $marker),
            "{$path} must end with the success marker consumed by kadmos test.",
        );
    }
}

function testComposerTestDelegatesToTheFullCliSuite(): void
{
    $composer = json_decode((string) file_get_contents(__DIR__.'/../composer.json'), true, 32, JSON_THROW_ON_ERROR);

    assertTrue(
        ($composer['scripts']['test'] ?? null) === 'php kadmos test',
        'composer test should execute the complete Kadmos suite.',
    );
}

function testLiveBenchmarkReadsCredentialsFromEnvironmentOnly(): void
{
    $script = (string) file_get_contents(__DIR__ . '/../kadmos-bench-live.php');

    assertTrue(
        str_contains($script, "getenv('DEEPSEEK_API_KEY')"),
        'Live benchmark credentials must come from the child environment.',
    );
    assertTrue(
        !str_contains($script, '$argv[2]'),
        'Live benchmark credentials must never be exposed in process arguments.',
    );
}

$tests = [
    'testMainCliRunsContractTests',
    'testToolContractTestUsesTheCliRunnerSuccessMarker',
    'testProceduralCompilerUsesTheCliRunnerSuccessMarker',
    'testBrowserContractTestsUseTheCliRunnerSuccessMarker',
    'testAlignmentContractTestsUseTheCliRunnerSuccessMarker',
    'testComposerTestDelegatesToTheFullCliSuite',
    'testLiveBenchmarkReadsCredentialsFromEnvironmentOnly',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI test suite contract tests passed" . PHP_EOL;
