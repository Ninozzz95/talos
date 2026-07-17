<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

final class TalosFileAuthorityGrant extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'talos_session_id',
        'scope',
        'label',
        'permissions',
        'status',
        'expires_at',
        'revoked_at',
        'last_used_at',
    ];

    /** @param Builder<TalosFileAuthorityGrant> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    /** @return BelongsToMany<TalosFile, $this> */
    public function files(): BelongsToMany
    {
        return $this->belongsToMany(
            TalosFile::class,
            'talos_file_authority_grant_files',
            'grant_id',
            'file_id',
        )->withPivot('checksum_snapshot')->withTimestamps();
    }

    /** @return BelongsTo<TalosSession, $this> */
    public function talosSession(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'talos_session_id');
    }

    /** @return array<string, mixed> */
    public function toApiArray(): array
    {
        $files = $this->relationLoaded('files') ? $this->files : collect();

        return [
            'id' => (string) $this->id,
            'scope' => (string) $this->scope,
            'label' => (string) $this->label,
            'permissions' => is_array($this->permissions) ? array_values($this->permissions) : [],
            'status' => (string) $this->status,
            'talos_session_id' => $this->talos_session_id,
            'files' => $files->map(static fn (TalosFile $file): array => [
                'id' => (string) $file->id,
                'original_name' => (string) $file->original_name,
                'mime_type' => $file->mime_type,
                'size_bytes' => (int) $file->size_bytes,
                'checksum' => (string) $file->checksum,
                'status' => (string) $file->status,
            ])->values()->all(),
            'expires_at' => $this->expires_at?->toJSON(),
            'revoked_at' => $this->revoked_at?->toJSON(),
            'last_used_at' => $this->last_used_at?->toJSON(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'permissions' => 'array',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }
}
