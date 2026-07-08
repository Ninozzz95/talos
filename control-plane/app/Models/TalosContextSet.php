<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

final class TalosContextSet extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'status',
        'metadata',
    ];

    /**
     * @return HasMany<TalosContextSource, $this>
     */
    public function sources(): HasMany
    {
        return $this->hasMany(TalosContextSource::class, 'context_set_id')->orderBy('sequence');
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeSources = false): array
    {
        $data = [
            'id' => $this->id,
            'name' => $this->name,
            'status' => $this->status,
            'metadata' => $this->metadata,
            'sources_count' => $this->sourcesCount(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeSources) {
            $data['sources'] = $this->apiSources()
                ->sortBy(fn (TalosContextSource $source): string => $this->sourceSortKey($source))
                ->map(fn (TalosContextSource $source): array => $source->toApiArray())
                ->values()
                ->all();
        }

        return $data;
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

    private function sourcesCount(): int
    {
        if (array_key_exists('sources_count', $this->attributes)) {
            return (int) $this->attributes['sources_count'];
        }

        if ($this->relationLoaded('sources')) {
            return $this->sources->count();
        }

        return $this->sources()->count();
    }

    /**
     * @return Collection<int, TalosContextSource>
     */
    private function apiSources(): Collection
    {
        if ($this->relationLoaded('sources')) {
            return $this->sources;
        }

        return $this->sources()->with(['file', 'fileChunk'])->get();
    }

    private function sourceSortKey(TalosContextSource $source): string
    {
        $sourceTypeOrder = match ($source->source_type) {
            'uploaded_file' => 0,
            'file_chunk' => 1,
            default => 2,
        };

        return sprintf('%d-%010d-%s', $sourceTypeOrder, $source->sequence, $source->id);
    }
}
