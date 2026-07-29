<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosFile;
use App\Models\TalosLibraryItem;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

final class TalosLibraryBackfillCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_reports_projected_changes_without_mutating_database(): void
    {
        $user = User::factory()->create();
        $this->file($user, 'dry-run.txt');

        self::assertSame(0, Artisan::call('talos:library-backfill', ['--dry-run' => true]));
        $report = $this->report();

        self::assertTrue($report['dry_run']);
        self::assertSame(1, $report['scanned']);
        self::assertSame(1, $report['created']);
        self::assertSame(0, $report['bindings_scanned']);
        self::assertSame(0, $report['bindings_synced']);
        self::assertSame(0, $report['failed']);
        self::assertSame(0, TalosLibraryItem::query()->count());
    }

    public function test_backfill_restores_historical_message_and_run_attachment_bindings(): void
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Historical attachments',
            'mode' => 'verified_execution',
            'persistence_mode' => 'persistent',
            'surface' => 'chat',
            'metadata' => [],
        ]);
        $file = $this->file($user, 'historical.txt');
        $message = TalosMessage::withoutEvents(fn (): TalosMessage => TalosMessage::query()->create([
            'session_id' => $session->id,
            'role' => 'user',
            'content' => 'Use the historical file.',
            'metadata' => ['attachments' => [['file_id' => $file->id]]],
        ]));
        $run = TalosRun::withoutEvents(fn (): TalosRun => TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'historical run'),
            'prompt' => 'Use the historical file.',
            'provider' => 'test',
            'model' => 'test-model',
            'metadata' => ['used_attachments' => [['file_id' => $file->id]]],
        ]));

        self::assertSame(0, Artisan::call('talos:library-backfill', ['--dry-run' => true]));
        $dryRun = $this->report();
        self::assertSame(2, $dryRun['bindings_scanned']);
        self::assertSame(2, $dryRun['bindings_synced']);
        self::assertDatabaseCount('talos_library_items', 0);
        self::assertDatabaseCount('talos_library_item_sessions', 0);

        self::assertSame(0, Artisan::call('talos:library-backfill'));
        $first = $this->report();
        self::assertSame(2, $first['bindings_scanned']);
        self::assertSame(2, $first['bindings_synced']);
        $item = TalosLibraryItem::query()->where('source_id', $file->id)->firstOrFail();
        self::assertDatabaseHas('talos_library_item_sessions', [
            'library_item_id' => $item->id,
            'binding_type' => 'message',
            'binding_id' => $message->id,
            'relation' => 'attachment',
        ]);
        self::assertDatabaseHas('talos_library_item_sessions', [
            'library_item_id' => $item->id,
            'binding_type' => 'run',
            'binding_id' => $run->id,
            'relation' => 'attachment',
        ]);

        self::assertSame(0, Artisan::call('talos:library-backfill'));
        $repeat = $this->report();
        self::assertSame(2, $repeat['bindings_scanned']);
        self::assertSame(2, $repeat['bindings_synced']);
        self::assertDatabaseCount('talos_library_item_sessions', 2);
    }

    public function test_mutating_backfill_is_repeatable_updates_sources_and_preserves_user_tombstones(): void
    {
        $user = User::factory()->create();
        $file = $this->file($user, 'first-name.txt');

        self::assertSame(0, Artisan::call('talos:library-backfill'));
        $first = $this->report();
        self::assertFalse($first['dry_run']);
        self::assertSame(1, $first['created']);
        $item = TalosLibraryItem::query()->where('source_id', $file->id)->firstOrFail();
        $item->forceFill(['hidden_at' => now()])->saveQuietly();

        $renamed = "CAF\u{00C9} \u{FF21}\u{FF36}\u{FF2D} \u{2615}\u{FE0F}.txt";
        $file->forceFill(['original_name' => $renamed])->saveQuietly();
        self::assertSame(0, Artisan::call('talos:library-backfill'));
        $updated = $this->report();
        self::assertSame(1, $updated['updated']);
        self::assertSame($renamed, $item->refresh()->title);
        self::assertSame("caf\u{00E9} avm \u{2615}.txt", $item->search_text);
        self::assertNotNull($item->hidden_at);

        self::assertSame(0, Artisan::call('talos:library-backfill'));
        $repeat = $this->report();
        self::assertSame(0, $repeat['updated']);
        self::assertSame(1, $repeat['skipped']);

        $file->forceFill(['status' => 'rejected'])->saveQuietly();
        self::assertSame(0, Artisan::call('talos:library-backfill'));
        $unavailable = $this->report();
        self::assertSame(1, $unavailable['unavailable']);
        self::assertNotNull($item->refresh()->hidden_at);
        self::assertNotNull($item->unavailable_at);
    }

    /** @return array{dry_run: bool, scanned: int, created: int, updated: int, skipped: int, unavailable: int, bindings_scanned: int, bindings_synced: int, failed: int} */
    private function report(): array
    {
        $lines = array_values(array_filter(
            preg_split('/\R/', trim(Artisan::output())) ?: [],
            static fn (string $line): bool => trim($line) !== '',
        ));
        $decoded = json_decode((string) end($lines), true, flags: JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }

    private function file(User $user, string $name): TalosFile
    {
        return TalosFile::withoutEvents(fn (): TalosFile => TalosFile::query()->create([
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
        ]));
    }
}
