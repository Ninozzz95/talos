<?php

declare(strict_types=1);

namespace App\Services\TraceReplay;

use App\Models\TalosAuditEvent;

final class TraceReplayService
{
    /**
     * @param list<array<string, mixed>> $events
     * @return array<string, mixed>
     */
    public function build(string $runId, array $events): array
    {
        $nodeStatuses = [];
        $steps = [];

        foreach (array_values($events) as $index => $event) {
            $step = $this->step($event, $index + 1, $nodeStatuses);
            $steps[] = $step;
        }

        return [
            'run_id' => $runId,
            'controls' => ['play', 'pause', 'step_forward', 'step_backward'],
            'speeds' => ['0.5x', '1x', '2x'],
            'filters' => ['faults', 'worker_execution'],
            'steps' => $steps,
            'final_node_statuses' => $nodeStatuses,
        ];
    }

    /**
     * @param array<string, mixed> $event
     * @param array<string, string> $nodeStatuses
     * @return array<string, mixed>
     */
    private function step(array $event, int $fallbackSequence, array &$nodeStatuses): array
    {
        $event = $this->redactEvent($event);
        $type = (string) ($event['type'] ?? 'event');
        $nodeId = (string) ($event['node_id'] ?? '');
        $action = (string) ($event['action'] ?? '');
        $status = $this->statusFromEvent($type, $event);

        if ($nodeId !== '' && $status !== null) {
            $nodeStatuses[$nodeId] = $status;
        }

        return [
            'sequence' => $this->sequenceFromEvent($event, $fallbackSequence),
            'kind' => $this->kind($type, $status, $event),
            'type' => $type,
            'node_id' => $nodeId,
            'status_after' => $status,
            'node_statuses' => $nodeStatuses,
            'label' => $this->label($type, $action, $nodeId),
            'event' => $event,
        ];
    }

    /**
     * @param array<string, mixed> $event
     */
    private function sequenceFromEvent(array $event, int $fallbackSequence): int
    {
        $sequence = $event['sequence'] ?? null;

        return is_int($sequence) && $sequence > 0 ? $sequence : $fallbackSequence;
    }

    /**
     * @param array<string, mixed> $event
     */
    private function kind(string $type, ?string $status, array $event): string
    {
        $severity = (string) ($event['severity'] ?? '');

        if ($severity === 'error' || $status === 'FAILED') {
            return 'fault';
        }

        return match ($type) {
            'validation_rejected', 'worker.failed' => 'fault',
            'worker_started', 'worker_finished', 'execution_skipped',
            'worker.started', 'worker.finished', 'node.status_changed' => 'worker_execution',
            'recovery.requested' => 'recovery',
            default => 'trace',
        };
    }

    /**
     * @param array<string, mixed> $event
     */
    private function statusFromEvent(string $type, array $event): ?string
    {
        $payload = $event['payload'] ?? [];
        if (! is_array($payload)) {
            $payload = [];
        }

        $status = $payload['status'] ?? $payload['node_status'] ?? null;
        if (is_string($status) && trim($status) !== '') {
            return trim($status);
        }

        if ($type === 'worker_started' || $type === 'worker.started') {
            return 'RUNNING';
        }

        if ($type === 'worker_finished' || $type === 'worker.finished') {
            return 'SUCCESS';
        }

        if ($type === 'validation_accepted') {
            return 'VALIDATED';
        }

        if ($type === 'validation_rejected' || str_contains($type, 'failed')) {
            return 'FAILED';
        }

        if (str_contains($type, 'blocked')) {
            return 'BLOCKED_BY_DEPENDENCY';
        }

        if (str_contains($type, 'retry')) {
            return 'RETRYING';
        }

        if (str_contains($type, 'skip')) {
            return 'SKIPPED';
        }

        return null;
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

    /**
     * @param array<string, mixed> $event
     * @return array<string, mixed>
     */
    private function redactEvent(array $event): array
    {
        $payload = $event['payload'] ?? [];

        if (is_array($payload)) {
            /** @var array<string, mixed> $payload */
            $event['payload'] = TalosAuditEvent::redact($payload);
        }

        return $event;
    }
}
