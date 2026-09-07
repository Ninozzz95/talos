<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosCapabilityPolicySet extends Model
{
    public const CONTRACT_SCHEMA_VERSION = 1;

    public const PERSISTENCE_SCHEMA_VERSION = 2;

    /** @deprecated Use CONTRACT_SCHEMA_VERSION or PERSISTENCE_SCHEMA_VERSION explicitly. */
    public const SCHEMA_VERSION = self::CONTRACT_SCHEMA_VERSION;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'schema_version',
        'revision',
    ];

    public static function idForUser(int $userId): string
    {
        return 'user-'.$userId;
    }

    /** @param Builder<TalosCapabilityPolicySet> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    /** @return HasMany<TalosCapabilityPolicy, $this> */
    public function policies(): HasMany
    {
        return $this->hasMany(TalosCapabilityPolicy::class, 'policy_set_id');
    }

    /** @return HasMany<TalosCapabilityGrant, $this> */
    public function grants(): HasMany
    {
        return $this->hasMany(TalosCapabilityGrant::class, 'policy_set_id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'schema_version' => 'integer',
            'revision' => 'integer',
        ];
    }
}
