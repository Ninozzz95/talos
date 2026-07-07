#!/usr/bin/env php
<?php

declare(strict_types=1);

$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    fwrite(STDERR, "Run composer install in core/ first.\n");
    exit(1);
}
require_once $autoload;

use Kadmos\Benchmark\BenchmarkComparisonRunner;
use Kadmos\Benchmark\BenchmarkMode;
use Kadmos\Benchmark\BenchmarkScenario;

$args = array_slice($argv, 1);
$scenarioArg = null;
$runs = 1;
$json = false;

foreach ($args as $arg) {
    if (str_starts_with($arg, '--scenario=')) {
        $scenarioArg = substr($arg, strlen('--scenario='));
    } elseif (str_starts_with($arg, '--runs=')) {
        $runs = max(1, (int) substr($arg, strlen('--runs=')));
    } elseif ($arg === '--json') {
        $json = true;
    }
}

$scenarioFiles = [];
if ($scenarioArg !== null) {
    $scenarioFiles[] = $scenarioArg;
} else {
    $scenarioFiles = glob(__DIR__ . '/tests/benchmarks/scenarios/*.json') ?: [];
    sort($scenarioFiles);
}

if ($scenarioFiles === []) {
    fwrite(STDERR, "No benchmark scenarios found.\n");
    exit(1);
}

$runner = new BenchmarkComparisonRunner($runs);
$reports = [];

foreach ($scenarioFiles as $scenarioFile) {
    $reports[] = $runner->compareScenario(BenchmarkScenario::fromFile($scenarioFile));
}

$payload = count($reports) === 1
    ? $reports[0]
    : [
        'schema_version' => 1,
        'generated_at' => date('c'),
        'runs' => $runs,
        'reports' => $reports,
    ];

if ($json) {
    echo json_encode($payload, JSON_PRETTY_PRINT) . PHP_EOL;
    exit(0);
}

$logDir = __DIR__ . '/tests/benchmarks/logs';
if (!is_dir($logDir)) {
    mkdir($logDir, 0777, true);
}

$logPath = $logDir . '/compare_' . date('Ymd_His') . '.json';
file_put_contents($logPath, json_encode($payload, JSON_PRETTY_PRINT));

echo "Kadmos benchmark compare\n";
echo "Report: tests/benchmarks/logs/" . basename($logPath) . PHP_EOL . PHP_EOL;
printf("%-28s %-18s %-8s %-8s %-8s %-8s %-8s\n", 'SCENARIO', 'MODE', 'COMP', 'SUCC', 'FAIL', 'BLOCK', 'MATCH');
echo str_repeat('-', 92) . PHP_EOL;

foreach ($reports as $report) {
    foreach (BenchmarkMode::all() as $index => $mode) {
        $result = $report['modes'][$mode];
        printf(
            "%-28s %-18s %-8s %-8s %-8s %-8s %-8s\n",
            $index === 0 ? $report['scenario']['name'] : '',
            $result['label'],
            (string) round($result['completion_rate'] * 100) . '%',
            (string) $result['success_nodes'],
            (string) $result['failed_nodes'],
            (string) $result['blocked_nodes'],
            $result['state_match'] ? 'yes' : 'no',
        );
    }
    echo PHP_EOL;
}
