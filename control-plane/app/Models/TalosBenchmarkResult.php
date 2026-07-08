<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosBenchmarkResult extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'benchmark_group_id',
        'mode',
        'label',
        'status',
        'prompt_hash',
        'context_hash',
        'evaluator_version',
        'metrics',
        'raw_report',
        'raw_log_path',
        'trace_replayable',
    ];

    /**
     * @return BelongsTo<TalosBenchmarkGroup, $this>
     */
    public function group(): BelongsTo
    {
        return $this->belongsTo(TalosBenchmarkGroup::class, 'benchmark_group_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'metrics' => 'array',
            'raw_report' => 'array',
            'trace_replayable' => 'boolean',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'benchmark_group_id' => $this->benchmark_group_id,
            'mode' => $this->mode,
            'label' => $this->label,
            'status' => $this->status,
            'prompt_hash' => $this->prompt_hash,
            'context_hash' => $this->context_hash,
            'evaluator_version' => $this->evaluator_version,
            'metrics' => $this->metrics ?? [],
            'raw_report' => $this->raw_report ?? [],
            'raw_log_path' => $this->raw_log_path,
            'trace_replayable' => $this->trace_replayable,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
