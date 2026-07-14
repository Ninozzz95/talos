<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosModelProfile;
use Kadmos\Provider\ProviderTurnAdapter;

interface TalosProviderAdapterResolver
{
    public function resolve(TalosModelProfile $profile, string $decryptedSecret): ProviderTurnAdapter;
}
