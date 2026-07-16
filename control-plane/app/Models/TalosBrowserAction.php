<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosBrowserAction extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'schema_version', 'task_id', 'user_id', 'talos_session_id', 'intent_id',
        'sequence', 'kind', 'arguments', 'expected_state_version', 'risk',
        'idempotency_key', 'preconditions', 'status', 'result_sha256', 'error_code',
        'requested_at', 'approved_at', 'started_at', 'committed_at', 'failed_at', 'reconciled_at',
    ];

    /** @param Builder<TalosBrowserAction> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserTask::class, 'task_id');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'talos_session_id');
    }

    public function evidenceBundles(): HasMany
    {
        return $this->hasMany(TalosBrowserEvidenceBundle::class, 'action_id')->orderBy('captured_at');
    }

    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
            'arguments' => 'array',
            'expected_state_version' => 'integer',
            'preconditions' => 'array',
            'requested_at' => 'datetime',
            'approved_at' => 'datetime',
            'started_at' => 'datetime',
            'committed_at' => 'datetime',
            'failed_at' => 'datetime',
            'reconciled_at' => 'datetime',
        ];
    }
}
