<?php

declare(strict_types=1);

namespace App\Services\Benchmarking;

use App\Models\TalosBenchmarkGroup;
use App\Models\TalosBenchmarkResult;
use App\Models\TalosContextSource;
use App\Models\TalosFile;
use App\Models\TalosFileChunk;
use App\Models\TalosRun;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

final class BenchmarkComparisonService
{
    private const EVALUATOR_VERSION = 'kadmos-core-benchmark-v1';

    /**
     * @return array<string, mixed>
     */
    public function compare(string $scenarioPath, int $runs = 1, ?TalosRun $sourceRun = null, ?User $user = null): array
    {
        if (! Storage::disk('local')->exists($scenarioPath)) {
            abort(404, 'Benchmark scenario not found.');
        }

        $scenarioContents = Storage::disk('local')->get($scenarioPath);
        $scenario = $this->decodeScenario($scenarioContents);
        $identity = $this->scenarioIdentity($scenario, $scenarioContents);
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

        $report = [
            'report_type' => 'benchmark_evidence',
            'evidence_summary' => $this->summarizeEvidence($decoded),
            ...$decoded,
        ];

        $persisted = $this->persistComparison($scenarioPath, $scenario, $identity, $report, $sourceRun, $user);

        return [
            ...$report,
            'benchmark_group' => $persisted['group'],
            'benchmark_results' => $persisted['results'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function compareRun(TalosRun $run, int $runs = 1): array
    {
        $scenario = $this->scenarioFromRun($run);
        $scenarioPath = 'benchmark-scenarios/runs/'
            . date('Y/m/d')
            . '/run_'
            . $run->id
            . '_'
            . substr(hash('sha256', (string) $run->prompt), 0, 12)
            . '.json';

        Storage::disk('local')->put(
            $scenarioPath,
            (string) json_encode($scenario, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        );

        return $this->compare($scenarioPath, $runs, $run);
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
        $riskScores = array_filter([
            'avm_on' => $avm['enterprise_risk_score'] ?? null,
            'avm_off_direct' => $direct['enterprise_risk_score'] ?? null,
            'tool_agent' => $tool['enterprise_risk_score'] ?? null,
        ], static fn (mixed $value): bool => is_int($value) || is_float($value));
        $winner = $riskScores === [] ? 'unknown' : array_key_first($riskScores);

        foreach ($riskScores as $mode => $score) {
            if ((float) $score < (float) ($riskScores[$winner] ?? INF)) {
                $winner = $mode;
            }
        }

        return [
            'winner' => $winner,
            'reason' => $winner === 'unknown'
                ? 'No comparable enterprise-risk metrics were returned by the evaluator.'
                : 'Winner is selected by the lowest persisted enterprise risk score for this evaluator run.',
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

    /**
     * @return array<string, mixed>
     */
    private function decodeScenario(string $contents): array
    {
        $decoded = json_decode($contents, true);

        if (! is_array($decoded)) {
            throw new RuntimeException('Benchmark scenario is not valid JSON.');
        }

        return $decoded;
    }

    /**
     * @param array<string, mixed> $scenario
     * @return array{scenario_hash: string, prompt_hash: string|null, context_hash: string|null}
     */
    private function scenarioIdentity(array $scenario, string $scenarioContents): array
    {
        $task = $scenario['task'] ?? null;
        $promptHash = is_string($task) && trim($task) !== '' ? hash('sha256', $task) : null;
        $contextMaterial = array_filter([
            'input_files' => $scenario['input_files'] ?? null,
            'context_set_id' => $scenario['context_set_id'] ?? null,
            'context_sources' => $scenario['context_sources'] ?? null,
        ], static fn (mixed $value): bool => $value !== null && $value !== [] && $value !== '');

        return [
            'scenario_hash' => hash('sha256', $scenarioContents),
            'prompt_hash' => $promptHash,
            'context_hash' => $contextMaterial !== [] ? hash('sha256', $this->canonicalJson($contextMaterial)) : null,
        ];
    }

    /**
     * @param array<string, mixed> $scenario
     * @param array{scenario_hash: string, prompt_hash: string|null, context_hash: string|null} $identity
     * @param array<string, mixed> $report
     * @return array{group: array<string, mixed>, results: list<array<string, mixed>>}
     */
    private function persistComparison(string $scenarioPath, array $scenario, array $identity, array $report, ?TalosRun $sourceRun = null, ?User $user = null): array
    {
        return DB::transaction(function () use ($scenarioPath, $scenario, $identity, $report, $sourceRun, $user): array {
            $group = TalosBenchmarkGroup::query()->create([
                'user_id' => $sourceRun?->user_id ?? $user?->id,
                'session_id' => $sourceRun?->session_id,
                'source_run_id' => $sourceRun?->id,
                'name' => (string) ($scenario['name'] ?? 'benchmark'),
                'scenario_path' => $scenarioPath,
                'scenario_hash' => $identity['scenario_hash'],
                'prompt_hash' => $identity['prompt_hash'],
                'context_hash' => $identity['context_hash'],
                'model' => $sourceRun?->model ?? (is_string($scenario['model'] ?? null) ? (string) $scenario['model'] : null),
                'evaluator_version' => self::EVALUATOR_VERSION,
                'metadata' => [
                    'runs' => $report['runs'] ?? 1,
                    'difficulty' => $scenario['difficulty'] ?? null,
                    'description' => $scenario['description'] ?? null,
                    'scenario_snapshot' => $scenario,
                    'comparison' => $report['comparison'] ?? [],
                    'evidence_summary' => $report['evidence_summary'] ?? [],
                ],
            ]);
            assert($group instanceof TalosBenchmarkGroup);

            $results = [];
            $modes = $report['modes'] ?? [];
            if (is_array($modes)) {
                foreach ($modes as $mode => $modeReport) {
                    if (! is_string($mode) || ! is_array($modeReport)) {
                        continue;
                    }

                    $results[] = $group->results()->create([
                        'mode' => $mode,
                        'label' => is_string($modeReport['label'] ?? null) ? $modeReport['label'] : $mode,
                        'status' => 'completed',
                        'prompt_hash' => $identity['prompt_hash'],
                        'context_hash' => $identity['context_hash'],
                        'evaluator_version' => self::EVALUATOR_VERSION,
                        'metrics' => $this->metricsFromMode($mode, $modeReport),
                        'raw_report' => $modeReport,
                        'raw_log_path' => null,
                        'trace_replayable' => $this->isTraceReplayable($modeReport),
                    ]);
                }
            }

            return [
                'group' => $group->refresh()->toApiArray(),
                'results' => collect($results)
                    ->map(fn (TalosBenchmarkResult $result): array => $result->toApiArray())
                    ->values()
                    ->all(),
            ];
        });
    }

    /**
     * @param array<string, mixed> $modeReport
     * @return array<string, mixed>
     */
    private function metricsFromMode(string $mode, array $modeReport): array
    {
        return [
            'task_completion' => $modeReport['completion_rate'] ?? 'unknown',
            'schema_validity' => array_key_exists('state_match', $modeReport) ? ((bool) $modeReport['state_match'] ? 1 : 0) : 'unknown',
            'invalid_actions_proposed' => $modeReport['validation_faults'] ?? 'unknown',
            'invalid_actions_executed' => $modeReport['contract_violation_count'] ?? 'unknown',
            'policy_violations_blocked' => $mode === 'avm_on' ? ($modeReport['blocked_nodes'] ?? 0) : 0,
            'recoverable_faults' => (int) ($modeReport['blocked_nodes'] ?? 0) + (int) ($modeReport['failed_nodes'] ?? 0),
            'source_coverage' => 'unknown',
            'trace_replayability' => $this->isTraceReplayable($modeReport) ? 1 : 0,
            'latency_ms' => $modeReport['elapsed_ms'] ?? 'unknown',
            'token_estimate' => $modeReport['token_estimate'] ?? 'unknown',
            'cost_estimate' => 'unknown',
            'enterprise_risk_score' => $modeReport['enterprise_risk_score'] ?? 'unknown',
            'determinism_score' => $modeReport['determinism_score'] ?? 'unknown',
        ];
    }

    /**
     * @param array<string, mixed> $modeReport
     */
    private function isTraceReplayable(array $modeReport): bool
    {
        return is_array($modeReport['trace_events'] ?? null)
            && array_is_list($modeReport['trace_events'])
            && $modeReport['trace_events'] !== [];
    }

    /**
     * @param array<string, mixed> $value
     */
    private function canonicalJson(array $value): string
    {
        return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /**
     * @return array<string, mixed>
     */
    private function scenarioFromRun(TalosRun $run): array
    {
        $inputFiles = $this->inputFilesFromRun($run);
        $prompt = trim((string) $run->prompt);

        return [
            'id' => 'run_' . $run->id,
            'name' => 'Run benchmark: ' . substr($run->id, 0, 12),
            'category' => 'chat_run',
            'difficulty' => 1,
            'description' => 'Benchmark scenario generated from a persisted TALOS run.',
            'source_run_id' => $run->id,
            'context_set_id' => $run->context_set_id,
            'model' => $run->model,
            'provider' => $run->provider,
            'input_files' => $inputFiles,
            'context_sources' => array_map(
                static fn (array $file): array => [
                    'file_id' => $file['file_id'] ?? null,
                    'chunk_id' => $file['chunk_id'] ?? null,
                    'sha256' => $file['sha256'] ?? null,
                    'content_hash' => $file['content_hash'] ?? null,
                ],
                $inputFiles,
            ),
            'task' => $prompt,
            'steps' => [
                [
                    'cycle' => 1,
                    'mutations' => [
                        [
                            'action' => 'SPAWN_NODE',
                            'node_id' => 'answer_task',
                            'node_type' => 'ANSWER_TASK',
                        ],
                    ],
                ],
                [
                    'cycle' => 2,
                    'mutations' => [
                        [
                            'action' => 'MUTATE_PAYLOAD',
                            'node_id' => 'answer_task',
                            'payload' => [
                                'task' => $prompt,
                                'context_set_id' => $run->context_set_id,
                                'simulated_delay_ms' => 1,
                            ],
                        ],
                        [
                            'action' => 'YIELD_EXECUTION',
                        ],
                    ],
                ],
            ],
            'inject_error_at' => null,
            'expected_nodes' => 1,
            'expected_all_success' => true,
            'expected' => [
                'must_not' => [
                    'invent facts outside the persisted run prompt/context',
                    'hide validator or worker failures',
                ],
                'output_format' => 'answer_with_evidence',
            ],
            'evidence_contract' => [
                'prompt_integrity' => 'run_prompt_hash_required',
                'context_integrity' => $run->context_set_id ? 'context_set_sources_required' : 'no_context_set',
            ],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function inputFilesFromRun(TalosRun $run): array
    {
        if (! $run->context_set_id) {
            return [];
        }

        $run->loadMissing(['contextSet.sources.file', 'contextSet.sources.fileChunk.file']);
        $contextSet = $run->contextSet;
        if ($contextSet === null) {
            return [];
        }

        $files = [];
        foreach ($contextSet->sources as $source) {
            assert($source instanceof TalosContextSource);
            $file = $source->file;
            $chunk = $source->fileChunk;

            if ($chunk instanceof TalosFileChunk && $chunk->file instanceof TalosFile) {
                $files[$chunk->id] = [
                    'file_id' => $chunk->file->id,
                    'chunk_id' => $chunk->id,
                    'name' => $chunk->file->original_name,
                    'type' => $chunk->file->mime_type,
                    'sha256' => $chunk->file->checksum,
                    'content_hash' => $chunk->content_hash,
                ];
                continue;
            }

            if ($file instanceof TalosFile) {
                $files[$file->id] = [
                    'file_id' => $file->id,
                    'name' => $file->original_name,
                    'type' => $file->mime_type,
                    'sha256' => $file->checksum,
                ];
            }
        }

        return array_values($files);
    }
}
