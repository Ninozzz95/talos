<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Storage;

abstract class TestCase extends BaseTestCase
{
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
