<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosModelComparison extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'prompt',
        'mode',
        'task_type',
        'blind',
        'shuffle_seed',
        'status',
        'timeout_seconds',
        'winner_lane_id',
        'revealed_at',
        'benchmark_group_id',
        'scorecard',
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
     * @return HasMany<TalosModelComparisonLane, $this>
     */
    public function lanes(): HasMany
    {
        return $this->hasMany(TalosModelComparisonLane::class, 'comparison_id');
    }

    /**
     * @return BelongsTo<TalosBenchmarkGroup, $this>
     */
    public function benchmarkGroup(): BelongsTo
    {
        return $this->belongsTo(TalosBenchmarkGroup::class, 'benchmark_group_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'blind' => 'boolean',
            'shuffle_seed' => 'integer',
            'timeout_seconds' => 'integer',
            'revealed_at' => 'datetime',
            'scorecard' => 'array',
            'metadata' => 'array',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeReveal = false, bool $includeLanes = true): array
    {
        $revealed = $includeReveal || ! $this->blind || $this->revealed_at !== null;
        $data = [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'prompt' => $this->prompt,
            'mode' => $this->mode,
            'task_type' => $this->task_type,
            'blind' => $this->blind,
            'status' => $this->status,
            'timeout_seconds' => $this->timeout_seconds,
            'winner_lane_id' => $this->winner_lane_id,
            'revealed' => $revealed,
            'revealed_at' => $this->revealed_at?->toJSON(),
            'benchmark_group_id' => $this->benchmark_group_id,
            'scorecard' => $this->scorecard,
            'metadata' => $this->metadata ?? [],
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeLanes) {
            $lanes = $this->relationLoaded('lanes') ? $this->lanes : $this->lanes()->with('modelProfile')->get();
            $data['lanes'] = $lanes
                ->sortBy('position')
                ->map(fn (TalosModelComparisonLane $lane): array => $lane->toApiArray($revealed))
                ->values()
                ->all();
        }

        return $data;
    }
}
