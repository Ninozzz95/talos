<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosBrowserHmiApproval extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'browser_session_id',
        'command_id',
        'interaction_id',
        'artifact_id',
        'artifact_sha256',
        'state_version',
        'normalized_x',
        'normalized_y',
        'button',
        'click_count',
        'target_fingerprint',
        'category',
        'status',
        'payload_version',
        'payload',
        'payload_hash',
        'request_hash',
        'expires_at',
        'approved_at',
        'execution_started_at',
        'execution_payload',
        'execution_lease_token',
        'execution_lease_expires_at',
        'execution_attempts',
        'rejected_at',
        'consumed_at',
        'result_payload',
    ];

    protected function casts(): array
    {
        return [
            'state_version' => 'integer',
            'normalized_x' => 'float',
            'normalized_y' => 'float',
            'click_count' => 'integer',
            'payload' => 'array',
            'expires_at' => 'datetime',
            'approved_at' => 'datetime',
            'execution_started_at' => 'datetime',
            'execution_payload' => 'array',
            'execution_lease_expires_at' => 'datetime',
            'execution_attempts' => 'integer',
            'rejected_at' => 'datetime',
            'consumed_at' => 'datetime',
            'result_payload' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return BelongsTo<TalosBrowserSession, $this> */
    public function browserSession(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserSession::class, 'browser_session_id');
    }

    /** @return BelongsTo<TalosBrowserArtifact, $this> */
    public function artifact(): BelongsTo
    {
        return $this->belongsTo(TalosBrowserArtifact::class, 'artifact_id');
    }
}
