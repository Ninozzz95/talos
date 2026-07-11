<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosBenchmarkGroup extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'session_id',
        'source_run_id',
        'name',
        'scenario_path',
        'scenario_hash',
        'prompt_hash',
        'context_hash',
        'model',
        'evaluator_version',
        'metadata',
    ];

    /**
     * @return HasMany<TalosBenchmarkResult, $this>
     */
    public function results(): HasMany
    {
        return $this->hasMany(TalosBenchmarkResult::class, 'benchmark_group_id');
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

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeResults = false): array
    {
        $data = [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'session_id' => $this->session_id,
            'source_run_id' => $this->source_run_id,
            'name' => $this->name,
            'scenario_ref' => is_string(($this->metadata ?? [])['scenario_ref'] ?? null)
                ? $this->metadata['scenario_ref']
                : null,
            'scenario_hash' => $this->scenario_hash,
            'prompt_hash' => $this->prompt_hash,
            'context_hash' => $this->context_hash,
            'model' => $this->model,
            'evaluator_version' => $this->evaluator_version,
            'metadata' => $this->metadata ?? [],
            'results_count' => $this->results_count ?? $this->results()->count(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeResults) {
            $data['results'] = $this->results
                ->sortBy('mode')
                ->map(fn (TalosBenchmarkResult $result): array => $result->toApiArray())
                ->values()
                ->all();
        }

        return $data;
    }
}
