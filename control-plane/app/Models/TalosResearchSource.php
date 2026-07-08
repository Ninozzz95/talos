<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

final class TalosResearchSource extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'research_report_id',
        'client_id',
        'sequence',
        'source_type',
        'url',
        'title',
        'status',
        'excerpt',
        'content_hash',
        'file_id',
        'file_chunk_id',
        'failure_reason',
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
     * @return BelongsToMany<TalosResearchClaim, $this>
     */
    public function claims(): BelongsToMany
    {
        return $this->belongsToMany(
            TalosResearchClaim::class,
            'talos_research_claim_source',
            'research_source_id',
            'research_claim_id',
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
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'research_report_id' => $this->research_report_id,
            'client_id' => $this->client_id,
            'sequence' => $this->sequence,
            'source_type' => $this->source_type,
            'url' => $this->url,
            'title' => $this->title,
            'status' => $this->status,
            'excerpt' => $this->excerpt,
            'content_hash' => $this->content_hash,
            'file_id' => $this->file_id,
            'file_chunk_id' => $this->file_chunk_id,
            'failure_reason' => $this->failure_reason,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
