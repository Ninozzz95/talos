<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

final class TalosFileChunk extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'file_id',
        'sequence',
        'content',
        'content_hash',
        'start_offset',
        'end_offset',
        'metadata',
    ];

    /**
     * @return BelongsTo<TalosFile, $this>
     */
    public function file(): BelongsTo
    {
        return $this->belongsTo(TalosFile::class, 'file_id');
    }

    /**
     * @return HasMany<TalosContextSource, $this>
     */
    public function contextSources(): HasMany
    {
        return $this->hasMany(TalosContextSource::class, 'file_chunk_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiPreviewArray(): array
    {
        return [
            'id' => $this->id,
            'file_id' => $this->file_id,
            'sequence' => $this->sequence,
            'preview' => Str::limit($this->content, 240, '...'),
            'content_hash' => $this->content_hash,
            'start_offset' => $this->start_offset,
            'end_offset' => $this->end_offset,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'sequence' => 'integer',
            'start_offset' => 'integer',
            'end_offset' => 'integer',
        ];
    }
}
