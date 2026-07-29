<?php

declare(strict_types=1);

namespace App\Services\Talos\Chat;

use App\Models\TalosRun;
use App\Models\TalosRunEvent;
use App\Services\Runs\TalosRunEventRecorder;
use App\Support\TalosMessageMetadata;
use InvalidArgumentException;
use Kadmos\Provider\ProviderStreamEvent;
use LogicException;

final class TalosStreamEventProjector
{
    public const CONTRACT = 'talos.chat.stream.v1';

    public function __construct(private readonly TalosRunEventRecorder $events) {}

    /**
     * @return array{
     *   contract: string,
     *   run_id: string,
     *   sequence: int,
     *   kind: string,
     *   occurred_at: string,
     *   payload: array<string, mixed>
     * }|null
     */
    public function projectProviderEvent(
        int $ownerUserId,
        TalosRun $run,
        ProviderStreamEvent $event,
    ): ?array {
        $this->assertOwner($ownerUserId, $run);

        return match ($event->kind) {
            ProviderStreamEvent::TEXT_DELTA => $this->recordPublic(
                $ownerUserId,
                $run,
                'text.delta',
                [
                    'text' => $event->payload['text'],
                    'provider_sequence' => $event->sequence,
                ],
            ),
            ProviderStreamEvent::REASONING_DELTA => $this->recordPublic(
                $ownerUserId,
                $run,
                'reasoning.delta',
                [
                    'text' => $event->payload['text'],
                    'provider_sequence' => $event->sequence,
                ],
            ),
            ProviderStreamEvent::TOOL_CALL_DELTA => $this->projectToolDelta(
                $ownerUserId,
                $run,
                $event,
            ),
            ProviderStreamEvent::USAGE => $this->recordPublic(
                $ownerUserId,
                $run,
                'usage.updated',
                [
                    ...$event->payload,
                    'provider_sequence' => $event->sequence,
                ],
            ),
            ProviderStreamEvent::HEARTBEAT => $this->recordPublic(
                $ownerUserId,
                $run,
                'stream.heartbeat',
                ['provider_sequence' => $event->sequence],
            ),
            ProviderStreamEvent::ARTIFACT => $this->recordInternal(
                $ownerUserId,
                $run,
                'provider.stream.artifact_observed',
                [
                    'provider_sequence' => $event->sequence,
                    'artifact_type' => $event->payload['artifact_type'],
                    'mime_type' => $event->payload['mime_type'],
                    'uri_sha256' => hash('sha256', (string) $event->payload['uri']),
                ],
            ),
            ProviderStreamEvent::COMPLETED => $this->recordInternal(
                $ownerUserId,
                $run,
                'provider.stream.completed',
                [
                    'provider_sequence' => $event->sequence,
                    'outcome' => $event->payload['outcome'],
                    'response_id' => $event->payload['response_id'],
                    'stop_reason' => $event->payload['stop_reason'],
                ],
            ),
            ProviderStreamEvent::FAILED => $this->recordInternal(
                $ownerUserId,
                $run,
                'provider.stream.failed',
                [
                    'provider_sequence' => $event->sequence,
                    'code' => $event->payload['code'],
                    'retryable' => $event->payload['retryable'],
                    'http_status' => $event->payload['http_status'],
                ],
            ),
            ProviderStreamEvent::CANCELLED => $this->recordInternal(
                $ownerUserId,
                $run,
                'provider.stream.cancelled',
                [
                    'provider_sequence' => $event->sequence,
                    'reason' => $event->payload['reason'],
                ],
            ),
            default => throw new InvalidArgumentException('Provider stream event kind is unsupported.'),
        };
    }

