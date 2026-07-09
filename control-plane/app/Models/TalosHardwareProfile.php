<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class TalosHardwareProfile extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'host_fingerprint',
        'os',
        'cpu_model',
        'cpu_cores',
        'ram_total_mb',
        'ram_free_mb',
        'gpus',
        'runtimes',
        'raw_evidence',
        'scanned_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'cpu_cores' => 'integer',
            'ram_total_mb' => 'integer',
            'ram_free_mb' => 'integer',
            'gpus' => 'array',
            'runtimes' => 'array',
            'raw_evidence' => 'array',
            'scanned_at' => 'datetime',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'host_fingerprint' => $this->host_fingerprint,
            'os' => $this->os,
            'cpu_model' => $this->cpu_model,
            'cpu_cores' => $this->cpu_cores,
            'ram_total_mb' => $this->ram_total_mb,
            'ram_free_mb' => $this->ram_free_mb,
            'gpus' => $this->gpus ?? [],
            'runtimes' => $this->runtimes ?? [],
            'raw_evidence' => $this->raw_evidence ?? [],
            'scanned_at' => $this->scanned_at?->toJSON(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
