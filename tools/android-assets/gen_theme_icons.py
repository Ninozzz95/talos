#!/usr/bin/env python3
"""Generate the 14 per-theme Android adaptive launcher icons for TALOS mobile.

Owner (2026-07-24): the launcher icon follows the active theme preset. Each of
the 14 presets gets its own adaptive icon: preset BACKGROUND behind the exact
completed boot symbol (rested shield + lit DAG, without the boot wordmark).

minSdk is 26, so ONLY mipmap-anydpi-v26 adaptive icons are needed (no legacy
raster fallback). Source of truth is the versioned
src/assets/talosBootFinalFrame.json contract. Circles are expressed as paths
and diagonal branches as rotated VectorDrawable groups.

Regenerate after any preset table / mark change:
    python tools/android-assets/gen_theme_icons.py

Verify tracked outputs without writing:
    python tools/android-assets/gen_theme_icons.py --check
"""
import argparse
import json
import os
import sys

# (id, background, accent) — kept in TALOS_THEME_IDS order
# (src/lib/talosThemes.ts). Launcher aliases remain preset-scoped, as before.
PRESETS = [
    ("forge",     "#080b11", "#c98b32"),
    ("paper",     "#f8fafc", "#a96617"),
    ("terminal",  "#020403", "#63f08e"),
    ("aurora",    "#071113", "#42e7c7"),
    ("glacier",   "#f4f9fb", "#2367d1"),
    ("ember",     "#10090a", "#ff5c62"),
    ("atlas",     "#07101f", "#d49a52"),
    ("noir",      "#050505", "#f2f2f2"),
    ("signal",    "#091011", "#ff6f61"),
    ("violet",    "#0d0a19", "#b794f6"),
    ("claudius",  "#faf9f5", "#d97757"),
    ("basicus",   "#fafafa", "#1976d2"),
    ("telemetry", "#0b0f11", "#6ad4d4"),
    ("calm",      "#1e1f22", "#c08b3c"),
]
DEFAULT_ID = "calm"  # TALOS_DEFAULT_THEME — the alias shipped enabled in the manifest.

RES = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "android", "app", "src", "main", "res"))
FRAME_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets", "talosBootFinalFrame.json")
)


def load_frame() -> dict:
    with open(FRAME_PATH, "r", encoding="utf-8") as source:
        frame = json.load(source)
    if frame.get("schema") != "talos.boot-final-frame/1":
        raise ValueError("Unsupported TALOS boot-final-frame schema")
    if frame.get("canvasDp") != 108 or frame.get("safeZoneDp") != 66:
        raise ValueError("TALOS launcher frame must retain the Android 108/66dp contract")
    viewport_width = float(frame["viewBox"].split()[2])
    adaptive = frame["adaptive"]
    if adaptive.get("content") != "mark-only":
        raise ValueError("TALOS launcher foreground must contain only the boot symbol")
    bounds = adaptive["visualBounds"]
    scaled_width_dp = (
        (bounds["right"] - bounds["left"])
        * adaptive["scale"]
        * frame["canvasDp"]
        / viewport_width
    )
    scaled_height_dp = (
        (bounds["bottom"] - bounds["top"])
        * adaptive["scale"]
        * frame["canvasDp"]
        / viewport_width
    )
    if min(scaled_width_dp, scaled_height_dp) < 48:
        raise ValueError("TALOS launcher symbol is smaller than the Android 48dp guidance")
    if max(scaled_width_dp, scaled_height_dp) > frame["safeZoneDp"]:
        raise ValueError("TALOS launcher symbol exceeds the Android adaptive-icon safe zone")
    return frame


FRAME = load_frame()


def ring(cx: float, cy: float, r: float) -> str:
    """A closed circle path; VectorDrawable has no circle element."""
    return (
        f"M{cx - r},{cy} a{r},{r} 0 1,0 {2 * r},0 "
        f"a{r},{r} 0 1,0 {-2 * r},0 Z"
    )


