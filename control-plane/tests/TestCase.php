<?php

namespace Tests;

use App\Models\User;
use App\Services\FileIngestion\Malware\TalosMalwareScanner;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Storage;
use Tests\Support\CleanTalosMalwareScanner;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->app->bind(
            TalosMalwareScanner::class,
            static fn (): TalosMalwareScanner => new CleanTalosMalwareScanner,
        );
    }

    protected function authenticateTalosUser(): User
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        return $user;
    }

    protected function useIsolatedLocalStorage(): string
    {
        $testName = str_replace('\\', '_', static::class);
        $root = storage_path('framework/testing/isolated-local/' . $testName . '-' . uniqid());

        config(['filesystems.disks.local.root' => $root]);
        Storage::forgetDisk('local');
        app('files')->ensureDirectoryExists($root);

        return $root;
    }
}
