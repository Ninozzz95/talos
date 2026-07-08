<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class TalosSkill extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'display_name',
        'description',
        'trigger',
        'content',
        'input_schema',
        'output_schema',
        'allowed_tools',
        'risk_level',
        'review_status',
        'eval_status',
        'eval_result',
        'source_type',
        'is_enabled',
        'metadata',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'input_schema' => 'array',
            'output_schema' => 'array',
            'allowed_tools' => 'array',
            'eval_result' => 'array',
            'is_enabled' => 'boolean',
            'metadata' => 'array',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeContent = false): array
    {
        $payload = [
            'id' => $this->id,
            'name' => $this->name,
            'display_name' => $this->display_name,
            'description' => $this->description,
            'trigger' => $this->trigger,
            'content_preview' => mb_strimwidth((string) $this->content, 0, 220, '...'),
            'input_schema' => $this->input_schema,
            'output_schema' => $this->output_schema,
            'allowed_tools' => $this->allowed_tools ?? [],
            'risk_level' => $this->risk_level,
            'review_status' => $this->review_status,
            'eval_status' => $this->eval_status,
            'eval_result' => $this->eval_result,
            'source_type' => $this->source_type,
            'is_enabled' => (bool) $this->is_enabled,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeContent) {
            $payload['content'] = $this->content;
        }

        return $payload;
    }
}
