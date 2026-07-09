<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosModelRoutingProfile extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'name',
        'task_type',
        'status',
        'lanes',
        'metadata',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'lanes' => 'array',
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
            'name' => $this->name,
            'task_type' => $this->task_type,
            'status' => $this->status,
            'lanes' => $this->lanes ?? [],
            'metadata' => $this->metadata ?? [],
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
