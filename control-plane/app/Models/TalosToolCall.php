<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosToolCall extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'tool_turn_id', 'run_id', 'user_id', 'sequence', 'logical_call_id', 'provider_call_id',
        'node_id', 'tool_name', 'node_type', 'arguments', 'arguments_sha256', 'dependencies',
        'canonical_call', 'execution_context',
        'fingerprint', 'state_version', 'evidence_hash', 'evidence_snapshot_artifact_id',
        'evidence_snapshot_id', 'risk', 'capability', 'status', 'attempt',
        'execution_token', 'execution_lease_expires_at', 'effect_key', 'effect_status',
        'approval_state', 'approval_id', 'approval_payload_sha256', 'approved_by_user_id', 'approved_at', 'rejected_at',
    ];

    /** @param Builder<TalosToolCall> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function turn(): BelongsTo
    {
        return $this->belongsTo(TalosToolTurn::class, 'tool_turn_id');
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(TalosRun::class, 'run_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function results(): HasMany
    {
        return $this->hasMany(TalosToolResult::class, 'tool_call_id')->orderBy('attempt');
    }

    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
            'arguments' => 'array',
            'canonical_call' => 'encrypted',
            'execution_context' => 'encrypted',
            'dependencies' => 'array',
            'state_version' => 'integer',
            'attempt' => 'integer',
            'execution_lease_expires_at' => 'datetime',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    protected $hidden = ['canonical_call', 'execution_context'];
}
