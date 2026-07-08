<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

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
        $redacted = [];

        foreach ($payload as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if (str_contains($normalizedKey, 'secret')
                || str_contains($normalizedKey, 'token')
                || str_contains($normalizedKey, 'password')
                || str_contains($normalizedKey, 'api_key')
            ) {
                $redacted[$key] = '[redacted]';
                continue;
            }

            if (is_array($value)) {
                /** @var array<string, mixed> $value */
                $redacted[$key] = self::redact($value);
                continue;
            }

            $redacted[$key] = $value;
        }

        return $redacted;
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