    /**
     * @return array{
     *   contract: string,
     *   run_id: string,
     *   sequence: int,
     *   kind: string,
     *   occurred_at: string,
     *   payload: array<string, mixed>
     * }
     */
    public function projectLifecycle(
        int $ownerUserId,
        TalosRun $run,
        string $kind,
        array $payload = [],
    ): array {
        $normalized = match ($kind) {
            'run.started' => $this->runStartedPayload($run, $payload),
            'tool.started',
            'tool.progress',
            'tool.completed' => $this->toolLifecyclePayload($kind, $payload),
            'artifact.created' => $this->artifactCreatedPayload($payload),
            'message.completed' => $this->messageCompletedPayload($run, $payload),
            'run.failed' => $this->runFailedPayload($payload),
            'run.cancelled' => $this->runCancelledPayload($payload),
            'stream.heartbeat' => $this->heartbeatPayload($payload),
            default => throw new InvalidArgumentException('TALOS stream lifecycle event kind is unsupported.'),
        };

        return $this->recordPublic($ownerUserId, $run, $kind, $normalized);
    }

    /** @return array<string, mixed> */
    public function envelope(TalosRunEvent $event): array
    {
        return [
            'contract' => self::CONTRACT,
            'run_id' => (string) $event->run_id,
            'sequence' => (int) $event->sequence,
            'kind' => (string) $event->event_type,
            'occurred_at' => (string) $event->occurred_at?->toJSON(),
            'payload' => is_array($event->payload) ? $event->payload : [],
        ];
    }

    /** @return array<string, mixed> */
    private function projectToolDelta(
        int $ownerUserId,
        TalosRun $run,
        ProviderStreamEvent $event,
    ): array {
        $index = (int) $event->payload['index'];
        $providerCallId = is_string($event->payload['provider_call_id'])
            ? $event->payload['provider_call_id']
            : null;
        $name = is_string($event->payload['name'])
            ? $event->payload['name']
            : null;
        $seen = $run->events()
            ->whereIn('event_type', ['tool.started', 'tool.progress'])
            ->oldest('sequence')
            ->get()
            ->contains(static function (TalosRunEvent $recorded) use ($index, $providerCallId): bool {
                $payload = is_array($recorded->payload) ? $recorded->payload : [];

                return (int) ($payload['index'] ?? -1) === $index
                    && ($providerCallId === null
                        || ($payload['provider_call_id'] ?? null) === $providerCallId);
            });

        return $this->recordPublic(
            $ownerUserId,
            $run,
            $seen ? 'tool.progress' : 'tool.started',
            [
                'provider_sequence' => $event->sequence,
                'index' => $index,
                'provider_call_id' => $providerCallId,
                'name' => $name,
                'arguments_progressed' => is_string($event->payload['arguments_delta'])
                    && $event->payload['arguments_delta'] !== '',
            ],
        );
    }

    /** @return array{run: array<string, mixed>} */
    private function runStartedPayload(TalosRun $run, array $payload): array
    {
        $this->assertExactKeys($payload, []);

        return [
            'run' => [
                'id' => (string) $run->id,
                'session_id' => (string) $run->session_id,
                'model_profile_id' => $run->model_profile_id,
                'model_routing_profile_id' => $run->model_routing_profile_id,
                'context_set_id' => $run->context_set_id,
                'mode' => (string) $run->mode,
                'status' => (string) $run->status,
                'provider' => $run->provider,
                'model' => $run->model,
                'started_at' => $run->started_at?->toJSON(),
            ],
        ];
    }

    /** @return array{provider_call_id: string, tool_name: string, status: string} */
    private function toolLifecyclePayload(string $kind, array $payload): array
    {
        $this->assertExactKeys($payload, ['provider_call_id', 'tool_name', 'status']);
        $statuses = match ($kind) {
            'tool.started' => ['running'],
            'tool.progress' => ['running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled'],
            'tool.completed' => ['succeeded', 'failed', 'cancelled'],
        };
        $status = $this->boundedString($payload['status'], 'Tool lifecycle status', 32);
        if (! in_array($status, $statuses, true)) {
            throw new InvalidArgumentException('Tool lifecycle status is unsupported for this event kind.');
        }

        return [
            'provider_call_id' => $this->boundedString(
                $payload['provider_call_id'],
                'Tool lifecycle provider call ID',
                256,
            ),
            'tool_name' => $this->boundedString($payload['tool_name'], 'Tool lifecycle name', 128),
            'status' => $status,
        ];
    }

