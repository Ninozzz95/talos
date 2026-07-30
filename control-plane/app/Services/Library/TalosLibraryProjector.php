<?php

declare(strict_types=1);

namespace App\Services\Library;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosDocument;
use App\Models\TalosFile;
use App\Models\TalosLibraryItem;
use App\Models\TalosLibraryItemSession;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class TalosLibraryProjector
{
    /** @var list<string> */
    private const RUN_ARTIFACT_TYPES = [
        'research_report',
        'binary_bundle',
        'evidence_report',
        'generated_document',
        'web_fetch',
        'web_search_result',
    ];

    public function __construct(
        private readonly TalosLibrarySearchNormalizer $searchNormalizer,
    ) {}

    public function project(Model $source): ?TalosLibraryItem
    {
        $projection = $this->projectionFor($source);
        if (! $projection instanceof TalosLibraryProjection) {
            $this->markUnavailable($source);

            return null;
        }

        return DB::transaction(function () use ($projection): TalosLibraryItem {
            $item = TalosLibraryItem::query()->updateOrCreate(
                [
                    'user_id' => $projection->userId,
                    'source_type' => $projection->sourceType,
                    'source_id' => $projection->sourceId,
                ],
                $projection->toAttributes(),
            );
            $this->syncSourceOrigin($item, $projection);

            return $item->refresh();
        }, 3);
    }

    public function markUnavailable(Model $source): void
    {
        $identity = $this->sourceIdentity($source);
        if ($identity === null) {
            return;
        }

        TalosLibraryItem::query()
            ->where('user_id', $identity['user_id'])
            ->where('source_type', $identity['source_type'])
            ->where('source_id', $identity['source_id'])
            ->whereNull('unavailable_at')
            ->update(['unavailable_at' => now(), 'updated_at' => now()]);
    }

    private function projectionFor(Model $source): ?TalosLibraryProjection
    {
        return match (true) {
            $source instanceof TalosFile => $this->fileProjection($source),
            $source instanceof TalosDocument => $this->documentProjection($source),
            $source instanceof TalosRunArtifact => $this->runArtifactProjection($source),
            $source instanceof TalosBrowserArtifact => $this->browserArtifactProjection($source),
            default => null,
        };
    }

    private function fileProjection(TalosFile $file): ?TalosLibraryProjection
    {
        if ((int) $file->user_id < 1 || $file->status !== 'available' || $file->scan_status !== 'clean') {
            return null;
        }

        $metadata = is_array($file->metadata) ? $file->metadata : [];
        $mime = $this->nullableString($file->detected_mime) ?? $this->nullableString($file->mime_type);
        $sourceUrl = $this->sourceUrlFromMetadata($metadata);
        $origin = $this->origin($metadata, $sourceUrl !== null ? 'search' : 'uploaded');
        $kind = $sourceUrl !== null ? 'link' : (str_starts_with((string) $mime, 'image/') ? 'image' : 'file');
        $chunks = $file->chunks()
            ->oldest('sequence')
            ->limit(32)
            ->pluck('content')
            ->filter(static fn (mixed $value): bool => is_string($value))
            ->implode("\n");

        return new TalosLibraryProjection(
            userId: (int) $file->user_id,
            originSessionId: $this->ownedSessionId($metadata['origin_session_id'] ?? $metadata['source_session_id'] ?? null, (int) $file->user_id),
            sourceType: 'file',
            sourceId: (string) $file->id,
            kind: $kind,
            origin: $origin,
            title: $this->boundedTitle($file->original_name, 'File'),
            mimeType: $mime,
            byteSize: max(0, (int) $file->size_bytes),
            checksum: $this->nullableString($file->checksum),
            sourceUrl: $sourceUrl,
            searchText: $this->searchText([(string) $file->original_name, $chunks]),
            trustBoundary: $this->trustBoundary($metadata, 'untrusted_upload'),
            occurredAt: CarbonImmutable::instance($file->created_at ?? now()),
            metadata: array_filter([
                'extension' => $this->nullableString($metadata['extension'] ?? null),
                'source_count' => is_array($metadata['source_links'] ?? null) ? count($metadata['source_links']) : null,
            ], static fn (mixed $value): bool => $value !== null),
        );
    }

    private function documentProjection(TalosDocument $document): ?TalosLibraryProjection
    {
        if ((int) $document->user_id < 1 || $document->status !== 'active') {
            return null;
        }

        $metadata = is_array($document->metadata) ? $document->metadata : [];
        if (($metadata['binary_artifact'] ?? false) === true) {
            return null;
        }
        $sourceUrl = $this->sourceUrlFromMetadata($metadata);
        $isLink = $sourceUrl !== null || in_array($document->document_type, ['web_source', 'link'], true);
        $run = $document->run()->first();
        $originSessionId = $run && (int) $run->user_id === (int) $document->user_id
            ? $this->ownedSessionId($run->session_id, (int) $document->user_id)
            : null;

        return new TalosLibraryProjection(
            userId: (int) $document->user_id,
            originSessionId: $originSessionId,
            sourceType: 'document',
            sourceId: (string) $document->id,
            kind: $isLink ? 'link' : 'file',
            origin: $this->origin($metadata, $isLink ? 'search' : 'generated'),
            title: $this->boundedTitle($document->title, 'Document'),
            mimeType: $this->documentMime((string) $document->format),
            byteSize: strlen((string) $document->content),
            checksum: $this->nullableString($document->content_hash),
            sourceUrl: $sourceUrl,
            searchText: $this->searchText([(string) $document->title, (string) $document->content]),
            trustBoundary: $this->trustBoundary($metadata, 'generated_content'),
            occurredAt: CarbonImmutable::instance($document->created_at ?? now()),
            metadata: [
                'document_type' => (string) $document->document_type,
                'format' => (string) $document->format,
            ],
        );
    }

    private function runArtifactProjection(TalosRunArtifact $artifact): ?TalosLibraryProjection
    {
        if (! in_array((string) $artifact->artifact_type, self::RUN_ARTIFACT_TYPES, true)) {
            return null;
        }

        $run = $artifact->run()->first();
        if (! $run || (int) $run->user_id < 1) {
            return null;
        }

        $metadata = is_array($artifact->metadata) ? $artifact->metadata : [];
        $sourceUrl = $this->canonicalUrl($metadata['source_url'] ?? $metadata['url'] ?? $artifact->uri);
        $isLink = in_array($artifact->artifact_type, ['web_fetch', 'web_search_result'], true) || $sourceUrl !== null;
        $title = $metadata['title'] ?? $metadata['filename'] ?? $metadata['name'] ?? Str::headline((string) $artifact->artifact_type);

        return new TalosLibraryProjection(
            userId: (int) $run->user_id,
            originSessionId: $this->ownedSessionId($run->session_id, (int) $run->user_id),
            sourceType: 'run_artifact',
            sourceId: (string) $artifact->id,
            kind: $isLink ? 'link' : 'file',
            origin: $this->origin($metadata, $isLink ? 'search' : 'generated'),
            title: $this->boundedTitle($title, 'Artifact'),
            mimeType: $this->nullableString($artifact->mime_type),
            byteSize: $this->nonNegativeInteger($metadata['size_bytes'] ?? null),
            checksum: $this->checksum($metadata['sha256'] ?? $metadata['checksum'] ?? null),
            sourceUrl: $sourceUrl,
            searchText: $this->searchText([$title, $metadata['summary'] ?? null, $sourceUrl]),
            trustBoundary: $this->trustBoundary($metadata, 'generated_content'),
            occurredAt: CarbonImmutable::instance($artifact->created_at ?? now()),
            metadata: ['artifact_type' => (string) $artifact->artifact_type],
        );
    }

    private function browserArtifactProjection(TalosBrowserArtifact $artifact): ?TalosLibraryProjection
    {
        if ((int) $artifact->user_id < 1 || $artifact->type !== 'screenshot') {
            return null;
        }

        $session = $artifact->session()->first();
        if (! $session || (int) $session->user_id !== (int) $artifact->user_id) {
            return null;
        }
        $metadata = is_array($artifact->metadata) ? $artifact->metadata : [];
        $title = $metadata['title'] ?? $session->current_title ?? 'Browser screenshot';
        $sourceUrl = $this->canonicalUrl($metadata['url'] ?? $session->current_url);

        return new TalosLibraryProjection(
            userId: (int) $artifact->user_id,
            originSessionId: $this->ownedSessionId($session->talos_session_id, (int) $artifact->user_id),
            sourceType: 'browser_artifact',
            sourceId: (string) $artifact->id,
            kind: 'image',
            origin: 'browser',
            title: $this->boundedTitle($title, 'Browser screenshot'),
            mimeType: $this->nullableString($artifact->mime) ?? 'image/png',
            byteSize: $this->nonNegativeInteger($metadata['size_bytes'] ?? null),
            checksum: $this->checksum($artifact->sha256),
            sourceUrl: $sourceUrl,
            searchText: $this->searchText([$title, $sourceUrl]),
            trustBoundary: $this->nullableString($artifact->trust_boundary) ?? 'untrusted_browser_content',
            occurredAt: CarbonImmutable::instance($artifact->created_at ?? now()),
            metadata: array_filter([
                'width' => $this->nonNegativeInteger($metadata['width'] ?? null),
                'height' => $this->nonNegativeInteger($metadata['height'] ?? null),
                'browser_session_id' => (string) $session->id,
            ], static fn (mixed $value): bool => $value !== null),
        );
    }

    /** @return array{user_id: int, source_type: string, source_id: string}|null */
    private function sourceIdentity(Model $source): ?array
    {
        $userId = match (true) {
            $source instanceof TalosFile, $source instanceof TalosDocument, $source instanceof TalosBrowserArtifact => (int) $source->user_id,
            $source instanceof TalosRunArtifact => (int) ($source->run()->value('user_id') ?? 0),
            default => 0,
        };
        $sourceType = match (true) {
            $source instanceof TalosFile => 'file',
            $source instanceof TalosDocument => 'document',
            $source instanceof TalosRunArtifact => 'run_artifact',
            $source instanceof TalosBrowserArtifact => 'browser_artifact',
            default => null,
        };

        return $userId > 0 && is_string($sourceType) && (string) $source->getKey() !== ''
            ? ['user_id' => $userId, 'source_type' => $sourceType, 'source_id' => (string) $source->getKey()]
            : null;
    }

    private function syncSourceOrigin(TalosLibraryItem $item, TalosLibraryProjection $projection): void
    {
        $query = TalosLibraryItemSession::query()
            ->where('library_item_id', $item->id)
            ->where('binding_type', 'source')
            ->where('binding_id', $projection->sourceId)
            ->where('relation', 'origin');

        if ($projection->originSessionId === null) {
            $query->delete();

            return;
        }

        $query->updateOrCreate(
            [],
            [
                'library_item_id' => $item->id,
                'user_id' => $projection->userId,
                'session_id' => $projection->originSessionId,
                'message_id' => null,
                'relation' => 'origin',
                'binding_type' => 'source',
                'binding_id' => $projection->sourceId,
                'occurred_at' => $projection->occurredAt,
                'metadata' => [],
            ],
        );
    }

    private function origin(array $metadata, string $fallback): string
    {
        $candidate = $this->nullableString($metadata['origin'] ?? null);

        return in_array($candidate, TalosLibraryProjection::ORIGINS, true) ? $candidate : $fallback;
    }

    private function trustBoundary(array $metadata, string $fallback): string
    {
        return $this->boundedString($metadata['trust_boundary'] ?? $metadata['trust_level'] ?? $metadata['trust'] ?? null, 64)
            ?? $fallback;
    }

    private function sourceUrlFromMetadata(array $metadata): ?string
    {
        $direct = $this->canonicalUrl($metadata['source_url'] ?? $metadata['url'] ?? null);
        if ($direct !== null) {
            return $direct;
        }

        $links = $metadata['source_links'] ?? null;
        if (! is_array($links) || ! array_is_list($links)) {
            return null;
        }

        foreach ($links as $link) {
            $candidate = is_array($link) ? ($link['url'] ?? null) : $link;
            $url = $this->canonicalUrl($candidate);
            if ($url !== null) {
                return $url;
            }
        }

        return null;
    }

    private function canonicalUrl(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $value = trim($value);
        if ($value === '' || strlen($value) > 2048 || filter_var($value, FILTER_VALIDATE_URL) === false) {
            return null;
        }
        $parts = parse_url($value);
        if (! is_array($parts)
            || ! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            || ! is_string($parts['host'] ?? null)
            || trim($parts['host']) === ''
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)) {
            return null;
        }

        $url = strtolower((string) $parts['scheme']).'://'.strtolower($parts['host']);
        if (isset($parts['port'])) {
            $url .= ':'.(int) $parts['port'];
        }
        $url .= is_string($parts['path'] ?? null) && $parts['path'] !== '' ? $parts['path'] : '/';
        if (is_string($parts['query'] ?? null) && $parts['query'] !== '') {
            $url .= '?'.$parts['query'];
        }

        return $url;
    }

    private function ownedSessionId(mixed $candidate, int $userId): ?string
    {
        if (! is_string($candidate) || trim($candidate) === '') {
            return null;
        }
        $id = trim($candidate);

        return TalosSession::query()->where('user_id', $userId)->whereKey($id)->exists() ? $id : null;
    }

    /** @param list<mixed> $parts */
    private function searchText(array $parts): string
    {
        $text = implode("\n", array_values(array_filter(
            $parts,
            static fn (mixed $value): bool => is_string($value) && trim($value) !== '',
        )));
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', ' ', strip_tags($text)) ?? '';

        return $this->searchNormalizer->normalize($text);
    }

    private function boundedTitle(mixed $value, string $fallback): string
    {
        return $this->boundedString($value, 255) ?? $fallback;
    }

    private function boundedString(mixed $value, int $max): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $value = trim($value);

        return $value === '' ? null : mb_substr($value, 0, $max);
    }

    private function nullableString(mixed $value): ?string
    {
        return $this->boundedString($value, 255);
    }

    private function nonNegativeInteger(mixed $value): ?int
    {
        return is_int($value) && $value >= 0 ? $value : null;
    }

    private function checksum(mixed $value): ?string
    {
        $value = $this->boundedString($value, 128);

        return $value === null ? null : preg_replace('/^sha256:/', '', $value);
    }

    private function documentMime(string $format): string
    {
        return match (strtolower($format)) {
            'markdown', 'md' => 'text/markdown',
            'html' => 'text/html',
            'json' => 'application/json',
            default => 'text/plain',
        };
    }
}