def stroke_path(
    data: str,
    color: str,
    width: float,
    *,
    fill: str = "#00000000",
    alpha: float | None = None,
    indent: str = "      ",
) -> str:
    alpha_attr = (
        f'\n{indent}    android:strokeAlpha="{alpha}"'
        if alpha is not None
        else ""
    )
    return (
        f'{indent}<path android:strokeColor="{color}" android:strokeWidth="{width}"'
        f'{alpha_attr}\n'
        f'{indent}    android:strokeLineCap="round" android:strokeLineJoin="round"\n'
        f'{indent}    android:fillColor="{fill}" android:pathData="{data}" />'
    )


def foreground_vector(accent: str) -> str:
    adaptive = FRAME["adaptive"]
    mark = FRAME["mark"]
    hexagon = mark["hex"]
    edge_width = mark["edgeStrokeWidth"]
    node_width = mark["nodeStrokeWidth"]
    viewport = FRAME["viewBox"].split()

    body = [
        stroke_path(
            hexagon["path"],
            accent,
            hexagon["strokeWidth"],
            alpha=hexagon["strokeOpacity"],
        ),
    ]
    body.extend(
        stroke_path(edge["path"], accent, edge_width)
        for edge in mark["edges"]
    )
    body.extend(
        stroke_path(
            ring(node["cx"], node["cy"], node["r"]),
            accent,
            node_width,
            fill=accent,
        )
        for node in mark["nodes"]
    )

    for branch in mark["branches"]:
        node = branch["node"]
        body.append(
            '      <group android:translateX="250" android:translateY="225" '
            f'android:rotation="{branch["rotation"]}">\n'
            f'{stroke_path(branch["edgePath"], accent, edge_width, indent="        ")}\n'
            f'{stroke_path(ring(node["cx"], node["cy"], node["r"]), accent, node_width, fill=accent, indent="        ")}\n'
            '      </group>'
        )

    body_xml = "\n".join(body)
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!-- GENERATED by tools/android-assets/gen_theme_icons.py — do not edit by hand. -->\n'
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:width="108dp" android:height="108dp"\n'
        f'    android:viewportWidth="{viewport[2]}" android:viewportHeight="{viewport[3]}">\n'
        f'  <group android:scaleX="{adaptive["scale"]}" android:scaleY="{adaptive["scale"]}"\n'
        f'      android:pivotX="{adaptive["pivotX"]}" android:pivotY="{adaptive["pivotY"]}">\n'
        f'    <group android:translateX="{mark["translateX"]}" android:translateY="{mark["translateY"]}">\n'
        f'{body_xml}\n'
        '    </group>\n'
        '  </group>\n'
        '</vector>\n'
    )


def adaptive_icon(pid: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!-- GENERATED by tools/android-assets/gen_theme_icons.py — do not edit by hand. -->\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        f'    <background android:drawable="@color/ic_talos_bg_{pid}" />\n'
        f'    <foreground android:drawable="@drawable/ic_talos_fg_{pid}" />\n'
        f'    <monochrome android:drawable="@drawable/ic_talos_fg_{pid}" />\n'
        '</adaptive-icon>\n'
    )


def color_resource() -> str:
    colors = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<!-- GENERATED (theme icon backgrounds + accents) by gen_theme_icons.py — do not edit by hand. -->",
        "<resources>",
    ]
    for pid, bg, _accent in PRESETS:
        colors.append(f'    <color name="ic_talos_bg_{pid}">{bg}</color>')
    # ⛔ Gli ACCENTI servono al nativo, non alle icone: la bolla (il pallino
    # flottante) deve seguire il tema come tutto il resto, e il suo colore non
    # può essere scritto a mano in Kotlin — sarebbe una seconda verità che il
    # giorno che il tema cambia resta indietro senza dirlo. Qui la sorgente è
    # una: la stessa tabella `PRESETS` che genera le icone.
    colors.append("")
    for pid, _bg, accent in PRESETS:
        colors.append(f'    <color name="ic_talos_accent_{pid}">{accent}</color>')
    colors.append("</resources>\n")
    return "\n".join(colors)


