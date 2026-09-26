# Screenshots Required for Submission

Place your screenshot files in this folder (`bob_session/images/`) before submitting.
The README.MD and submission assets reference these exact filenames.

---

## Required Screenshots

### 1. `demo.png` ← MOST IMPORTANT
**What to capture:** A terminal showing `byakugan analyze <path>` running.
Show the progress output — the pass numbers, file counts, and the final green checkmarks.

**How to take it:**
```bash
byakugan analyze ./byakugan    # analyse your own repo for a quick demo
```
Capture the full terminal output from start to finish.

---

### 2. `report.png`
**What to capture:** The generated `report.html` open in a browser.
Show the Overview section with the project cards visible (name, language, files, lines).
The intent note banner at the top should be visible.

**How to take it:**
```bash
byakugan analyze ./byakugan
byakugan report
# open .byakugan/report.html in Chrome/Firefox
```

---

### 3. `chat.png`
**What to capture:** A `byakugan chat` session in the terminal.
Show at least one question and its answer. Ideally a technical question like
"What does lib/analyzer.js export?" so the RAG retrieval is exercised.

**How to take it:**
```bash
byakugan chat
# ask: "What does lib/analyzer.js export?"
# screenshot the question + answer
```

---

### 4. `explain.png`
**What to capture:** Output of `byakugan explain <file>` in the terminal.

**How to take it:**
```bash
byakugan explain lib/analyzer.js
# screenshot the full explanation output
```

---

### 5. `doctor.png`
**What to capture:** Output of `byakugan doctor` showing all green ✓ checkmarks.
Both generation and embedding should show OK.

**How to take it:**
```bash
byakugan doctor
# screenshot when both lines show green ✓
```

---

## After Taking Screenshots

1. Save all files to this folder (`bob_session/images/`)
2. Use exact filenames: `demo.png`, `report.png`, `chat.png`, `explain.png`, `doctor.png`
3. The `README.MD` already references `bob_session/images/demo.png` — update the other
   image references in the README if you want them included there too.

---

## Optional: Additional Screenshots

These are not referenced in the README but useful for the submission:

| Filename | What to show |
|---|---|
| `impact.png` | Output of `byakugan impact lib/analyzer.js` |
| `quiz.png` | The Quiz section of the HTML report with one question answered |
| `profile.png` | The `byakugan profile` interactive setup questions |
| `chakra.png` | The Chakra Network table in the HTML report |
