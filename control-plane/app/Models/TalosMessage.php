<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosMessage extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'session_id',
        'role',
        'content',
        'model_profile_id',
        'run_id',
        'request_key',
        'metadata',
    ];

    /**
     * @return BelongsTo<TalosSession, $this>
     */
    public function session(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'session_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'metadata' => 'array',
        ];
    }
}
