<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\User;
use App\Support\TalosProductCapabilityManifest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosCapabilityApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_capabilities_require_an_authenticated_operator(): void
    {
        $this->getJson('/api/talos/capabilities')
            ->assertUnauthorized();
    }

    public function test_capability_response_is_strict_versioned_and_distinguishes_current_from_planned_work(): void
    {
        config(['services.talos.browser.worker_url' => 'http://127.0.0.1:3100']);
        $user = $this->authenticateTalosUser();
        $this->healthyProfile($user);

        $response = $this->getJson('/api/talos/capabilities')
            ->assertOk()
            ->assertJsonPath('data.contract', TalosProductCapabilityManifest::CONTRACT)
            ->assertJsonStructure([
                'data' => [
                    'contract',
                    'revision',
                    'capabilities' => [
                        '*' => ['id', 'state', 'reason', 'evidence'],
                    ],
                ],
            ]);

        $records = collect($response->json('data.capabilities'))->keyBy('id');

        self::assertSame('available', $records->get('chat.provider')['state']);
        self::assertSame('available', $records->get('browser.hmi')['state']);
        self::assertSame('available', $records->get('benchmarks.avm')['state']);
        self::assertSame('available', $records->get('files.ingestion')['state']);
        self::assertSame('available', $records->get('models.profiles')['state']);
        self::assertSame('available', $records->get('runs.replay')['state']);
        self::assertSame('available', $records->get('settings.workspace')['state']);
        self::assertSame('planned', $records->get('models.local_runtime')['state']);
        self::assertSame('planned', $records->get('models.multi_model_orchestration')['state']);
        self::assertSame('degraded', $records->get('integrations.google_workspace')['state']);
        self::assertStringContainsString(
            'complete acceptance gate',
            $records->get('integrations.google_workspace')['reason'],
        );
        self::assertNotEmpty($records->get('models.local_runtime')['reason']);
        self::assertNotEmpty($records->get('models.local_runtime')['evidence']);
        self::assertArrayNotHasKey('subject', $response->json('data'));
        self::assertStringNotContainsString($user->email, $response->getContent());
    }

    public function test_browser_hmi_capability_is_blocked_without_configured_worker(): void
    {
        config(['services.talos.browser.worker_url' => null]);
        $user = $this->authenticateTalosUser();
        $this->healthyProfile($user);

        $response = $this->getJson('/api/talos/capabilities')
            ->assertOk();

        $browser = collect($response->json('data.capabilities'))
            ->firstWhere('id', 'browser.hmi');

        self::assertSame('blocked', $browser['state']);
        self::assertStringContainsString('browser worker', $browser['reason']);
        self::assertContains('config:TALOS_BROWSER_WORKER_URL', $browser['evidence']);
    }

    public function test_endpoint_uses_only_the_authenticated_users_effective_state(): void
    {
        $configured = User::factory()->create();
        $unconfigured = User::factory()->create();
        $this->healthyProfile($configured);

        $this->actingAs($configured)
            ->getJson("/api/talos/capabilities?user_id={$unconfigured->id}")
            ->assertOk()
            ->assertJsonPath(
                'data.capabilities.0.id',
                'chat.provider',
            )
            ->assertJsonPath(
                'data.capabilities.0.state',
                'available',
            );

        $this->actingAs($unconfigured)
            ->getJson("/api/talos/capabilities?user_id={$configured->id}")
            ->assertOk()
            ->assertJsonPath(
                'data.capabilities.0.id',
                'chat.provider',
            )
            ->assertJsonPath(
                'data.capabilities.0.state',
                'blocked',
            );
    }

    public function test_healthy_model_exposes_streaming_as_usable_but_not_human_promoted(): void
    {
        $user = $this->authenticateTalosUser();
        $this->healthyProfile($user);

        $response = $this->getJson('/api/talos/capabilities')
            ->assertOk();

        $streaming = collect($response->json('data.capabilities'))
            ->firstWhere('id', 'chat.streaming');

        self::assertSame('degraded', $streaming['state']);
        self::assertStringContainsString('acceptance', $streaming['reason']);
        self::assertSame([
            'api:POST /api/talos/chat/stream',
            'api:POST /api/talos/runs/{id}/cancel',
            'test:TalosChatStreamApiTest',
            'e2e:talosStreamingChat.e2e.spec.ts',
        ], $streaming['evidence']);
    }

    public function test_streaming_stays_blocked_without_a_healthy_model(): void
    {
        $this->authenticateTalosUser();

        $response = $this->getJson('/api/talos/capabilities')
            ->assertOk();

        $streaming = collect($response->json('data.capabilities'))
            ->firstWhere('id', 'chat.streaming');

        self::assertSame('blocked', $streaming['state']);
        self::assertStringContainsString('model profile', $streaming['reason']);
        self::assertContains(
            'database:talos_model_profiles.user_id',
            $streaming['evidence'],
        );
    }

    private function healthyProfile(User $user): TalosModelProfile
    {
        return TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'display_name' => 'DeepSeek Chat',
            'encrypted_secret' => 'encrypted-test-secret',
            'status' => 'healthy',
            'show_in_composer' => true,
        ]);
    }
}
