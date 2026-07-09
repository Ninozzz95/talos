<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosRun;
use App\Models\TalosRunEvent;
use App\Models\User;
use App\Services\Runs\RunEventNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class TalosRecoveryController extends Controller
{
    private const HIGH_RISK_CAPABILITY = 'talos.recovery.high_risk';

    /**
     * @var list<string>
     */
    private const HIGH_RISK_ACTIONS = [
        'skip_node',
        'mark_resolved',
    ];

    public function __invoke(Request $request, TalosRun $run, RunEventNormalizer $normalizer): JsonResponse
    {
        $this->assertRunOwnedByCurrentUser($request, $run);

        $validated = $request->validate([
            'action' => ['required', 'string', Rule::in([
                'retry_node',
                'retry_branch',
                'edit_payload_and_retry',
                'skip_node',
                'mark_resolved',
            ])],
            'node_id' => ['required', 'string', 'min:1', 'max:255'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'payload' => ['required_if:action,edit_payload_and_retry', 'array'],
            'capabilities' => ['sometimes', 'array'],
            'capabilities.*' => ['string', 'max:255'],
        ]);

        $action = (string) $validated['action'];
        /** @var list<string> $capabilities */
        $capabilities = array_values(array_filter(
            $validated['capabilities'] ?? [],
            static fn (mixed $capability): bool => is_string($capability) && trim($capability) !== '',
        ));

        if ($this->isHighRisk($action) && ! in_array(self::HIGH_RISK_CAPABILITY, $capabilities, true)) {
            throw ValidationException::withMessages([
                'capabilities' => 'This recovery action requires the talos.recovery.high_risk capability.',
            ]);
        }

        $nodeId = (string) $validated['node_id'];
        $reason = $validated['reason'] ?? null;
        $targetStatus = $this->targetStatus($action);
        $nextRunStatus = $this->nextRunStatus($action);

        $result = DB::transaction(function () use ($run, $normalizer, $action, $nodeId, $reason, $targetStatus, $nextRunStatus, $validated, $capabilities): array {
            $nextSequence = ((int) $run->events()->max('sequence')) + 1;
            $events = [];

            $events[] = $run->events()->create([
                ...$normalizer->normalize([
                    'event_type' => 'recovery.requested',
                    'node_id' => $nodeId,
                    'severity' => $this->isHighRisk($action) ? 'warning' : 'info',
                    'payload' => [
                        'action' => $action,
                        'reason' => $reason,
                        'target_status' => $targetStatus,
                        'scope' => $action === 'retry_branch' ? 'branch' : 'node',
                        'capabilities' => $capabilities,
                        'edited_payload' => $action === 'edit_payload_and_retry' ? ($validated['payload'] ?? []) : null,
                    ],
                ]),
                'sequence' => $nextSequence,
                'occurred_at' => now(),
            ]);
            $nextSequence++;

            $events[] = $run->events()->create([
                ...$normalizer->normalize([
                    'event_type' => 'node.status_changed',
                    'node_id' => $nodeId,
                    'severity' => $targetStatus === 'SKIPPED' ? 'warning' : 'info',
                    'payload' => [
                        'status' => $targetStatus,
                        'source' => 'hmi_recovery',
                        'action' => $action,
                    ],
                ]),
                'sequence' => $nextSequence,
                'occurred_at' => now(),
            ]);

            $metadata = is_array($run->metadata) ? $run->metadata : [];
            $metadata['last_recovery'] = [
                'action' => $action,
                'node_id' => $nodeId,
                'target_status' => $targetStatus,
                'requested_at' => now()->toJSON(),
            ];

            $run->forceFill([
                'status' => $nextRunStatus,
                'completed_at' => null,
                'metadata' => $metadata,
            ])->save();

            TalosAuditEvent::record('recovery.requested', 'run', (string) $run->id, [
                'action' => $action,
                'node_id' => $nodeId,
                'reason' => $reason,
                'target_status' => $targetStatus,
                'high_risk' => $this->isHighRisk($action),
                'capabilities' => $capabilities,
            ]);

            return [
                'run' => $run->refresh()->toApiArray(),
                'events' => collect($events)
                    ->map(fn (TalosRunEvent $event): array => $event->toApiArray())
                    ->values()
                    ->all(),
            ];
        });

        return response()->json(['data' => $result], 201);
    }

    private function isHighRisk(string $action): bool
    {
        return in_array($action, self::HIGH_RISK_ACTIONS, true);
    }

    private function targetStatus(string $action): string
    {
        return match ($action) {
            'skip_node' => 'SKIPPED',
            'mark_resolved' => 'SUCCESS',
            default => 'RETRYING',
        };
    }

    private function nextRunStatus(string $action): string
    {
        return match ($action) {
            'skip_node', 'mark_resolved' => 'running',
            default => 'queued',
        };
    }

    private function assertRunOwnedByCurrentUser(Request $request, TalosRun $run): void
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless((int) $run->user_id === (int) $user->id, 404);
    }
}
