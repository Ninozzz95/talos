<?php

declare(strict_types=1);

namespace App\Services\Cookbook;

use App\Models\TalosHardwareProfile;
use App\Models\TalosModelCatalogEntry;

final class ModelFitScorer
{
    /**
     * @return array{score:int,label:string,reasons:list<string>}
     */
    public function score(TalosModelCatalogEntry $model, ?TalosHardwareProfile $profile): array
    {
        if ($profile === null) {
            return [
                'score' => 0,
                'label' => 'Unknown',
                'reasons' => ['No local hardware profile has been scanned yet.'],
            ];
        }

        $reasons = [];
        $score = 100;

        $ramScore = $this->capacityScore((int) ($model->estimated_ram_mb ?? 0), (int) ($profile->ram_total_mb ?? 0));
        if ($ramScore !== null) {
            $score = min($score, $ramScore);
            $reasons[] = "Estimated RAM {$model->estimated_ram_mb} MB vs local RAM {$profile->ram_total_mb} MB.";
        }

        $vramMb = $this->maxGpuVram($profile);
        $vramScore = $this->capacityScore((int) ($model->estimated_vram_mb ?? 0), $vramMb);
        if ($vramScore !== null) {
            $score = min($score, $vramScore);
            $reasons[] = "Estimated VRAM {$model->estimated_vram_mb} MB vs detected VRAM {$vramMb} MB.";
        } elseif ((int) ($model->estimated_vram_mb ?? 0) > 0) {
            $score = min($score, 65);
            $reasons[] = 'No GPU VRAM was detected by the read-only scanner.';
        }

        if ($reasons === []) {
            return [
                'score' => 0,
                'label' => 'Unknown',
                'reasons' => ['Model memory requirements are unavailable.'],
            ];
        }

        return [
            'score' => max(0, min(100, $score)),
            'label' => $this->label($score),
            'reasons' => $reasons,
        ];
    }

    private function capacityScore(int $requiredMb, int $availableMb): ?int
    {
        if ($requiredMb <= 0 || $availableMb <= 0) {
            return null;
        }

        $ratio = $availableMb / $requiredMb;

        if ($ratio >= 1.5) {
            return 100;
        }

        if ($ratio >= 1.15) {
            return 82;
        }

        if ($ratio >= 1.0) {
            return 62;
        }

        return max(0, (int) floor($ratio * 45));
    }

    private function label(int $score): string
    {
        return match (true) {
            $score >= 90 => 'Perfect',
            $score >= 70 => 'Good',
            $score >= 50 => 'Borderline',
            default => 'Too heavy',
        };
    }

    private function maxGpuVram(TalosHardwareProfile $profile): int
    {
        $gpus = is_array($profile->gpus) ? $profile->gpus : [];
        $max = 0;

        foreach ($gpus as $gpu) {
            if (is_array($gpu)) {
                $max = max($max, (int) ($gpu['vram_mb'] ?? 0));
            }
        }

        return $max;
    }
}
