<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosRunArtifact extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'run_id',
        'artifact_type',
        'uri',
        'mime_type',
        'metadata',
    ];

    /**
     * @return BelongsTo<TalosRun, $this>
     */
    public function run(): BelongsTo
    {
        return $this->belongsTo(TalosRun::class, 'run_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'metadata' => 'array',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeRun = false): array
    {
        $data = [
            'id' => $this->id,
            'run_id' => $this->run_id,
            'artifact_type' => $this->artifact_type,
            'uri' => $this->uri,
            'mime_type' => $this->mime_type,
            'metadata' => $this->redactPrivateMetadata(is_array($this->metadata) ? $this->metadata : []),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeRun) {
            $data['run'] = $this->run?->toApiArray();
        }

        return $data;
    }

    /**
     * @param array<string|int, mixed> $metadata
     * @return array<string|int, mixed>
     */
    private function redactPrivateMetadata(array $metadata): array
    {
        foreach ($metadata as $key => $value) {
            $normalized = strtolower((string) $key);
            if ($normalized === 'storage_disk'
                || $normalized === 'storage_path'
                || str_ends_with($normalized, '_storage_path')
                || $normalized === 'data_base64'
                || str_contains($normalized, 'quarantine')
                || str_contains($normalized, 'password')
                || str_contains($normalized, 'secret')
                || str_contains($normalized, 'api_key')
                || $normalized === 'token'
                || str_ends_with($normalized, '_token')) {
                unset($metadata[$key]);

                continue;
            }
            if (is_array($value)) {
                $metadata[$key] = $this->redactPrivateMetadata($value);
            }
        }

        return $metadata;
    }
}
