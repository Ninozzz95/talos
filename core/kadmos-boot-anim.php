<?php
/**
 * KADMOS AVM — Optimized Boot Animation v6
 * Terminal-playable ANSI/ASCII animation in pure PHP.
 *
 * Usage:
 *   php talos_boot_animation_v5.php
 *
 * Integration:
 *   require_once __DIR__ . '/talos_boot_animation_v5.php';
 *   talos_boot_animation();
 */

function talos_write_at(int $x, int $y, string $text, string $color = ''): void
{
    echo "\033[{$y};{$x}H{$color}{$text}\033[0m\033[48;2;13;17;23m";
}

function talos_strlen(string $text): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($text, 'UTF-8');
    }
    return strlen($text);
}

function talos_substr(string $text, int $start, ?int $length = null): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($text, $start, $length, 'UTF-8');
    }
    return $length === null ? substr($text, $start) : substr($text, $start, $length);
}

function talos_center_x(string $text, int $cols): int
{
    return max(1, intdiv($cols - talos_strlen($text), 2));
}

function talos_term_size(): array
{
    $cols = 110;
    $rows = 34;

    if (function_exists('shell_exec')) {
        $stty = @shell_exec('stty size 2>/dev/null');
        if (is_string($stty) && preg_match('/(\d+)\s+(\d+)/', trim($stty), $m)) {
            $rows = (int)$m[1];
            $cols = (int)$m[2];
        }
    }

    $envCols = getenv('COLUMNS');
    $envRows = getenv('LINES');

    if ($envCols !== false && ctype_digit((string)$envCols)) {
        $cols = (int)$envCols;
    }

    if ($envRows !== false && ctype_digit((string)$envRows)) {
        $rows = (int)$envRows;
    }

    return [$cols, $rows];
}

function talos_clear(string $dark): void
{
    echo $dark . "\033[2J\033[H";
}

function talos_sparks(int $cols, int $rows, float $t, int $density, array $colors): void
{
    // Calm deterministic embers. No aggressive random flicker.
    mt_srand(1337);

    $chars = ['·', '˙', '•'];

    for ($i = 0; $i < $density; $i++) {
        $baseX = mt_rand(2, max(3, $cols - 2));
        $baseY = $rows - mt_rand(1, max(2, (int)($rows * 0.28)));
        $speed = mt_rand(1, 3) / 3.0;
        $drift = (int)(((int)($t * $speed * 2) + $i) % max(2, intdiv($rows, 5)));
        $y = $baseY - $drift;

        if ($y < 1 || $y > $rows) {
            continue;
        }

        $char = $chars[$i % count($chars)];
        $color = $colors[$i % count($colors)];
        talos_write_at($baseX, $y, $char, $color);
    }
}

function talos_draw_box(int $x, int $y, int $w, int $h, string $color): void
{
    if ($w < 4 || $h < 3) {
        return;
    }

    talos_write_at($x, $y, '╔' . str_repeat('═', $w - 2) . '╗', $color);
    for ($i = 1; $i < $h - 1; $i++) {
        talos_write_at($x, $y + $i, '║' . str_repeat(' ', $w - 2) . '║', $color);
    }
    talos_write_at($x, $y + $h - 1, '╚' . str_repeat('═', $w - 2) . '╝', $color);
}

function talos_big_logo(): array
{
    return [
        '████████╗ █████╗ ██╗      ██████╗ ███████╗',
        '╚══██╔══╝██╔══██╗██║     ██╔═══██╗██╔════╝',
        '   ██║   ███████║██║     ██║   ██║███████╗',
        '   ██║   ██╔══██║██║     ██║   ██║╚════██║',
        '   ██║   ██║  ██║███████╗╚██████╔╝███████║',
        '   ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝',
    ];
}

function talos_phase_forge(int $cols, int $rows, float $elapsed, array $ansi): void
{
    talos_clear($ansi['dark']);
    talos_sparks($cols, $rows, $elapsed, 18, [$ansi['dim'], $ansi['bronze']]);

    $title = 'HEPHAESTUS ANVIL INITIALIZING';
    $titleLen = talos_strlen($title);
    $visibleLen = min($titleLen, max(1, (int)floor($titleLen * min(1.0, $elapsed / 0.85))));
    $visible = talos_substr($title, 0, $visibleLen);

    $meander = '╔═▣═▣═▣═▣═▣═▣═▣═▣═▣═▣═▣═╗';
    talos_write_at(talos_center_x($meander, $cols), intdiv($rows, 2) - 3, $meander, $ansi['dim']);
    talos_write_at(talos_center_x($visible, $cols), intdiv($rows, 2), $visible, $ansi['amber']);
    talos_write_at(talos_center_x('◆  ◆  ◆', $cols), intdiv($rows, 2) + 2, '◆  ◆  ◆', $ansi['bronze']);

    flush();
}

