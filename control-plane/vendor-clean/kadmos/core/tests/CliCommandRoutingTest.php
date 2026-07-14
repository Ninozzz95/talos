<?php

declare(strict_types=1);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function runKadmos(string $args): array
{
    $phpBin = getenv('KADMOS_TEST_PHP') ?: PHP_BINARY;

    $output = [];
    $code = 0;
    exec(escapeshellarg($phpBin) . ' ' . escapeshellarg(__DIR__ . '/../kadmos') . ' ' . $args . ' 2>&1', $output, $code);

    return [$code, implode(PHP_EOL, $output)];
}

/**
 * @return array{url: string, stop: callable(): void}
 */
function startMockControlPlane(string $routerCode): array
{
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'kadmos-cp-' . bin2hex(random_bytes(4));
    if (! mkdir($dir) && ! is_dir($dir)) {
        throw new RuntimeException('Could not create mock control-plane directory.');
    }

    $router = $dir . DIRECTORY_SEPARATOR . 'router.php';
    file_put_contents($router, $routerCode);

    $port = random_int(18080, 19080);
    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open(
        [PHP_BINARY, '-S', '127.0.0.1:' . $port, $router],
        $descriptorSpec,
        $pipes,
        $dir,
    );

    if (! is_resource($process)) {
        throw new RuntimeException('Could not start mock control-plane.');
    }

    $ready = false;
    for ($attempt = 0; $attempt < 25; $attempt++) {
        $socket = @fsockopen('127.0.0.1', $port);
        if (is_resource($socket)) {
            fclose($socket);
            $ready = true;
            break;
        }
        usleep(100_000);
    }

    if (! $ready) {
        proc_terminate($process);
        throw new RuntimeException('Mock control-plane did not start.');
    }

    return [
        'url' => 'http://127.0.0.1:' . $port,
        'stop' => static function () use ($process, $pipes, $dir, $router): void {
            proc_terminate($process);
            foreach ($pipes as $pipe) {
                if (is_resource($pipe)) {
                    fclose($pipe);
                }
            }
            proc_close($process);
            @unlink($router);
            @rmdir($dir);
        },
    ];
}

function testRunCommandEmitsJsonForScenario(): void
{
    $scenario = __DIR__ . '/benchmarks/scenarios/01_simple_http.json';
    [$code, $text] = runKadmos('run ' . escapeshellarg($scenario) . ' --mode=avm-on --json');
    $payload = json_decode($text, true);

    assertTrue($code === 0, 'kadmos run should exit 0. Output: '.$text);
    assertTrue(is_array($payload), 'kadmos run --json should emit JSON. Output: '.$text);
    assertTrue(($payload['command'] ?? null) === 'run', 'run JSON should identify command.');
    assertTrue(($payload['mode'] ?? null) === 'avm_on', 'run JSON should normalize avm-on mode.');
    assertTrue(($payload['scenario']['name'] ?? null) === 'simple_http_call', 'run JSON should include scenario.');
    assertTrue(isset($payload['result']) && is_array($payload['result']), 'run JSON should include mode result evidence.');
}

function testControlPlaneCommandsFailClosedAsJsonWhenUnavailable(): void
{
    foreach ([
        'trace replay run-1 --control-plane=http://127.0.0.1:9 --json',
        'fault explain run-1 --node=node-1 --control-plane=http://127.0.0.1:9 --json',
        'recover run-1 --node=node-1 --action=retry_node --control-plane=http://127.0.0.1:9 --json',
        'export benchmark group-1 --control-plane=http://127.0.0.1:9 --json',
    ] as $args) {
        [$code, $text] = runKadmos($args);
        $payload = json_decode($text, true);

        assertTrue($code === 2, "{$args} should fail closed with exit 2. Output: {$text}");
        assertTrue(is_array($payload), "{$args} should emit machine-readable failure JSON. Output: {$text}");
        assertTrue(($payload['error'] ?? null) === 'CONTROL_PLANE_UNAVAILABLE', "{$args} should explain control-plane failure.");
    }
}

