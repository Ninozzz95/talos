<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class TalosEmailDraft extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'referenced_message_ids',
        'to_addresses',
        'cc_addresses',
        'subject',
        'body',
        'status',
        'send_enabled',
        'metadata',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'referenced_message_ids' => 'array',
            'to_addresses' => 'array',
            'cc_addresses' => 'array',
            'send_enabled' => 'boolean',
            'metadata' => 'array',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'referenced_message_ids' => $this->referenced_message_ids ?? [],
            'to' => $this->to_addresses ?? [],
            'cc' => $this->cc_addresses ?? [],
            'subject' => $this->subject,
            'body' => $this->body,
            'status' => $this->status,
            'send_enabled' => $this->send_enabled,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }
}