def alias_resource() -> str:
    aliases = []
    for pid, _bg, _accent in PRESETS:
        enabled = "true" if pid == DEFAULT_ID else "false"
        aliases.append(
            f'        <activity-alias\n'
            f'            android:name=".MainActivityIcon_{pid}"\n'
            f'            android:enabled="{enabled}"\n'
            f'            android:exported="true"\n'
            f'            android:icon="@mipmap/ic_launcher_{pid}"\n'
            f'            android:roundIcon="@mipmap/ic_launcher_{pid}_round"\n'
            f'            android:label="@string/app_name"\n'
            f'            android:targetActivity=".MainActivity">\n'
            f'            <intent-filter>\n'
            f'                <action android:name="android.intent.action.MAIN" />\n'
            f'                <category android:name="android.intent.category.LAUNCHER" />\n'
            f'            </intent-filter>\n'
            f'        </activity-alias>'
        )
    return "\n".join(aliases) + "\n"


def web_mark_svg() -> str:
    """
    ⭐ LO STESSO MARCHIO, per il web — dalla STESSA fonte del launcher.

    Owner 2026-08-10: «l'icona TALOS sopra il testo orbitron non è la stessa
    della app icon nel Launcher, la possiamo allineare?» — e poi: «vince il
    Launcher».

    Non erano due disegni diversi: il path è identico. MISURATE quattro
    differenze, e tre stavano nella cornice:

      canvas      600 (launcher) contro 500 (web)  → nel web il marchio è il
                  17% più grande e senza il margine della safe zone Android
      esagono     opacità 0.18 contro 1.0          → nel web «urla» invece di
                  fare da cornice
      colore      accento del tema contro currentColor
      fondo       presente nel launcher, assente nel web

    Qui si generano le prime due dalla fonte comune, così non possono più
    divergere. Colore e fondo restano al CSS: in app il tema è già per-tema
    esattamente come lo sono gli alias del launcher, e un colore cotto dentro
    l'SVG sarebbe l'unico modo di romperlo di nuovo.
    """
    mark = FRAME["mark"]
    hexagon = mark["hex"]
    edge_width = mark["edgeStrokeWidth"]
    node_width = mark["nodeStrokeWidth"]
    viewport = FRAME["viewBox"].split()

    parti = [
        f'    <path d="{hexagon["path"]}" stroke-width="{hexagon["strokeWidth"]}"'
        f' opacity="{hexagon["strokeOpacity"]}" />',
    ]
    parti.extend(
        f'    <path d="{edge["path"]}" stroke-width="{edge_width}" />'
        for edge in mark["edges"]
    )
    parti.extend(
        f'    <circle cx="{node["cx"]}" cy="{node["cy"]}" r="{node["r"]}"'
        f' stroke-width="{node_width}" fill="currentColor" />'
        for node in mark["nodes"]
    )
    for branch in mark["branches"]:
        node = branch["node"]
        parti.extend([
            f'    <g transform="translate(250, 225) rotate({branch["rotation"]})">',
            f'      <path d="{branch["edgePath"]}" stroke-width="{edge_width}" />',
            f'      <circle cx="{node["cx"]}" cy="{node["cy"]}" r="{node["r"]}"'
            f' stroke-width="{node_width}" fill="currentColor" />',
            '    </g>',
        ])

    corpo = "\n".join(parti)
    intestazione = (
        "<!-- GENERATED by tools/android-assets/gen_theme_icons.py"
        " — do not edit by hand. -->"
    )
    """
    ⛔ IL RIQUADRO SI STRINGE SUL MARCHIO: la safe zone qui non serve.

    Owner 2026-08-11, guardando il risultato: «è un logo troppo piccolo su
    tablet». Aveva ragione, e la causa è precisa: i 50px per lato che il
    launcher richiede sono la SAFE ZONE di Android — il sistema ritaglia
    l'icona a maschera (tondo, squircle, quadrato) e quel margine impedisce che
    il disegno venga tagliato. In app non ritaglia nessuno: quel margine resta
    vuoto e rimpicciolisce il marchio del 17% senza proteggerlo da niente.

    Quindi il `viewBox` parte dal marchio invece che dalla tela: stessa forma,
    stessa opacità, stessi spessori — solo senza il bordo che serviva a un
    ritaglio che qui non avviene.
    """
    """
    ⛔ E L'ORIGINE È ZERO, non il translate — owner 2026-08-11: «su telefono non
    è centrato bene rispetto alla scritta».

    Errore mio di aritmetica, e la misura lo dice in una riga: il disegno vive
    in coordinate **0…500** (l'esagono va da x=111,5 a x=388,5, centro 250). Il
    `translate(50, 50)` del launcher SPOSTA quel disegno dentro la tela da 600 —
    non dichiara dove il disegno si trova. Prendendolo come origine guardavo la
    finestra 50…550, cioè il marchio scostato di 50 unità a sinistra: appena
    percettibile accanto a un titolo centrato, e infatti si vedeva.
    """
    lato = float(viewport[2]) - 2 * float(mark["translateX"])
    return "\n".join([
        intestazione,
        f'<svg xmlns="http://www.w3.org/2000/svg"'
        f' viewBox="0 0 {lato:g} {lato:g}">',
        '  <g stroke="currentColor" fill="none"'
        ' stroke-linecap="round" stroke-linejoin="round">',
        corpo,
        "  </g>",
        "</svg>",
        "",
    ])


