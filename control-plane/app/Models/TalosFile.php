<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

final class TalosFile extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'original_name',
        'mime_type',
        'size_bytes',
        'checksum',
        'status',
        'storage_disk',
        'storage_path',
        'parser',
        'failure_reason',
        'metadata',
    ];

    /**
     * @return HasMany<TalosFileChunk, $this>
     */
    public function chunks(): HasMany
    {
        return $this->hasMany(TalosFileChunk::class, 'file_id')->orderBy('sequence');
    }

    /**
     * @return HasMany<TalosContextSource, $this>
     */
    public function contextSources(): HasMany
    {
        return $this->hasMany(TalosContextSource::class, 'file_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeChunks = false): array
    {
        $data = [
            'id' => $this->id,
            'original_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'size_bytes' => $this->size_bytes,
            'checksum' => $this->checksum,
            'status' => $this->status,
            'storage_disk' => $this->storage_disk,
            'storage_path' => $this->storage_path,
            'parser' => $this->parser,
            'failure_reason' => $this->failure_reason,
            'metadata' => $this->metadata,
            'chunks_count' => $this->chunksCount(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeChunks) {
            $data['chunks'] = $this->apiChunks()
                ->map(fn (TalosFileChunk $chunk): array => $chunk->toApiPreviewArray())
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
            'size_bytes' => 'integer',
        ];
    }

    private function chunksCount(): int
    {
        if (array_key_exists('chunks_count', $this->attributes)) {
            return (int) $this->attributes['chunks_count'];
        }

        if ($this->relationLoaded('chunks')) {
            return $this->chunks->count();
        }

        return $this->chunks()->count();
    }

    /**
     * @return Collection<int, TalosFileChunk>
     */
    private function apiChunks(): Collection
    {
        if ($this->relationLoaded('chunks')) {
            return $this->chunks;
        }

        return $this->chunks()->get();
    }
}
