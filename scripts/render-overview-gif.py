#!/usr/bin/env python3
"""Renders docs/assets/overview.gif, the README's animated overview of RepoCanon.

    python3 scripts/render-overview-gif.py

Needs Pillow and the Noto Sans and JetBrains Mono fonts (falls back to DejaVu).
Every number shown comes from the benchmark in bench/; keep them in sync with README.
"""

import glob
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 960, 540
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'assets', 'overview.gif')

BG = (13, 17, 23)
PANEL = (22, 27, 34)
BORDER = (48, 54, 61)
TEXT = (230, 237, 243)
MUTED = (139, 148, 158)
ACCENT = (63, 185, 80)
BLUE = (88, 166, 255)
WARN = (210, 153, 34)
RED = (248, 81, 73)


def find_font(patterns):
    for pattern in patterns:
        hits = sorted(glob.glob(pattern, recursive=True))
        if hits:
            return hits[0]
    raise SystemExit(f'font not found: {patterns}')


SANS = find_font(['/usr/share/fonts/**/NotoSans-Regular.ttf', '/usr/share/fonts/**/DejaVuSans.ttf'])
SANS_BOLD = find_font(['/usr/share/fonts/**/NotoSans-Bold.ttf', '/usr/share/fonts/**/DejaVuSans-Bold.ttf'])
# Noto Sans has no ✓ ✗ →; symbols come from DejaVu
SYMBOL = find_font(['/usr/share/fonts/**/DejaVuSans-Bold.ttf'])
MONO = find_font([os.path.expanduser('~/.local/share/fonts/**/JetBrainsMono-Regular.ttf'),
                  '/usr/share/fonts/**/DejaVuSansMono.ttf'])


def font(path, size):
    return ImageFont.truetype(path, size)


def blank():
    image = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(image)
    # Brand strip on every frame, so a still from the middle still says what this is
    draw.text((32, 20), 'RepoCanon', font=font(SANS_BOLD, 18), fill=ACCENT)
    draw.text((W - 32, 22), 'npx repocanon init', font=font(MONO, 15), fill=MUTED, anchor='ra')
    return image, draw


