<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosApiToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosDoctorBackupApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_doctor_reports_degraded_validator_when_health_url_is_missing(): void
    {
        config(['services.talos.validator_health_url' => null]);
        $plainToken = TalosApiToken::issue('doctor', ['talos.doctor.read']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->getJson('/api/talos/admin/doctor')
            ->assertOk()
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('checks.validator_health.status', 'degraded')
            ->assertJsonPath('checks.database.status', 'healthy');
    }

    public function test_backup_manifest_includes_required_domains(): void
    {
        $plainToken = TalosApiToken::issue('backup-reader', ['talos.backup.read']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->getJson('/api/talos/admin/backup/manifest')
            ->assertOk()
            ->assertJsonPath('schema_version', 'talos-backup-v1')
            ->assertJsonPath('domains.sessions.included', true)
            ->assertJsonPath('domains.runs.included', true)
            ->assertJsonPath('domains.files.included', true)
            ->assertJsonPath('domains.artifacts.included', true)
            ->assertJsonPath('domains.policies.included', true)
            ->assertJsonPath('restore_policy.dry_run_required', true);
    }

    public function test_restore_validation_rejects_incompatible_schema(): void
    {
        $plainToken = TalosApiToken::issue('backup-restore', ['talos.backup.restore']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->postJson('/api/talos/admin/backup/validate-restore', [
                'schema_version' => 'talos-backup-v0',
                'dry_run' => true,
                'domains' => [],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['schema_version']);
    }

    public function test_restore_validation_rejects_incomplete_domain_manifest(): void
    {
        $plainToken = TalosApiToken::issue('backup-restore', ['talos.backup.restore']);

        $this->withHeader('X-Talos-Api-Token', $plainToken)
            ->postJson('/api/talos/admin/backup/validate-restore', [
                'schema_version' => 'talos-backup-v1',
                'dry_run' => true,
                'domains' => [
                    'sessions' => ['included' => true],
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['domains']);
    }

    public function test_validator_health_url_is_declared_in_env_and_services_config(): void
    {
        $envExample = file_get_contents(base_path('.env.example'));
        $servicesConfig = file_get_contents(config_path('services.php'));

        $this->assertIsString($envExample);
        $this->assertIsString($servicesConfig);
        $this->assertStringContainsString('TALOS_VALIDATOR_HEALTH_URL=', $envExample);
        $this->assertStringContainsString('validator_health_url', $servicesConfig);
    }
}
