<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosToolResult extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'tool_call_id', 'tool_turn_id', 'run_id', 'user_id', 'provider_call_id', 'attempt',
        'status', 'is_error', 'canonical_result', 'error_code', 'evidence_ids', 'state_version',
    ];

    /** @param Builder<TalosToolResult> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function call(): BelongsTo
    {
        return $this->belongsTo(TalosToolCall::class, 'tool_call_id');
    }

    public function turn(): BelongsTo
    {
        return $this->belongsTo(TalosToolTurn::class, 'tool_turn_id');
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(TalosRun::class, 'run_id');
    }

    protected function casts(): array
    {
        return [
            'attempt' => 'integer',
            'is_error' => 'boolean',
            'canonical_result' => 'array',
            'evidence_ids' => 'array',
            'state_version' => 'integer',
        ];
    }
}