    /** @return array<string, mixed> */
    private function artifactCreatedPayload(array $payload): array
    {
        $this->assertAllowedKeys(
            $payload,
            ['artifact_id', 'artifact_type', 'mime_type'],
            ['name', 'size_bytes'],
        );
        $normalized = [
            'artifact_id' => $this->boundedString($payload['artifact_id'], 'Artifact ID', 256),
            'artifact_type' => $this->boundedString($payload['artifact_type'], 'Artifact type', 128),
            'mime_type' => $this->boundedString($payload['mime_type'], 'Artifact MIME type', 255),
        ];
        if (array_key_exists('name', $payload)) {
            $normalized['name'] = $this->boundedString($payload['name'], 'Artifact name', 255);
        }
        if (array_key_exists('size_bytes', $payload)) {
            if (! is_int($payload['size_bytes']) || $payload['size_bytes'] < 0) {
                throw new InvalidArgumentException('Artifact size must be a non-negative integer.');
            }
            $normalized['size_bytes'] = $payload['size_bytes'];
        }

        return $normalized;
    }

    /** @return array<string, mixed> */
    private function messageCompletedPayload(TalosRun $run, array $payload): array
    {
        $this->assertExactKeys($payload, ['message_id', 'request_key', 'message']);
        $messageId = $this->boundedString($payload['message_id'], 'Completed message ID', 256);
        $requestKey = $this->boundedString($payload['request_key'], 'Completed message request key', 512);
        $expectedRequestKey = self::CONTRACT.':'.$run->id.':assistant';
        if (! hash_equals($expectedRequestKey, $requestKey)) {
            throw new InvalidArgumentException('Completed message request key is not canonical for this run.');
        }
        if (! is_array($payload['message']) || array_is_list($payload['message'])) {
            throw new InvalidArgumentException('Completed message payload must be an object.');
        }
        $message = $payload['message'];
        $this->assertExactKeys($message, [
            'id',
            'session_id',
            'role',
            'content',
            'model_profile_id',
            'run_id',
            'request_key',
            'metadata',
            'created_at',
            'updated_at',
        ]);
        if (! hash_equals($messageId, $this->boundedString($message['id'], 'Completed message object ID', 256))
            || (string) $message['session_id'] !== (string) $run->session_id
            || $message['role'] !== 'assistant'
            || (string) $message['run_id'] !== (string) $run->id
            || $message['request_key'] !== $requestKey) {
            throw new InvalidArgumentException('Completed message identity does not match its run envelope.');
        }
        if ($message['model_profile_id'] !== null
            && ! is_string($message['model_profile_id'])
            && ! is_int($message['model_profile_id'])) {
            throw new InvalidArgumentException('Completed message model profile ID is invalid.');
        }

        return [
            'message_id' => $messageId,
            'request_key' => $requestKey,
            'message' => [
                'id' => $messageId,
                'session_id' => (string) $message['session_id'],
                'role' => 'assistant',
                'content' => $this->boundedString($message['content'], 'Completed message content', 1_000_000),
                'model_profile_id' => $message['model_profile_id'],
                'run_id' => (string) $message['run_id'],
                'request_key' => $requestKey,
                'metadata' => TalosMessageMetadata::fromStorage($message['metadata'])->toApiArray(),
                'created_at' => $this->nullableBoundedString(
                    $message['created_at'],
                    'Completed message creation time',
                    64,
                ),
                'updated_at' => $this->nullableBoundedString(
                    $message['updated_at'],
                    'Completed message update time',
                    64,
                ),
            ],
        ];
    }

