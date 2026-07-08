<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class TalosConnector extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'key',
        'display_name',
        'description',
        'is_enabled',
        'health_status',
        'capabilities',
        'policy',
        'health_payload',
        'last_checked_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
            'capabilities' => 'array',
            'policy' => 'array',
            'health_payload' => 'array',
            'last_checked_at' => 'datetime',
        ];
    }

    /**
     * @return HasMany<TalosTool>
     */
    public function tools(): HasMany
    {
        return $this->hasMany(TalosTool::class, 'connector_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeTools = false): array
    {
        $payload = [
            'id' => $this->id,
            'key' => $this->key,
            'display_name' => $this->display_name,
            'description' => $this->description,
            'is_enabled' => (bool) $this->is_enabled,
            'health_status' => $this->health_status,
            'capabilities' => $this->capabilities,
            'policy' => $this->policy,
            'health_payload' => $this->health_payload,
            'last_checked_at' => $this->last_checked_at?->toJSON(),
            'tools_count' => $this->tools_count ?? $this->tools()->count(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeTools) {
            $payload['tools'] = $this->tools
                ->map(fn (TalosTool $tool): array => $tool->toApiArray(false))
                ->values()
                ->all();
        }

        return $payload;
    }
}
