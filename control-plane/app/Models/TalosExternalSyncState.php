<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosExternalSyncState extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'external_account_id',
        'provider',
        'resource_type',
        'resource_id',
        'sync_cursor',
        'status',
        'last_synced_at',
        'metadata',
    ];

    /**
     * @return BelongsTo<TalosExternalAccount, $this>
     */
    public function externalAccount(): BelongsTo
    {
        return $this->belongsTo(TalosExternalAccount::class, 'external_account_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_synced_at' => 'datetime',
            'metadata' => 'array',
        ];
    }
}
