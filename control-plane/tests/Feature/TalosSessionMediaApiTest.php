<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosLibraryItem;
use App\Models\TalosLibraryItemSession;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosSessionMediaApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_session_media_is_owned_deduplicated_ordered_and_filterable(): void
    {
        $owner = $this->authenticateTalosUser();
        $foreign = User::factory()->create();
        $session = $this->makeSession($owner, 'Media chat');
        $otherSession = $this->makeSession($owner, 'Other chat');
        $foreignSession = $this->makeSession($foreign, 'Foreign chat');
        $older = now()->subMinute();
        $newer = now();

        $image = $this->item($owner, ['kind' => 'image', 'title' => 'Screenshot', 'occurred_at' => $newer]);
        $file = $this->item($owner, ['kind' => 'file', 'title' => 'Brief', 'occurred_at' => $older]);
        $other = $this->item($owner, ['kind' => 'link', 'title' => 'Other source']);
        $hidden = $this->item($owner, ['kind' => 'image', 'title' => 'Hidden', 'hidden_at' => now()]);
        $unavailable = $this->item($owner, ['kind' => 'image', 'title' => 'Unavailable', 'unavailable_at' => now()]);

        $this->link($owner, $session, $image, 'message', 'message-1', $newer);
        $this->link($owner, $session, $image, 'run', 'run-1', $newer);
        $this->link($owner, $session, $file, 'message', 'message-2', $older);
        $this->link($owner, $otherSession, $other, 'message', 'message-3', $newer);
        $this->link($owner, $session, $hidden, 'message', 'message-4', $newer);
        $this->link($owner, $session, $unavailable, 'message', 'message-5', $newer);

        $this->getJson('/api/talos/sessions/'.$session->id.'/media')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $image->id)
            ->assertJsonPath('data.1.id', $file->id)
            ->assertJsonPath('meta.count', 2);

        $this->getJson('/api/talos/sessions/'.$session->id.'/media?kind=image')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $image->id);

        $this->getJson('/api/talos/sessions/'.$foreignSession->id.'/media')->assertNotFound();
    }

    public function test_session_media_rejects_invalid_filters_and_never_returns_foreign_items(): void
    {
        $owner = $this->authenticateTalosUser();
        $foreign = User::factory()->create();
        $session = $this->makeSession($owner, 'Owned chat');
        $foreignItem = $this->item($foreign, ['kind' => 'image']);

        TalosLibraryItemSession::query()->create([
            'user_id' => $foreign->id,
            'library_item_id' => $foreignItem->id,
            'session_id' => $session->id,
            'message_id' => null,
            'relation' => 'attachment',
            'binding_type' => 'message',
            'binding_id' => 'foreign-binding',
            'occurred_at' => now(),
            'metadata' => [],
        ]);

        $this->getJson('/api/talos/sessions/'.$session->id.'/media')
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->getJson('/api/talos/sessions/'.$session->id.'/media?kind=video')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('kind');
    }

    /** @param array<string, mixed> $overrides */
    private function item(User $user, array $overrides = []): TalosLibraryItem
    {
        $item = new TalosLibraryItem;
        $item->forceFill([
            'user_id' => $user->id,
            'source_type' => 'document',
            'source_id' => fake()->uuid(),
            'kind' => 'file',
            'origin' => 'generated',
            'title' => 'Media item',
            'mime_type' => 'text/plain',
            'byte_size' => 12,
            'checksum' => hash('sha256', fake()->uuid()),
            'source_url' => null,
            'search_text' => 'media item',
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

    private function link(
        User $user,
        TalosSession $session,
        TalosLibraryItem $item,
        string $bindingType,
        string $bindingId,
        \DateTimeInterface $occurredAt,
    ): void {
        TalosLibraryItemSession::query()->create([
            'user_id' => $user->id,
            'library_item_id' => $item->id,
            'session_id' => $session->id,
            'message_id' => null,
            'relation' => 'attachment',
            'binding_type' => $bindingType,
            'binding_id' => $bindingId,
            'occurred_at' => $occurredAt,
            'metadata' => [],
        ]);
    }
}
