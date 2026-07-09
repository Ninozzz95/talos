<?php

declare(strict_types=1);

namespace Kadmos\Cli;

final class DoctorCommand
{
    /**
     * @return array{ok: bool, checks: list<array{name: string, ok: bool, message?: string, version?: string}>}
     */
    public static function report(string $coreDir): array
    {
        $rootDir = dirname($coreDir);
        $checks = [
            self::phpCheck(),
            self::commandCheck('composer', 'composer --version'),
            self::commandCheck('node', self::nodeCommand($rootDir) . ' --version'),
            self::directoryCheck('validator_dependencies', $rootDir . '/validator/node_modules', 'Run npm install in validator/.'),
            self::directoryCheck('laravel', $rootDir . '/control-plane/vendor', 'Run composer install in control-plane/.'),
            self::sqliteWritableCheck($rootDir . '/control-plane/database'),
            self::controlPlaneUrlCheck(),
            self::validatorHealthUrlCheck(),
            self::rootPackagingCheck($rootDir),
            self::providerKeyCheck(),
            self::sslVerificationCheck(),
        ];

        return [
            'ok' => !in_array(false, array_column($checks, 'ok'), true),
            'checks' => $checks,
        ];
    }

    public static function run(array $args, string $coreDir): int
    {
        $report = self::report($coreDir);

        if (in_array('--json', $args, true)) {
            echo Console::json($report);
            return Console::EXIT_SUCCESS;
        }

        echo self::renderHuman($report);
        return Console::EXIT_SUCCESS;
    }

    /**
     * @param array{ok: bool, checks: list<array{name: string, ok: bool, message?: string, version?: string}>} $report
     */
    private static function renderHuman(array $report): string
    {
        $lines = ['Kadmos Doctor', str_repeat('-', 48)];
        foreach ($report['checks'] as $check) {
            $status = $check['ok'] ? 'OK' : 'WARN';
            $detail = $check['version'] ?? $check['message'] ?? '';
            $lines[] = sprintf('%-24s %-5s %s', $check['name'], $status, $detail);
        }

        return implode(PHP_EOL, $lines) . PHP_EOL;
    }

    /**
     * @return array{name: string, ok: bool, version: string}
     */
    private static function phpCheck(): array
    {
        return [
            'name' => 'php',
            'ok' => version_compare(PHP_VERSION, '8.5.0', '>='),
            'version' => PHP_VERSION,
        ];
    }

    /**
     * @return array{name: string, ok: bool, message?: string, version?: string}
     */
    private static function commandCheck(string $name, string $command): array
    {
        $output = [];
        $code = 0;
        exec($command . ' 2>&1', $output, $code);
        $firstLine = trim((string) ($output[0] ?? ''));
        $detailKey = $code === 0 ? 'version' : 'message';

        return [
            'name' => $name,
            'ok' => $code === 0,
            $detailKey => $firstLine !== '' ? $firstLine : 'Not available',
        ];
    }

    /**
     * @return array{name: string, ok: bool, message: string}
     */
    private static function directoryCheck(string $name, string $path, string $missingMessage): array
    {
        return [
            'name' => $name,
            'ok' => is_dir($path),
            'message' => is_dir($path) ? 'Installed' : $missingMessage,
        ];
    }

    /**
     * @return array{name: string, ok: bool, message: string}
     */
    private static function sqliteWritableCheck(string $databaseDir): array
    {
        return [
            'name' => 'sqlite_writable',
            'ok' => is_dir($databaseDir) && is_writable($databaseDir),
            'message' => is_dir($databaseDir) && is_writable($databaseDir) ? 'Database directory writable' : 'Database directory is not writable',
        ];
    }

    /**
     * @return array{name: string, ok: bool, message: string}
     */
    private static function providerKeyCheck(): array
    {
        $configured = (bool) (getenv('KADMOS_API_KEY') ?: getenv('DEEPSEEK_API_KEY') ?: getenv('OPENAI_API_KEY') ?: getenv('ANTHROPIC_API_KEY'));

        return [
            'name' => 'provider_key',
            'ok' => $configured,
            'message' => $configured ? 'Configured' : 'Missing: set KADMOS_API_KEY or configure provider profile',
        ];
    }

    /**
     * @return array{name: string, ok: bool, message: string}
     */
    private static function controlPlaneUrlCheck(): array
    {
        $url = getenv('KADMOS_CONTROL_PLANE_URL') ?: 'http://127.0.0.1:8000';

        return [
            'name' => 'control_plane_url',
            'ok' => true,
            'message' => (string) $url,
        ];
    }

    /**
     * @return array{name: string, ok: bool, message: string}
     */
    private static function validatorHealthUrlCheck(): array
    {
        $url = getenv('KADMOS_VALIDATOR_HEALTH_URL') ?: 'http://127.0.0.1:3000/health';

        return [
            'name' => 'validator_health_url',
            'ok' => true,
            'message' => (string) $url,
        ];
    }

    /**
     * @return array{name: string, ok: bool, message: string}
     */
    private static function rootPackagingCheck(string $rootDir): array
    {
        $required = [
            $rootDir . '/docker-compose.yml',
            $rootDir . '/Dockerfile.talos',
            $rootDir . '/Dockerfile.validator',
            $rootDir . '/talos',
            $rootDir . '/talos.cmd',
            $rootDir . '/.env.example',
        ];

        $missing = array_values(array_filter($required, static fn (string $path): bool => ! is_file($path)));

        return [
            'name' => 'root_packaging',
            'ok' => $missing === [],
            'message' => $missing === [] ? 'Docker-first packaging files present' : 'Missing: '.implode(', ', $missing),
        ];
    }

    /**
     * @return array{name: string, ok: bool, message: string}
     */
    private static function sslVerificationCheck(): array
    {
        $insecure = getenv('KADMOS_INSECURE_SSL') === '1';

        return [
            'name' => 'ssl_verification',
            'ok' => !$insecure,
            'message' => $insecure ? 'Disabled by KADMOS_INSECURE_SSL=1' : 'Enabled by default',
        ];
    }

    private static function nodeCommand(string $rootDir): string
    {
        $localNode = $rootDir . '/.tools/node/node.exe';
        return file_exists($localNode) ? escapeshellarg($localNode) : 'node';
    }
}
