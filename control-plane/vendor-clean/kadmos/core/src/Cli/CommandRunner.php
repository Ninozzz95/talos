<?php

declare(strict_types=1);

namespace Kadmos\Cli;

use Kadmos\Benchmark\BenchmarkComparisonRunner;
use Kadmos\Benchmark\BenchmarkScenario;
use Throwable;

final class CommandRunner
{
    public static function runScenario(array $args): int
    {
        $json = self::hasFlag($args, '--json');
        $scenarioPath = self::option($args, '--scenario') ?? self::firstPositional($args);
        $mode = self::normalizeMode(self::option($args, '--mode') ?? 'avm-on');

        if (! is_string($scenarioPath) || $scenarioPath === '') {
            return self::userError('Usage: kadmos run <scenario.json> --mode=avm-on [--json]', $json);
        }

        try {
            $scenario = BenchmarkScenario::fromFile($scenarioPath);
            $report = (new BenchmarkComparisonRunner(runs: 1))->compareScenario($scenario);
        } catch (Throwable $exception) {
            return self::userError($exception->getMessage(), $json);
        }

        $result = $report['modes'][$mode] ?? null;
        if (! is_array($result)) {
            return self::userError("Unknown mode: {$mode}", $json);
        }

        $payload = [
            'schema_version' => 1,
            'command' => 'run',
            'mode' => $mode,
            'scenario' => $report['scenario'] ?? $scenario->toArray(),
            'result' => $result,
        ];

        if ($json) {
            echo Console::json($payload);
            return Console::EXIT_SUCCESS;
        }

        echo sprintf(
            "Kadmos run: %s [%s]\nStatus: %s\n",
            $scenario->name(),
            $mode,
            (string) ($result['status'] ?? 'unknown'),
        );

        return Console::EXIT_SUCCESS;
    }

    public static function trace(array $args): int
    {
        $subcommand = array_shift($args);
        if ($subcommand !== 'replay') {
            return self::userError('Usage: kadmos trace replay <run-id|trace.json> [--json]', self::hasFlag($args, '--json'));
        }

        $json = self::hasFlag($args, '--json');
        $target = self::firstPositional($args);
        if (! is_string($target) || $target === '') {
            return self::userError('Usage: kadmos trace replay <run-id|trace.json> [--json]', $json);
        }

        if (is_file($target)) {
            $decoded = json_decode((string) file_get_contents($target), true);
            if (! is_array($decoded)) {
                return self::userError('Trace file is not valid JSON.', $json);
            }

            $steps = self::extractSteps($decoded);
            $payload = [
                'schema_version' => 1,
                'command' => 'trace replay',
                'source' => 'file',
                'target' => $target,
                'replayable' => true,
                'steps_count' => count($steps),
                'steps' => $steps,
            ];

            echo $json ? Console::json($payload) : self::humanTrace($payload);
            return Console::EXIT_SUCCESS;
        }

        return self::controlPlaneGet(
            'trace replay',
            self::controlPlaneUrl($args).'/api/talos/runs/'.rawurlencode($target).'/replay',
            $json,
        );
    }

    public static function fault(array $args): int
    {
        $subcommand = array_shift($args);
        if ($subcommand !== 'explain') {
            return self::userError('Usage: kadmos fault explain <run-id> --node=<node-id> [--json]', self::hasFlag($args, '--json'));
        }

        $json = self::hasFlag($args, '--json');
        $runId = self::firstPositional($args);
        $nodeId = self::option($args, '--node');

        if (! is_string($runId) || $runId === '' || ! is_string($nodeId) || $nodeId === '') {
            return self::userError('Usage: kadmos fault explain <run-id> --node=<node-id> [--json]', $json);
        }

        return self::controlPlanePost(
            'fault explain',
            self::controlPlaneUrl($args).'/api/faults/explain',
            [
                'run_id' => $runId,
                'node_id' => $nodeId,
            ],
            $json,
        );
    }

    public static function recover(array $args): int
    {
        $json = self::hasFlag($args, '--json');
        $runId = self::firstPositional($args);
        $nodeId = self::option($args, '--node');
        $action = self::option($args, '--action') ?? 'retry_node';
        $reason = self::option($args, '--reason') ?? 'Requested from KADMOS CLI.';

        if (! is_string($runId) || $runId === '' || ! is_string($nodeId) || $nodeId === '') {
            return self::userError('Usage: kadmos recover <run-id> --node=<node-id> --action=retry_node [--json]', $json);
        }

        return self::controlPlanePost(
            'recover',
            self::controlPlaneUrl($args).'/api/talos/runs/'.rawurlencode($runId).'/recover',
            [
                'action' => $action,
                'node_id' => $nodeId,
                'reason' => $reason,
            ],
            $json,
        );
    }

