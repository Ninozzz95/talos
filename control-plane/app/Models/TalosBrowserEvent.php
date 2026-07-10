<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class TalosBrowserEvent extends Model
{
    use HasUuids;
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['browser_session_id', 'user_id', 'type', 'actor', 'url_before', 'url_after', 'payload', 'policy_decision'];
    protected function casts(): array { return ['payload' => 'array', 'policy_decision' => 'array']; }
    /** @return BelongsTo<TalosBrowserSession, $this> */
    public function session(): BelongsTo { return $this->belongsTo(TalosBrowserSession::class, 'browser_session_id'); }
    public function toApiArray(): array { return ['id' => $this->id, 'type' => $this->type, 'actor' => $this->actor, 'url_before' => $this->url_before, 'url_after' => $this->url_after, 'payload' => $this->payload, 'policy_decision' => $this->policy_decision, 'created_at' => $this->created_at?->toJSON()]; }
}
