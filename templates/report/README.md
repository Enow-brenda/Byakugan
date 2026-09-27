# Report templates

The HTML report is built from these files by `lib/template.js`. `lib/reporter.js`
only shapes data; all markup lives here.

```
report.css            inlined into <style> by layout.html
report.js             inlined into <script> by layout.html
layout.html           document shell: head, activation overlay, nav, sections, palette
nav.html              sidebar: brand, section links, rank progress
sections/overview.html        Mission Dossier
sections/chakra-network.html  Chakra Flow
sections/techniques.html      Jutsu Library
sections/impact-sight.html    Fovea Vision
sections/files.html           Shinobi Registry
sections/quiz.html            The Dojo
```

The output is one self-contained file. No CDN, no fonts to fetch, no build step,
and nothing to serve: open it from disk and it works, which is the point when the
report might be emailed or dropped in a folder.

## Syntax

| Form | Meaning |
|---|---|
| `{{name}}` | HTML-escaped value. Use this for anything from `analysis.json`. |
| `{{{name}}}` | Trusted HTML, inserted verbatim. Only for markup this app built itself. |
| `{{a.b.c}}` | Dotted lookup. |
| `{{#if x}}` / `{{#unless x}}` | Conditional, both support `{{else}}`. |
| `{{#each xs}}` | Loop; supports `{{else}}` for empty lists. |
| `{{@index}}` `{{@first}}` `{{@last}}` | Position within the current loop. |
| `{{.}}` | The current item, when looping over plain strings. |
| `{{! ... }}` | Comment. |

Inside a loop, names not found on the item fall through to the enclosing
context, so a section-level flag such as `showExports` is readable from inside
`{{#each files}}` without being passed down again.

`@first`, `@last` and `@index` only mean anything inside `{{#each}}`. Using them
at the top level of a template silently yields a falsey value rather than an
error, so a plural suffix written that way appears on every item.

## Three rules worth keeping

**Escaping is the default.** `{{ }}` escapes; emitting raw HTML takes a
deliberate `{{{ }}}`. Model-generated text arrives through `{{ }}`, so a stray
`<script>` in a summary cannot reach the page.

**Keep these files ASCII.** Write `&mdash;`, `&#10003;`, `&middot;` rather than
the literal characters. This codebase was previously saved through a
windows-1252 round-trip and every em dash and arrow in the report came out as
mojibake; ASCII-only templates make that class of bug impossible.
`test-encoding.js` guards the rest of the source tree.

**Only app-built markup gets `{{{ }}}`.** Currently that is: the CSS, the script,
the sidebar (the icons are path data generated in `reporter.js`), the section
bodies, and the graph JSON. The JSON is the subtle one, because it lands inside a
`<script>` element: `jsonForScript()` escapes `<`, `>`, `&` and the two line
separators, because a node label containing `</script` would otherwise end the
element early and have the rest of the label parsed as markup.

## The client script is an enhancement, not a dependency

`report.js` adds the chakra graph, filtering, sorting, quiz scoring, the theme
toggle, the command palette, and the skip path for the activation overlay. The
report is fully readable if it never runs, which shapes two decisions:

- The activation sequence is CSS, including its own timeout. No script means no
  way to hide the overlay, so it hides itself.
- The chakra graph is a `<div>` in the markup, and the same data is already in a
  table underneath it. If the script fails, the table is the graph.

Model-written text is only ever placed with `textContent` in `report.js`, never
`innerHTML`, so nothing there re-interprets what the templates escaped.

## Section data

`lib/reporter.js` builds one plain object per section and hands it to the
template. Two shapes are worth knowing about when editing a template:

- A section is only rendered when its data is non-empty (`SECTIONS[].when`), and
  the sidebar is built from the same filtered list, so a section and its nav link
  can never disagree.
- Values used in a class name or a CSS custom property are narrowed first.
  `severity()` clamps significance and risk to `high|medium|low`, and node types
  and edge kinds are checked against `NODE_TYPES` and `EDGE_KINDS`, so a model
  that invents `catastrophic` cannot inject an arbitrary class.

## Styling

Every colour in `report.css` is a custom property, so the daytime theme is a
second block of overrides on `[data-theme="day"]` rather than a second
stylesheet. Anything hard-coded defeats that, so a new colour should become a
token.

Elements that animate in on load carry the `stagger` class. Its delays are
written to land after the activation overlay clears, and the first eight
children get individual offsets; the rest share the last one.

## Indentation

A line containing nothing but a block tag has its own line removed, so indenting
the template does not inject blank lines into the output. Keep structural tags on
their own lines; the indentation inside the block is preserved verbatim in the
HTML, which is harmless.
