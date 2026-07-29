<?php

declare(strict_types=1);

namespace App\Services\Talos\Chat;

use App\Models\TalosRun;
use App\Models\TalosRunEvent;
use App\Services\Runs\TalosRunEventRecorder;
use InvalidArgumentException;

final class TalosSendTrace
{
    private const MAX_METRIC = 2_147_483_647;

    private const PHASES = [
        'accepted',
        'provider',
        'tool',
        'finalized',
        'completed',
        'failed',
        'cancelled',
    ];

    private const METRICS = [
        'elapsed_ms',
        'time_to_first_event_ms',
        'input_tokens',
        'output_tokens',
        'cached_tokens',
        'cache_read_tokens',
        'cache_write_tokens',
        'cache_miss_tokens',
        'cache_write_5m_tokens',
        'cache_write_1h_tokens',
        'event_count',
        'tool_call_count',
    ];

    private const NULLABLE_CACHE_METRICS = [
        'cache_read_tokens',
        'cache_write_tokens',
        'cache_miss_tokens',
        'cache_write_5m_tokens',
        'cache_write_1h_tokens',
    ];

    public function __construct(private readonly TalosRunEventRecorder $events) {}

    /**
     * @param array<string, mixed> $metrics
     */
    public function record(
        int $ownerUserId,
        TalosRun $run,
        string $phase,
        bool $streamed,
        array $metrics = [],
    ): TalosRunEvent {
        $ownedRun = TalosRun::query()
            ->whereKey($run->id)
            ->where('user_id', $ownerUserId)
            ->first();
        if (! $ownedRun instanceof TalosRun) {
            throw new InvalidArgumentException('Send trace run is not owned by the current user.');
        }
        if (! in_array($phase, self::PHASES, true)) {
            throw new InvalidArgumentException('Send trace phase is unsupported.');
        }
        if (array_diff(array_keys($metrics), self::METRICS) !== []) {
            throw new InvalidArgumentException('Send trace metrics contain unsupported fields.');
        }

        $normalizedMetrics = [];
        foreach (self::METRICS as $name) {
            if (! array_key_exists($name, $metrics)) {
                continue;
            }
            $value = $metrics[$name];
            if ($value === null && in_array($name, self::NULLABLE_CACHE_METRICS, true)) {
                $normalizedMetrics[$name] = null;

                continue;
            }
            if (! is_int($value) || $value < 0 || $value > self::MAX_METRIC) {
                throw new InvalidArgumentException(sprintf(
                    'Send trace metric %s must be an integer between 0 and %d.',
                    $name,
                    self::MAX_METRIC,
                ));
            }
            $normalizedMetrics[$name] = $value;
        }

        return $this->events->record(
            ['run_id' => (string) $ownedRun->id, 'user_id' => $ownerUserId],
            [
                'event_type' => 'chat.send.trace',
                'payload' => [
                    'phase' => $phase,
                    'streamed' => $streamed,
                    'provider' => is_string($ownedRun->provider) ? $ownedRun->provider : null,
                    'model' => is_string($ownedRun->model) ? $ownedRun->model : null,
                    'run_status' => (string) $ownedRun->status,
                    ...$normalizedMetrics,
                ],
            ],
        );
    }
}
