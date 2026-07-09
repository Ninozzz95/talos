<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosHardwareProfile;
use App\Models\TalosLocalRuntime;
use App\Models\TalosModelCatalogEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosCookbookApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_cookbook_models_serialize_without_shell_execution_fields(): void
    {
        $profile = TalosHardwareProfile::query()->create([
            'host_fingerprint' => 'host-test',
            'os' => 'Windows',
            'cpu_model' => 'Ryzen Test',
            'cpu_cores' => 16,
            'ram_total_mb' => 65536,
            'ram_free_mb' => 32768,
            'gpus' => [['vendor' => 'NVIDIA', 'model' => 'RTX Test', 'vram_mb' => 24576]],
            'runtimes' => ['ollama' => ['status' => 'available']],
            'raw_evidence' => ['source' => 'test'],
            'scanned_at' => now(),
        ]);

        $runtime = TalosLocalRuntime::query()->create([
            'name' => 'Ollama',
            'kind' => 'ollama',
            'status' => 'available',
            'version' => '0.9.0',
            'executable_path' => null,
            'evidence' => ['command' => 'ollama --version'],
            'last_checked_at' => now(),
        ]);

        $model = TalosModelCatalogEntry::query()->create([
            'provider' => 'huggingface',
            'model_id' => 'meta-llama/Llama-3.1-8B-Instruct',
            'display_name' => 'Llama 3.1 8B Instruct',
            'parameters_b' => 8.0,
            'quantization' => 'Q4_K_M',
            'context_window' => 8192,
            'runtime_modes' => ['ollama', 'llama_cpp'],
            'estimated_vram_mb' => 6144,
            'estimated_ram_mb' => 8192,
            'tags' => ['chat', 'local'],
            'source_url' => 'https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct',
            'status' => 'available',
        ]);

        $this->assertSame('host-test', $profile->toApiArray()['host_fingerprint']);
        $this->assertSame('ollama', $runtime->toApiArray()['kind']);
        $this->assertSame('meta-llama/Llama-3.1-8B-Instruct', $model->toApiArray()['model_id']);
        $this->assertArrayNotHasKey('execute', $model->toApiArray());
        $this->assertArrayNotHasKey('shell', $model->toApiArray());
    }

    public function test_cookbook_hardware_scan_persists_profile_and_runtime_readiness(): void
    {
        $this->postJson('/api/talos/cookbook/hardware-scan')
            ->assertOk()
            ->assertJsonPath('data.profile.trust_level', 'local_evidence')
            ->assertJsonStructure([
                'data' => [
                    'profile' => ['id', 'os', 'cpu_cores', 'ram_total_mb', 'runtimes', 'scanned_at'],
                    'runtimes',
                ],
            ]);

        $this->assertDatabaseCount('talos_hardware_profiles', 1);
    }

    public function test_cookbook_fit_scoring_is_deterministic(): void
    {
        $this->postJson('/api/talos/cookbook/models', [
            'provider' => 'huggingface',
            'model_id' => 'test/local-8b',
            'display_name' => 'Local 8B',
            'parameters_b' => 8,
            'quantization' => 'Q4_K_M',
            'context_window' => 8192,
            'runtime_modes' => ['ollama'],
            'estimated_vram_mb' => 6144,
            'estimated_ram_mb' => 8192,
            'status' => 'available',
        ])->assertCreated();

        $this->getJson('/api/talos/cookbook/models')
            ->assertOk()
            ->assertJsonPath('data.0.fit.label', fn (string $label): bool => in_array($label, ['Perfect', 'Good', 'Borderline', 'Too heavy', 'Unknown'], true))
            ->assertJsonPath('data.0.fit.score', fn (int $score): bool => $score >= 0 && $score <= 100);
    }

    public function test_cookbook_download_and_serve_are_preview_only(): void
    {
        $this->postJson('/api/talos/cookbook/download-preview', [
            'model_id' => 'meta-llama/Llama-3.1-8B-Instruct',
            'runtime' => 'ollama',
        ])
            ->assertOk()
            ->assertJsonPath('data.mode', 'dry_run')
            ->assertJsonPath('data.executed', false)
            ->assertJsonPath('data.requires_approval', true);

        $this->postJson('/api/talos/cookbook/serve-preview', [
            'model_id' => 'meta-llama/Llama-3.1-8B-Instruct',
            'runtime' => 'ollama',
        ])
            ->assertOk()
            ->assertJsonPath('data.mode', 'dry_run')
            ->assertJsonPath('data.executed', false)
            ->assertJsonPath('data.requires_approval', true);
    }

    public function test_cookbook_planning_context_exposes_read_only_tools_only(): void
    {
        $this->getJson('/api/talos/cookbook/planning-context')
            ->assertOk()
            ->assertJsonPath('tools.0.id', 'scan_hardware')
            ->assertJsonPath('tools.1.id', 'list_fit_models')
            ->assertJsonPath('tools.2.id', 'runtime_readiness')
            ->assertJsonPath('tools.3.id', 'dependency_catalog')
            ->assertJsonMissing(['id' => 'download_model'])
            ->assertJsonMissing(['id' => 'serve_model']);
    }

    public function test_cookbook_dependency_catalog_reports_policy_gates_without_execution(): void
    {
        TalosLocalRuntime::query()->create([
            'name' => 'Ollama',
            'kind' => 'ollama',
            'status' => 'missing',
            'version' => null,
            'executable_path' => null,
            'evidence' => ['path_check' => false],
            'last_checked_at' => now(),
        ]);

        $this->getJson('/api/talos/cookbook/dependencies')
            ->assertOk()
            ->assertJsonPath('data.policy.execution_allowed', false)
            ->assertJsonPath('data.dependencies.0.runtime', 'ollama')
            ->assertJsonPath('data.dependencies.0.install_allowed', false)
            ->assertJsonPath('data.dependencies.0.required_scope', 'talos.shell.exec')
            ->assertJsonPath('data.dependencies.0.detected_status', 'missing');
    }

    public function test_cookbook_dependency_preview_returns_dry_run_plan_only(): void
    {
        $this->postJson('/api/talos/cookbook/dependencies/preview', [
            'runtime' => 'ollama',
            'model_id' => 'meta-llama/Llama-3.1-8B-Instruct',
        ])
            ->assertOk()
            ->assertJsonPath('data.mode', 'dry_run')
            ->assertJsonPath('data.executed', false)
            ->assertJsonPath('data.install_allowed', false)
            ->assertJsonPath('data.requires_approval', true)
            ->assertJsonPath('data.runtime', 'ollama')
            ->assertJsonPath('data.steps.0.kind', 'dependency_check')
            ->assertJsonPath('data.steps.1.kind', 'install_preview')
            ->assertJsonPath('data.policy.execution_allowed', false);
    }

    public function test_cookbook_policy_endpoint_is_fail_closed_for_dependency_execution(): void
    {
        $this->getJson('/api/talos/cookbook/policy')
            ->assertOk()
            ->assertJsonPath('data.default_decision', 'deny')
            ->assertJsonPath('data.execution_allowed', false)
            ->assertJsonPath('data.install_execution_enabled', false)
            ->assertJsonPath('data.required_scope', 'talos.shell.exec');
    }
}
