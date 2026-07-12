<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Browser\TalosBrowserFollowUpResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosBrowserFollowUpResolverTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_resolves_consecutive_retry_turns_to_the_nearest_previous_single_url(): void
    {
        $session = $this->chatSession();
        $url = 'https://example.com/vehicle?id=42&source=search-results';
        $source = $session->messages()->create(['role' => 'user', 'content' => "Apri {$url} e dimmi cosa vedi."]);
        $session->messages()->create(['role' => 'assistant', 'content' => 'Browse non era ancora attivo.']);
        $session->messages()->create(['role' => 'user', 'content' => 'riprova']);
        $session->messages()->create(['role' => 'system', 'content' => 'TALOS_BROWSER_COMMAND_MALFORMED']);
        $current = $session->messages()->create(['role' => 'user', 'content' => 'riprova ora']);

        $resolved = app(TalosBrowserFollowUpResolver::class)->resolveNavigation('riprova ora', $session, $current->id);

        $this->assertSame($url, $resolved['url'] ?? null);
        $this->assertSame('retry_follow_up', $resolved['source'] ?? null);
        $this->assertSame($source->id, $resolved['source_message_id'] ?? null);
    }

    public function test_it_never_crosses_an_unrelated_user_turn_to_revive_a_stale_url(): void
    {
        $session = $this->chatSession();
        $session->messages()->create(['role' => 'user', 'content' => 'Apri https://example.com/old']);
        $session->messages()->create(['role' => 'assistant', 'content' => 'Pagina letta.']);
        $session->messages()->create(['role' => 'user', 'content' => 'Parliamo invece del preventivo.']);
        $session->messages()->create(['role' => 'assistant', 'content' => 'Va bene.']);
        $current = $session->messages()->create(['role' => 'user', 'content' => 'riprova']);

        $this->assertNull(app(TalosBrowserFollowUpResolver::class)->resolveNavigation('riprova', $session, $current->id));
    }

    public function test_it_rejects_an_ambiguous_previous_turn_with_multiple_urls(): void
    {
        $session = $this->chatSession();
        $session->messages()->create([
            'role' => 'user',
            'content' => 'Confronta https://example.com/one e https://example.com/two',
        ]);
        $session->messages()->create(['role' => 'assistant', 'content' => 'Browse non era attivo.']);
        $current = $session->messages()->create(['role' => 'user', 'content' => 'try again']);

        $this->assertNull(app(TalosBrowserFollowUpResolver::class)->resolveNavigation('try again', $session, $current->id));
    }

    public function test_retry_follow_up_requires_the_current_persisted_user_turn_binding(): void
    {
        $session = $this->chatSession();
        $session->messages()->create(['role' => 'user', 'content' => 'Apri https://example.com/private?token=secret']);
        $session->messages()->create(['role' => 'assistant', 'content' => 'Browse non era attivo.']);
        $session->messages()->create(['role' => 'user', 'content' => 'riprova']);

        $this->assertNull(app(TalosBrowserFollowUpResolver::class)->resolveNavigation('riprova', $session));
    }

    public function test_bound_retry_never_selects_a_newer_concurrent_url_turn(): void
    {
        $session = $this->chatSession();
        $expected = 'https://example.com/requested';
        $session->messages()->create(['role' => 'user', 'content' => "Apri {$expected}"]);
        $session->messages()->create(['role' => 'assistant', 'content' => 'Browse non era attivo.']);
        $current = $session->messages()->create(['role' => 'user', 'content' => 'riprova']);
        $session->messages()->create(['role' => 'user', 'content' => 'Apri https://example.com/concurrent']);

        $resolved = app(TalosBrowserFollowUpResolver::class)->resolveNavigation('riprova', $session, $current->id);

        $this->assertSame($expected, $resolved['url'] ?? null);
    }

    public function test_bound_retry_rejects_a_current_turn_from_another_session(): void
    {
        $session = $this->chatSession();
        $session->messages()->create(['role' => 'user', 'content' => 'Apri https://example.com/requested']);
        $foreign = $this->chatSession()->messages()->create(['role' => 'user', 'content' => 'riprova']);

        $this->assertNull(app(TalosBrowserFollowUpResolver::class)->resolveNavigation('riprova', $session, $foreign->id));
    }

    public function test_current_message_url_takes_precedence_without_history_lookup(): void
    {
        $url = 'https://example.com/current?mode=browser&safe=1';

        $this->assertSame([
            'url' => $url,
            'source' => 'current_message',
            'source_message_id' => null,
        ], app(TalosBrowserFollowUpResolver::class)->resolveNavigation("Apri {$url}", null));
    }

    private function chatSession(): TalosSession
    {
        $user = User::factory()->create();

        return TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Browser follow-up resolver',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
    }
}
