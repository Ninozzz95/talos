<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\FileIngestion\FileBenchmarkScenarioFactory;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Mockery;
use RuntimeException;
use Tests\TestCase;

final class FileBenchmarkScenarioFactoryTest extends TestCase
{
    private ?string $invalidRoot = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->useIsolatedLocalStorage();
    }

    protected function tearDown(): void
    {
        config([
            'filesystems.disks.local.root' => storage_path('app/private'),
            'filesystems.disks.local.throw' => false,
        ]);
        Storage::forgetDisk('local');

        if ($this->invalidRoot !== null && is_file($this->invalidRoot)) {
            unlink($this->invalidRoot);
        }

        parent::tearDown();
    }

    public function test_failed_scenario_write_is_observable(): void
    {
        $this->invalidRoot = tempnam(sys_get_temp_dir(), 'talos-scenario-root-');
        $this->assertIsString($this->invalidRoot);
        config([
            'filesystems.disks.local.root' => $this->invalidRoot,
            'filesystems.disks.local.throw' => false,
        ]);
        Storage::forgetDisk('local');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('TALOS_BENCHMARK_SCENARIO_WRITE_FAILED');

        (new FileBenchmarkScenarioFactory)->create($this->ingestedFile());
    }

    public function test_successful_scenario_artifact_can_be_discarded(): void
    {
        $factory = new FileBenchmarkScenarioFactory;

        $scenario = $factory->create($this->ingestedFile());
        $path = $scenario['storage_path'] ?? null;
        $this->assertIsString($path);
        Storage::disk('local')->assertExists($path);

        $factory->discard($scenario);

        Storage::disk('local')->assertMissing($path);
    }

    public function test_equal_content_uses_ingestion_scoped_identity_and_persists_owner_reference(): void
    {
        $factory = new FileBenchmarkScenarioFactory;
        $firstId = '00000000-0000-4000-8000-000000000001';
        $secondId = '00000000-0000-4000-8000-000000000002';
        $first = $factory->create($this->ingestedFile($firstId));
        $second = $factory->create($this->ingestedFile($secondId));

        $this->assertNotSame($first['id'], $second['id']);
        $this->assertNotSame($first['storage_path'], $second['storage_path']);
        $this->assertSame($firstId, $first['ref']);
        $this->assertSame($secondId, $second['ref']);
        $this->assertSame($firstId, Storage::disk('local')->json($first['storage_path'])['ref'] ?? null);
        $this->assertSame($secondId, Storage::disk('local')->json($second['storage_path'])['ref'] ?? null);
        Storage::disk('local')->assertExists($first['storage_path']);
        Storage::disk('local')->assertExists($second['storage_path']);

        $factory->discard($second);

        Storage::disk('local')->assertExists($first['storage_path']);
        Storage::disk('local')->assertMissing($second['storage_path']);
    }

    public function test_failed_scenario_write_discards_partial_artifact(): void
    {
        $storageManager = Storage::getFacadeRoot();
        $disk = Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('put')
            ->once()
            ->with(Mockery::on(static fn (string $path): bool => str_ends_with($path, '.json.partial')), Mockery::type('string'))
            ->andReturnFalse();
        $disk->shouldReceive('exists')->twice()->andReturnTrue();
        $disk->shouldReceive('delete')->twice()->andReturnTrue();
        $failure = null;

        try {
            Storage::shouldReceive('disk')->with('local')->andReturn($disk);
            (new FileBenchmarkScenarioFactory)->create($this->ingestedFile());
        } catch (RuntimeException $exception) {
            $failure = $exception;
        } finally {
            Storage::swap($storageManager);
        }

        $this->assertInstanceOf(RuntimeException::class, $failure);
        $this->assertSame('TALOS_BENCHMARK_SCENARIO_WRITE_FAILED', $failure->getMessage());
    }

    public function test_failed_scenario_move_discards_temporary_and_destination_artifacts(): void
    {
        $storageManager = Storage::getFacadeRoot();
        $disk = Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('put')
            ->once()
            ->with(Mockery::on(static fn (string $path): bool => str_ends_with($path, '.json.partial')), Mockery::type('string'))
            ->andReturnTrue();
        $disk->shouldReceive('move')
            ->once()
            ->with(
                Mockery::on(static fn (string $path): bool => str_ends_with($path, '.json.partial')),
                Mockery::on(static fn (string $path): bool => str_ends_with($path, '.json')),
            )
            ->andReturnFalse();
        $disk->shouldReceive('exists')->twice()->andReturnTrue();
        $disk->shouldReceive('delete')->twice()->andReturnTrue();
        $failure = null;

        try {
            Storage::shouldReceive('disk')->with('local')->andReturn($disk);
            (new FileBenchmarkScenarioFactory)->create($this->ingestedFile());
        } catch (RuntimeException $exception) {
            $failure = $exception;
        } finally {
            Storage::swap($storageManager);
        }

        $this->assertInstanceOf(RuntimeException::class, $failure);
        $this->assertSame('TALOS_BENCHMARK_SCENARIO_WRITE_FAILED', $failure->getMessage());
    }

    public function test_discard_rejects_traversal_outside_scenario_prefix(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('TALOS_BENCHMARK_SCENARIO_ARTIFACT_INVALID');

        (new FileBenchmarkScenarioFactory)->discard([
            'storage_disk' => 'local',
            'storage_path' => 'benchmark-scenarios/../ingested/foreign.txt',
        ]);
    }

    /** @return array<string, mixed> */
    private function ingestedFile(string $fileId = '00000000-0000-4000-8000-000000000000'): array
    {
        return [
            'id' => $fileId,
            'sha256' => hash('sha256', 'scenario sentinel'),
            'original_name' => 'scenario.txt',
            'mime_type' => 'text/plain',
            'storage_disk' => 'local',
            'storage_path' => 'ingested/scenario.txt',
            'extracted_chars' => 17,
            'extracted_text' => 'scenario sentinel',
        ];
    }
}
