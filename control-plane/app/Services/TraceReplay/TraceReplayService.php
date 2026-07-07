<?php

declare(strict_types=1);

namespace App\Services\TraceReplay;

final class TraceReplayService
{
    /**
     * @param list<array<string, mixed>> $events
     * @return array<string, mixed>
     */
    public function build(string $runId, array $events): array
    {
        return [
            'run_id' => $runId,
            'controls' => ['play', 'pause', 'step_forward', 'step_backward'],
            'speeds' => ['0.5x', '1x', '2x'],
            'filters' => ['faults', 'worker_execution'],
            'steps' => array_map(
                fn(array $event, int $index): array => $this->step($event, $index + 1),
                $events,
                array_keys($events),
            ),
        ];
    }

    /**
     * @param array<string, mixed> $event
     * @return array<string, mixed>
     */
    private function step(array $event, int $sequence): array
    {
        $type = (string) ($event['type'] ?? 'event');
        $nodeId = (string) ($event['node_id'] ?? '');
        $action = (string) ($event['action'] ?? '');

        return [
            'sequence' => $sequence,
            'kind' => $this->kind($type),
            'type' => $type,
            'node_id' => $nodeId,
            'label' => $this->label($type, $action, $nodeId),
            'event' => $event,
        ];
    }

    private function kind(string $type): string
    {
        return match ($type) {
            'validation_rejected' => 'fault',
            'worker_started', 'worker_finished', 'execution_skipped' => 'worker_execution',
            default => 'trace',
        };
    }

    private function label(string $type, string $action, string $nodeId): string
    {
        return match ($type) {
            'llm_mutation' => trim("LLM proposed {$action} {$nodeId}"),
            'validation_accepted' => "Validator accepted {$nodeId}",
            'validation_rejected' => "Validator rejected {$nodeId}",
            'dag_node_added' => "DAG added {$nodeId}",
            'execution_skipped' => "Execution skipped {$nodeId}",
            'worker_started' => "Worker started {$nodeId}",
            'worker_finished' => "Worker finished {$nodeId}",
            default => trim("Trace event {$nodeId}"),
        };
    }
}
