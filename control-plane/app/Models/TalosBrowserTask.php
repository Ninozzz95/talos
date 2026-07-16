<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use InvalidArgumentException;
use Kadmos\Browser\Contract\BrowserTask;

final class TalosBrowserTask extends Model
{
    use HasUuids;

    private const STATE_PATCH_FIELDS = [
        'runtime_id',
        'active_tab_id',
        'started_at',
        'completed_at',
        'failed_at',
        'cancelled_at',
        'reconciled_at',
    ];

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'schema_version', 'user_id', 'talos_session_id', 'origin_message_id',
        'browser_session_id', 'goal', 'status', 'autonomy_profile', 'budget',
        'runtime_id', 'active_tab_id', 'state_version', 'requested_at', 'started_at',
        'completed_at', 'failed_at', 'cancelled_at', 'reconciled_at',
    ];

    /** @param Builder<TalosBrowserTask> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'talos_session_id');
    }

    public function originMessage(): BelongsTo
    {
        return $this->belongsTo(TalosMessage::class, 'origin_message_id');
    }

    public function browserSession(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserSession::class, 'browser_session_id');
    }

    public function actions(): HasMany
    {
        return $this->hasMany(TalosBrowserAction::class, 'task_id')->orderBy('sequence');
    }

    public function evidenceBundles(): HasMany
    {
        return $this->hasMany(TalosBrowserEvidenceBundle::class, 'task_id')->orderBy('captured_at');
    }

    public function checkpoints(): HasMany
    {
        return $this->hasMany(TalosBrowserCheckpoint::class, 'task_id')->orderBy('task_state_version');
    }

    public function leases(): HasMany
    {
        return $this->hasMany(TalosBrowserSessionLease::class, 'task_id')->orderBy('acquired_at');
    }

    public function events(): HasMany
    {
        return $this->hasMany(TalosBrowserTaskEvent::class, 'task_id')
            ->orderBy('to_state_version')
            ->orderBy('id');
    }

    public function toCoreContract(): BrowserTask
    {
        if ($this->created_at === null || $this->updated_at === null) {
            throw new InvalidArgumentException('Persisted Browser task timestamps are required.');
        }

        return BrowserTask::fromArray([
            'schema_version' => $this->schema_version,
            'task_id' => (string) $this->id,
            'conversation_id' => (string) $this->talos_session_id,
            'origin_message_id' => (string) $this->origin_message_id,
            'goal' => (string) $this->goal,
            'status' => (string) $this->status,
            'autonomy_profile' => (string) $this->autonomy_profile,
            'budget' => $this->budget,
            'runtime_id' => $this->runtime_id,
            'active_tab_id' => $this->active_tab_id,
            'state_version' => $this->state_version,
            'created_at' => $this->created_at->toISOString(),
            'updated_at' => $this->updated_at->toISOString(),
        ]);
    }

    /**
     * Persistence-only CAS. The core contract must approve the semantic transition first.
     *
     * @param  array<string, mixed>  $statePatch
     */
    public function compareAndSwapState(int $expectedVersion, string $status, array $statePatch = []): bool
    {
        if ($expectedVersion < 0 || trim($status) === '') {
            throw new InvalidArgumentException('Browser task CAS requires a non-negative version and status.');
        }
        $unsupported = array_diff(array_keys($statePatch), self::STATE_PATCH_FIELDS);
        if ($unsupported !== []) {
            throw new InvalidArgumentException('Browser task CAS contains unsupported state fields.');
        }

        $updated = self::query()
            ->whereKey($this->getKey())
            ->where('user_id', $this->user_id)
            ->where('state_version', $expectedVersion)
            ->update([
                ...$statePatch,
                'status' => $status,
                'state_version' => $expectedVersion + 1,
                'updated_at' => now(),
            ]);

        if ($updated === 1) {
            $this->refresh();
        }

        return $updated === 1;
    }

    protected function casts(): array
    {
        return [
            'budget' => 'array',
            'state_version' => 'integer',
            'requested_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'failed_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'reconciled_at' => 'datetime',
        ];
    }
}
