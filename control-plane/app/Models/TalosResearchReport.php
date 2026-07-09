<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosResearchReport extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'run_id',
        'context_set_id',
        'benchmark_group_id',
        'title',
        'query',
        'status',
        'summary',
        'report_markdown',
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
     * @return BelongsTo<TalosRun, $this>
     */
    public function run(): BelongsTo
    {
        return $this->belongsTo(TalosRun::class, 'run_id');
    }

    /**
     * @return HasMany<TalosResearchSource, $this>
     */
    public function sources(): HasMany
    {
        return $this->hasMany(TalosResearchSource::class, 'research_report_id');
    }

    /**
     * @return HasMany<TalosResearchClaim, $this>
     */
    public function claims(): HasMany
    {
        return $this->hasMany(TalosResearchClaim::class, 'research_report_id');
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
    public function toApiArray(bool $includeDetails = false): array
    {
        $data = [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'run_id' => $this->run_id,
            'context_set_id' => $this->context_set_id,
            'benchmark_group_id' => $this->benchmark_group_id,
            'title' => $this->title,
            'query' => $this->query,
            'status' => $this->status,
            'summary' => $this->summary,
            'report_markdown' => $includeDetails ? $this->report_markdown : null,
            'metadata' => $this->metadata,
            'sources_count' => $this->sources_count ?? ($this->relationLoaded('sources') ? $this->sources->count() : null),
            'claims_count' => $this->claims_count ?? ($this->relationLoaded('claims') ? $this->claims->count() : null),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeDetails) {
            $data['sources'] = $this->sources
                ->map(fn (TalosResearchSource $source): array => $source->toApiArray())
                ->values();
            $data['claims'] = $this->claims
                ->map(fn (TalosResearchClaim $claim): array => $claim->toApiArray(includeSources: true))
                ->values();
        }

        return $data;
    }
}
