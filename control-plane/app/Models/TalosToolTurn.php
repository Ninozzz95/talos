<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosToolTurn extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'session_id',
        'browser_session_id',
        'run_id',
        'model_profile_id',
        'status',
        'provider',
        'model',
        'adapter_version',
        'provider_response_id',
        'continuation_kind',
        'pending_tool_call_ids',
        'provider_state',
        'provider_state_sha256',
        'provider_outcome',
        'provider_outcome_sha256',
        'loop_guard_state',
        'loop_guard_state_sha256',
        'dag_state',
        'dag_state_sha256',
        'budget_policy',
        'budget_usage',
        'revision',
        'execution_lease_token',
        'execution_lease_expires_at',
        'execution_lease_phase',
        'provider_operation_key',
        'provider_operation_hash',
        'provider_operation_status',
        'provider_round',
        'repair_attempt',
        'cancel_requested_at',
        'started_at',
        'completed_at',
    ];

    protected $hidden = ['provider_state', 'provider_outcome', 'loop_guard_state', 'dag_state'];

    /** @param Builder<TalosToolTurn> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'session_id');
    }

    public function browserSession(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserSession::class, 'browser_session_id');
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(TalosRun::class, 'run_id');
    }

    public function modelProfile(): BelongsTo
    {
        return $this->belongsTo(TalosModelProfile::class, 'model_profile_id');
    }

    public function calls(): HasMany
    {
        return $this->hasMany(TalosToolCall::class, 'tool_turn_id')->orderBy('sequence');
    }

    public function results(): HasMany
    {
        return $this->hasMany(TalosToolResult::class, 'tool_turn_id');
    }

    public function budgetReservations(): HasMany
    {
        return $this->hasMany(TalosToolBudgetReservation::class, 'tool_turn_id');
    }

    protected function casts(): array
    {
        return [
            'pending_tool_call_ids' => 'array',
            'provider_state' => 'encrypted',
            'provider_outcome' => 'encrypted',
            'loop_guard_state' => 'encrypted',
            'dag_state' => 'encrypted',
            'budget_policy' => 'array',
            'budget_usage' => 'array',
            'revision' => 'integer',
            'execution_lease_expires_at' => 'datetime',
            'provider_round' => 'integer',
            'repair_attempt' => 'integer',
            'cancel_requested_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }
}
