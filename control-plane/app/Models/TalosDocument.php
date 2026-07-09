<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosDocument extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'run_id',
        'run_artifact_id',
        'research_report_id',
        'title',
        'document_type',
        'format',
        'status',
        'content',
        'content_hash',
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
     * @return BelongsTo<TalosRunArtifact, $this>
     */
    public function runArtifact(): BelongsTo
    {
        return $this->belongsTo(TalosRunArtifact::class, 'run_artifact_id');
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
    public function toApiArray(bool $includeContent = false, bool $includeProvenance = false): array
    {
        $data = [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'run_id' => $this->run_id,
            'run_artifact_id' => $this->run_artifact_id,
            'research_report_id' => $this->research_report_id,
            'title' => $this->title,
            'document_type' => $this->document_type,
            'format' => $this->format,
            'status' => $this->status,
            'content_hash' => $this->content_hash,
            'content_preview' => str((string) preg_split('/\R/', $this->content, 2)[0])->limit(240)->toString(),
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeContent) {
            $data['content'] = $this->content;
        }

        if ($includeProvenance) {
            $data['provenance'] = [
                'run_id' => $this->run_id,
                'artifact_id' => $this->run_artifact_id,
                'prompt_hash' => $this->run?->prompt_hash,
                'provider' => $this->run?->provider,
                'model' => $this->run?->model,
            ];
        }

        return $data;
    }
}
