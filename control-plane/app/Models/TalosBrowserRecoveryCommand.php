<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosBrowserRecoveryCommand extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'schema_version', 'task_id', 'user_id', 'talos_session_id',
        'command_id', 'command_sha256', 'strategy', 'reason_code',
        'remediation', 'resulting_task_id', 'payload', 'occurred_at',
    ];

    /** @param Builder<TalosBrowserRecoveryCommand> $query */
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
        return ['payload' => 'array', 'occurred_at' => 'datetime'];
    }
}
