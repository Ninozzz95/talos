<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosNote extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'run_id',
        'scope_type',
        'scope_id',
        'title',
        'content',
        'status',
        'metadata',
        'last_used_at',
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
            'last_used_at' => 'datetime',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeContent = false): array
    {
        $data = [
            'id' => $this->id,
            'run_id' => $this->run_id,
            'scope_type' => $this->scope_type,
            'scope_id' => $this->scope_id,
            'title' => $this->title,
            'content_preview' => str((string) preg_split('/\R/', $this->content, 2)[0])->limit(240)->toString(),
            'status' => $this->status,
            'metadata' => $this->metadata,
            'trust_level' => 'untrusted',
            'last_used_at' => $this->last_used_at?->toJSON(),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeContent) {
            $data['content'] = $this->content;
        }

        return $data;
    }
}
