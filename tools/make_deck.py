import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR, MSO_AUTO_SIZE
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.oxml import parse_xml
from pptx.oxml.ns import nsdecls

BG      = RGBColor(0x0a, 0x0b, 0x12)
SURFACE = RGBColor(0x12, 0x14, 0x1f)
ELEV    = RGBColor(0x18, 0x1b, 0x28)
LINE    = RGBColor(0x25, 0x2a, 0x3a)
LINE_S  = RGBColor(0x1c, 0x20, 0x30)
TEXT    = RGBColor(0xe6, 0xe8, 0xf0)
MUTED   = RGBColor(0x8b, 0x90, 0xa5)
FAINT   = RGBColor(0x5a, 0x60, 0x76)
ACCENT  = RGBColor(0xff, 0x7a, 0x1a)
ACCENT_D= RGBColor(0x7c, 0x3a, 0x12)
VEIN    = RGBColor(0xc0, 0x39, 0x6b)
OK      = RGBColor(0x4a, 0xde, 0x80)
WARN    = RGBColor(0xfb, 0xbf, 0x24)
BAD     = RGBColor(0xf8, 0x71, 0x71)

SANS = "Segoe UI"
MONO = "Cascadia Code"

W, H = Inches(13.333), Inches(7.5)
M    = Inches(0.85)
CW   = W - 2 * M
TOTAL_SLIDES = 12


def slide(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = BG
    return s


def tb(s, x, y, w, h, anchor=MSO_ANCHOR.TOP):
    box = s.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.paragraphs[0].text = ""
    return tf


def para(tf, text, size, color=TEXT, bold=False, font=SANS, align=PP_ALIGN.LEFT,
         before=0, after=0, spacing=1.15, first=False):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.line_spacing = spacing
    p.space_before = Pt(before)
    p.space_after = Pt(after)
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.name = font
    r.font.color.rgb = color
    return p


def rich(tf, chunks, size, spacing=1.25, before=0, after=0, align=PP_ALIGN.LEFT, first=False):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.line_spacing = spacing
    p.space_before = Pt(before)
    p.space_after = Pt(after)
    for text, color, bold, font in chunks:
        r = p.add_run()
        r.text = text
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.name = font
        r.font.color.rgb = color
    return p


def card(s, x, y, w, h, fill=SURFACE, border=LINE, radius=0.06):
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    sh.adjustments[0] = radius
    sh.fill.solid()
    sh.fill.fore_color.rgb = fill
    sh.line.color.rgb = border
    sh.line.width = Pt(1)
    sh.shadow.inherit = False
    sh.text_frame.text = ""
    return sh


def bar(s, x, y, w, h, color=ACCENT):
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    sh.fill.solid()
    sh.fill.fore_color.rgb = color
    sh.line.fill.background()
    sh.shadow.inherit = False
    return sh


def chip(s, x, y, text, color=ACCENT, size=10.5, pad=Inches(0.16)):
    w = Inches(0.085 * size / 10.5) + Inches(len(text) * 0.088 * size / 10.5) + 2 * pad
    h = Inches(0.30)
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    sh.adjustments[0] = 0.5
    sh.fill.solid()
    sh.fill.fore_color.rgb = ELEV
    sh.line.color.rgb = color
    sh.line.width = Pt(0.75)
    sh.shadow.inherit = False
    tfr = sh.text_frame
    tfr.margin_left = tfr.margin_right = tfr.margin_top = tfr.margin_bottom = 0
    tfr.vertical_anchor = MSO_ANCHOR.MIDDLE
    para(tfr, text, size, color, bold=True, font=MONO, align=PP_ALIGN.CENTER, first=True)
    return w


def arrow(s, x1, y1, x2, y2, color=FAINT, width=1.25):
    c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,
                               Emu(int(x1)), Emu(int(y1)),
                               Emu(int(x2)), Emu(int(y2)))
    c.line.color.rgb = color
    c.line.width = Pt(width)
    ln = c.line._get_or_add_ln()
    ln.append(parse_xml('<a:tailEnd %s type="triangle" w="med" len="med"/>' % nsdecls('a')))
    return c


