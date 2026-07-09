<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosRun extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'session_id',
        'model_profile_id',
        'model_routing_profile_id',
        'context_set_id',
        'mode',
        'status',
        'prompt_hash',
        'prompt',
        'provider',
        'model',
        'metadata',
        'started_at',
        'completed_at',
    ];

    /**
     * @return BelongsTo<TalosSession, $this>
     */
    public function session(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'session_id');
    }

    /**
     * @return BelongsTo<TalosModelProfile, $this>
     */
    public function modelProfile(): BelongsTo
    {
        return $this->belongsTo(TalosModelProfile::class, 'model_profile_id');
    }

    /**
     * @return BelongsTo<TalosModelRoutingProfile, $this>
     */
    public function modelRoutingProfile(): BelongsTo
    {
        return $this->belongsTo(TalosModelRoutingProfile::class, 'model_routing_profile_id');
    }

    /**
     * @return BelongsTo<TalosContextSet, $this>
     */
    public function contextSet(): BelongsTo
    {
        return $this->belongsTo(TalosContextSet::class, 'context_set_id');
    }

    /**
     * @return HasMany<TalosRunEvent, $this>
     */
    public function events(): HasMany
    {
        return $this->hasMany(TalosRunEvent::class, 'run_id');
    }

    /**
     * @return HasMany<TalosRunArtifact, $this>
     */
    public function artifacts(): HasMany
    {
        return $this->hasMany(TalosRunArtifact::class, 'run_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'session_id' => $this->session_id,
            'model_profile_id' => $this->model_profile_id,
            'model_routing_profile_id' => $this->model_routing_profile_id,
            'context_set_id' => $this->context_set_id,
            'mode' => $this->mode,
            'status' => $this->status,
            'prompt_hash' => $this->prompt_hash,
            'provider' => $this->provider,
            'model' => $this->model,
            'metadata' => $this->metadata,
            'started_at' => $this->started_at?->toJSON(),
            'completed_at' => $this->completed_at?->toJSON(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
