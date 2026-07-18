<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\FileIngestion\TalosQuarantineStore;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Mockery;
use RuntimeException;
use Tests\TestCase;

final class TalosQuarantineStoreTest extends TestCase
{
    public function test_stage_path_preserves_invalid_server_id_fault_before_io(): void
    {
        $sourcePath = tempnam(sys_get_temp_dir(), 'talos-quarantine-source-');
        $this->assertIsString($sourcePath);

        try {
            $this->expectException(RuntimeException::class);
            $this->expectExceptionMessage('TALOS_FILE_QUARANTINE_ID_INVALID');

            (new TalosQuarantineStore)->stagePath($sourcePath, '../invalid-owner');
        } finally {
            @unlink($sourcePath);
        }
    }

    public function test_stage_rejects_malformed_uuid_before_writing(): void
    {
        $storageManager = Storage::getFacadeRoot();
        $failure = null;

        try {
            Storage::shouldReceive('disk')->never();
            (new TalosQuarantineStore)->stageContents('sentinel', str_repeat('a', 36));
        } catch (RuntimeException $exception) {
            $failure = $exception;
        } finally {
            Storage::swap($storageManager);
        }

        $this->assertInstanceOf(RuntimeException::class, $failure);
        $this->assertSame('TALOS_FILE_QUARANTINE_ID_INVALID', $failure->getMessage());
    }

    public function test_absolute_path_rejects_traversal_before_resolution(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('TALOS_FILE_QUARANTINE_PATH_INVALID');

        (new TalosQuarantineStore)->absolutePath('pending/../../private/secret.txt');
    }

    public function test_failed_quarantine_write_discards_partial_unowned_object(): void
    {
        $storageManager = Storage::getFacadeRoot();
        $disk = Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('put')->once()->andReturnFalse();
        $disk->shouldReceive('exists')->once()->andReturnTrue();
        $disk->shouldReceive('delete')->once()->andReturnTrue();
        $failure = null;

        try {
            Storage::shouldReceive('disk')->with('talos_quarantine')->andReturn($disk);
            (new TalosQuarantineStore)->stageContents(
                'partial quarantine sentinel',
                '00000000-0000-4000-8000-000000000001',
            );
        } catch (RuntimeException $exception) {
            $failure = $exception;
        } finally {
            Storage::swap($storageManager);
        }

        $this->assertInstanceOf(RuntimeException::class, $failure);
        $this->assertSame('TALOS_FILE_QUARANTINE_WRITE_FAILED', $failure->getMessage());
    }

    public function test_failed_final_write_discards_temporary_and_destination_objects(): void
    {
        $storageManager = Storage::getFacadeRoot();
        $finalPath = 'ingested/2026/07/17/'.str_repeat('a', 64).'-00000000-0000-4000-8000-000000000001.txt';
        $partialPath = $finalPath.'.partial';
        $source = fopen('php://temp', 'w+b');
        self::assertIsResource($source);
        fwrite($source, 'partial promotion sentinel');
        rewind($source);

        $quarantine = Mockery::mock(FilesystemAdapter::class);
        $quarantine->shouldReceive('readStream')->once()->andReturn($source);

        $local = Mockery::mock(FilesystemAdapter::class);
        $local->shouldReceive('writeStream')->once()->with($partialPath, Mockery::type('resource'))->andReturnFalse();
        $local->shouldReceive('exists')->once()->with($partialPath)->andReturnTrue();
        $local->shouldReceive('delete')->once()->with($partialPath)->andReturnTrue();
        $local->shouldReceive('exists')->once()->with($finalPath)->andReturnTrue();
        $local->shouldReceive('delete')->once()->with($finalPath)->andReturnTrue();

        $failure = null;

        try {
            Storage::shouldReceive('disk')->with('talos_quarantine')->andReturn($quarantine);
            Storage::shouldReceive('disk')->with('local')->andReturn($local);
            (new TalosQuarantineStore)->copyToFinal(
                'pending/2026/07/17/00000000-0000-4000-8000-000000000001.upload',
                $finalPath,
            );
        } catch (RuntimeException $exception) {
            $failure = $exception;
        } finally {
            Storage::swap($storageManager);
        }

        $this->assertInstanceOf(RuntimeException::class, $failure);
        $this->assertSame('TALOS_FILE_PROMOTION_WRITE_FAILED', $failure->getMessage());
    }

    public function test_failed_final_move_discards_temporary_and_destination_objects(): void
    {
        $storageManager = Storage::getFacadeRoot();
        $finalPath = 'ingested/2026/07/17/'.str_repeat('a', 64).'-00000000-0000-4000-8000-000000000001.txt';
        $partialPath = $finalPath.'.partial';
        $source = fopen('php://temp', 'w+b');
        self::assertIsResource($source);
        fwrite($source, 'failed move sentinel');
        rewind($source);

        $quarantine = Mockery::mock(FilesystemAdapter::class);
        $quarantine->shouldReceive('readStream')->once()->andReturn($source);

        $local = Mockery::mock(FilesystemAdapter::class);
        $local->shouldReceive('writeStream')->once()->with($partialPath, Mockery::type('resource'))->andReturnTrue();
        $local->shouldReceive('move')->once()->with($partialPath, $finalPath)->andReturnFalse();
        $local->shouldReceive('exists')->once()->with($partialPath)->andReturnTrue();
        $local->shouldReceive('delete')->once()->with($partialPath)->andReturnTrue();
        $local->shouldReceive('exists')->once()->with($finalPath)->andReturnTrue();
        $local->shouldReceive('delete')->once()->with($finalPath)->andReturnTrue();

        $failure = null;

        try {
            Storage::shouldReceive('disk')->with('talos_quarantine')->andReturn($quarantine);
            Storage::shouldReceive('disk')->with('local')->andReturn($local);
            (new TalosQuarantineStore)->copyToFinal(
                'pending/2026/07/17/00000000-0000-4000-8000-000000000001.upload',
                $finalPath,
            );
        } catch (RuntimeException $exception) {
            $failure = $exception;
        } finally {
            Storage::swap($storageManager);
        }

        $this->assertInstanceOf(RuntimeException::class, $failure);
        $this->assertSame('TALOS_FILE_PROMOTION_MOVE_FAILED', $failure->getMessage());
    }

    public function test_discard_final_retries_temporary_and_destination_cleanup(): void
    {
        $storageManager = Storage::getFacadeRoot();
        $finalPath = 'ingested/2026/07/17/'.str_repeat('a', 64).'-00000000-0000-4000-8000-000000000001.txt';
        $partialPath = $finalPath.'.partial';
        $local = Mockery::mock(FilesystemAdapter::class);
        $local->shouldReceive('exists')->once()->with($partialPath)->andReturnTrue();
        $local->shouldReceive('delete')->once()->with($partialPath)->andReturnTrue();
        $local->shouldReceive('exists')->once()->with($finalPath)->andReturnTrue();
        $local->shouldReceive('delete')->once()->with($finalPath)->andReturnTrue();

        try {
            Storage::shouldReceive('disk')->with('local')->andReturn($local);
            (new TalosQuarantineStore)->discardFinal($finalPath);
        } finally {
            Storage::swap($storageManager);
        }
    }
}
