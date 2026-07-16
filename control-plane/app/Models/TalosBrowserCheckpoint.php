<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosBrowserCheckpoint extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'schema_version', 'task_id', 'user_id', 'talos_session_id', 'task_state_version',
        'task_status', 'tab_inventory', 'budget', 'action_frontier', 'evidence_frontier',
        'runtime_reconciliation_token', 'recorded_at',
    ];

    protected $hidden = ['runtime_reconciliation_token'];

    /** @param Builder<TalosBrowserCheckpoint> $query */
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

    protected function casts(): array
    {
        return [
            'task_state_version' => 'integer',
            'tab_inventory' => 'array',
            'budget' => 'array',
            'action_frontier' => 'array',
            'evidence_frontier' => 'array',
            'runtime_reconciliation_token' => 'encrypted',
            'recorded_at' => 'datetime',
        ];
    }
}
