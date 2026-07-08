<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class TalosWorkspaceSetting extends Model
{
    public const DEFAULT_ID = 'default';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'default_model_profile_id',
        'default_context_set_id',
        'preferences',
    ];

    /**
     * @return array<string, mixed>
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'default_model_profile_id' => $this->default_model_profile_id,
            'default_context_set_id' => $this->default_context_set_id,
            'preferences' => self::sanitizePreferences($this->preferences ?? []),
            'created_at' => $this->created_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }

    /**
     * @param mixed $preferences
     * @return array<mixed>
     */
    public static function sanitizePreferences(mixed $preferences): array
    {
        if (! is_array($preferences)) {
            return [];
        }

        $safe = [];
        foreach ($preferences as $key => $value) {
            if (is_string($key) && self::isSecretPreferenceKey($key)) {
                continue;
            }

            $safe[$key] = is_array($value) ? self::sanitizePreferences($value) : $value;
        }

        return $safe;
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'preferences' => 'array',
        ];
    }

    private static function isSecretPreferenceKey(string $key): bool
    {
        $normalized = strtolower($key);

        return str_contains($normalized, 'api_key')
            || str_contains($normalized, 'secret')
            || str_contains($normalized, 'password')
            || str_contains($normalized, 'token');
    }
}
