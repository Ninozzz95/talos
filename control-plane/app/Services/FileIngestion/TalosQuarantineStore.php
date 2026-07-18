<?php

declare(strict_types=1);

namespace App\Services\FileIngestion;

use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

final class TalosQuarantineStore
{
    public function stagePath(string $sourcePath, string $fileId): string
    {
        $path = $this->pendingPath($fileId);
        $source = fopen($sourcePath, 'rb');
        if (! is_resource($source)) {
            throw new RuntimeException('TALOS_FILE_QUARANTINE_SOURCE_UNREADABLE');
        }

        try {
            $storage = Storage::disk('talos_quarantine');
            if (! $storage->writeStream($path, $source)) {
                throw new RuntimeException('TALOS_FILE_QUARANTINE_WRITE_FAILED');
            }

            return $path;
        } catch (Throwable $exception) {
            if (isset($storage, $path)) {
                $this->cleanupAfterFailure($storage, $path);
            }

            throw new RuntimeException('TALOS_FILE_QUARANTINE_WRITE_FAILED', 0, $exception);
        } finally {
            fclose($source);
        }
    }

    public function stageContents(string $contents, string $fileId): string
    {
        $path = $this->pendingPath($fileId);
        $storage = Storage::disk('talos_quarantine');

        try {
            if (! $storage->put($path, $contents)) {
                throw new RuntimeException('TALOS_FILE_QUARANTINE_WRITE_FAILED');
            }
        } catch (Throwable $exception) {
            $this->cleanupAfterFailure($storage, $path);

            throw new RuntimeException('TALOS_FILE_QUARANTINE_WRITE_FAILED', 0, $exception);
        }

        return $path;
    }

    public function absolutePath(string $relativePath): string
    {
        $this->assertQuarantinePath($relativePath);

        return Storage::disk('talos_quarantine')->path($relativePath);
    }

    public function promote(string $relativePath, string $finalPath): void
    {
        $this->copyToFinal($relativePath, $finalPath);

        try {
            $this->discard($relativePath);
        } catch (Throwable $exception) {
            try {
                $this->discardFinal($finalPath);
            } catch (Throwable $cleanupException) {
                report($cleanupException);
            }

            throw $exception;
        }
    }

    public function copyToFinal(string $relativePath, string $finalPath): void
    {
        $this->assertQuarantinePath($relativePath);
        $this->assertFinalPath($finalPath);
        $quarantine = Storage::disk('talos_quarantine');
        $final = Storage::disk('local');
        $partialPath = $finalPath.'.partial';
        $source = $quarantine->readStream($relativePath);
        if (! is_resource($source)) {
            throw new RuntimeException('TALOS_FILE_QUARANTINE_READ_FAILED');
        }

        $failureCode = 'TALOS_FILE_PROMOTION_WRITE_FAILED';

        try {
            if (! $final->writeStream($partialPath, $source)) {
                throw new RuntimeException($failureCode);
            }

            $failureCode = 'TALOS_FILE_PROMOTION_MOVE_FAILED';
            if (! $final->move($partialPath, $finalPath)) {
                throw new RuntimeException($failureCode);
            }
        } catch (Throwable $exception) {
            $this->cleanupAfterFailure($final, $partialPath);
            $this->cleanupAfterFailure($final, $finalPath);

            throw new RuntimeException($failureCode, 0, $exception);
        } finally {
            fclose($source);
        }
    }

    public function discard(string $relativePath): void
    {
        $this->assertQuarantinePath($relativePath);
        $storage = Storage::disk('talos_quarantine');
        if ($storage->exists($relativePath) && ! $storage->delete($relativePath)) {
            throw new RuntimeException('TALOS_FILE_QUARANTINE_DELETE_FAILED');
        }
    }

    public function discardFinal(string $finalPath): void
    {
        $this->assertFinalPath($finalPath);
        $storage = Storage::disk('local');
        $firstFailure = null;

        foreach ([$finalPath.'.partial', $finalPath] as $path) {
            try {
                if ($storage->exists($path) && ! $storage->delete($path)) {
                    throw new RuntimeException('TALOS_FILE_FINAL_DELETE_FAILED');
                }
            } catch (Throwable $exception) {
                $firstFailure ??= $exception;
            }
        }

        if ($firstFailure !== null) {
            throw new RuntimeException('TALOS_FILE_FINAL_DELETE_FAILED', 0, $firstFailure);
        }
    }

    private function pendingPath(string $fileId): string
    {
        if (preg_match(
            '/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i',
            $fileId,
        ) !== 1) {
            throw new RuntimeException('TALOS_FILE_QUARANTINE_ID_INVALID');
        }

        return 'pending/'.gmdate('Y/m/d').'/'.strtolower($fileId).'.upload';
    }

    private function assertQuarantinePath(string $relativePath): void
    {
        if (preg_match(
            '#\Apending/\d{4}/\d{2}/\d{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.upload\z#',
            $relativePath,
        ) !== 1) {
            throw new RuntimeException('TALOS_FILE_QUARANTINE_PATH_INVALID');
        }
    }

    private function assertFinalPath(string $finalPath): void
    {
        if (preg_match(
            '#\Aingested/\d{4}/\d{2}/\d{2}/[0-9a-f]{64}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+(?:\.partial)?\z#',
            $finalPath,
        ) !== 1) {
            throw new RuntimeException('TALOS_FILE_FINAL_PATH_INVALID');
        }
    }

    private function cleanupAfterFailure(FilesystemAdapter $storage, string $path): void
    {
        try {
            if ($storage->exists($path) && ! $storage->delete($path)) {
                throw new RuntimeException('TALOS_FILE_COMPENSATION_DELETE_FAILED');
            }
        } catch (Throwable $cleanupException) {
            report($cleanupException);
        }
    }
}
