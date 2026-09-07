<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosLibraryItemSession extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'library_item_id',
        'session_id',
        'message_id',
        'relation',
        'binding_type',
        'binding_id',
        'occurred_at',
        'metadata',
    ];

    /** @return BelongsTo<TalosLibraryItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(TalosLibraryItem::class, 'library_item_id');
    }

    /** @return BelongsTo<TalosSession, $this> */
    public function session(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'session_id');
    }

    /** @return BelongsTo<TalosMessage, $this> */
    public function message(): BelongsTo
    {
        return $this->belongsTo(TalosMessage::class, 'message_id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'metadata' => 'array',
        ];
    }
}
