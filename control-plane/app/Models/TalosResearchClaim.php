<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

final class TalosResearchClaim extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'research_report_id',
        'sequence',
        'text',
        'status',
        'confidence',
        'metadata',
    ];

    /**
     * @return BelongsTo<TalosResearchReport, $this>
     */
    public function report(): BelongsTo
    {
        return $this->belongsTo(TalosResearchReport::class, 'research_report_id');
    }

    /**
     * @return BelongsToMany<TalosResearchSource, $this>
     */
    public function sources(): BelongsToMany
    {
        return $this->belongsToMany(
            TalosResearchSource::class,
            'talos_research_claim_source',
            'research_claim_id',
            'research_source_id',
        )->withTimestamps();
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
    public function toApiArray(bool $includeSources = false): array
    {
        $data = [
            'id' => $this->id,
            'research_report_id' => $this->research_report_id,
            'sequence' => $this->sequence,
            'text' => $this->text,
            'status' => $this->status,
            'confidence' => $this->confidence,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeSources) {
            $data['sources'] = $this->sources
                ->map(fn (TalosResearchSource $source): array => $source->toApiArray())
                ->values();
        }

        return $data;
    }
}