function testTraceReplayCanReadLocalFixture(): void
{
    $fixture = tempnam(sys_get_temp_dir(), 'kadmos-trace-');
    if ($fixture === false) {
        throw new RuntimeException('Could not create temp trace fixture.');
    }
    file_put_contents($fixture, json_encode([
        'events' => [
            ['type' => 'node_started', 'node_id' => 'node-1'],
            ['type' => 'node_completed', 'node_id' => 'node-1'],
        ],
    ], JSON_THROW_ON_ERROR));

    [$code, $text] = runKadmos('trace replay ' . escapeshellarg($fixture) . ' --json');
    @unlink($fixture);
    $payload = json_decode($text, true);

    assertTrue($code === 0, 'trace replay local fixture should exit 0. Output: '.$text);
    assertTrue(is_array($payload), 'trace replay local fixture should emit JSON. Output: '.$text);
    assertTrue(($payload['command'] ?? null) === 'trace replay', 'trace replay JSON should identify command.');
    assertTrue(($payload['source'] ?? null) === 'file', 'trace replay fixture should be read from file.');
    assertTrue(($payload['replayable'] ?? null) === true, 'trace replay fixture should be marked replayable.');
    assertTrue(($payload['steps_count'] ?? null) === 2, 'trace replay fixture should preserve event count.');
}

function testFilesIngestRequiresRealControlPlaneOrDryRun(): void
{
    $fixture = tempnam(sys_get_temp_dir(), 'kadmos-ingest-');
    if ($fixture === false) {
        throw new RuntimeException('Could not create temp fixture.');
    }
    file_put_contents($fixture, 'KADMOS file ingestion dry-run.');

    [$code, $text] = runKadmos('files ingest ' . escapeshellarg($fixture) . ' --dry-run --json');
    @unlink($fixture);
    $payload = json_decode($text, true);

    assertTrue($code === 0, 'files ingest --dry-run should exit 0. Output: '.$text);
    assertTrue(is_array($payload), 'files ingest --dry-run should emit JSON. Output: '.$text);
    assertTrue(($payload['command'] ?? null) === 'files ingest', 'dry-run JSON should identify command.');
    assertTrue(($payload['dry_run'] ?? null) === true, 'dry-run JSON should declare dry_run.');
    assertTrue(($payload['sha256'] ?? '') !== '', 'dry-run JSON should include file hash.');
}

function testExportBenchmarkRejectsInvalidControlPlaneSchema(): void
{
    $server = startMockControlPlane(<<<'PHP'
<?php
header('Content-Type: application/json');
echo json_encode(['ok' => true, 'raw' => 'not a benchmark export']);
PHP);

    try {
        [$code, $text] = runKadmos('export benchmark group-1 --control-plane=' . escapeshellarg($server['url']) . ' --json');
    } finally {
        ($server['stop'])();
    }

    $payload = json_decode($text, true);
    assertTrue($code === 2, 'export benchmark should reject invalid 2xx schema. Output: '.$text);
    assertTrue(is_array($payload), 'export benchmark invalid schema should emit JSON. Output: '.$text);
    assertTrue(($payload['error'] ?? null) === 'CONTROL_PLANE_INVALID_RESPONSE', 'export benchmark should fail closed on invalid schema.');
}

function testFilesIngestRejectsFailedControlPlaneIngestion(): void
{
    $fixture = tempnam(sys_get_temp_dir(), 'kadmos-ingest-');
    if ($fixture === false) {
        throw new RuntimeException('Could not create temp fixture.');
    }
    file_put_contents($fixture, 'KADMOS failed ingestion fixture.');

    $server = startMockControlPlane(<<<'PHP'
<?php
header('Content-Type: application/json');
echo json_encode(['data' => ['id' => 'file-1', 'status' => 'failed', 'failure_reason' => 'Parser failed.']]);
PHP);

    try {
        [$code, $text] = runKadmos('files ingest ' . escapeshellarg($fixture) . ' --control-plane=' . escapeshellarg($server['url']) . ' --json');
    } finally {
        @unlink($fixture);
        ($server['stop'])();
    }

    $payload = json_decode($text, true);
    assertTrue($code === 2, 'files ingest should reject failed ingestion contracts. Output: '.$text);
    assertTrue(is_array($payload), 'files ingest failed contract should emit JSON. Output: '.$text);
    assertTrue(($payload['error'] ?? null) === 'CONTROL_PLANE_INVALID_RESPONSE', 'files ingest should fail closed on failed status.');
}

$tests = [
    'testRunCommandEmitsJsonForScenario',
    'testControlPlaneCommandsFailClosedAsJsonWhenUnavailable',
    'testTraceReplayCanReadLocalFixture',
    'testFilesIngestRequiresRealControlPlaneOrDryRun',
    'testExportBenchmarkRejectsInvalidControlPlaneSchema',
    'testFilesIngestRejectsFailedControlPlaneIngestion',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI command routing tests passed" . PHP_EOL;
