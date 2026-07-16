<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\GuardsLegacyBrowserWrites;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosBrowserArtifact extends Model
{
    use GuardsLegacyBrowserWrites, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['browser_session_id', 'user_id', 'worker_capture_id', 'source_command_id', 'source_state_version', 'state_version', 'trust_boundary', 'type', 'mime', 'storage_disk', 'storage_path', 'sha256', 'metadata'];

    protected function casts(): array
    {
        return ['metadata' => 'array', 'source_state_version' => 'integer', 'state_version' => 'integer'];
    }

    /** @return BelongsTo<TalosBrowserSession, $this> */
    public function session(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserSession::class, 'browser_session_id');
    }

    public function toApiArray(): array
    {
        return ['id' => $this->id, 'browser_session_id' => $this->browser_session_id, 'worker_capture_id' => $this->worker_capture_id, 'source_command_id' => $this->source_command_id, 'source_state_version' => $this->source_state_version, 'state_version' => $this->state_version, 'trust_boundary' => $this->trust_boundary, 'type' => $this->type, 'mime' => $this->mime, 'sha256' => $this->sha256, 'metadata' => $this->metadata, 'created_at' => $this->created_at?->toJSON()];
    }
}
