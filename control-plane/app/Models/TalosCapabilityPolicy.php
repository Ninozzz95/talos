<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosCapabilityPolicy extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'policy_set_id',
        'capability',
        'decision',
        'talos_session_id',
        'expires_at',
        'last_used_at',
    ];

    /** @return BelongsTo<TalosCapabilityPolicySet, $this> */
    public function policySet(): BelongsTo
    {
        return $this->belongsTo(TalosCapabilityPolicySet::class, 'policy_set_id');
    }

    /** @return BelongsTo<TalosSession, $this> */
    public function talosSession(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'talos_session_id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'expires_at' => 'immutable_datetime',
            'last_used_at' => 'immutable_datetime',
        ];
    }
}