def half(length):
    return Emu(int(length) // 2)


def span(total, parts, gap):
    return Emu(int((total - gap * (parts - 1)) / parts))


def eyebrow(s, text):
    tf = tb(s, M, Inches(0.52), CW, Inches(0.3))
    para(tf, text.upper(), 10.5, ACCENT, bold=True, font=MONO, first=True)
    return tf


def headline(s, text, size=40, y=Inches(0.88), color=TEXT, w=None):
    tf = tb(s, M, y, w or CW, Inches(1.15))
    para(tf, text, size, color, bold=True, spacing=1.02, first=True)
    return tf


def subhead(s, text, size=15, y=Inches(1.95), color=MUTED, w=None):
    tf = tb(s, M, y, w or Inches(10.4), Inches(0.9))
    para(tf, text, size, color, spacing=1.3, first=True)
    return tf


def footer(s, n, label="Byakugan"):
    bar(s, M, Inches(6.86), Inches(0.34), Inches(0.035), ACCENT)
    tf = tb(s, M, Inches(7.0), Inches(6.0), Inches(0.3))
    para(tf, label, 9.5, FAINT, font=MONO, first=True)
    tf2 = tb(s, W - M - Inches(2.0), Inches(7.0), Inches(2.0), Inches(0.3))
    para(tf2, "%02d / %d" % (n, TOTAL_SLIDES), 9.5, FAINT, font=MONO,
         align=PP_ALIGN.RIGHT, first=True)


def notes(s, text):
    s.notes_slide.notes_text_frame.text = text.strip()


def node(s, x, y, w, h, title, sub=None, tone=LINE, title_size=12.5, sub_size=9.5):
    card(s, x, y, w, h, ELEV, tone)
    tf = tb(s, x + Inches(0.16), y + Inches(0.13), w - Inches(0.32), h - Inches(0.26),
            anchor=MSO_ANCHOR.MIDDLE)
    para(tf, title, title_size, TEXT, bold=True, spacing=1.1, first=True)
    if sub:
        para(tf, sub, sub_size, MUTED, font=MONO, spacing=1.15, before=3)


def bullets(s, x, y, w, h, items, size=13, gap=9, dot=ACCENT):
    tf = tb(s, x, y, w, h)
    for i, it in enumerate(items):
        if isinstance(it, tuple):
            head, body = it
            rich(tf, [("— ", dot, True, SANS), (head, TEXT, True, SANS), ("  ", TEXT, False, SANS),
                      (body, MUTED, False, SANS)], size, spacing=1.32,
                 before=0 if i == 0 else gap, first=(i == 0))
        else:
            rich(tf, [("— ", dot, True, SANS), (it, MUTED, False, SANS)], size,
                 spacing=1.32, before=0 if i == 0 else gap, first=(i == 0))
    return tf


def build(path):
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H

    s = slide(prs)
    bar(s, Inches(0), Inches(0), Inches(0.10), H, ACCENT)
    bar(s, Inches(0), Inches(3.30), Inches(0.10), Inches(0.62), VEIN)
    tf = tb(s, M, Inches(1.55), Inches(11.0), Inches(1.5))
    para(tf, "Byakugan", 66, TEXT, bold=True, spacing=0.98, first=True)
    tf = tb(s, M, Inches(2.85), Inches(10.2), Inches(0.7))
    para(tf, "Understand any codebase in one command.", 22, ACCENT, spacing=1.15, first=True)
    tf = tb(s, M, Inches(3.62), Inches(10.4), Inches(1.0))
    para(tf, "You did not write it. You did not choose it. Byakugan reads the whole "
              "codebase and hands back something you can actually read.",
         14, MUTED, spacing=1.4, first=True)
    tf = tb(s, M, Inches(4.92), Inches(6.0), Inches(0.4))
    rich(tf, [("Brenda", TEXT, True, SANS), ("  &  ", FAINT, False, SANS),
              ("Naran", TEXT, True, SANS)], 16, first=True)
    tf = tb(s, M, Inches(5.38), Inches(8.0), Inches(0.4))
    para(tf, "IBM Bob 2.0 Hackathon   ·   48 hours   ·   MIT licensed", 11.5, FAINT,
         font=MONO, spacing=1.35, first=True)
    card(s, W - M - Inches(4.55), Inches(5.02), Inches(4.55), Inches(0.62), SURFACE, ACCENT)
    tf = tb(s, W - M - Inches(4.31), Inches(5.19), Inches(4.1), Inches(0.32))
    rich(tf, [("npm install -g ", MUTED, False, MONO),
              ("byakugan-macgpt", ACCENT, True, MONO)], 13, first=True)
    notes(s, """
Open with the situation, not the product.

"Every one of us has joined a project we knew nothing about. You spend the first week
just finding files. Byakugan turns that week into a coffee break."

Then the one line: understand any codebase in one command.

Do not explain the architecture yet. Do not mention providers, tokens, or the backend.
That is slide nine and slide eleven, and judges will still be with you.

Say the install line out loud once. It tells them this is real and runnable.
""")

    s = slide(prs)
    eyebrow(s, "the problem")
    headline(s, "The first week is silent.")
    subhead(s, "Nobody ever explains the codebase. You open file after file, guess at the "
               "names, and slowly piece together something that was never written down.")
    cards = [
        ("You are guessing", "The names are abbreviated and the important logic is in "
                             "three folders nobody volunteers to explain.", VEIN),
        ("Asking is awkward", "The one person who knows is busy. So you keep guessing "
                              "rather than keep interrupting them.", ACCENT),
        ("Generic answers miss", "Explaining one file alone ignores the other twenty-nine. "
                                 "You already know how to read a function.", OK),
    ]
    cw = span(CW, 3, Inches(0.22))
    for i, (t, b, tone) in enumerate(cards):
        x = M + i * (cw + Inches(0.22))
        card(s, x, Inches(3.30), cw, Inches(2.75), SURFACE, LINE)
        bar(s, x, Inches(3.30), cw, Inches(0.045), tone)
        tf = tb(s, x + Inches(0.26), Inches(3.66), cw - Inches(0.52), Inches(0.5))
        para(tf, t, 17, TEXT, bold=True, spacing=1.1, first=True)
        tf = tb(s, x + Inches(0.26), Inches(4.28), cw - Inches(0.52), Inches(1.6))
        para(tf, b, 13, MUTED, spacing=1.4, first=True)
    footer(s, 2)
    notes(s, """
This is the slide that earns the rest of the pitch. Spend time here.

Land each card as a moment you have actually lived, not a bullet:

- You are guessing. Open the file, read the name, have no idea what it does, move on.
- Asking is awkward. Nobody wants to be the person who keeps asking, so you burn a week.
- Generic answers miss. A chatbot will happily explain a function to you. It will not
  tell you that three other files depend on it.

Then bridge: "we have all done this. It is not a you problem, it is a missing tool."
""")

    s = slide(prs)
    eyebrow(s, "why the usual tools don't fix it")
    headline(s, "They answer a different question.")
    subhead(s, "The tools we already have are good at their jobs. They just do not answer "
               "the one question you have on day one.")
    rows = [
        ("Search", "Finds files and symbols fast", "Never tells you why the code exists", FAINT),
        ("Chatbots", "Answer anything, instantly", "They answer from memory, not from your code", VEIN),
        ("Documentation", "Explains what the features do", "Written for users, and often out of date", FAINT),
        ("Code review", "Catches real problems", "Only after you have already written the code", OK),
    ]
    y = Inches(2.98)
    for name, does, why, tone in rows:
        card(s, M, y, CW, Inches(0.80), SURFACE, LINE)
        bar(s, M, y, Inches(0.045), Inches(0.80), tone)
        tf = tb(s, M + Inches(0.30), y + Inches(0.27), Inches(2.3), Inches(0.32))
        para(tf, name, 14.5, TEXT, bold=True, first=True)
        tf = tb(s, M + Inches(2.75), y + Inches(0.28), Inches(3.7), Inches(0.32))
        para(tf, does, 13, MUTED, first=True)
        tf = tb(s, M + Inches(6.70), y + Inches(0.28), Inches(4.6), Inches(0.32))
        para(tf, why, 13, tone if tone != FAINT else MUTED, first=True)
        y += Inches(0.94)
    footer(s, 3)
    notes(s, """
The point of this slide is fairness. We are not saying these tools are bad.

Say plainly: "Search is genuinely great. It finds the file in a second. It just cannot
tell you whether the file matters."

The chatbots line is the one to emphasise, and it sets up our whole answer. They are
fluent and confident, and they are reasoning from what they saw in training, not from
the repository in front of you. On a codebase that is a week old, that is a guess.

Do not go soft here. This is the gap we are filling.
""")

    s = slide(prs)
    eyebrow(s, "the solution")
    headline(s, "One command. Four things back.")
    card(s, M, Inches(2.72), CW, Inches(0.78), ELEV, ACCENT)
    tf = tb(s, M + Inches(0.34), Inches(2.96), Inches(8.0), Inches(0.34))
    rich(tf, [("> ", OK, True, MONO), ("byakugan analyze .", TEXT, True, MONO)], 15, first=True)
    tf = tb(s, W - M - Inches(4.6), Inches(2.99), Inches(4.26), Inches(0.32))
    para(tf, "no setup, no API key, no config file", 12, FAINT, font=MONO,
         align=PP_ALIGN.RIGHT, first=True)
    outs = [
        ("A report worth reading", "Project overview, file map, risky spots, and what to "
                                  "look at first. One page, opens in a browser, works offline."),
        ("Any file, in plain English", "What it is for, what it depends on, why it exists, "
                                       "without reading all of it first."),
        ("Know what breaks", "Point at a file before you change it and see everything that "
                             "depends on it."),
        ("Ask questions like a person", "\"Where is auth handled?\" answered from your code, "
                                        "not from memory. Follow-ups keep the context."),
    ]
    cw = span(CW, 2, Inches(0.36))
    for i, (t, b) in enumerate(outs):
        x = M + (i % 2) * (cw + Inches(0.36))
        yy = Inches(3.78) + (i // 2) * Inches(1.52)
        card(s, x, yy, cw, Inches(1.34), SURFACE, LINE)
        tf = tb(s, x + Inches(0.26), yy + Inches(0.22), Inches(0.5), Inches(0.3))
        para(tf, "0%d" % (i + 1), 11, ACCENT, bold=True, font=MONO, first=True)
        tf = tb(s, x + Inches(0.80), yy + Inches(0.20), cw - Inches(1.06), Inches(0.34))
        para(tf, t, 14.5, TEXT, bold=True, first=True)
        tf = tb(s, x + Inches(0.80), yy + Inches(0.60), cw - Inches(1.06), Inches(0.62))
        para(tf, b, 12, MUTED, spacing=1.35, first=True)
    footer(s, 4)
    notes(s, """
This is the turn. Say the command out loud and pause.

"One command. You get four things back."

Then take the four quickly, one breath each. Do not read the cards. The judges can read.

The strongest one to dwell on is number three, change impact, because it is the one
nobody expects. Nobody has a tool that tells you what breaks before you break it.

The line to land: "and you only do the first one. The other three are instant, because
the understanding is already saved."
""")

    s = slide(prs)
    eyebrow(s, "how it works")
    headline(s, "Four passes, because one pass is wrong.")
    subhead(s, "Ask a model to describe a whole repository in one go and you get confident "
               "nonsense. So we do not do that.")
    steps = [
        ("You point at a folder", "That is the entire setup."),
        ("It reads the code", "Skips junk, keeps the good parts of huge files."),
        ("It works out the shape", "What depends on what, and what is risky."),
        ("It saves the understanding", "Everything later reads from this one result."),
    ]
    gap = Inches(0.30)
    nw = span(CW, 4, gap)
    for i, (t, b) in enumerate(steps):
        x = M + i * (nw + gap)
        card(s, x, Inches(3.12), nw, Inches(1.95), ELEV, LINE)
        bar(s, x, Inches(3.12), nw, Inches(0.04), ACCENT if i < 3 else OK)
        tf = tb(s, x + Inches(0.22), Inches(3.42), Inches(0.6), Inches(0.3))
        para(tf, "0%d" % (i + 1), 11, FAINT, bold=True, font=MONO, first=True)
        tf = tb(s, x + Inches(0.22), Inches(3.78), nw - Inches(0.44), Inches(0.6))
        para(tf, t, 14, TEXT, bold=True, spacing=1.15, first=True)
        tf = tb(s, x + Inches(0.22), Inches(4.42), nw - Inches(0.44), Inches(0.56))
        para(tf, b, 11.5, MUTED, spacing=1.35, first=True)
        if i < 3:
            arrow(s, x + nw + Inches(0.05), Inches(4.09),
                  x + nw + gap - Inches(0.05), Inches(4.09))
    card(s, M, Inches(5.36), CW, Inches(0.80), SURFACE, LINE)
    tf = tb(s, M + Inches(0.34), Inches(5.58), Inches(11.0), Inches(0.36))
    rich(tf, [("You do the first one. ", TEXT, True, SANS),
              ("The other three happen once, and then every question after that is instant.",
               MUTED, False, SANS)], 13.5, first=True)
    footer(s, 5)
    notes(s, """
The only technical idea in the whole deck, and it is worth it because it is the core
idea: we split the work into passes instead of one enormous ask.

If a judge pushes on why, the honest answer is: "we tried the single prompt first. On our
own thirty file project it produced a confident, wrong answer. Splitting it into a survey
pass and then a pass per file fixed it."

Then the closing bar: the first pass is the only one you wait for. Everything after is a
lookup, which is why the chat feels instant.

Keep this to about forty seconds. It is a means, not the story.
""")

    s = slide(prs)
    eyebrow(s, "features")
    headline(s, "Seven commands, all reading one saved result.")
    feats = [
        ("byakugan profile", "Five questions. Saves what you know and your goal."),
        ("byakugan analyze", "The main event. Reads the project, learns it."),
        ("byakugan report", "The interactive report. Opens in a browser."),
        ("byakugan explain", "One file in plain English, at your level."),
        ("byakugan impact", "What breaks downstream if you change this."),
        ("byakugan chat", "Answered from your code, not from memory."),
        ("byakugan doctor", "One second to confirm everything works."),
    ]
    cw = span(CW, 2, Inches(0.36))
    for i, (cmd, desc) in enumerate(feats):
        col = i // 4
        row = i % 4
        x = M + col * (cw + Inches(0.36))
        yy = Inches(2.86) + row * Inches(0.94)
        card(s, x, yy, cw, Inches(0.80), SURFACE, LINE)
        tf = tb(s, x + Inches(0.26), yy + Inches(0.15), cw - Inches(0.52), Inches(0.28))
        para(tf, cmd, 12.5, ACCENT, bold=True, font=MONO, first=True)
        tf = tb(s, x + Inches(0.26), yy + Inches(0.45), cw - Inches(0.52), Inches(0.28))
        para(tf, desc, 11.5, MUTED, first=True)
    card(s, M + (cw + Inches(0.36)), Inches(5.68), cw, Inches(0.80), ELEV, ACCENT)
    tf = tb(s, M + (cw + Inches(0.36)) + Inches(0.26), Inches(5.88), cw - Inches(0.52), Inches(0.42))
    rich(tf, [("One analysis. ", TEXT, True, SANS),
              ("Nothing is worked out twice, so nothing costs you twice.", MUTED, False, SANS)],
         12, spacing=1.3, first=True)
    footer(s, 6)
    notes(s, """
Do not read all seven. That is what the slide is for.

Say: "seven commands, but you will only ever type two of them. analyze, then report."

Then point at the two that surprise people:

- explain, because most people assume that is the whole product. It is one of four parts.
- doctor, because it is the one that tells a sceptical judge they can check it themselves
  in a second. That earns credibility for everything else.

If a judge is technical, this is the slide where you can offer to demo. Offer once, do not
push twice.
""")

    s = slide(prs)
    eyebrow(s, "the bit that surprised us")
    headline(s, "It explains it your way, not one fixed way.")
    subhead(s, "You say how much you know and what you are trying to do. Everything after "
               "that is pitched to match. Nobody hand-writes two versions of anything.")
    panes = [
        ("new to the codebase", "Learning it", OK,
         "Concepts before implementation, jargon defined, and a sensible order to read in.",
         "billing.js keeps a running total of requests per window. when the window fills "
         "up it waits for it to clear."),
        ("joining to change it", "Reviewing it", ACCENT,
         "Skips the tutorial. Tradeoffs, edge cases, and the bit that surprises you later.",
         "that limit is per running copy, so it resets on deploy. fine on one box, wrong "
         "the moment you scale to two."),
    ]
    pw = span(CW, 2, Inches(0.36))
    for i, (tag, title, tone, desc, quote) in enumerate(panes):
        x = M + i * (pw + Inches(0.36))
        card(s, x, Inches(3.10), pw, Inches(2.90), SURFACE, LINE)
        bar(s, x, Inches(3.10), pw, Inches(0.04), tone)
        tf = tb(s, x + Inches(0.28), Inches(3.38), pw - Inches(0.56), Inches(0.28))
        para(tf, tag.upper(), 10.5, tone, bold=True, font=MONO, first=True)
        tf = tb(s, x + Inches(0.28), Inches(3.72), pw - Inches(0.56), Inches(0.34))
        para(tf, title, 19, TEXT, bold=True, first=True)
        tf = tb(s, x + Inches(0.28), Inches(4.16), pw - Inches(0.56), Inches(0.62))
        para(tf, desc, 12.5, MUTED, spacing=1.35, first=True)
        card(s, x + Inches(0.28), Inches(4.92), pw - Inches(0.56), Inches(0.92), BG, LINE_S)
        tf = tb(s, x + Inches(0.44), Inches(5.06), pw - Inches(0.88), Inches(0.66))
        para(tf, quote, 11, MUTED, font=MONO, spacing=1.35, first=True)
    footer(s, 7)
    notes(s, """
Slow down. This is the most interesting thing we built and it is easy to miss.

The demo that works: the same file, two different people. The junior gets "this file keeps
a running total of requests and waits when the window is full." The senior gets "that
limit is per running copy, so it resets on deploy, which is wrong the moment you scale."

Same file. Same command. Different answer, because we told it who was asking.

If you only get one live demo all pitch, make it this one. It is the clearest possible
answer to "what is this actually for", and it looks considered rather than clever.
""")

    s = slide(prs)
    eyebrow(s, "the impact")
    headline(s, "Your first day becomes your first coffee break.")
    subhead(s, "The goal was never to write code for you. It is to get you from \"I have no "
               "idea where to start\" to making a real change.")
    imp = [
        ("Stop reading at random", "You get an order to read things in, so you stop opening "
                                   "files hoping one of them matters.", ACCENT),
        ("Ask without awkwardness", "The person who knows the codebase is not interrupted, "
                                   "and you are not quietly guessing for a week.", OK),
        ("Change things more safely", "See what depends on a file before you touch it, not "
                                      "after something falls over.", VEIN),
    ]
    cw = span(CW, 3, Inches(0.22))
    for i, (t, b, tone) in enumerate(imp):
        x = M + i * (cw + Inches(0.22))
        card(s, x, Inches(3.34), cw, Inches(2.35), SURFACE, LINE)
        bar(s, x, Inches(3.34), cw, Inches(0.045), tone)
        tf = tb(s, x + Inches(0.26), Inches(3.70), cw - Inches(0.52), Inches(0.5))
        para(tf, t, 16.5, TEXT, bold=True, spacing=1.1, first=True)
        tf = tb(s, x + Inches(0.26), Inches(4.34), cw - Inches(0.52), Inches(1.2))
        para(tf, b, 12.5, MUTED, spacing=1.4, first=True)
    tf = tb(s, M, Inches(6.02), CW, Inches(0.4))
    para(tf, "The same tool gets a first-week developer moving on day one and a senior "
             "reviewing on day two.", 13, FAINT, spacing=1.3, first=True)
    footer(s, 8)
    notes(s, """
Judges score impact, so give them something they can picture.

Pick the concrete one and give a story, not a metric. We have no user study and we should
not pretend otherwise. Say: "the win is the first afternoon. A new person opens the report,
sees the order to read things in, and makes a real change the same day."

Then the senior line, because it shows the tool has a second audience: "and the person
reviewing their PR gets the honest version, not a simplified one."

If asked for numbers, be straight: we built it in 48 hours and we have not run a proper
trial yet. Honesty here buys more credibility than a made-up percentage.
""")

    s = slide(prs)
    eyebrow(s, "the hackathon")
    headline(s, "Built with IBM Bob, in 48 hours.")
    subhead(s, "Byakugan was built during the IBM Bob 2.0 Hackathon. Bob is the reason we "
               "got to a working demo at all.")
    bob = [
        ("planning", "We had a very large idea and 48 hours. Bob helped us break it into a "
                     "build order we could actually finish."),
        ("building", "Bob sat in the loop while we wrote the scanner and the pipeline, "
                     "catching what would not work before we lost a night to it."),
        ("finishing", "When the project outgrew the original plan, Bob helped us rework it "
                      "into the shape that shipped."),
    ]
    cw = span(CW, 3, Inches(0.22))
    for i, (t, b) in enumerate(bob):
        x = M + i * (cw + Inches(0.22))
        card(s, x, Inches(3.30), cw, Inches(2.30), SURFACE, LINE)
        bar(s, x, Inches(3.30), cw, Inches(0.045), ACCENT)
        tf = tb(s, x + Inches(0.26), Inches(3.66), cw - Inches(0.52), Inches(0.3))
        para(tf, t.upper(), 10.5, ACCENT, bold=True, font=MONO, first=True)
        tf = tb(s, x + Inches(0.26), Inches(4.06), cw - Inches(0.52), Inches(1.4))
        para(tf, b, 12.5, MUTED, spacing=1.4, first=True)
    card(s, M, Inches(5.86), CW, Inches(0.66), ELEV, LINE)
    tf = tb(s, M + Inches(0.34), Inches(6.06), Inches(11.0), Inches(0.3))
    rich(tf, [("Two developers, one weekend, ", MUTED, False, SANS),
              ("and a tool we now use on codebases we did not write.", TEXT, True, SANS)],
         13.5, first=True)
    footer(s, 9)
    notes(s, """
Keep this warm and short. It is a thank you slide, not a technical one.

The honest and impressive framing is that Bob shaped the work rather than that it is
wired into the product. Say it plainly: "Bob is how we planned this, how we built it, and
how we reshaped it when it outgrew the plan. It is the reason there is a demo."

If a judge asks whether Bob is in the running code, answer straight: no, it is not. Do not
imply an integration that is not there. Saying "no, but here is what it did for us" is a
better answer than a vague yes, and judges respect it.

Then move on quickly. Do not linger on the tool you used to build the tool.
""")

    s = slide(prs)
    eyebrow(s, "challenges")
    headline(s, "Four things that broke on the way.")
    subhead(s, "All four were ours to solve, not something we blamed on the technology. "
               "That is the honest version.")
    ch = [
        ("One pass was not enough", "Asking for a whole codebase in a single request gave us "
                                    "fluent, confident, wrong answers. We split it into passes.", ACCENT),
        ("We kept hitting a rate limit", "The free tier caps how much you can ask per minute. "
                                         "We had to get far more careful about how much we asked at once.", WARN),
        ("Answers were cut off mid sentence", "Long replies stopped early. Fixed by asking for "
                                              "less per call and streaming the rest as it arrived.", VEIN),
        ("48 hours is genuinely short", "We cut whole features rather than ship something "
                                        "half working. The core does one thing properly.", OK),
    ]
    cw = span(CW, 2, Inches(0.36))
    for i, (t, b, tone) in enumerate(ch):
        x = M + (i % 2) * (cw + Inches(0.36))
        yy = Inches(3.26) + (i // 2) * Inches(1.58)
        card(s, x, yy, cw, Inches(1.40), SURFACE, LINE)
        bar(s, x, yy, Inches(0.045), Inches(1.40), tone)
        tf = tb(s, x + Inches(0.28), yy + Inches(0.22), cw - Inches(0.56), Inches(0.3))
        para(tf, t, 15, TEXT, bold=True, first=True)
        tf = tb(s, x + Inches(0.28), yy + Inches(0.60), cw - Inches(0.56), Inches(0.68))
        para(tf, b, 12, MUTED, spacing=1.38, first=True)
    footer(s, 10)
    notes(s, """
Judges have heard every project claim it was hard. The way to win this slide is specificity
and ownership.

Own every one. Do not say "the API was limiting us", say "we were asking for too much at
once and it was our job to notice."

If you only have time for two, use one pass and the rate limit. The rate limit one is good
because it shows you adapted the design instead of complaining: we learned to send less,
more carefully, and measure the real size of what we were sending.

The last card is worth saying out loud. Cutting features is a decision, not a failure, and
saying we did it deliberately reads as judgement.
""")

    s = slide(prs)
    eyebrow(s, "future scope")
    headline(s, "Where this goes next.")
    subhead(s, "We built the part that makes the rest possible. These are the parts we want "
               "to add next.")
    fut = [
        ("Live in the editor", "Understand a file as you open it, without running a command first."),
        ("Compare two versions", "What changed between two branches, and what that change breaks."),
        ("Keep it up to date", "Re-analyse only what changed, so the report never goes stale."),
        ("Team view", "Share one understanding of a codebase across the whole team."),
        ("More languages", "Broaden beyond what we support today."),
    ]
    y = Inches(2.94)
    for i, (t, b) in enumerate(fut):
        card(s, M, y, CW, Inches(0.66), SURFACE, LINE)
        tf = tb(s, M + Inches(0.30), y + Inches(0.20), Inches(0.5), Inches(0.28))
        para(tf, "0%d" % (i + 1), 11, FAINT, bold=True, font=MONO, first=True)
        tf = tb(s, M + Inches(0.86), y + Inches(0.19), Inches(3.1), Inches(0.3))
        para(tf, t, 14, TEXT, bold=True, first=True)
        tf = tb(s, M + Inches(4.20), y + Inches(0.21), Inches(7.0), Inches(0.3))
        para(tf, b, 12.5, MUTED, first=True)
        y += Inches(0.78)
    footer(s, 11)
    notes(s, """
Future scope is where you show you know what this is not yet. That reads as honesty and
it stops judges hunting for the obvious gap.

Lead with live in the editor. It is the one everyone in the room wants, and it is the
natural next step from a command line tool.

Then compare two versions. It is the most valuable thing on the list and it reuses
everything we already built, so it is credible rather than fanciful.

Say clearly which one you would build first if you had another weekend. That is the
question behind the question, and having an answer matters more than the list.
""")

    s = slide(prs)
    bar(s, Inches(0), Inches(0), Inches(0.10), H, ACCENT)
    tf = tb(s, M, Inches(0.92), Inches(11.0), Inches(0.9))
    para(tf, "Thank you.", 44, TEXT, bold=True, spacing=1.0, first=True)
    tf = tb(s, M, Inches(1.92), Inches(9.6), Inches(0.5))
    para(tf, "Understand any codebase in one command.", 17, ACCENT, first=True)
    people = [
        ("Brenda", "Lead", "The CLI, the scanning, the pipeline, and how it all fits together.", ACCENT),
        ("Naran", "Prompts & report", "Every prompt, the report you look at, and all the visuals.", OK),
    ]
    pw = Inches(5.35)
    for i, (name, role, did, tone) in enumerate(people):
        x = M + i * (pw + Inches(0.5))
        card(s, x, Inches(2.78), pw, Inches(2.05), SURFACE, LINE)
        bar(s, x, Inches(2.78), pw, Inches(0.04), tone)
        tf = tb(s, x + Inches(0.30), Inches(3.06), pw - Inches(0.6), Inches(0.34))
        para(tf, name, 20, TEXT, bold=True, first=True)
        tf = tb(s, x + Inches(0.30), Inches(3.48), pw - Inches(0.6), Inches(0.28))
        para(tf, role.upper(), 10.5, tone, bold=True, font=MONO, first=True)
        tf = tb(s, x + Inches(0.30), Inches(3.86), pw - Inches(0.6), Inches(0.8))
        para(tf, did, 12.5, MUTED, spacing=1.4, first=True)
    card(s, M, Inches(5.22), CW, Inches(0.80), ELEV, ACCENT)
    tf = tb(s, M + Inches(0.34), Inches(5.44), Inches(7.4), Inches(0.32))
    rich(tf, [("npm install -g ", MUTED, False, MONO),
              ("byakugan-macgpt", ACCENT, True, MONO),
              ("   then   ", FAINT, False, MONO),
              ("byakugan analyze .", TEXT, True, MONO)], 14, first=True)
    tf = tb(s, W - M - Inches(3.3), Inches(5.46), Inches(3.0), Inches(0.3))
    para(tf, "MIT licensed", 12, FAINT, font=MONO, align=PP_ALIGN.RIGHT, first=True)
    tf = tb(s, M, Inches(6.30), CW, Inches(0.3))
    para(tf, "IBM Bob 2.0 Hackathon   ·   48 hours   ·   contact details in the repository",
         11, FAINT, font=MONO, first=True)
    notes(s, """
Land the closing line and stop talking.

The ask, if a judge asks what you need: "a codebase nobody understands, and thirty
seconds of your attention while it runs." That is a real ask and it is what you want.

Then thank you, and hand over. Do not trail off into architecture after the close.

Keep the install line on screen through questions. It is the only thing they can act on,
and it is the thing that makes them try it tonight.
""")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    prs.save(path)
    return prs


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "docs", "byakugan.pptx")
    p = build(out)
    print("wrote %s" % out)
    print("slides: %d" % len(p.slides))
    withnotes = sum(1 for s in p.slides if s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip())
    print("slides with speaker notes: %d" % withnotes)
