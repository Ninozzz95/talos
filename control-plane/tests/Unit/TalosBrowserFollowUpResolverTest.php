<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Security\PublicHttpUrlPolicy;
use App\Services\Talos\Browser\TalosBrowserFollowUpDecision;
use App\Services\Talos\Browser\TalosBrowserFollowUpResolver;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use App\Services\Talos\Browser\TalosBrowserUrlIntentResolver;
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

    public function test_container_resolved_follow_up_honors_only_the_exact_human_journey_fixture_origin(): void
    {
        config(['services.talos.browser.test_fixture_origin' => 'http://127.0.0.1:43125']);
        $this->app->forgetInstance(TalosBrowserPolicy::class);
        $this->app->forgetInstance(TalosBrowserUrlIntentResolver::class);
        $this->app->forgetInstance(TalosBrowserFollowUpResolver::class);

        $resolver = $this->app->make(TalosBrowserFollowUpResolver::class);
        $allowed = $resolver->resolve('Apri http://127.0.0.1:43125/catalog e dimmi cosa vedi', null);
        $blocked = $resolver->resolve('Apri http://127.0.0.1:43126/catalog e dimmi cosa vedi', null);

        $this->assertTrue($allowed->isExecutable());
        $this->assertSame(TalosBrowserFollowUpDecision::INSPECT, $allowed->effectiveOperation());
        $this->assertSame('http://127.0.0.1:43125/catalog', $allowed->targetUrl);
        $this->assertSame(TalosBrowserFollowUpDecision::CLARIFY, $blocked->operation);
        $this->assertSame('url_policy_denied', $blocked->reason);
    }

    public function test_current_page_pronoun_requires_one_owned_operable_browser_page(): void
    {
        $session = $this->chatSession();
        $browser = $this->browserSession($session, 'https://example.com/current');
        $current = $session->messages()->create(['role' => 'user', 'content' => 'Cosa vedi qui?']);

        $resolved = $this->resolver()->resolve('Cosa vedi qui?', $session, $browser, $current->id);

        $this->assertSame(TalosBrowserFollowUpDecision::INSPECT, $resolved->operation);
        $this->assertSame('inspect', $resolved->effectiveOperation());
        $this->assertTrue($resolved->isExecutable());
        $this->assertSame('https://example.com/current', $resolved->currentUrl);
        $this->assertStringContainsString('browser_snapshot', $resolved->toProviderDirective());

        $foreign = $this->browserSession($this->chatSession(), 'https://example.com/foreign');
        $rejected = $this->resolver()->resolve('Cosa vedi qui?', $session, $foreign, $current->id);

        $this->assertSame(TalosBrowserFollowUpDecision::CLARIFY, $rejected->operation);
        $this->assertFalse($rejected->isExecutable());
    }

    public function test_direct_screenshot_confirmation_and_retry_resolve_to_the_current_page(): void
    {
        $session = $this->chatSession();
        $browser = $this->browserSession($session, 'https://example.com/product');

        $direct = $session->messages()->create(['role' => 'user', 'content' => 'Cattura uno screenshot.']);
        $directDecision = $this->resolver()->resolve($direct->content, $session, $browser, $direct->id);
        $this->assertSame(TalosBrowserFollowUpDecision::SCREENSHOT, $directDecision->operation);
        $this->assertSame('screenshot', $directDecision->effectiveOperation());

        $session->messages()->create(['role' => 'assistant', 'content' => 'Vuoi che catturi uno screenshot della pagina corrente?']);
        $confirmation = $session->messages()->create(['role' => 'user', 'content' => "S\u{00EC}."]);
        $confirmationDecision = $this->resolver()->resolve($confirmation->content, $session, $browser, $confirmation->id);
        $this->assertSame(TalosBrowserFollowUpDecision::SCREENSHOT, $confirmationDecision->operation);
        $this->assertSame('assistant_confirmation', $confirmationDecision->source);

        $retrySession = $this->chatSession();
        $retryBrowser = $this->browserSession($retrySession, 'https://example.com/retry');
        $retrySession->messages()->create(['role' => 'user', 'content' => 'Puoi catturare uno screenshot?']);
        $retrySession->messages()->create(['role' => 'system', 'content' => 'Temporary worker failure.']);
        $retry = $retrySession->messages()->create(['role' => 'user', 'content' => 'riprova']);
        $retryDecision = $this->resolver()->resolve('riprova', $retrySession, $retryBrowser, $retry->id);

        $this->assertSame(TalosBrowserFollowUpDecision::RETRY, $retryDecision->operation);
        $this->assertSame('screenshot', $retryDecision->effectiveOperation());
        $this->assertSame('retry_follow_up', $retryDecision->source);
    }

    public function test_conversational_screenshot_is_direct_but_a_compound_task_stays_provider_owned(): void
    {
        $session = $this->chatSession();
        $browser = $this->browserSession($session, 'https://example.com/product');

        $direct = $this->resolver()->resolve('Riesci a farmi uno screenshot?', $session, $browser);
        $compound = $this->resolver()->resolve(
            'Cattura uno screenshot della pagina corrente e poi descrivi il contenuto.',
            $session,
            $browser,
        );

        $this->assertSame(TalosBrowserFollowUpDecision::SCREENSHOT, $direct->operation);
        $this->assertSame(TalosBrowserFollowUpDecision::NONE, $compound->operation);
    }

    public function test_unpersisted_confirmation_and_retry_keep_the_legacy_chat_api_contract(): void
    {
        $confirmationSession = $this->chatSession();
        $confirmationBrowser = $this->browserSession($confirmationSession, 'https://example.com/confirmation');
        $confirmationSession->messages()->create([
            'role' => 'assistant',
            'content' => 'Vuoi che esegua uno screenshot della pagina corrente?',
        ]);

        $confirmation = $this->resolver()->resolve('si', $confirmationSession, $confirmationBrowser);

        $retrySession = $this->chatSession();
        $retryBrowser = $this->browserSession($retrySession, 'https://example.com/retry');
        $retrySession->messages()->create(['role' => 'user', 'content' => 'Puoi fare uno screenshot?']);
        $retrySession->messages()->create(['role' => 'assistant', 'content' => 'Non posso fare screenshot in questo momento.']);

        $retry = $this->resolver()->resolve('prova ora', $retrySession, $retryBrowser);

        $this->assertSame(TalosBrowserFollowUpDecision::SCREENSHOT, $confirmation->effectiveOperation());
        $this->assertSame(TalosBrowserFollowUpDecision::SCREENSHOT, $retry->effectiveOperation());
        $this->assertSame(TalosBrowserFollowUpDecision::RETRY, $retry->operation);
    }

    public function test_general_browser_instructions_do_not_become_current_page_follow_ups(): void
    {
        $session = $this->chatSession();
        $browser = $this->browserSession($session, 'https://example.com/current');

        foreach ([
            'Use all browser commands then answer.',
            'Read page A, navigate to B, then read.',
            'Do two browser operations.',
            'Read after a slow response.',
        ] as $prompt) {
            $decision = $this->resolver()->resolve($prompt, $session, $browser);

            $this->assertSame(TalosBrowserFollowUpDecision::NONE, $decision->operation, $prompt);
        }
    }

    public function test_owned_ready_browser_page_can_be_captured_before_a_url_projection_exists(): void
    {
        $session = $this->chatSession();
        $browser = $this->browserSession($session, 'https://example.com/bootstrap');
        $browser->forceFill(['status' => 'ready', 'current_url' => null])->save();

        $decision = $this->resolver()->resolve('Cattura uno screenshot.', $session, $browser);

        $this->assertSame(TalosBrowserFollowUpDecision::SCREENSHOT, $decision->operation);
        $this->assertTrue($decision->isExecutable());
        $this->assertNull($decision->currentUrl);
    }

    public function test_multiple_urls_return_an_ordered_non_executable_clarification(): void
    {
        $session = $this->chatSession();
        $current = $session->messages()->create([
            'role' => 'user',
            'content' => 'Apri https://one.example/path e https://two.example/item.',
        ]);

        $decision = $this->resolver()->resolve($current->content, $session, null, $current->id);
        $safe = $decision->toSafeArray();

        $this->assertSame(TalosBrowserFollowUpDecision::CLARIFY, $decision->operation);
        $this->assertFalse($decision->isExecutable());
        $this->assertSame([
            'https://one.example/path',
            'https://two.example/item',
        ], array_column($safe['choices'], 'url'));
        $this->assertSame('', $decision->toProviderDirective());
    }

    private function resolver(): TalosBrowserFollowUpResolver
    {
        $policy = new TalosBrowserPolicy(publicPolicy: new PublicHttpUrlPolicy(
            resolver: static fn (string $host): array => ['93.184.216.34'],
        ));

        return new TalosBrowserFollowUpResolver(new TalosBrowserUrlIntentResolver(policy: $policy));
    }

    private function browserSession(TalosSession $session, string $url): TalosBrowserSession
    {
        return TalosBrowserSession::query()->create([
            'user_id' => $session->user_id,
            'talos_session_id' => $session->id,
            'worker_session_id' => 'worker-'.str()->uuid(),
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => $url,
            'current_title' => 'Current page',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
            ],
            'policy' => [],
            'expires_at' => now()->addHour(),
        ]);
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
