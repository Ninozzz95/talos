<?php

declare(strict_types=1);

namespace App\Models;

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
        'status',
        'capabilities',
        'probe_result',
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
            'capabilities' => 'array',
            'probe_result' => 'array',
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
            'status' => $this->status,
            'capabilities' => $this->capabilities,
            'probe_result' => $this->probe_result,
            'has_secret' => filled($this->encrypted_secret),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
