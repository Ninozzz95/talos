<?php

declare(strict_types=1);

namespace App\Services\Runs;

use App\Models\TalosAuditEvent;

final class RunEventNormalizer
{
    /**
     * @param array<string, mixed> $event
     * @return array{event_type: string, node_id: string|null, severity: string, payload: array<string, mixed>}
     */
    public function normalize(array $event): array
    {
        $eventType = $event['event_type'] ?? $event['type'] ?? null;
        if (! is_string($eventType) || trim($eventType) === '') {
            $eventType = 'unknown.generic';
        }

        $nodeId = $event['node_id'] ?? null;
        if (! is_string($nodeId) || trim($nodeId) === '') {
            $nodeId = null;
        }

        $severity = $event['severity'] ?? null;
        if (! is_string($severity) || trim($severity) === '') {
            $severity = 'info';
        }

        $payload = $event['payload'] ?? [];
        if (! is_array($payload)) {
            $payload = [];
        }

        return [
            'event_type' => trim($eventType),
            'node_id' => $nodeId,
            'severity' => trim($severity),
            'payload' => TalosAuditEvent::redact($payload),
        ];
    }
}