function talos_phase_guardian(int $cols, int $rows, float $elapsed, array $ansi): void
{
    $shield = [
        '                    ╔════════════════════════════════╗                    ',
        '              ╔═════╝ ▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜ ╚═════╗              ',
        '          ╔═══╝ ▛▀▀▀     ╔══════════════════╗     ▀▀▀▜ ╚═══╗          ',
        '        ╔═╝ ▛▀▀          ║   HOPLON AVM     ║          ▀▀▜ ╚═╗        ',
        '      ╔═╝ ▛▀    ╔════════╩══════════════════╩════════╗    ▀▜ ╚═╗      ',
        '     ║  ▛▀      ║  ▞▚ ▞▚ ▞▚ ▞▚ ▞▚ ▞▚ ▞▚ ▞▚ ▞▚ ▞▚  ║      ▀▜  ║     ',
        '     ║  ▌       ║  ▚▞ ▚▞ ▚▞ ▚▞ ▚▞ ▚▞ ▚▞ ▚▞ ▚▞ ▚▞  ║       ▐  ║     ',
        '     ║  ▌       ║                                      ║       ▐  ║     ',
        '     ║  ▙▄      ║        BRONZE SENTINEL ONLINE       ║      ▄▟  ║     ',
        '      ╚═╗ ▙▄    ╚════════╦══════════════════╦════════╝    ▄▟ ╔═╝      ',
        '        ╚═╗ ▙▄▄          ║    ICHOR BUS     ║          ▄▄▟ ╔═╝        ',
        '          ╚═══╗ ▙▄▄▄     ╚══════════════════╝     ▄▄▄▟ ╔═══╝          ',
        '              ╚═════╗ ▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟ ╔═════╝              ',
        '                    ╚════════════════════════════════╝                    ',
    ];

    $modules = [
        'ICHOR CORE',
        'BRONZE SHELL',
        'JMP GATE',
        'DAG TOPOLOGY',
        'HMI DASHBOARD',
        'BATCH VALIDATOR',
        'EVENT LOOP',
        'SENTINEL WATCH',
    ];

    talos_clear($ansi['dark']);
    talos_sparks($cols, $rows, $elapsed + 2, 10, [$ansi['dim'], $ansi['bronze']]);

    $logo = talos_big_logo();
    $logoReveal = min(1.0, max(0.0, ($elapsed - 0.25) / 0.85));
    $shownLogo = (int)(count($logo) * $logoReveal);

    $startY = max(2, intdiv($rows, 2) - intdiv(count($shield), 2) - 6);
    $reveal = min(1.0, $elapsed / 1.15);
    $shownLines = (int)(count($shield) * $reveal);

    for ($i = 0; $i < $shownLines; $i++) {
        talos_write_at(talos_center_x($shield[$i], $cols), $startY + $i, $shield[$i], $ansi['bronze']);
    }

    $logoY = $startY + 3;
    for ($i = 0; $i < $shownLogo; $i++) {
        $line = $logo[$i];
        talos_write_at(talos_center_x($line, $cols), $logoY + $i, $line, $ansi['bronze']);
    }

    if ($elapsed > 0.35) {
        $msg = 'MATERIALIZING HOPLON GUARDIAN :: KADMOS AVM';
        talos_write_at(talos_center_x($msg, $cols), $startY + count($shield) + 1, $msg, $ansi['text']);
    }

    $baseY = $startY + count($shield) + 3;
    $count = min(count($modules), max(0, (int)(($elapsed - 0.45) * 5)));

    for ($i = 0; $i < $count; $i++) {
        $line = sprintf('⟦OK⟧ %-18s :: ONLINE', $modules[$i]);
        $color = $i === $count - 1 ? $ansi['amber'] : $ansi['text'];
        talos_write_at(talos_center_x($line, $cols), $baseY + $i, $line, $color);
    }

    flush();
}

