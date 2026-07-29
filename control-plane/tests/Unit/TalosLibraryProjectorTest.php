<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosDocument;
use App\Models\TalosFile;
use App\Models\TalosLibraryItem;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Library\TalosLibraryProjector;
use App\Services\Library\TalosLibrarySessionBinder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

final class TalosLibraryProjectorTest extends TestCase
{
    use RefreshDatabase;

    public function test_migration_creates_federated_items_and_many_chat_bindings(): void
    {
        self::assertTrue(Schema::hasColumns('talos_library_items', [
            'id',
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
        ]));
        self::assertTrue(Schema::hasColumns('talos_library_item_sessions', [
            'id',
            'user_id',
            'library_item_id',
            'session_id',
            'message_id',
            'relation',
            'binding_type',
            'binding_id',
            'occurred_at',
            'metadata',
        ]));
    }

    public function test_projector_classifies_all_supported_sources_and_excludes_raw_browser_evidence(): void
    {
        $user = User::factory()->create();
        $chat = $this->makeSession($user, 'Source chat');
        $run = TalosRun::withoutEvents(fn (): TalosRun => TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $chat->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
        ]));
        $browser = TalosBrowserSession::withoutEvents(fn (): TalosBrowserSession => TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'worker-library-projector',
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => 'https://example.com/catalog',
            'current_title' => 'Example catalog',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'device_scale_factor' => 1,
            'capabilities' => ['screenshots' => true],
            'policy' => [],
            'worker_state_version' => 1,
            'expires_at' => now()->addHour(),
        ]));

        $file = $this->file($user, [
            'original_name' => 'photo.png',
            'mime_type' => 'image/png',
            'detected_mime' => 'image/png',
        ]);
        $document = TalosDocument::withoutEvents(fn (): TalosDocument => TalosDocument::query()->create([
            'user_id' => $user->id,
            'run_id' => $run->id,
            'title' => 'Decision record',
            'document_type' => 'document',
            'format' => 'markdown',
            'status' => 'active',
            'content' => '# Decision record',
            'content_hash' => hash('sha256', '# Decision record'),
            'metadata' => ['origin' => 'generated'],
        ]));
        $artifact = TalosRunArtifact::withoutEvents(fn (): TalosRunArtifact => TalosRunArtifact::query()->create([
            'run_id' => $run->id,
            'artifact_type' => 'research_report',
            'uri' => 'talos://research-reports/report-1',
            'mime_type' => 'application/json',
            'metadata' => ['title' => 'Research report'],
        ]));
        $screenshot = TalosBrowserArtifact::withoutEvents(fn (): TalosBrowserArtifact => TalosBrowserArtifact::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $user->id,
            'source_state_version' => 0,
            'state_version' => 1,
            'trust_boundary' => 'untrusted_browser_content',
            'type' => 'screenshot',
            'mime' => 'image/png',
            'storage_disk' => 'local',
            'storage_path' => 'talos/browser/screenshot.png',
            'sha256' => hash('sha256', 'screenshot'),
            'metadata' => ['width' => 1280, 'height' => 800],
        ]));
        $snapshot = TalosBrowserArtifact::withoutEvents(fn (): TalosBrowserArtifact => TalosBrowserArtifact::query()->create([
            'browser_session_id' => $browser->id,
            'user_id' => $user->id,
            'source_state_version' => 0,
            'state_version' => 1,
            'trust_boundary' => 'untrusted_browser_content',
            'type' => 'snapshot',
            'mime' => 'application/json',
            'storage_disk' => 'local',
            'storage_path' => 'talos/browser/snapshot.json',
            'sha256' => hash('sha256', 'snapshot'),
            'metadata' => ['text_digest' => 'raw evidence'],
        ]));
        $duplicateBrowserRunArtifact = TalosRunArtifact::withoutEvents(fn (): TalosRunArtifact => TalosRunArtifact::query()->create([
            'run_id' => $run->id,
            'artifact_type' => 'browser_screenshot',
            'uri' => 'talos-browser-artifact://'.$screenshot->id,
            'mime_type' => 'image/png',
            'metadata' => ['browser_artifact_id' => $screenshot->id],
        ]));

        $projector = $this->app->make(TalosLibraryProjector::class);
        $projector->project($file);
        $projector->project($document);
        $projector->project($artifact);
        $projector->project($screenshot);
        self::assertNull($projector->project($snapshot));
        self::assertNull($projector->project($duplicateBrowserRunArtifact));

        self::assertSame(4, TalosLibraryItem::query()->count());
        self::assertDatabaseHas('talos_library_items', [
            'source_type' => 'file',
            'source_id' => $file->id,
            'kind' => 'image',
            'origin' => 'uploaded',
        ]);
        self::assertDatabaseHas('talos_library_items', [
            'source_type' => 'document',
            'source_id' => $document->id,
            'kind' => 'file',
            'origin' => 'generated',
        ]);
        self::assertDatabaseHas('talos_library_items', [
            'source_type' => 'run_artifact',
            'source_id' => $artifact->id,
            'kind' => 'file',
            'origin' => 'generated',
        ]);
        self::assertDatabaseHas('talos_library_items', [
            'source_type' => 'browser_artifact',
            'source_id' => $screenshot->id,
            'kind' => 'image',
            'origin' => 'browser',
        ]);
        self::assertDatabaseMissing('talos_library_items', ['source_id' => $snapshot->id]);
        self::assertDatabaseMissing('talos_library_items', ['source_id' => $duplicateBrowserRunArtifact->id]);
    }

    public function test_projection_is_idempotent_preserves_user_tombstone_and_never_copies_storage_paths_to_public_metadata(): void
    {
        $user = User::factory()->create();
        $file = $this->file($user, ['metadata' => ['origin' => 'generated', 'storage_path' => 'private/secret.txt']]);
        $projector = $this->app->make(TalosLibraryProjector::class);

        $first = $projector->project($file);
        self::assertNotNull($first);
        $first->forceFill(['hidden_at' => now()])->save();
        $file->forceFill(['original_name' => 'renamed.txt'])->saveQuietly();
        $second = $projector->project($file->refresh());

        self::assertNotNull($second);
        self::assertSame($first->id, $second->id);
        self::assertNotNull($second->hidden_at);
        self::assertSame('renamed.txt', $second->title);
        self::assertSame(1, TalosLibraryItem::query()->count());
        self::assertArrayNotHasKey('storage_path', $second->metadata ?? []);
        self::assertStringNotContainsString('private/secret.txt', json_encode($second->toApiArray(), JSON_THROW_ON_ERROR));
    }

    public function test_ineligible_file_marks_existing_projection_unavailable_without_removing_user_tombstone(): void
    {
        $user = User::factory()->create();
        $file = $this->file($user);
        $projector = $this->app->make(TalosLibraryProjector::class);
        $item = $projector->project($file);
        self::assertNotNull($item);
        $item->forceFill(['hidden_at' => now()])->save();

        $file->forceFill(['status' => 'rejected'])->saveQuietly();
        self::assertNull($projector->project($file->refresh()));

        $item->refresh();
        self::assertNotNull($item->hidden_at);
        self::assertNotNull($item->unavailable_at);
    }

    public function test_one_file_binds_to_multiple_chats_without_duplicate_library_items(): void
    {
        $user = User::factory()->create();
        $firstChat = $this->makeSession($user, 'First chat');
        $secondChat = $this->makeSession($user, 'Second chat');
        $file = $this->file($user);
        $projector = $this->app->make(TalosLibraryProjector::class);
        $item = $projector->project($file);
        self::assertNotNull($item);

        $firstMessage = TalosMessage::withoutEvents(fn (): TalosMessage => TalosMessage::query()->create([
            'session_id' => $firstChat->id,
            'role' => 'user',
            'content' => 'Use this file.',
            'metadata' => ['attachments' => [['file_id' => $file->id, 'name' => $file->original_name]]],
        ]));
        $secondMessage = TalosMessage::withoutEvents(fn (): TalosMessage => TalosMessage::query()->create([
            'session_id' => $secondChat->id,
            'role' => 'user',
            'content' => 'Reuse this file.',
            'metadata' => ['attachments' => [['file_id' => $file->id, 'name' => $file->original_name]]],
        ]));

        $binder = $this->app->make(TalosLibrarySessionBinder::class);
        $binder->syncMessage($firstMessage);
        $binder->syncMessage($secondMessage);
        $binder->syncMessage($secondMessage->refresh());

        self::assertSame(1, TalosLibraryItem::query()->count());
        self::assertSame(2, $item->sessionLinks()->count());
        self::assertSame(2, $item->sessionLinks()->distinct()->count('session_id'));
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

    /** @param array<string, mixed> $overrides */
    private function file(User $user, array $overrides = []): TalosFile
    {
        return TalosFile::withoutEvents(fn (): TalosFile => TalosFile::query()->create([
            'user_id' => $user->id,
            'original_name' => 'notes.txt',
            'mime_type' => 'text/plain',
            'detected_mime' => 'text/plain',
            'size_bytes' => 5,
            'checksum' => hash('sha256', 'notes'),
            'status' => 'available',
            'scan_status' => 'clean',
            'extraction_status' => 'complete',
            'storage_disk' => 'local',
            'storage_path' => 'ingested/notes.txt',
            'metadata' => [],
            ...$overrides,
        ]));
    }
}
