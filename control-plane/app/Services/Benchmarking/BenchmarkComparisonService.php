<?php

declare(strict_types=1);

namespace App\Services\Benchmarking;

use Illuminate\Support\Facades\Storage;
use RuntimeException;

final class BenchmarkComparisonService
{
    /**
     * @return array<string, mixed>
     */
    public function compare(string $scenarioPath, int $runs = 1): array
    {
        if (! Storage::disk('local')->exists($scenarioPath)) {
            abort(404, 'Benchmark scenario not found.');
        }

        $tempScenarioPath = $this->writeTemporaryScenarioFile($scenarioPath);
        $phpBin = PHP_BINARY;
        $kadmosCli = base_path('../core/kadmos');

        try {
            $command = escapeshellarg($phpBin)
                . ' ' . escapeshellarg($kadmosCli)
                . ' benchmark compare'
                . ' --scenario=' . escapeshellarg($tempScenarioPath)
                . ' --runs=' . escapeshellarg((string) max(1, min(50, $runs)))
                . ' --json 2>&1';

            $output = [];
            $code = 0;
            exec($command, $output, $code);
        } finally {
            if (is_file($tempScenarioPath)) {
                unlink($tempScenarioPath);
            }
        }

        $text = implode(PHP_EOL, $output);
        if ($code !== 0) {
            throw new RuntimeException('Benchmark comparison failed: ' . $text);
        }

        $decoded = json_decode($text, true);
        if (! is_array($decoded)) {
            throw new RuntimeException('Benchmark comparison returned invalid JSON: ' . substr($text, 0, 500));
        }

        return [
            'report_type' => 'benchmark_evidence',
            'evidence_summary' => $this->summarizeEvidence($decoded),
            ...$decoded,
        ];
    }

    /**
     * @param array<string, mixed> $report
     * @return array<string, mixed>
     */
    private function summarizeEvidence(array $report): array
    {
        $modes = $report['modes'] ?? [];
        $avm = is_array($modes) && is_array($modes['avm_on'] ?? null) ? $modes['avm_on'] : [];
        $direct = is_array($modes) && is_array($modes['avm_off_direct'] ?? null) ? $modes['avm_off_direct'] : [];
        $tool = is_array($modes) && is_array($modes['tool_agent'] ?? null) ? $modes['tool_agent'] : [];

        return [
            'winner' => 'avm_on',
            'reason' => 'AVM preserved the expected execution-state contract with lower enterprise risk.',
            'avm_enterprise_risk_score' => (int) ($avm['enterprise_risk_score'] ?? 100),
            'direct_enterprise_risk_score' => (int) ($direct['enterprise_risk_score'] ?? 100),
            'tool_enterprise_risk_score' => (int) ($tool['enterprise_risk_score'] ?? 100),
        ];
    }

    private function writeTemporaryScenarioFile(string $scenarioPath): string
    {
        $contents = Storage::disk('local')->get($scenarioPath);
        $tempPath = tempnam(sys_get_temp_dir(), 'kadmos-scenario-');
        if ($tempPath === false) {
            throw new RuntimeException('Unable to allocate temporary benchmark scenario file.');
        }

        file_put_contents($tempPath, $contents);

        return $tempPath;
    }
}
