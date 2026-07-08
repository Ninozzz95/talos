<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosCalendarDraft extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'run_id',
        'title',
        'description',
        'starts_at',
        'ends_at',
        'timezone',
        'attendees',
        'status',
        'confirmation_required',
        'confirmed_at',
        'metadata',
    ];

    /**
     * @return BelongsTo<TalosRun, $this>
     */
    public function run(): BelongsTo
    {
        return $this->belongsTo(TalosRun::class, 'run_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'attendees' => 'array',
            'confirmation_required' => 'boolean',
            'metadata' => 'array',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'confirmed_at' => 'datetime',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'run_id' => $this->run_id,
            'title' => $this->title,
            'description' => $this->description,
            'starts_at' => $this->starts_at?->toJSON(),
            'ends_at' => $this->ends_at?->toJSON(),
            'timezone' => $this->timezone,
            'attendees' => $this->attendees ?? [],
            'status' => $this->status,
            'confirmation_required' => $this->confirmation_required,
            'confirmed_at' => $this->confirmed_at?->toJSON(),
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
