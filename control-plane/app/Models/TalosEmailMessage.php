<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class TalosEmailMessage extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'external_id',
        'from_address',
        'to_addresses',
        'cc_addresses',
        'subject',
        'body',
        'status',
        'received_at',
        'metadata',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'to_addresses' => 'array',
            'cc_addresses' => 'array',
            'metadata' => 'array',
            'received_at' => 'datetime',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(bool $includeBody = false): array
    {
        $data = [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'external_id' => $this->external_id,
            'from' => $this->from_address,
            'to' => $this->to_addresses ?? [],
            'cc' => $this->cc_addresses ?? [],
            'subject' => $this->subject,
            'body_preview' => str((string) preg_split('/\R/', $this->body, 2)[0])->limit(240)->toString(),
            'status' => $this->status,
            'trust_level' => 'untrusted',
            'received_at' => $this->received_at?->toJSON(),
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];

        if ($includeBody) {
            $data['body'] = $this->body;
        }

        return $data;
    }
}
