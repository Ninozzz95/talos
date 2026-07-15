<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Kadmos\Tool\ToolContractGuard;

final class TalosAuditEvent extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'event_type',
        'subject_type',
        'subject_id',
        'actor_type',
        'actor_id',
        'payload',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
        ];
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function record(
        string $eventType,
        ?string $subjectType = null,
        ?string $subjectId = null,
        array $payload = [],
        ?string $actorType = null,
        ?string $actorId = null,
    ): self {
        $event = self::query()->create([
            'event_type' => $eventType,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'actor_type' => $actorType,
            'actor_id' => $actorId,
            'payload' => self::redact($payload),
        ]);

        assert($event instanceof self);

        return $event;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public static function redact(array $payload): array
    {
        return self::normalizeRedactionMarkers(ToolContractGuard::redact($payload));
    }

    /**
     * Keep the established lowercase API marker while the core owns redaction semantics.
     *
     * @param array<string, mixed>|list<mixed> $payload
     * @return array<string, mixed>|list<mixed>
     */
    private static function normalizeRedactionMarkers(array $payload): array
    {
        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                $payload[$key] = self::normalizeRedactionMarkers($value);
                continue;
            }

            if (is_string($value)) {
                $payload[$key] = str_replace('[REDACTED]', '[redacted]', $value);
            }
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'event_type' => $this->event_type,
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,
            'actor_type' => $this->actor_type,
            'actor_id' => $this->actor_id,
            'payload' => $this->payload ?? [],
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
