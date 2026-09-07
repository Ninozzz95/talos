<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosFile;
use App\Models\TalosLibraryItem;
use App\Models\TalosLibraryItemSession;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Library\TalosLibraryCursor;
use App\Services\Library\TalosLibraryProjector;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosLibraryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_is_owner_scoped_filters_searches_and_omits_private_projection_fields(): void
    {
        $owner = $this->authenticateTalosUser();
        $foreign = User::factory()->create();
        $chat = $this->makeSession($owner, 'Research chat');

        $expected = $this->item($owner, [
            'kind' => 'link',
            'origin' => 'search',
            'title' => 'Quarterly research report',
            'source_url' => 'https://example.com/report',
            'search_text' => 'quarterly research report automotive',
            'metadata' => ['storage_path' => 'private/secret.json', 'summary' => 'Public summary'],
        ]);
        TalosLibraryItemSession::query()->create([
            'user_id' => $owner->id,
            'library_item_id' => $expected->id,
            'session_id' => $chat->id,
            'message_id' => null,
            'relation' => 'origin',
            'binding_type' => 'source',
            'binding_id' => $expected->source_id,
            'occurred_at' => now(),
            'metadata' => [],
        ]);
        $this->item($owner, ['kind' => 'image', 'title' => 'Unrelated screenshot']);
        $this->item($owner, ['title' => 'Hidden result', 'hidden_at' => now()]);
        $this->item($owner, ['title' => 'Unavailable result', 'unavailable_at' => now()]);
        $this->item($foreign, ['kind' => 'link', 'origin' => 'search', 'title' => 'Quarterly research report']);

        $response = $this->getJson('/api/talos/library?kind=link&origin=search&search=%20quarterly%20%20report%20&limit=20')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $expected->id)
            ->assertJsonPath('data.0.backlinks.0.session_id', $chat->id)
            ->assertJsonPath('data.0.backlinks.0.title', 'Research chat')
            ->assertJsonPath('data.0.metadata.summary', 'Public summary')
            ->assertJsonPath('meta.has_more', false)
            ->assertJsonPath('meta.next_cursor', null);

        $payload = $response->json();
        self::assertArrayNotHasKey('search_text', $payload['data'][0]);
        self::assertArrayNotHasKey('storage_path', $payload['data'][0]['metadata']);
        self::assertStringNotContainsString('private/secret.json', $response->getContent());
    }

    public function test_cursor_is_stable_for_duplicate_timestamps_and_cannot_cross_owner_or_filter_scope(): void
    {
        $owner = $this->authenticateTalosUser();
        $other = User::factory()->create();
        $occurredAt = now()->startOfSecond();

        foreach ([1, 2, 3] as $suffix) {
            $this->item($owner, [
                'id' => sprintf('00000000-0000-7000-8000-%012d', $suffix),
                'kind' => 'file',
                'title' => 'Cursor '.$suffix,
                'occurred_at' => $occurredAt,
            ]);
        }

        $first = $this->getJson('/api/talos/library?kind=file&limit=2')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.title', 'Cursor 3')
            ->assertJsonPath('data.1.title', 'Cursor 2')
            ->assertJsonPath('meta.has_more', true);
        $cursor = $first->json('meta.next_cursor');
        self::assertIsString($cursor);

        $this->getJson('/api/talos/library?kind=file&limit=2&cursor='.rawurlencode($cursor))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Cursor 1')
            ->assertJsonPath('meta.has_more', false);

        $this->getJson('/api/talos/library?kind=image&limit=2&cursor='.rawurlencode($cursor))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cursor');

        $foreignCursor = $this->app->make(TalosLibraryCursor::class)->encode(
            (int) $other->id,
            ['kind' => 'file', 'origin' => null, 'search' => null, 'limit' => 2],
            $occurredAt,
            '00000000-0000-7000-8000-000000000002',
        );
        $this->getJson('/api/talos/library?kind=file&limit=2&cursor='.rawurlencode($foreignCursor))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cursor');
    }

    public function test_empty_metadata_is_serialized_as_a_json_object(): void
    {
        $owner = $this->authenticateTalosUser();
        $this->item($owner, ['metadata' => []]);

        $response = $this->getJson('/api/talos/library')
            ->assertOk()
            ->assertJsonCount(1, 'data');
        $payload = json_decode($response->getContent(), false, flags: JSON_THROW_ON_ERROR);

        self::assertIsObject($payload);
        self::assertIsArray($payload->data);
        self::assertCount(1, $payload->data);
        self::assertIsObject($payload->data[0]);
        self::assertIsObject($payload->data[0]->metadata);
    }

    public function test_search_matches_mobile_unicode_normalization_contract(): void
    {
        $owner = $this->authenticateTalosUser();
        $filename = "CAF\u{00C9} \u{FF21}\u{FF36}\u{FF2D} \u{2615}\u{FE0F}.txt";
        $file = TalosFile::withoutEvents(fn (): TalosFile => TalosFile::query()->create([
            'user_id' => $owner->id,
            'original_name' => $filename,
            'mime_type' => 'text/plain',
            'detected_mime' => 'text/plain',
            'size_bytes' => 8,
            'checksum' => hash('sha256', 'unicode'),
            'status' => 'available',
            'scan_status' => 'clean',
            'extraction_status' => 'complete',
            'storage_disk' => 'local',
            'storage_path' => 'ingested/unicode.txt',
            'metadata' => [],
        ]));
        $projected = $this->app->make(TalosLibraryProjector::class)->project($file);
        self::assertNotNull($projected);

        $query = "cafe\u{0301} avm \u{2615}";
        $this->getJson('/api/talos/library?search='.rawurlencode($query))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $projected->id);
    }

    public function test_remove_from_library_is_bounded_owner_scoped_and_never_deletes_source(): void
    {
        $owner = $this->authenticateTalosUser();
        $foreign = User::factory()->create();
        $file = TalosFile::withoutEvents(fn (): TalosFile => TalosFile::query()->create([
            'user_id' => $owner->id,
            'original_name' => 'retained.txt',
            'mime_type' => 'text/plain',
            'detected_mime' => 'text/plain',
            'size_bytes' => 8,
            'checksum' => hash('sha256', 'retained'),
            'status' => 'available',
            'scan_status' => 'clean',
            'extraction_status' => 'complete',
            'storage_disk' => 'local',
            'storage_path' => 'ingested/retained.txt',
            'metadata' => [],
        ]));
        $owned = $this->app->make(TalosLibraryProjector::class)->project($file);
        self::assertNotNull($owned);
        $foreignItem = $this->item($foreign);

        $this->deleteJson('/api/talos/library', ['ids' => [$owned->id, $foreignItem->id]])
            ->assertOk()
            ->assertJsonPath('data.removed_count', 1);

        self::assertNotNull($owned->refresh()->hidden_at);
        self::assertNull($foreignItem->refresh()->hidden_at);
        self::assertDatabaseHas('talos_files', ['id' => $file->id]);
        $this->getJson('/api/talos/library')->assertOk()->assertJsonCount(0, 'data');

        $tooManyIds = array_map(
            static fn (int $index): string => sprintf('00000000-0000-7000-8000-%012d', $index),
            range(1, 101),
        );
        $this->deleteJson('/api/talos/library', ['ids' => $tooManyIds])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ids');
    }

    /** @param array<string, mixed> $overrides */
    private function item(User $user, array $overrides = []): TalosLibraryItem
    {
        $item = new TalosLibraryItem;
        $item->forceFill([
            'user_id' => $user->id,
            'origin_session_id' => null,
            'source_type' => 'document',
            'source_id' => fake()->uuid(),
            'kind' => 'file',
            'origin' => 'generated',
            'title' => 'Library item',
            'mime_type' => 'text/plain',
            'byte_size' => 32,
            'checksum' => hash('sha256', fake()->uuid()),
            'source_url' => null,
            'search_text' => 'library item',
            'trust_boundary' => 'generated_content',
            'occurred_at' => now(),
            'metadata' => [],
            'hidden_at' => null,
            'unavailable_at' => null,
            ...$overrides,
        ]);
        $item->saveQuietly();

        return $item;
    }

    private function makeSession(User $user, string $title): TalosSession
    {
        return TalosSession::withoutEvents(fn (): TalosSession => TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => $title,
            'mode' => 'verified_execution',
            'persistence_mode' => 'persistent',
            'surface' => 'chat',
            'metadata' => [],
        ]));
    }
}
