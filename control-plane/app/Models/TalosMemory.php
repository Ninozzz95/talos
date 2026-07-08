<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class TalosMemory extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'scope_type',
        'scope_id',
        'kind',
        'status',
        'title',
        'content',
        'source',
        'metadata',
        'last_used_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'last_used_at' => 'datetime',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeContent = false): array
    {
        $payload = [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'scope_type' => $this->scope_type,
            'scope_id' => $this->scope_id,
            'kind' => $this->kind,
            'status' => $this->status,
            'title' => $this->title,
            'content_preview' => $this->preview((string) $this->content),
            'source' => $this->source,
            'metadata' => $this->metadata,
            'trust_level' => 'untrusted',
            'last_used_at' => $this->last_used_at?->toJSON(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeContent) {
            $payload['content'] = $this->content;
        }

        return $payload;
    }

    private function preview(string $content): string
    {
        return mb_strimwidth($content, 0, 220, '...');
    }
}
