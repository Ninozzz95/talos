<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

final class TalosApiToken extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'role',
        'token_hash',
        'scopes',
        'expires_at',
        'last_used_at',
        'is_disabled',
        'metadata',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'scopes' => 'array',
            'metadata' => 'array',
            'expires_at' => 'datetime',
            'last_used_at' => 'datetime',
            'is_disabled' => 'boolean',
        ];
    }

    /**
     * @param list<string> $scopes
     */
    public static function issue(string $name, array $scopes, ?Carbon $expiresAt = null, string $role = 'admin'): string
    {
        $plainToken = 'talos_'.Str::random(48);

        self::query()->create([
            'name' => $name,
            'role' => $role,
            'token_hash' => hash('sha256', $plainToken),
            'scopes' => array_values($scopes),
            'expires_at' => $expiresAt,
        ]);

        return $plainToken;
    }

    public static function findForPlainToken(string $plainToken): ?self
    {
        $token = self::query()
            ->where('token_hash', hash('sha256', $plainToken))
            ->first();

        return $token instanceof self ? $token : null;
    }

    public function hasScope(string $scope): bool
    {
        $scopes = $this->scopes ?? [];

        return in_array($scope, $scopes, true) || in_array('talos.admin.all', $scopes, true);
    }

    public function isExpired(): bool
    {
        return $this->expires_at instanceof Carbon && $this->expires_at->isPast();
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'role' => $this->role,
            'scopes' => $this->scopes ?? [],
            'expires_at' => $this->expires_at?->toJSON(),
            'last_used_at' => $this->last_used_at?->toJSON(),
            'is_disabled' => $this->is_disabled,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
