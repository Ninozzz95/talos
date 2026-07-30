<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosArtifactGeneration extends Model
{
    public const STATUS_RUNNING = 'running';

    public const STATUS_SUCCEEDED = 'succeeded';

    public const STATUS_FAILED = 'failed';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_CANCELLATION_REQUESTED = 'cancellation_requested';

    public const STATUS_RECOVERY_REQUIRED = 'recovery_required';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'run_id',
        'artifact_id',
        'document_id',
        'request_hash',
        'format',
        'filename',
        'status',
        'failure_code',
        'started_at',
        'completed_at',
    ];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<TalosRun, $this> */
    public function run(): BelongsTo
    {
        return $this->belongsTo(TalosRun::class, 'run_id');
    }

    /** @return BelongsTo<TalosRunArtifact, $this> */
    public function artifact(): BelongsTo
    {
        return $this->belongsTo(TalosRunArtifact::class, 'artifact_id');
    }

    /** @return BelongsTo<TalosDocument, $this> */
    public function document(): BelongsTo
    {
        return $this->belongsTo(TalosDocument::class, 'document_id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    /** @return array<string, mixed> */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'run_id' => $this->run_id,
            'artifact_id' => $this->artifact_id,
            'document_id' => $this->document_id,
            'format' => $this->format,
            'filename' => $this->filename,
            'status' => $this->status,
            'failure_code' => $this->failure_code,
            'started_at' => $this->started_at?->toJSON(),
            'completed_at' => $this->completed_at?->toJSON(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
