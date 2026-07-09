<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosModelComparisonLane extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'comparison_id',
        'model_profile_id',
        'display_alias',
        'position',
        'weight',
        'status',
        'response_text',
        'latency_ms',
        'cost',
        'run_id',
        'error_code',
        'error_message',
        'metadata',
    ];

    /**
     * @return BelongsTo<TalosModelComparison, $this>
     */
    public function comparison(): BelongsTo
    {
        return $this->belongsTo(TalosModelComparison::class, 'comparison_id');
    }

    /**
     * @return BelongsTo<TalosModelProfile, $this>
     */
    public function modelProfile(): BelongsTo
    {
        return $this->belongsTo(TalosModelProfile::class, 'model_profile_id');
    }

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
            'position' => 'integer',
            'weight' => 'integer',
            'latency_ms' => 'integer',
            'cost' => 'decimal:6',
            'metadata' => 'array',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeIdentity = false): array
    {
        $data = [
            'id' => $this->id,
            'comparison_id' => $this->comparison_id,
            'display_alias' => $this->display_alias,
            'position' => $this->position,
            'weight' => $this->weight,
            'status' => $this->status,
            'response_text' => $this->response_text,
            'latency_ms' => $this->latency_ms,
            'cost' => $this->cost !== null ? (float) $this->cost : null,
            'error_code' => $this->error_code,
            'error_message' => $this->error_message,
            'metadata' => $this->metadata ?? [],
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeIdentity) {
            $profile = $this->relationLoaded('modelProfile') ? $this->modelProfile : $this->modelProfile()->first();
            $data['run_id'] = $this->run_id;
            $data['model_profile_id'] = $this->model_profile_id;
            $data['model_profile'] = $profile instanceof TalosModelProfile
                ? [
                    'id' => $profile->id,
                    'display_name' => $profile->display_name,
                    'provider' => $profile->provider,
                    'model' => $profile->model,
                    'status' => $profile->status,
                ]
                : null;
        }

        return $data;
    }
}
