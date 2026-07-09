<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class TalosModelCatalogEntry extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'provider',
        'model_id',
        'display_name',
        'parameters_b',
        'quantization',
        'context_window',
        'runtime_modes',
        'estimated_vram_mb',
        'estimated_ram_mb',
        'tags',
        'source_url',
        'status',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'parameters_b' => 'float',
            'context_window' => 'integer',
            'runtime_modes' => 'array',
            'estimated_vram_mb' => 'integer',
            'estimated_ram_mb' => 'integer',
            'tags' => 'array',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'provider' => $this->provider,
            'model_id' => $this->model_id,
            'display_name' => $this->display_name,
            'parameters_b' => $this->parameters_b,
            'quantization' => $this->quantization,
            'context_window' => $this->context_window,
            'runtime_modes' => $this->runtime_modes ?? [],
            'estimated_vram_mb' => $this->estimated_vram_mb,
            'estimated_ram_mb' => $this->estimated_ram_mb,
            'tags' => $this->tags ?? [],
            'source_url' => $this->source_url,
            'status' => $this->status,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