function talos_phase_standby(int $cols, int $rows, float $elapsed, array $ansi): void
{
    $shield = [
        '                    ╔════════════════════════════════════════════╗                    ',
        '              ╔═════╝ ▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜ ╚═════╗              ',
        '          ╔═══╝ ▛▀▀▀                                          ▀▀▀▜ ╚═══╗          ',
        '        ╔═╝ ▛▀                                                  ▀▜ ╚═╗        ',
        '      ╔═╝ ▛▀      ████████╗ █████╗ ██╗      ██████╗ ███████╗      ▀▜ ╚═╗      ',
        '     ║  ▛▀        ╚══██╔══╝██╔══██╗██║     ██╔═══██╗██╔════╝        ▀▜  ║     ',
        '     ║  ▌            ██║   ███████║██║     ██║   ██║███████╗         ▐  ║     ',
        '     ║  ▌            ██║   ██╔══██║██║     ██║   ██║╚════██║         ▐  ║     ',
        '     ║  ▌            ██║   ██║  ██║███████╗╚██████╔╝███████║         ▐  ║     ',
        '     ║  ▙▄           ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝        ▄▟  ║     ',
        '      ╚═╗ ▙▄    ╔════════════════════════════════════════════╗    ▄▟ ╔═╝      ',
        '        ╚═╗ ▙▄▄ ║       AVM GUARDIAN :: ICHOR CORE        ║ ▄▄▟ ╔═╝        ',
        '          ╚═══╗ ╚══════════════╦══════════════╦══════════════╝ ╔═══╝          ',
        '              ╚═════╗ ▙▄▄▄▄▄▄▄ ║  STANDBY     ║ ▄▄▄▄▄▄▄▟ ╔═════╝              ',
        '                    ╚══════════╩══════════════╩══════════╝                    ',
    ];

    $commands = [
        'start [N] [--mock]    Launch the main event loop',
        'dashboard             Start validator + HMI dashboard',
        'validate <file>       Validate a JMP JSON batch',
        'test                  Run all test suites',
        'demo                  Run HMI demo',
        'status                Show system status',
    ];

    talos_clear($ansi['dark']);

    $shieldY = 2;
    foreach ($shield as $i => $line) {
        $color = ($i >= 4 && $i <= 9) ? $ansi['amber'] : $ansi['bronze'];
        talos_write_at(talos_center_x($line, $cols), $shieldY + $i, $line, $color);
    }

    $panelW = min(92, max(64, $cols - 10));
    $panelX = talos_center_x(str_repeat(' ', $panelW), $cols);
    $panelY = $shieldY + count($shield) + 2;
    talos_draw_box($panelX, $panelY, $panelW, 11, $ansi['dim']);

    talos_write_at($panelX + 3, $panelY + 1, 'KADMOS AVM :: STANDBY', $ansi['gold']);
    talos_write_at($panelX + 3, $panelY + 2, 'guardian online | JMP gate sealed | deterministic execution', $ansi['muted']);

    // Static cursor: no blinking/flicker.
    talos_write_at($panelX + 3, $panelY + 4, 'talos > _', $ansi['amber']);

    foreach ($commands as $i => $cmd) {
        talos_write_at($panelX + 3, $panelY + 6 + $i, $cmd, $ansi['text']);
    }

    flush();
}

function talos_boot_animation(float $duration = 4.0, int $fps = 8): void
{
    if (function_exists('mb_internal_encoding')) {
        mb_internal_encoding('UTF-8');
    }

    $ansi = [
        'dark'   => "\033[48;2;13;17;23m",
        'reset'  => "\033[0m",
        'hide'   => "\033[?25l",
        'show'   => "\033[?25h",
        'bronze' => "\033[38;2;184;134;11m",
        'gold'   => "\033[38;2;255;215;0m",
        'amber'  => "\033[38;2;255;191;0m",
        'dim'    => "\033[38;2;120;89;20m",
        'text'   => "\033[38;2;210;178;92m",
        'muted'  => "\033[38;2;90;98;112m",
    ];

    [$cols, $rows] = talos_term_size();
    $frameDelayUs = (int)(1000000 / max(1, $fps));
    $start = microtime(true);

    echo $ansi['hide'] . $ansi['dark'];

    try {
        while (true) {
            $elapsed = microtime(true) - $start;

            if ($elapsed >= $duration) {
                break;
            }

            if ($elapsed < 1.0) {
                talos_phase_forge($cols, $rows, $elapsed, $ansi);
            } elseif ($elapsed < 2.75) {
                talos_phase_guardian($cols, $rows, $elapsed - 1.0, $ansi);
            } else {
                talos_phase_standby($cols, $rows, $elapsed - 2.75, $ansi);
            }

            usleep($frameDelayUs);
        }

        talos_phase_standby($cols, $rows, 2.0, $ansi);
    } finally {
        echo $ansi['reset'] . $ansi['show'] . PHP_EOL;
        flush();
    }
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    talos_boot_animation();
}
