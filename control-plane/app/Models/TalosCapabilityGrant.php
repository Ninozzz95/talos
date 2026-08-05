<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosCapabilityGrant extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'policy_set_id',
        'capability',
        'tool_id',
        'actions',
        'scope',
        'scope_id',
        'status',
        'granted_at',
        'expires_at',
        'risk_acknowledged',
        'last_used_at',
        'consumed_at',
        'revoked_at',
        'legacy_policy_id',
    ];

    /** @return BelongsTo<TalosCapabilityPolicySet, $this> */
    public function policySet(): BelongsTo
    {
        return $this->belongsTo(TalosCapabilityPolicySet::class, 'policy_set_id');
    }

    /** @param Builder<TalosCapabilityGrant> $query */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'actions' => 'array',
            'granted_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
            'risk_acknowledged' => 'boolean',
            'last_used_at' => 'immutable_datetime',
            'consumed_at' => 'immutable_datetime',
            'revoked_at' => 'immutable_datetime',
        ];
    }
}
