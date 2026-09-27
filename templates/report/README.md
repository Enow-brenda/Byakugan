# Report templates

The HTML report is built from these files by `lib/template.js`. `lib/reporter.js`
only shapes data; all markup lives here.

```
report.css            inlined into <style> by layout.html
layout.html           document shell: head, header, nav, section slot, quiz script
sections/overview.html
sections/chakra-network.html
sections/techniques.html
sections/impact-sight.html
sections/files.html
sections/quiz.html
```

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

## Two rules worth keeping

**Escaping is the default.** `{{ }}` escapes; emitting raw HTML takes a
deliberate `{{{ }}}`. Model-generated text arrives through `{{ }}`, so a stray
`<script>` in a summary cannot reach the page.

**Keep these files ASCII.** Write `&mdash;`, `&#10003;`, `&middot;` rather than
the literal characters. This codebase was previously saved through a
windows-1252 round-trip and every em dash and arrow in the report came out as
mojibake; ASCII-only templates make that class of bug impossible.
`test-encoding.js` guards the rest of the source tree.

## Indentation

A line containing nothing but a block tag has its own line removed, so indenting
the template does not inject blank lines into the output. Keep structural tags on
their own lines; the indentation inside the block is preserved verbatim in the
HTML, which is harmless.
