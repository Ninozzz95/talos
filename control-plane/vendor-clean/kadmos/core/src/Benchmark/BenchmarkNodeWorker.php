<?php

declare(strict_types=1);

namespace Kadmos\Benchmark;

use Kadmos\NodeStatus;
use Kadmos\Workers\NodeWorkerInterface;

final readonly class BenchmarkNodeWorker implements NodeWorkerInterface
{
    public function __construct(private BenchmarkScenario $scenario)
    {
    }

    public function execute(array $payload): array
    {
        $error = $this->scenario->injectedError();
        $nodeId = (string) ($payload['__benchmark_node_id'] ?? '');

        if ($error !== null && ($error['type'] ?? null) === 'EXECUTION_FAILURE' && ($error['node'] ?? null) === $nodeId) {
            return [
                'status' => NodeStatus::FAILED,
                'output_summary' => 'Injected benchmark execution failure',
                'raw_output' => null,
            ];
        }

        return [
            'status' => NodeStatus::SUCCESS,
            'output_summary' => 'OK',
            'raw_output' => null,
        ];
    }
}
