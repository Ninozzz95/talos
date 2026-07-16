<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosBrowserEvidenceBundle extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'schema_version', 'task_id', 'action_id', 'user_id', 'talos_session_id',
        'worker_state_version', 'url', 'title', 'captured_at', 'frame',
        'snapshot_artifact_id', 'snapshot_mime', 'snapshot_sha256', 'snapshot_byte_size',
        'snapshot_width', 'snapshot_height', 'snapshot_redaction_status',
        'screenshot_artifact_id', 'screenshot_mime', 'screenshot_sha256', 'screenshot_byte_size',
        'screenshot_width', 'screenshot_height', 'screenshot_redaction_status',
        'before_evidence_id', 'integrity_sha256', 'claims', 'committed_at', 'reconciled_at',
    ];

    /** @param Builder<TalosBrowserEvidenceBundle> $query */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserTask::class, 'task_id');
    }

    public function action(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserAction::class, 'action_id');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'talos_session_id');
    }

    public function snapshotArtifact(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserArtifact::class, 'snapshot_artifact_id');
    }

    public function screenshotArtifact(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserArtifact::class, 'screenshot_artifact_id');
    }

    public function previousEvidence(): BelongsTo
    {
        return $this->belongsTo(self::class, 'before_evidence_id');
    }

    protected function casts(): array
    {
        return [
            'worker_state_version' => 'integer',
            'captured_at' => 'datetime',
            'frame' => 'array',
            'snapshot_byte_size' => 'integer',
            'snapshot_width' => 'integer',
            'snapshot_height' => 'integer',
            'screenshot_byte_size' => 'integer',
            'screenshot_width' => 'integer',
            'screenshot_height' => 'integer',
            'claims' => 'array',
            'committed_at' => 'datetime',
            'reconciled_at' => 'datetime',
        ];
    }
}
