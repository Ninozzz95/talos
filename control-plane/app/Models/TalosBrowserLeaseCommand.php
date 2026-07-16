<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosBrowserLeaseCommand extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'schema_version', 'lease_id', 'task_id', 'user_id', 'talos_session_id',
        'command_id', 'command_sha256', 'operation', 'payload', 'occurred_at',
    ];

    /** @param Builder<TalosBrowserLeaseCommand> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function lease(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserSessionLease::class, 'lease_id');
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
        return ['payload' => 'array', 'occurred_at' => 'datetime'];
    }
}
