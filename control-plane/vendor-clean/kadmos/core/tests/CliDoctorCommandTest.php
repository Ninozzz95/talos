<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Kadmos\Cli\DoctorCommand;

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testDoctorReportIncludesEnterpriseChecks(): void
{
    $report = DoctorCommand::report(dirname(__DIR__));
    $names = array_column($report['checks'], 'name');

    foreach ([
        'php',
        'composer',
        'node',
        'validator_dependencies',
        'laravel',
        'sqlite_writable',
        'control_plane_url',
        'validator_health_url',
        'root_packaging',
        'provider_key',
        'ssl_verification',
    ] as $check) {
        assertTrue(in_array($check, $names, true), "Doctor report should include {$check}.");
    }

    assertTrue(array_key_exists('ok', $report), 'Doctor report should expose top-level ok.');
}

function testDoctorJsonCommandEmitsMachineReadableReport(): void
{
    $phpBin = getenv('KADMOS_TEST_PHP') ?: PHP_BINARY;
    $command = escapeshellarg($phpBin)
        . ' ' . escapeshellarg(__DIR__ . '/../kadmos')
        . ' doctor --json 2>&1';

    $output = [];
    $code = 0;
    exec($command, $output, $code);
    $text = implode(PHP_EOL, $output);
    $report = json_decode($text, true);

    assertTrue($code === 0, 'doctor --json should exit 0 as a diagnostic command. Output: ' . $text);
    assertTrue(is_array($report), 'doctor --json should emit valid JSON. Output: ' . $text);
    assertTrue(isset($report['checks']) && is_array($report['checks']), 'doctor --json should include checks.');
}

function testDoctorDocumentsCanonicalRuntimeUrls(): void
{
    $report = DoctorCommand::report(dirname(__DIR__));
    $checks = array_column($report['checks'], null, 'name');

    assertTrue(str_contains((string) ($checks['control_plane_url']['message'] ?? ''), 'http://127.0.0.1:8000'), 'Doctor should document canonical TALOS control-plane URL.');
    assertTrue(str_contains((string) ($checks['validator_health_url']['message'] ?? ''), 'http://127.0.0.1:3000/health'), 'Doctor should document canonical validator health URL.');
}

$tests = [
    'testDoctorReportIncludesEnterpriseChecks',
    'testDoctorJsonCommandEmitsMachineReadableReport',
    'testDoctorDocumentsCanonicalRuntimeUrls',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed" . PHP_EOL;
}

echo "All CLI doctor command tests passed" . PHP_EOL;
