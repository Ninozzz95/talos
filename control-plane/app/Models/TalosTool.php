<?php

declare(strict_types=1);

namespace App\Models;

use App\Services\Tools\TalosToolContractMapper;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Kadmos\Alignment\Contract\ToolDefinitionV1;

final class TalosTool extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'connector_id',
        'name',
        'display_name',
        'description',
        'input_schema',
        'output_schema',
        'risk_level',
        'capability',
        'capabilities',
        'actions',
        'confirmation',
        'effects',
        'lifecycle_kind',
        'lifecycle_integrity_sha256',
        'execution_locations',
        'implementation_key',
        'schema_version',
        'contract_revision',
        'policy',
        'is_enabled',
        'planning_enabled',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'input_schema' => 'array',
            'output_schema' => 'array',
            'capabilities' => 'array',
            'actions' => 'array',
            'effects' => 'array',
            'execution_locations' => 'array',
            'schema_version' => 'integer',
            'contract_revision' => 'integer',
            'policy' => 'array',
            'is_enabled' => 'boolean',
            'planning_enabled' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<TalosConnector, TalosTool>
     */
    public function connector(): BelongsTo
    {
        return $this->belongsTo(TalosConnector::class, 'connector_id');
    }

    /**
     * @param Builder<TalosTool> $query
     * @return Builder<TalosTool>
     */
    public function scopeAvailableForPlanning(Builder $query): Builder
    {
        return $query
            ->where('talos_tools.is_enabled', true)
            ->where('talos_tools.planning_enabled', true)
            ->whereHas(
                'connector',
                fn (Builder $connector): Builder => $connector
                    ->where('is_enabled', true)
                    ->where('health_status', 'healthy'),
            );
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeConnector = true): array
    {
        $connector = $includeConnector && $this->relationLoaded('connector') && $this->connector instanceof TalosConnector
            ? $this->connector->toApiArray()
            : null;

        return TalosToolContractMapper::apiEnvelope($this->toContractV1(), $this->toLegacyApiArray(), $connector);
    }

    public function toContractV1(): ToolDefinitionV1
    {
        return TalosToolContractMapper::fromModel($this);
    }

    /** @return array<string, mixed> */
    public function toLegacyApiArray(): array
    {
        return [
            'id' => $this->id,
            'connector_id' => $this->connector_id,
            'name' => $this->name,
            'display_name' => $this->display_name,
            'description' => $this->description,
            'input_schema' => $this->input_schema,
            'risk_level' => $this->risk_level,
            'capability' => $this->capability,
            'policy' => $this->policy,
            'is_enabled' => (bool) $this->is_enabled,
            'planning_enabled' => (bool) $this->planning_enabled,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
