<?php

declare(strict_types=1);

namespace App\Services\Benchmarking;

use App\Models\TalosFile;
use App\Models\User;
use Illuminate\Support\Facades\Storage;

final class UserBenchmarkScenarioResolver
{
    public function resolve(string $reference, User $user): string
    {
        $file = TalosFile::query()
            ->whereKey($reference)
            ->where('user_id', $user->id)
            ->firstOrFail();

        $path = $file->metadata['benchmark_scenario_storage_path'] ?? null;
        abort_unless(is_string($path)
            && str_starts_with($path, 'benchmark-scenarios/')
            && str_ends_with($path, '.json')
            && ! str_contains($path, '..')
            && Storage::disk('local')->exists($path), 404, 'Benchmark scenario not found.');

        return $path;
    }
}
