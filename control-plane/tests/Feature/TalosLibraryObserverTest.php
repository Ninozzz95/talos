<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosFile;
use App\Models\TalosLibraryItem;
use App\Models\TalosMessage;
use App\Models\TalosSession;
use App\Models\User;
use App\Observers\TalosLibraryChatReferenceObserver;
use App\Observers\TalosLibrarySourceObserver;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

final class TalosLibraryObserverTest extends TestCase
{
    use DatabaseMigrations;

    public function test_source_projection_runs_only_after_commit_and_rollback_never_projects_source(): void
    {
        self::assertTrue(is_subclass_of(TalosLibrarySourceObserver::class, ShouldHandleEventsAfterCommit::class));

        $user = User::factory()->create();
        $committed = DB::transaction(fn (): TalosFile => $this->file($user, 'committed.txt'));

        self::assertDatabaseHas('talos_library_items', [
            'user_id' => $user->id,
            'source_type' => 'file',
            'source_id' => $committed->id,
        ]);

        $rolledBackId = null;
        try {
            DB::transaction(function () use ($user, &$rolledBackId): void {
                $rolledBackId = $this->file($user, 'rolled-back.txt')->id;
                self::assertDatabaseMissing('talos_library_items', ['source_id' => $rolledBackId]);

                throw new RuntimeException('rollback sentinel');
            });
        } catch (RuntimeException $exception) {
            self::assertSame('rollback sentinel', $exception->getMessage());
        }

        self::assertNotNull($rolledBackId);
        self::assertDatabaseMissing('talos_files', ['id' => $rolledBackId]);
        self::assertDatabaseMissing('talos_library_items', ['source_id' => $rolledBackId]);
    }

    public function test_committed_message_attachment_creates_backlink_and_metadata_replacement_removes_stale_backlink(): void
    {
        self::assertTrue(is_subclass_of(TalosLibraryChatReferenceObserver::class, ShouldHandleEventsAfterCommit::class));

        $user = User::factory()->create();
        $session = $this->makeSession($user, 'Attachment chat');
        $first = $this->file($user, 'first.txt');
        $second = $this->file($user, 'second.txt');
        $firstItem = TalosLibraryItem::query()->where('source_id', $first->id)->firstOrFail();
        $secondItem = TalosLibraryItem::query()->where('source_id', $second->id)->firstOrFail();

        $message = TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Use the first file.',
            'metadata' => ['attachments' => [['file_id' => $first->id]]],
        ]);

        self::assertDatabaseHas('talos_library_item_sessions', [
            'library_item_id' => $firstItem->id,
            'session_id' => $session->id,
            'binding_type' => 'message',
            'binding_id' => $message->id,
            'relation' => 'attachment',
        ]);

        $message->update([
            'metadata' => ['used_attachments' => [['file_id' => $second->id]]],
        ]);

        self::assertDatabaseMissing('talos_library_item_sessions', [
            'library_item_id' => $firstItem->id,
            'binding_type' => 'message',
            'binding_id' => $message->id,
        ]);
        self::assertDatabaseHas('talos_library_item_sessions', [
            'library_item_id' => $secondItem->id,
            'session_id' => $session->id,
            'binding_type' => 'message',
            'binding_id' => $message->id,
        ]);
    }

    public function test_deleted_source_is_marked_unavailable_without_deleting_projection_or_user_tombstone(): void
    {
        $user = User::factory()->create();
        $file = $this->file($user, 'retained.txt');
        $item = TalosLibraryItem::query()->where('source_id', $file->id)->firstOrFail();
        $item->forceFill(['hidden_at' => now()])->save();

        $file->delete();

        $item->refresh();
        self::assertNotNull($item->hidden_at);
        self::assertNotNull($item->unavailable_at);
        self::assertDatabaseHas('talos_library_items', ['id' => $item->id]);
    }

    private function file(User $user, string $name): TalosFile
    {
        return TalosFile::query()->create([
            'user_id' => $user->id,
            'original_name' => $name,
            'mime_type' => 'text/plain',
            'detected_mime' => 'text/plain',
            'size_bytes' => strlen($name),
            'checksum' => hash('sha256', $name),
            'status' => 'available',
            'scan_status' => 'clean',
            'extraction_status' => 'complete',
            'storage_disk' => 'local',
            'storage_path' => 'ingested/'.$name,
            'metadata' => [],
        ]);
    }

    private function makeSession(User $user, string $title): TalosSession
    {
        return TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => $title,
            'mode' => 'verified_execution',
            'persistence_mode' => 'persistent',
            'surface' => 'chat',
            'metadata' => [],
        ]);
    }
}