    /** @return array{status: string, code: string, retryable: bool} */
    private function runFailedPayload(array $payload): array
    {
        $this->assertExactKeys($payload, ['status', 'code', 'retryable']);
        $status = $this->boundedString($payload['status'], 'Run failure status', 32);
        if (! in_array($status, ['failed', 'recovery_required'], true)) {
            throw new InvalidArgumentException('Run failure status is unsupported.');
        }
        $code = $this->boundedString($payload['code'], 'Run failure code', 128);
        if (preg_match('/^[A-Z][A-Z0-9_]{0,127}$/', $code) !== 1) {
            throw new InvalidArgumentException('Run failure code is not canonical.');
        }
        if (! is_bool($payload['retryable'])) {
            throw new InvalidArgumentException('Run failure retryable flag must be boolean.');
        }

        return ['status' => $status, 'code' => $code, 'retryable' => $payload['retryable']];
    }

    /** @return array{reason: string} */
    private function runCancelledPayload(array $payload): array
    {
        $this->assertExactKeys($payload, ['reason']);
        $reason = $this->boundedString($payload['reason'], 'Run cancellation reason', 64);
        if (! in_array($reason, ['user_requested', 'provider_cancelled', 'system_cancelled'], true)) {
            throw new InvalidArgumentException('Run cancellation reason is unsupported.');
        }

        return ['reason' => $reason];
    }

    /** @return array{} */
    private function heartbeatPayload(array $payload): array
    {
        $this->assertExactKeys($payload, []);

        return [];
    }

    /** @return array<string, mixed> */
    private function recordPublic(
        int $ownerUserId,
        TalosRun $run,
        string $kind,
        array $payload,
    ): array {
        $this->assertOwner($ownerUserId, $run);
        $recorded = $this->events->record(
            ['run_id' => (string) $run->id, 'user_id' => $ownerUserId],
            ['event_type' => $kind, 'severity' => 'info', 'payload' => $payload],
        );

        return $this->envelope($recorded);
    }

    private function recordInternal(
        int $ownerUserId,
        TalosRun $run,
        string $eventType,
        array $payload,
    ): null {
        $this->events->record(
            ['run_id' => (string) $run->id, 'user_id' => $ownerUserId],
            ['event_type' => $eventType, 'severity' => 'info', 'payload' => $payload],
        );

        return null;
    }

    private function assertOwner(int $ownerUserId, TalosRun $run): void
    {
        if ((int) $run->user_id !== $ownerUserId) {
            throw new LogicException('The stream projector owner does not match the run owner.');
        }
    }

    /** @param list<string> $expected */
    private function assertExactKeys(array $payload, array $expected): void
    {
        $actual = array_keys($payload);
        sort($actual);
        sort($expected);
        if ($actual !== $expected) {
            throw new InvalidArgumentException('TALOS stream lifecycle payload has unexpected fields.');
        }
    }

    /**
     * @param list<string> $required
     * @param list<string> $optional
     */
    private function assertAllowedKeys(array $payload, array $required, array $optional): void
    {
        $actual = array_keys($payload);
        foreach ($required as $key) {
            if (! array_key_exists($key, $payload)) {
                throw new InvalidArgumentException('TALOS stream lifecycle payload is missing a required field.');
            }
        }
        if (array_diff($actual, [...$required, ...$optional]) !== []) {
            throw new InvalidArgumentException('TALOS stream lifecycle payload has unexpected fields.');
        }
    }

    private function boundedString(mixed $value, string $label, int $limit): string
    {
        if (! is_string($value)
            || trim($value) === ''
            || strlen($value) > $limit
            || preg_match('//u', $value) !== 1) {
            throw new InvalidArgumentException($label.' must be a non-empty bounded UTF-8 string.');
        }

        return $value;
    }

    private function nullableBoundedString(mixed $value, string $label, int $limit): ?string
    {
        if ($value === null) {
            return null;
        }

        return $this->boundedString($value, $label, $limit);
    }
}
