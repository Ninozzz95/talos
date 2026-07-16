<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\GuardsLegacyBrowserWrites;
use App\Services\Talos\Browser\TalosBrowserRedactor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosBrowserSession extends Model
{
    use GuardsLegacyBrowserWrites, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $attributes = ['worker_state_version' => 0];

    protected $fillable = ['user_id', 'talos_session_id', 'worker_session_id', 'status', 'mode', 'current_url', 'current_title', 'viewport_width', 'viewport_height', 'capabilities', 'policy', 'worker_state_version', 'last_snapshot_artifact_id', 'last_screenshot_artifact_id', 'expires_at', 'last_seen_at'];

    protected function casts(): array
    {
        return ['capabilities' => 'array', 'policy' => 'array', 'worker_state_version' => 'integer', 'expires_at' => 'datetime', 'last_seen_at' => 'datetime'];
    }

    /** @return HasMany<TalosBrowserEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(TalosBrowserEvent::class, 'browser_session_id');
    }

    /** @return HasMany<TalosBrowserArtifact, $this> */
    public function artifacts(): HasMany
    {
        return $this->hasMany(TalosBrowserArtifact::class, 'browser_session_id');
    }

    /** @return BelongsTo<TalosSession, $this> */
    public function talosSession(): BelongsTo
    {
        return $this->belongsTo(TalosSession::class, 'talos_session_id');
    }

    public function toApiArray(): array
    {
        return ['id' => $this->id, 'talos_session_id' => $this->talos_session_id, 'status' => $this->status, 'mode' => $this->mode, 'current_url' => $this->current_url, 'current_title' => $this->current_title, 'viewport' => ['width' => $this->viewport_width, 'height' => $this->viewport_height], 'capabilities' => $this->apiCapabilities(), 'policy' => $this->policy, 'state_version' => (int) $this->worker_state_version, 'last_snapshot_artifact_id' => $this->last_snapshot_artifact_id, 'last_screenshot_artifact_id' => $this->last_screenshot_artifact_id, 'expires_at' => $this->expires_at?->toJSON(), 'last_seen_at' => $this->last_seen_at?->toJSON(), 'created_at' => $this->created_at?->toJSON(), 'updated_at' => $this->updated_at?->toJSON()];
    }

    /** @return list<string> */
    public function apiCapabilities(): array
    {
        $capabilities = is_array($this->capabilities) ? $this->capabilities : [];
        if (array_is_list($capabilities)) {
            $supported = ['navigate', 'screenshot', 'snapshot'];

            return array_values(array_unique(array_filter(
                $capabilities,
                static fn (mixed $capability): bool => is_string($capability) && in_array($capability, $supported, true),
            )));
        }

        $names = [];
        foreach (['navigation' => 'navigate', 'screenshots' => 'screenshot', 'accessibilitySnapshot' => 'snapshot', 'hmiActions' => 'interact'] as $workerName => $apiName) {
            if (($capabilities[$workerName] ?? false) === true) {
                $names[] = $apiName;
            }
        }

        return $names;
    }

    public function supportsBrowserOperation(string $operation): bool
    {
        if ($operation === 'read') {
            return in_array('snapshot', $this->apiCapabilities(), true);
        }

        return in_array($operation, $this->apiCapabilities(), true);
    }

    public function isOperable(): bool
    {
        return in_array($this->status, ['ready', 'active'], true)
            && $this->expires_at !== null
            && $this->expires_at->isFuture();
    }

    public function setCurrentUrlAttribute(?string $value): void
    {
        $this->attributes['current_url'] = TalosBrowserRedactor::url($value);
    }
}
