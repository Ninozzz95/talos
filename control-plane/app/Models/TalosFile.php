<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

final class TalosFile extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'original_name',
        'mime_type',
        'detected_mime',
        'size_bytes',
        'checksum',
        'status',
        'scan_status',
        'scan_engine',
        'scan_engine_version',
        'scan_signature_version',
        'scanned_at',
        'extraction_status',
        'extractor',
        'extractor_version',
        'extracted_at',
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

    /** @return BelongsToMany<TalosFileAuthorityGrant, $this> */
    public function authorityGrants(): BelongsToMany
    {
        return $this->belongsToMany(
            TalosFileAuthorityGrant::class,
            'talos_file_authority_grant_files',
            'file_id',
            'grant_id',
        )->withPivot('checksum_snapshot')->withTimestamps();
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeChunks = false): array
    {
        $data = [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'original_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'detected_mime' => $this->detected_mime,
            'size_bytes' => $this->size_bytes,
            'checksum' => $this->checksum,
            'status' => $this->status,
            'scan_status' => $this->scan_status,
            'scan_engine' => $this->scan_engine,
            'scan_engine_version' => $this->scan_engine_version,
            'scan_signature_version' => $this->scan_signature_version,
            'scanned_at' => $this->scanned_at?->toJSON(),
            'extraction_status' => $this->extraction_status,
            'extractor' => $this->extractor,
            'extractor_version' => $this->extractor_version,
            'extracted_at' => $this->extracted_at?->toJSON(),
            'parser' => $this->parser,
            'failure_reason' => $this->failure_reason,
            'metadata' => $this->redactStorageMetadata(is_array($this->metadata) ? $this->metadata : []),
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
            'scanned_at' => 'datetime',
            'extracted_at' => 'datetime',
        ];
    }

    /**
     * @param  array<string|int, mixed>  $metadata
     * @return array<string|int, mixed>
     */
    private function redactStorageMetadata(array $metadata): array
    {
        foreach ($metadata as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if ($normalizedKey === 'storage_disk' || str_ends_with($normalizedKey, 'storage_path')) {
                unset($metadata[$key]);

                continue;
            }

            if (is_array($value)) {
                $metadata[$key] = $this->redactStorageMetadata($value);
            }
        }

        return $metadata;
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