def generated_outputs() -> dict[str, str]:
    drawable = os.path.join(RES, "drawable")
    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    outputs: dict[str, str] = {}

    for pid, _bg, accent in PRESETS:
        outputs[os.path.join(drawable, f"ic_talos_fg_{pid}.xml")] = (
            foreground_vector(accent)
        )
        for suffix in ("", "_round"):
            outputs[os.path.join(anydpi, f"ic_launcher_{pid}{suffix}.xml")] = (
                adaptive_icon(pid)
            )

    # The base app icon (used by recents/settings and as the pre-alias default) is
    # the TALOS default-theme mark, replacing the Capacitor placeholder icon.
    for suffix in ("", "_round"):
        outputs[os.path.join(anydpi, f"ic_launcher{suffix}.xml")] = (
            adaptive_icon(DEFAULT_ID)
        )

    # ⭐ Il marchio del web, dalla stessa fonte: vedi `web_mark_svg`.
    outputs[os.path.normpath(os.path.join(
        os.path.dirname(__file__), "..", "..", "public", "talos", "brand", "logo-short.svg",
    ))] = web_mark_svg()

    outputs[os.path.join(RES, "values", "ic_talos_colors.xml")] = color_resource()
    outputs[os.path.join(os.path.dirname(__file__), "aliases.generated.xml")] = alias_resource()
    return outputs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if any tracked generated resource differs; never write",
    )
    args = parser.parse_args(argv)
    outputs = generated_outputs()

    if args.check:
        stale = []
        for path, expected in outputs.items():
            try:
                # Preserve newline bytes so --check cannot silently normalize a
                # Windows CRLF output into the LF-only canonical string.
                with open(path, "r", encoding="utf-8", newline="") as source:
                    actual = source.read()
            except FileNotFoundError:
                stale.append(path)
                continue
            if actual != expected:
                stale.append(path)

        if stale:
            for path in stale:
                print(f"STALE: {os.path.relpath(path, os.getcwd())}", file=sys.stderr)
            return 1

        print(f"CHECK OK: {len(outputs)} generated resources match canonical frame")
        return 0

    for path, content in outputs.items():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # Explicit LF keeps generated XML byte-identical across host OSes and
        # prevents CR bytes from surfacing as trailing whitespace in Git.
        with open(path, "w", encoding="utf-8", newline="\n") as destination:
            destination.write(content)

    print(f"OK: {len(PRESETS)} presets -> foregrounds+adaptive+round, ic_talos_colors.xml, aliases.generated.xml")
    print(f"    default enabled alias: MainActivityIcon_{DEFAULT_ID}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