    public static function files(array $args): int
    {
        $subcommand = array_shift($args);
        $json = self::hasFlag($args, '--json');
        if ($subcommand !== 'ingest') {
            return self::userError('Usage: kadmos files ingest <path> [--dry-run] [--json]', $json);
        }

        $path = self::firstPositional($args);
        if (! is_string($path) || ! is_file($path)) {
            return self::userError('File not found. Usage: kadmos files ingest <path> [--dry-run] [--json]', $json);
        }

        if (self::hasFlag($args, '--dry-run')) {
            $payload = [
                'schema_version' => 1,
                'command' => 'files ingest',
                'dry_run' => true,
                'path' => $path,
                'bytes' => filesize($path),
                'sha256' => hash_file('sha256', $path),
                'target_endpoint' => self::controlPlaneUrl($args).'/api/files/ingest',
            ];

            echo $json ? Console::json($payload) : self::humanFileDryRun($payload);
            return Console::EXIT_SUCCESS;
        }

        return self::controlPlaneFile(
            'files ingest',
            self::controlPlaneUrl($args).'/api/files/ingest',
            $path,
            $json,
        );
    }

    public static function export(array $args): int
    {
        $subcommand = array_shift($args);
        $json = self::hasFlag($args, '--json');

        if ($subcommand !== 'benchmark') {
            return self::userError('Usage: kadmos export benchmark <benchmark-group-id> [--json]', $json);
        }

        $groupId = self::firstPositional($args);
        if (! is_string($groupId) || $groupId === '') {
            return self::userError('Usage: kadmos export benchmark <benchmark-group-id> [--json]', $json);
        }

        return self::controlPlaneGet(
            'export benchmark',
            self::controlPlaneUrl($args).'/api/talos/benchmark-groups/'.rawurlencode($groupId).'/export',
            $json,
        );
    }

    private static function controlPlaneGet(string $command, string $url, bool $json): int
    {
        return self::controlPlaneRequest($command, $url, 'GET', null, $json);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private static function controlPlanePost(string $command, string $url, array $payload, bool $json): int
    {
        return self::controlPlaneRequest($command, $url, 'POST', $payload, $json);
    }

    /**
     * @param array<string, mixed>|null $payload
     */
    private static function controlPlaneRequest(string $command, string $url, string $method, ?array $payload, bool $json): int
    {
        $ch = curl_init($url);
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_TIMEOUT_MS => 1200,
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json'],
        ];

        if ($payload !== null) {
            $options[CURLOPT_POSTFIELDS] = json_encode($payload);
        }

        curl_setopt_array($ch, $options);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (! is_string($body) || $body === '' || $status < 200 || $status >= 300) {
            return self::controlPlaneUnavailable($command, $url, $json, $status);
        }

        $decoded = json_decode($body, true);
        if (! is_array($decoded)) {
            return self::controlPlaneInvalidResponse($command, $url, $json, $status, 'The TALOS control-plane returned invalid JSON.');
        }

        $contractError = self::controlPlaneContractError($command, $decoded);
        if ($contractError !== null) {
            return self::controlPlaneInvalidResponse($command, $url, $json, $status, $contractError);
        }

        $response = $decoded;

        echo $json ? Console::json($response) : self::humanControlPlane($command, $response);
        return Console::EXIT_SUCCESS;
    }

    private static function controlPlaneFile(string $command, string $url, string $path, bool $json): int
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_TIMEOUT_MS => 3000,
            CURLOPT_POSTFIELDS => [
                'file' => curl_file_create($path),
            ],
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (! is_string($body) || $body === '' || $status < 200 || $status >= 300) {
            return self::controlPlaneUnavailable($command, $url, $json, $status);
        }

        $decoded = json_decode($body, true);
        if (! is_array($decoded)) {
            return self::controlPlaneInvalidResponse($command, $url, $json, $status, 'The TALOS control-plane returned invalid JSON.');
        }

        $contractError = self::controlPlaneContractError($command, $decoded);
        if ($contractError !== null) {
            return self::controlPlaneInvalidResponse($command, $url, $json, $status, $contractError);
        }

        $response = $decoded;

