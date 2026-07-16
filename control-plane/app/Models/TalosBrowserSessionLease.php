<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use InvalidArgumentException;

final class TalosBrowserSessionLease extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'schema_version', 'task_id', 'user_id', 'talos_session_id', 'owner_type',
        'owner_id', 'status', 'acquired_at', 'expires_at', 'released_at',
    ];

    protected $hidden = ['fencing_token_hash'];

    /** @param Builder<TalosBrowserSessionLease> $query */
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

    public function commands(): HasMany
    {
        return $this->hasMany(TalosBrowserLeaseCommand::class, 'lease_id')->orderBy('occurred_at');
    }

    public function setFencingToken(string $token): self
    {
        if ($token === '') {
            throw new InvalidArgumentException('Browser lease fencing token cannot be empty.');
        }

        $this->fencing_token_hash = 'sha256:'.hash('sha256', $token);

        return $this;
    }

    public function matchesFencingToken(string $token): bool
    {
        return $token !== ''
            && is_string($this->fencing_token_hash)
            && hash_equals($this->fencing_token_hash, 'sha256:'.hash('sha256', $token));
    }

    protected function casts(): array
    {
        return [
            'acquired_at' => 'datetime',
            'expires_at' => 'datetime',
            'released_at' => 'datetime',
        ];
    }
}
