<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserSession;
use Illuminate\Support\Facades\Storage;

final class TalosBrowserArtifactStore
{
    /** @param array<string, mixed> $metadata */
    public function store(TalosBrowserSession $session, string $type, string $mime, string $contents, array $metadata = []): TalosBrowserArtifact
    {
        $id = (string) str()->uuid(); $path = "talos/browser/{$session->user_id}/{$session->id}/{$id}";
        Storage::disk('local')->put($path, $contents);
        return TalosBrowserArtifact::query()->create(['id' => $id, 'browser_session_id' => $session->id, 'user_id' => $session->user_id, 'type' => $type, 'mime' => $mime, 'storage_disk' => 'local', 'storage_path' => $path, 'sha256' => hash('sha256', $contents), 'metadata' => $metadata]);
    }
}
