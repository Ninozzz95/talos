<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosReadinessTest extends TestCase
{
    use RefreshDatabase;

    public function test_readyz_is_public_and_reports_healthy_when_dependencies_are_ready(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'queue.default' => 'database',
            'services.talos.validator_health_url' => 'http://validator.test/health',
        ]);

        Http::fake([
            'http://validator.test/health' => Http::response(['status' => 'healthy'], 200),
        ]);

        $this->getJson('/readyz')
            ->assertOk()
            ->assertJsonPath('ready', true)
            ->assertJsonPath('status', 'healthy')
            ->assertJsonPath('checks.database.status', 'healthy')
            ->assertJsonPath('checks.storage.status', 'healthy')
            ->assertJsonPath('checks.queue.status', 'healthy')
            ->assertJsonPath('checks.validator.status', 'healthy')
            ->assertJsonPath('checks.app_key.status', 'healthy')
            ->assertJsonPath('checks.migrations.status', 'healthy');
    }

    public function test_readyz_fails_closed_when_validator_health_url_is_missing(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'queue.default' => 'database',
            'services.talos.validator_health_url' => null,
        ]);

        $this->getJson('/readyz')
            ->assertStatus(503)
            ->assertJsonPath('ready', false)
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('checks.validator.status', 'failed')
            ->assertJsonPath('checks.validator.detail', 'TALOS_VALIDATOR_HEALTH_URL is not configured.');
    }
}
