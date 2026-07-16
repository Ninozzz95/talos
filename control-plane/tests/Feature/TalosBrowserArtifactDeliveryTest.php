<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosBrowserArtifactDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private TalosSession $chat;

    private TalosBrowserSession $browser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
        $this->chat = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Private Browser evidence',
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);
        $this->browser = TalosBrowserSession::query()->create([
            'user_id' => $this->user->id,
            'talos_session_id' => $this->chat->id,
            'worker_session_id' => 'worker-delivery-'.str()->uuid(),
            'status' => 'active',
            'mode' => 'read_only',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['screenshots' => true],
            'policy' => [],
            'worker_state_version' => 1,
            'expires_at' => now()->addHour(),
        ]);
        $this->useIsolatedLocalStorage();
        $this->withHeader('X-Talos-Session-Id', (string) $this->chat->id);
    }

    public function test_owner_receives_verified_png_bytes_with_private_hardened_headers(): void
    {
        $artifact = $this->screenshot($this->png());

        $response = $this->get($this->previewUrl($artifact))->assertOk();

        $response
            ->assertHeader('Content-Type', 'image/png')
            ->assertHeader('ETag', '"sha256-'.$artifact->sha256.'"')
            ->assertHeader('Content-Disposition', 'inline; filename=talos-browser-'.$artifact->id.'.png')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $cacheControl = (string) $response->headers->get('Cache-Control');
        self::assertStringContainsString('private', $cacheControl);
        self::assertStringContainsString('no-cache', $cacheControl);
        self::assertStringContainsString('must-revalidate', $cacheControl);
        self::assertStringNotContainsString('no-store', $cacheControl);
        self::assertSame($this->png(), $response->getContent());
    }

    public function test_matching_if_none_match_returns_an_empty_304_response(): void
    {
        $artifact = $this->screenshot($this->png());
        $etag = '"sha256-'.$artifact->sha256.'"';

        $response = $this->withHeader('If-None-Match', $etag)->get($this->previewUrl($artifact));

        $response->assertStatus(304)->assertHeader('ETag', $etag);
        self::assertSame('', $response->getContent());
    }

    public function test_cross_user_and_cross_chat_screenshot_access_fail_closed_as_not_found(): void
    {
        $artifact = $this->screenshot($this->png());
        $other = User::factory()->create();
        $otherChat = TalosSession::query()->create([
            'user_id' => $other->id,
            'title' => 'Foreign chat',
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);

        $this->actingAs($other)
            ->withHeader('X-Talos-Session-Id', (string) $otherChat->id)
            ->getJson($this->previewUrl($artifact))
            ->assertNotFound();

        $sameOwnerOtherChat = TalosSession::query()->create([
            'user_id' => $this->user->id,
            'title' => 'Other owned chat',
            'mode' => 'verified_execution',
            'surface' => 'browse',
        ]);
        $this->actingAs($this->user)
            ->withHeader('X-Talos-Session-Id', (string) $sameOwnerOtherChat->id)
            ->getJson($this->previewUrl($artifact))
            ->assertNotFound();
    }

    public function test_matching_hash_non_png_bytes_are_never_delivered_as_a_screenshot(): void
    {
        $artifact = $this->screenshot('not a png');

        $this->getJson($this->previewUrl($artifact))
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_RECOVERY_REQUIRED')
            ->assertJsonPath('details.reason', 'mime_mismatch');
    }

    public function test_declared_non_png_screenshot_mime_is_never_delivered(): void
    {
        $artifact = $this->screenshot($this->png(), 'application/octet-stream');

        $this->getJson($this->previewUrl($artifact))
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_RECOVERY_REQUIRED')
            ->assertJsonPath('details.reason', 'mime_mismatch');
    }

    private function screenshot(string $bytes, string $mime = 'image/png'): TalosBrowserArtifact
    {
        return app(TalosBrowserArtifactStore::class)->store(
            $this->browser,
            'screenshot',
            $mime,
            $bytes,
            ['width' => 1, 'height' => 1],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 1],
        );
    }

    private function previewUrl(TalosBrowserArtifact $artifact): string
    {
        return '/api/talos/browser/artifacts/'.$artifact->id.'/preview';
    }

    private function png(): string
    {
        return base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            true,
        ) ?: throw new \RuntimeException('PNG fixture is invalid.');
    }
}
