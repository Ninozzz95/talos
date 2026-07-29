<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

final class TalosLibraryItem extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'origin_session_id',
        'source_type',
        'source_id',
        'kind',
        'origin',
        'title',
        'mime_type',
        'byte_size',
        'checksum',
        'source_url',
        'search_text',
        'trust_boundary',
        'occurred_at',
        'metadata',
        'hidden_at',
        'unavailable_at',
    ];

    /** @return BelongsTo<TalosSession, $this> */
    public function originSession(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'origin_session_id');
    }

    /** @return HasMany<TalosLibraryItemSession, $this> */
    public function sessionLinks(): HasMany
    {
        return $this->hasMany(TalosLibraryItemSession::class, 'library_item_id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'byte_size' => 'integer',
            'metadata' => 'array',
            'occurred_at' => 'datetime',
            'hidden_at' => 'datetime',
            'unavailable_at' => 'datetime',
        ];
    }

    /** @return array<string, mixed> */
    public function toApiArray(): array
    {
        $links = $this->apiSessionLinks();
        $metadata = $this->redactPrivateMetadata(is_array($this->metadata) ? $this->metadata : []);
        $backlinks = $links
            ->unique('session_id')
            ->take(10)
            ->map(static fn (TalosLibraryItemSession $link): array => [
                'session_id' => (string) $link->session_id,
                'title' => (string) ($link->session?->title ?? 'Chat'),
                'relation' => (string) $link->relation,
                'occurred_at' => $link->occurred_at?->toJSON(),
            ])
            ->values()
            ->all();

        return [
            'id' => (string) $this->id,
            'source_type' => (string) $this->source_type,
            'source_id' => (string) $this->source_id,
            'kind' => (string) $this->kind,
            'origin' => (string) $this->origin,
            'title' => (string) $this->title,
            'mime_type' => $this->mime_type,
            'byte_size' => $this->byte_size,
            'checksum' => $this->checksum,
            'source_url' => $this->source_url,
            'content_url' => $this->contentUrl(),
            'trust_boundary' => (string) $this->trust_boundary,
            'occurred_at' => $this->occurred_at?->toJSON(),
            'metadata' => (object) $metadata,
            'chat_count' => $links->unique('session_id')->count(),
            'backlinks' => $backlinks,
            'can_attach' => $this->source_type === 'file',
        ];
    }

    private function contentUrl(): ?string
    {
        $id = rawurlencode((string) $this->source_id);

        return match ($this->source_type) {
            'file' => "/api/talos/files/{$id}/content",
            'document' => "/api/talos/documents/{$id}",
            'run_artifact' => "/api/talos/artifacts/{$id}/preview",
            'browser_artifact' => "/api/talos/browser/artifacts/{$id}/preview"
                .($this->origin_session_id ? '?talos_session_id='.rawurlencode((string) $this->origin_session_id) : ''),
            default => null,
        };
    }

    /** @return Collection<int, TalosLibraryItemSession> */
    private function apiSessionLinks(): Collection
    {
        if ($this->relationLoaded('sessionLinks')) {
            return $this->sessionLinks;
        }

        return $this->sessionLinks()->with('session')->get();
    }

    /**
     * @param array<string|int, mixed> $metadata
     * @return array<string|int, mixed>
     */
    private function redactPrivateMetadata(array $metadata): array
    {
        foreach ($metadata as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if ($normalizedKey === 'storage_disk'
                || $normalizedKey === 'storage_path'
                || str_ends_with($normalizedKey, '_storage_path')) {
                unset($metadata[$key]);

                continue;
            }
            if (is_array($value)) {
                $metadata[$key] = $this->redactPrivateMetadata($value);
            }
        }

        return $metadata;
    }
}
