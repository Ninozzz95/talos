<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosToolBudgetReservation extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'tool_turn_id', 'run_id', 'user_id', 'tool_call_id', 'reservation_id', 'kind',
        'resource', 'reserved_amount', 'settled_amount', 'status', 'metadata',
    ];

    /** @param Builder<TalosToolBudgetReservation> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function turn(): BelongsTo
    {
        return $this->belongsTo(TalosToolTurn::class, 'tool_turn_id');
    }

    public function call(): BelongsTo
    {
        return $this->belongsTo(TalosToolCall::class, 'tool_call_id');
    }

    protected function casts(): array
    {
        return [
            'reserved_amount' => 'integer',
            'settled_amount' => 'integer',
            'metadata' => 'array',
        ];
    }
}