        echo $json ? Console::json($response) : self::humanControlPlane($command, $response);
        return Console::EXIT_SUCCESS;
    }

    private static function controlPlaneUnavailable(string $command, string $url, bool $json, int $status): int
    {
        $payload = [
            'schema_version' => 1,
            'command' => $command,
            'error' => 'CONTROL_PLANE_UNAVAILABLE',
            'message' => 'The TALOS control-plane did not return a successful JSON response.',
            'control_plane_url' => $url,
            'http_status' => $status,
        ];

        if ($json) {
            echo Console::json($payload);
        } else {
            fwrite(STDERR, $payload['error'].': '.$payload['message'].PHP_EOL);
        }

        return Console::EXIT_ENVIRONMENT_ERROR;
    }

    private static function controlPlaneInvalidResponse(string $command, string $url, bool $json, int $status, string $message): int
    {
        $payload = [
            'schema_version' => 1,
            'command' => $command,
            'error' => 'CONTROL_PLANE_INVALID_RESPONSE',
            'message' => $message,
            'control_plane_url' => $url,
            'http_status' => $status,
        ];

        if ($json) {
            echo Console::json($payload);
        } else {
            fwrite(STDERR, $payload['error'].': '.$payload['message'].PHP_EOL);
        }

        return Console::EXIT_ENVIRONMENT_ERROR;
    }

    /**
     * @param array<string, mixed> $response
     */
    private static function controlPlaneContractError(string $command, array $response): ?string
    {
        return match ($command) {
            'export benchmark' => self::benchmarkExportContractError($response),
            'files ingest' => self::fileIngestionContractError($response),
            'trace replay' => self::traceReplayContractError($response),
            default => null,
        };
    }

    /**
     * @param array<string, mixed> $response
     */
    private static function benchmarkExportContractError(array $response): ?string
    {
        if (($response['schema_version'] ?? null) !== 1
            || ($response['report_type'] ?? null) !== 'talos_benchmark_export'
            || ($response['export_status'] ?? null) !== 'complete'
            || ! is_array($response['benchmark_group'] ?? null)
            || ! is_array($response['fairness_contract'] ?? null)
            || ! is_array($response['results'] ?? null)
        ) {
            return 'Benchmark export response did not match talos_benchmark_export v1.';
        }

        return null;
    }

    /**
     * @param array<string, mixed> $response
     */
    private static function fileIngestionContractError(array $response): ?string
    {
        $data = $response['data'] ?? null;
        if (! is_array($data)
            || ! is_string($data['id'] ?? null)
            || ($data['status'] ?? null) !== 'available'
            || ! is_string($data['checksum'] ?? $data['sha256'] ?? null)
        ) {
            return 'File ingestion response did not confirm an available ingested file.';
        }

        return null;
    }

    /**
     * @param array<string, mixed> $response
     */
    private static function traceReplayContractError(array $response): ?string
    {
        if (! is_string($response['run_id'] ?? null)
            || ! is_array($response['steps'] ?? null)
        ) {
            return 'Trace replay response did not include a run_id and steps list.';
        }

        return null;
    }

    private static function userError(string $message, bool $json): int
    {
        if ($json) {
            echo Console::json([
                'schema_version' => 1,
                'error' => 'USER_ERROR',
                'message' => $message,
            ]);
        } else {
            fwrite(STDERR, $message.PHP_EOL);
        }

        return Console::EXIT_USER_ERROR;
    }

    private static function hasFlag(array $args, string $flag): bool
    {
        return in_array($flag, $args, true);
    }

    private static function option(array $args, string $name): ?string
    {
        foreach ($args as $index => $arg) {
            if ($arg === $name && isset($args[$index + 1])) {
                return (string) $args[$index + 1];
            }

            if (is_string($arg) && str_starts_with($arg, $name.'=')) {
                return substr($arg, strlen($name) + 1);
            }
        }

        return null;
    }

    private static function firstPositional(array $args): ?string
    {
        foreach ($args as $arg) {
            if (is_string($arg) && ! str_starts_with($arg, '--')) {
                return $arg;
            }
        }

        return null;
    }

    private static function controlPlaneUrl(array $args): string
    {
        $url = self::option($args, '--control-plane') ?? (getenv('KADMOS_CONTROL_PLANE_URL') ?: 'http://127.0.0.1:8000');

        return rtrim((string) $url, '/');
    }

    private static function normalizeMode(string $mode): string
    {
        return match ($mode) {
            'avm-on', 'avm_on' => 'avm_on',
            'avm-off', 'avm-off-direct', 'avm_off_direct' => 'avm_off_direct',
            'tool-agent', 'tool_agent' => 'tool_agent',
            default => $mode,
        };
    }

    /**
     * @param array<string, mixed> $decoded
     * @return list<array<string, mixed>>
     */
    private static function extractSteps(array $decoded): array
    {
        $steps = $decoded['steps'] ?? $decoded['data']['steps'] ?? $decoded['events'] ?? [];
        return is_array($steps) ? array_values(array_filter($steps, 'is_array')) : [];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private static function humanTrace(array $payload): string
    {
        return sprintf("Trace replay: %d step(s)\n", (int) ($payload['steps_count'] ?? 0));
    }

    /**
     * @param array<string, mixed> $payload
     */
    private static function humanFileDryRun(array $payload): string
    {
        return sprintf(
            "File ingestion dry-run: %s\nBytes: %d\nSHA-256: %s\n",
            (string) $payload['path'],
            (int) $payload['bytes'],
            (string) $payload['sha256'],
        );
    }

    /**
     * @param array<string, mixed> $response
     */
    private static function humanControlPlane(string $command, array $response): string
    {
        return $command.' completed through TALOS control-plane.'.PHP_EOL.Console::json($response);
    }
}