def centered(draw, y, text, size, color=TEXT, bold=False):
    draw.text((W // 2, y), text, font=font(SANS_BOLD if bold else SANS, size), fill=color, anchor='ma')


def panel(draw, box, title=None):
    draw.rounded_rectangle(box, radius=12, fill=PANEL, outline=BORDER, width=2)
    if title:
        x0, y0 = box[0], box[1]
        for i, color in enumerate([RED, WARN, ACCENT]):
            draw.ellipse((x0 + 18 + i * 20, y0 + 14, x0 + 30 + i * 20, y0 + 26), fill=color)
        draw.text((x0 + 90, y0 + 11), title, font=font(MONO, 14), fill=MUTED)


def scene_title(step):
    image, draw = blank()
    centered(draw, 150, 'RepoCanon', 76, TEXT, bold=True)
    centered(draw, 255, 'Project memory your AI coding agent can trust', 30, TEXT)
    if step >= 1:
        centered(draw, 320, 'The rules your code can’t show, kept true and checked by git', 21, MUTED)
    if step >= 2:
        tools = 'Claude Code · Cursor · GitHub Copilot · Codex · Gemini CLI · Windsurf · Cline'
        centered(draw, 410, tools, 18, BLUE)
    return image


def scene_problem(step):
    image, draw = blank()
    centered(draw, 70, 'The problem', 40, TEXT, bold=True)
    items = [
        ('Agents re-learn your repo on every task', 'scanning files and burning tokens'),
        ('They miss rules the code can’t show', 'money rules, state machines, why a choice was made'),
        ('Hand-written AGENTS.md quietly goes stale', 'nobody notices when it stops matching the code')
    ]
    for i, (head, sub) in enumerate(items[:step + 1]):
        y = 160 + i * 105
        draw.text((140, y + 2), '✗', font=font(SYMBOL, 28), fill=RED)
        draw.text((190, y), head, font=font(SANS_BOLD, 27), fill=TEXT)
        draw.text((190, y + 40), sub, font=font(SANS, 19), fill=MUTED)
    return image


def scene_init(step):
    image, draw = blank()
    centered(draw, 62, 'One command sets it up', 38, TEXT, bold=True)
    panel(draw, (110, 130, 850, 440), 'your-project')
    command = 'npx repocanon init'
    typed = command[:min(len(command), step * 5)]
    mono = font(MONO, 22)
    draw.text((140, 175), '$ ', font=mono, fill=ACCENT)
    draw.text((170, 175), typed + ('▌' if len(typed) < len(command) else ''), font=mono, fill=TEXT)
    lines = [
        ('✓', 'AGENTS.md', 'the rules every agent reads first'),
        ('✓', '.ai/', 'module docs, decisions, conventions'),
        ('✓', 'CLAUDE.md, .cursor/rules, Copilot', 'all pointed at the same rules')
    ]
    shown = max(0, step - 4)
    for i, (mark, name, what) in enumerate(lines[:shown]):
        y = 240 + i * 55
        draw.text((140, y), mark, font=mono, fill=ACCENT)
        draw.text((175, y), name, font=font(MONO, 20), fill=BLUE)
        draw.text((175, y + 28), what, font=font(SANS, 16), fill=MUTED)
    if shown >= 3:
        centered(draw, 470, 'One knowledge layer for every AI tool. Local, no LLM calls, zero dependencies.', 19, MUTED)
    return image


def scene_hook(step):
    image, draw = blank()
    centered(draw, 62, 'Rules arrive while the agent works', 38, TEXT, bold=True)
    panel(draw, (90, 125, 870, 455), 'Claude Code')
    mono = font(MONO, 19)
    draw.text((120, 170), '● Read  src/billing/refund.js', font=mono, fill=TEXT)
    if step >= 1:
        draw.rounded_rectangle((120, 215, 840, 405), radius=10, fill=(16, 38, 24), outline=ACCENT, width=2)
        draw.text((140, 230), 'RepoCanon rules for src/billing/refund.js', font=font(SANS_BOLD, 19), fill=ACCENT)
        rules = ['- Refunds never exceed the captured amount.', '- Amounts are integer cents; never floats.',
                 '- A refund is a credit note, never an edit of the invoice.']
        for i, rule in enumerate(rules[:step]):
            draw.text((140, 272 + i * 38), rule, font=mono, fill=TEXT)
    if step >= 3:
        centered(draw, 475, 'The right module’s rules, at the moment they matter. No tool call needed.', 19, MUTED)
    return image


def scene_claims(step):
    image, draw = blank()
    centered(draw, 62, 'Every rule is checked against the code', 38, TEXT, bold=True)
    panel(draw, (90, 125, 870, 440), '$ repocanon claims')
    rows = [
        (ACCENT, '✓', 'enforced', 'Floats are rejected', 'test/money.test.js'),
        (ACCENT, '✓', 'anchored', 'Refunds never exceed the capture', 'src/billing.js#refund'),
        (WARN, '!', 'stale', 'Money is integer cents', 'src/money.js#toCents changed')
    ]
    for i, (color, mark, tier, rule, where) in enumerate(rows[:step + 1]):
        y = 180 + i * 80
        draw.text((120, y + 2), mark, font=font(SYMBOL, 24), fill=color)
        draw.text((160, y + 2), tier, font=font(MONO, 18), fill=color)
        draw.text((280, y), rule, font=font(SANS_BOLD, 21), fill=TEXT)
        draw.text((280, y + 32), where, font=font(MONO, 16), fill=MUTED)
    if step >= 3:
        centered(draw, 465, 'When the code changes, the rule is flagged, not trusted. CI catches it on every PR.', 19, MUTED)
    return image


def scene_results(step):
    image, draw = blank()
    centered(draw, 62, 'Measured, not promised', 38, TEXT, bold=True)
    cards = [
        ('8% → 100%', 'tasks passed once the', 'project’s rules were written down'),
        ('6 / 6', 'stale docs fixed by agents', 'hand-written AGENTS.md: 0 / 3'),
        ('0', 'dependencies · runs locally', 'MIT licensed')
    ]
    for i, (big, line1, line2) in enumerate(cards[:step + 1]):
        x0 = 60 + i * 290
        draw.rounded_rectangle((x0, 140, x0 + 260, 400), radius=14, fill=PANEL, outline=BORDER, width=2)
        parts = big.split('→')
        if len(parts) == 2:
            big_font, arrow_font = font(SANS_BOLD, 44), font(SYMBOL, 36)
            left, right = parts[0].strip(), parts[1].strip()
            widths = [draw.textlength(left, font=big_font), draw.textlength(' → ', font=arrow_font), draw.textlength(right, font=big_font)]
            x = x0 + 130 - sum(widths) / 2
            draw.text((x, 190), left, font=big_font, fill=ACCENT)
            draw.text((x + widths[0], 198), ' → ', font=arrow_font, fill=ACCENT)
            draw.text((x + widths[0] + widths[1], 190), right, font=big_font, fill=ACCENT)
        else:
            draw.text((x0 + 130, 190), big, font=font(SANS_BOLD, 44), fill=ACCENT, anchor='ma')
        draw.text((x0 + 130, 285), line1, font=font(SANS, 17), fill=TEXT, anchor='ma')
        draw.text((x0 + 130, 312), line2, font=font(SANS, 15), fill=MUTED, anchor='ma')
    if step >= 2:
        centered(draw, 440, 'RepoCanon benchmark, claude-sonnet-5-5, Oct 2026. Small samples; method and raw data in bench/.', 15, MUTED)
    return image


def scene_cta(step):
    image, draw = blank()
    centered(draw, 80, 'Safe by default', 36, TEXT, bold=True)
    chips = ['Blocks secrets in docs', 'Catches prompt injection', 'GitHub Action for every PR']
    widths = [draw.textlength(c, font=font(SANS, 19)) + 44 for c in chips]
    x = (W - (sum(widths) + 20 * (len(chips) - 1))) / 2
    for chip, width in zip(chips, widths):
        draw.rounded_rectangle((x, 150, x + width, 196), radius=23, outline=BLUE, width=2)
        draw.text((x + width / 2, 162), chip, font=font(SANS, 19), fill=BLUE, anchor='ma')
        x += width + 20
    if step >= 1:
        draw.rounded_rectangle((250, 260, 710, 340), radius=14, fill=PANEL, outline=ACCENT, width=3)
        draw.text((W // 2, 280), 'npx repocanon init', font=font(MONO, 32), fill=ACCENT, anchor='ma')
    if step >= 2:
        centered(draw, 385, 'github.com/awalhadi/repo-canon', 22, TEXT)
        centered(draw, 425, 'Free and open source', 18, MUTED)
    return image


# (scene, steps, ms per step, ms on the last step)
TIMELINE = [
    (scene_title, 3, 700, 2200),
    (scene_problem, 3, 1300, 2200),
    (scene_init, 8, 260, 2400),
    (scene_hook, 4, 800, 2600),
    (scene_claims, 4, 900, 2600),
    (scene_results, 3, 1200, 3000),
    (scene_cta, 3, 700, 3200)
]


def main():
    frames, durations = [], []
    for scene, steps, step_ms, hold_ms in TIMELINE:
        for step in range(steps):
            frames.append(scene(step))
            durations.append(hold_ms if step == steps - 1 else step_ms)
    # One shared palette keeps the colours stable from frame to frame and the file small
    sheet = Image.new('RGB', (W, H * len(frames)))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (0, H * i))
    palette = sheet.quantize(colors=96, method=Image.Quantize.MEDIANCUT)
    quantized = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    quantized[0].save(OUT, save_all=True, append_images=quantized[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print(f'{OUT}: {len(frames)} frames, {sum(durations) / 1000:.1f} s, {os.path.getsize(OUT) // 1024} KB')


if __name__ == '__main__':
    main()
