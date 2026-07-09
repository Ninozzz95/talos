<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosExternalAccount extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'provider',
        'provider_account_id',
        'email',
        'display_name',
        'encrypted_access_token',
        'encrypted_refresh_token',
        'scopes',
        'status',
        'token_expires_at',
        'connected_at',
        'last_used_at',
        'last_error',
        'metadata',
    ];

    protected $hidden = [
        'encrypted_access_token',
        'encrypted_refresh_token',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return HasMany<TalosExternalSyncState>
     */
    public function syncStates(): HasMany
    {
        return $this->hasMany(TalosExternalSyncState::class, 'external_account_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'scopes' => 'array',
            'token_expires_at' => 'datetime',
            'connected_at' => 'datetime',
            'last_used_at' => 'datetime',
            'metadata' => 'array',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'provider' => $this->provider,
            'provider_account_id' => $this->provider_account_id,
            'email' => $this->email,
            'display_name' => $this->display_name,
            'scopes' => $this->scopes ?? [],
            'status' => $this->status,
            'has_access_token' => filled($this->encrypted_access_token),
            'has_refresh_token' => filled($this->encrypted_refresh_token),
            'token_expires_at' => $this->token_expires_at?->toJSON(),
            'connected_at' => $this->connected_at?->toJSON(),
            'last_used_at' => $this->last_used_at?->toJSON(),
            'last_error' => $this->last_error,
            'metadata' => $this->metadata ?? [],
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
