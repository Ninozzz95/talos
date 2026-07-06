<?php
/**
 * TALOS AVM — Boot Animation
 * Terminal-playable ANSI/ASCII animation in pure PHP.
 *
 * Usage:
 *   php talos_boot_animation.php
 *
 * Integration:
 *   require_once __DIR__ . '/talos_boot_animation.php';
 *   talos_boot_animation();
 */

function talos_write_at(int $x, int $y, string $text, string $color = ''): void
{
    echo "\033[{$y};{$x}H{$color}{$text}\033[0m\033[48;2;13;17;23m";
}

function talos_center_x(string $text, int $cols): int
{
    return max(1, intdiv($cols - mb_strlen($text), 2));
}

function talos_term_size(): array
{
    $cols = 100;
    $rows = 32;

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
    mt_srand((int)($t * 2000));

    $chars = ['·', '˙', '•', '⠂', '⠄', '*'];

    for ($i = 0; $i < $density; $i++) {
        $x = mt_rand(2, max(3, $cols - 2));
        $rise = mt_rand(1, max(2, (int)($rows * 0.35)));
        $drift = (int)fmod($t * mt_rand(1, 5), max(2, intdiv($rows, 4)));
        $y = $rows - $rise - $drift;

        if ($y < 1 || $y > $rows) {
            continue;
        }

        $char = $chars[array_rand($chars)];
        $color = $colors[array_rand($colors)];
        talos_write_at($x, $y, $char, $color);
    }
}

function talos_phase_forge(int $cols, int $rows, float $elapsed, array $ansi): void
{
    talos_clear($ansi['dark']);
    talos_sparks($cols, $rows, $elapsed, 45, [$ansi['dim'], $ansi['bronze'], $ansi['amber']]);

    $title = 'HEPHAESTUS ANVIL INITIALIZING';
    $titleLen = mb_strlen($title);
    $pulse = (int)(((sin($elapsed * 12) + 1) * 0.5) * $titleLen);
    $visible = $elapsed < 0.75 ? mb_substr($title, 0, max(1, $pulse)) : $title;

    talos_write_at(talos_center_x($visible, $cols), intdiv($rows, 2), $visible, $ansi['amber']);

    if (((int)($elapsed * 6)) % 2 === 0) {
        talos_write_at(talos_center_x('◆', $cols), intdiv($rows, 2) + 2, '◆', $ansi['bronze']);
    }

    flush();
}

function talos_phase_guardian(int $cols, int $rows, float $elapsed, array $ansi): void
{
    $shield = [
        '              ╔══════════════════════╗              ',
        '          ╔═══╝ ▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜ ╚═══╗          ',
        '       ╔══╝ ▛▀▀▀  ╔══════════╗  ▀▀▀▜ ╚══╗       ',
        '     ╔═╝ ▛▀▀      ║  TALOS   ║      ▀▀▜ ╚═╗     ',
        '    ║  ▛▀  ╔══════╩══════════╩══════╗  ▀▜  ║    ',
        '    ║  ▌   ║  ▞▚  ▞▚  ▞▚  ▞▚  ▞▚   ║   ▐  ║    ',
        '    ║  ▌   ║  ▚▞  ▚▞  ▚▞  ▚▞  ▚▞   ║   ▐  ║    ',
        '    ║  ▙▄  ╚══════╦══════════╦══════╝  ▄▟  ║    ',
        '     ╚═╗ ▙▄▄      ║  AVM     ║      ▄▄▟ ╔═╝     ',
        '       ╚══╗ ▙▄▄▄  ╚══════════╝  ▄▄▄▟ ╔══╝       ',
        '          ╚═══╗ ▙▄▄▄▄▄▄▄▄▄▄▄▄▟ ╔═══╝          ',
        '              ╚══════════════════════╝              ',
    ];

    $modules = [
        'ICHOR CORE',
        'BRONZE SHELL',
        'JMP GATE',
        'DAG TOPOLOGY',
        'HMI LINK',
        'VALIDATOR',
        'EVENT LOOP',
        'SENTINEL WATCH',
    ];

    talos_clear($ansi['dark']);
    talos_sparks($cols, $rows, $elapsed + 2, 30, [$ansi['dim'], $ansi['bronze'], $ansi['amber']]);

    $reveal = min(1.0, $elapsed / 1.2);
    $shownLines = (int)(count($shield) * $reveal);
    $startY = max(2, intdiv($rows, 2) - intdiv(count($shield), 2) - 2);

    for ($i = 0; $i < $shownLines; $i++) {
        $color = ($elapsed > 1.15 && $elapsed < 1.35) ? $ansi['gold'] : $ansi['bronze'];
        talos_write_at(talos_center_x($shield[$i], $cols), $startY + $i, $shield[$i], $color);
    }

    if ($elapsed > 0.35) {
        $msg = 'MATERIALIZING HOPLON GUARDIAN';
        talos_write_at(talos_center_x($msg, $cols), $startY + count($shield) + 1, $msg, $ansi['text']);
    }

    $baseY = $startY + count($shield) + 3;
    $count = min(count($modules), max(0, (int)(($elapsed - 0.45) * 5)));

    for ($i = 0; $i < $count; $i++) {
        $line = sprintf('[OK] %-18s :: ONLINE', $modules[$i]);
        $color = $i === $count - 1 ? $ansi['amber'] : $ansi['text'];
        talos_write_at(talos_center_x($line, $cols), $baseY + $i, $line, $color);
    }

    flush();
}

function talos_phase_standby(int $cols, int $rows, float $elapsed, array $ansi): void
{
    $logo = [
        '╔══════╗',
        '║TALOS ║',
        '╚══════╝',
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

    foreach ($logo as $i => $line) {
        talos_write_at(3, 2 + $i, $line, $ansi['bronze']);
    }

    talos_write_at(15, 3, 'TALOS AVM :: STANDBY', $ansi['gold']);

    $cursor = ((int)($elapsed * 3)) % 2 === 0 ? '_' : ' ';
    talos_write_at(15, 7, 'talos > ' . $cursor, $ansi['amber']);

    $fadeCount = min(count($commands), max(0, (int)($elapsed * 4)));
    for ($i = 0; $i < $fadeCount; $i++) {
        talos_write_at(15, 10 + $i, $commands[$i], $ansi['text']);
    }

    talos_write_at(
        15,
        max(12, $rows - 3),
        'guardian online | no faces | no wings | deterministic execution',
        $ansi['muted']
    );

    flush();
}

function talos_boot_animation(float $duration = 4.0, int $fps = 12): void
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
            } elseif ($elapsed < 2.5) {
                talos_phase_guardian($cols, $rows, $elapsed - 1.0, $ansi);
            } else {
                talos_phase_standby($cols, $rows, $elapsed - 2.5, $ansi);
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
