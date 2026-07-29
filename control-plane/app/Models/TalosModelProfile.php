<?php

declare(strict_types=1);

namespace App\Models;

use App\Services\Models\ProviderPromptCacheCapabilityTable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class TalosModelProfile extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'provider',
        'model',
        'display_name',
        'encrypted_secret',
        'base_url',
        'timeout_seconds',
        'status',
        'capabilities',
        'probe_result',
        'effort_levels',
        'supports_thinking',
        'show_in_composer',
    ];

    protected $hidden = [
        'encrypted_secret',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'timeout_seconds' => 'integer',
            'capabilities' => 'array',
            'probe_result' => 'array',
            'effort_levels' => 'array',
            'supports_thinking' => 'boolean',
            'show_in_composer' => 'boolean',
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
            'provider' => $this->provider,
            'model' => $this->model,
            'display_name' => $this->display_name,
            'base_url' => $this->base_url,
            'timeout_seconds' => $this->timeout_seconds,
            'status' => $this->status,
            'capabilities' => $this->capabilities,
            'probe_result' => $this->probe_result,
            'effort_levels' => $this->effort_levels ?? [],
            'supports_thinking' => (bool) $this->supports_thinking,
            'show_in_composer' => (bool) $this->show_in_composer,
            'prompt_cache_capability' => ProviderPromptCacheCapabilityTable::resolve(
                (string) $this->provider,
                (string) $this->model,
            ),
            'has_secret' => filled($this->encrypted_secret),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
