<?php

declare(strict_types=1);

namespace App\Services\Cookbook;

final class HardwareScanner
{
    /**
     * @return array<string, mixed>
     */
    public function scan(): array
    {
        $cpuCores = $this->cpuCores();
        $ram = $this->ramMb();
        $cpuModel = $this->cpuModel();

        return [
            'host_fingerprint' => hash('sha256', implode('|', [
                PHP_OS_FAMILY,
                php_uname('n'),
                $cpuModel ?? 'unknown-cpu',
                (string) $cpuCores,
            ])),
            'os' => PHP_OS_FAMILY,
            'cpu_model' => $cpuModel,
            'cpu_cores' => $cpuCores,
            'ram_total_mb' => $ram['total'],
            'ram_free_mb' => $ram['free'],
            'gpus' => [],
            'raw_evidence' => [
                'source' => 'php_runtime_inspection',
                'shell_execution' => false,
                'gpu_probe' => 'not_collected_without_shell',
                'ram_probe' => $ram['source'],
            ],
            'scanned_at' => now(),
        ];
    }

    private function cpuCores(): int
    {
        $windowsCores = getenv('NUMBER_OF_PROCESSORS');
        if (is_string($windowsCores) && ctype_digit($windowsCores) && (int) $windowsCores > 0) {
            return (int) $windowsCores;
        }

        $cpuInfo = $this->readFile('/proc/cpuinfo');
        if ($cpuInfo !== null) {
            $processors = substr_count($cpuInfo, 'processor');
            if ($processors > 0) {
                return $processors;
            }
        }

        return 1;
    }

    private function cpuModel(): ?string
    {
        $processor = getenv('PROCESSOR_IDENTIFIER');
        if (is_string($processor) && trim($processor) !== '') {
            return trim($processor);
        }

        $cpuInfo = $this->readFile('/proc/cpuinfo');
        if ($cpuInfo === null) {
            return php_uname('m') ?: null;
        }

        foreach (explode("\n", $cpuInfo) as $line) {
            if (str_starts_with($line, 'model name')) {
                $parts = explode(':', $line, 2);

                return isset($parts[1]) ? trim($parts[1]) : null;
            }
        }

        return php_uname('m') ?: null;
    }

    /**
     * @return array{total:int,free:int,source:string}
     */
    private function ramMb(): array
    {
        $memInfo = $this->readFile('/proc/meminfo');
        if ($memInfo === null) {
            return [
                'total' => 0,
                'free' => 0,
                'source' => 'unavailable_without_shell',
            ];
        }

        $values = [];
        foreach (explode("\n", $memInfo) as $line) {
            if (preg_match('/\A(?P<key>MemTotal|MemAvailable):\s+(?P<value>\d+)\s+kB\z/', trim($line), $matches) === 1) {
                $values[$matches['key']] = (int) floor(((int) $matches['value']) / 1024);
            }
        }

        return [
            'total' => $values['MemTotal'] ?? 0,
            'free' => $values['MemAvailable'] ?? 0,
            'source' => 'proc_meminfo',
        ];
    }

    private function readFile(string $path): ?string
    {
        if (! is_readable($path)) {
            return null;
        }

        $contents = file_get_contents($path);

        return is_string($contents) ? $contents : null;
    }
}
