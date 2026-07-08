<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosContextSource extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'context_set_id',
        'file_id',
        'file_chunk_id',
        'source_type',
        'sequence',
        'metadata',
    ];

    /**
     * @return BelongsTo<TalosContextSet, $this>
     */
    public function contextSet(): BelongsTo
    {
        return $this->belongsTo(TalosContextSet::class, 'context_set_id');
    }

    /**
     * @return BelongsTo<TalosFile, $this>
     */
    public function file(): BelongsTo
    {
        return $this->belongsTo(TalosFile::class, 'file_id');
    }

    /**
     * @return BelongsTo<TalosFileChunk, $this>
     */
    public function fileChunk(): BelongsTo
    {
        return $this->belongsTo(TalosFileChunk::class, 'file_chunk_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        $data = [
            'id' => $this->id,
            'context_set_id' => $this->context_set_id,
            'file_id' => $this->file_id,
            'file_chunk_id' => $this->file_chunk_id,
            'source_type' => $this->source_type,
            'sequence' => $this->sequence,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($this->relationLoaded('file') && $this->file !== null) {
            $data['file'] = $this->file->toApiArray();
        }

        if ($this->relationLoaded('fileChunk') && $this->fileChunk !== null) {
            $data['chunk'] = $this->fileChunk->toApiPreviewArray();
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
            'sequence' => 'integer',
        ];
    }
}
