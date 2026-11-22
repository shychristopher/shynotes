# Contributing a Course to Shy Notes

Adding a new course to **Shy Notes** takes ~5 minutes and requires **zero coding or plugins**. You can do everything directly in GitHub's web editor (`Add file → Create new file`) or locally via Git.

---

## What Happens Automagically (Do NOT Create Manually!)

When you add a course folder and metadata file, the site automatically generates:

- **Course Catalog card & search/tag filtering** (`/courses/`)
- **Left course sidebar & nested folder navigation** (from your subfolders)
- **Progress tracking & "Updated / New" indicators** (saved per-student in browser `localStorage`)
- **Quick Reference page** (`Study Tools → Quick Reference` — for student bookmarks, "Return to" spots, and "Review later" flags)
- **Glossary page & filter sidebar** (`Study Tools → Glossary` — appears automatically the moment you add `_data/glossaries/<slug>.yml`)
- **Inline term popovers & page Key Terms cards** (auto-matched from your glossary on every page that mentions those terms)
- **Collapsible headings & section bookmarking** (auto-built from your `##` / `###` Markdown headings)
- **Course & Glossary Print Preview Studios** (single page, whole section, or entire course + glossary appendix)
- **Offline PWA caching** (students automatically cache courses they open)

> **Important:** You do **not** need to create a `glossary.md` or `quick-reference.md` file inside your course folder. Both are wired up automatically for every course!

---

## Step-by-Step: Adding a New Course

Pick a short, lowercase, URL-friendly **slug** for your course (no spaces—use hyphens), e.g. `emt`, `bio-101`, or `git-405`.

### Folder & File Layout

```text
_data/
├── courses/
│   └── <slug>.yml                 # REQUIRED: Course metadata (title, code, tags, summary)
├── glossaries/
│   └── <slug>.yml                 # OPTIONAL: Glossary terms (auto-enables Glossary & Key Terms)
├── links/
│   └── <slug>.yml                 # OPTIONAL: Quizlets, flashcards, videos & mind map link definitions
└── mindmaps/
    └── <slug>/
        └── <map-id>.yml           # OPTIONAL: Markmap markdown mind map files (pan/zoom viewer)

_courses/
└── <slug>/
    ├── index.md                   # REQUIRED: Course Overview page
    ├── reference-sheet.md         # OPTIONAL: Root-level files show under "General"
    ├── 01-getting-started/        # Subfolders become collapsible sections under "Content"
    │   ├── index.md               # Section overview (sets the section display name)
    │   ├── 01-first-topic.md      # Lesson page
    │   └── 02-second-topic.md     # Lesson page
    └── 02-advanced-topics/
        ├── index.md
        └── 01-nested-subtopic/    # Subfolders can be nested as deep as you need
            ├── index.md
            └── 01-deep-dive.md
```

**Ordering tip:** Prefix folders and files with `01-`, `02-`, `03-` so they stay in chapter order. Leading numbers are stripped automatically from sidebar folder titles when no `index.md` title is set.

---

## Copy-Paste Templates

### 1. Course Metadata — `_data/courses/<slug>.yml` (Required)

```yaml
title: Biology 101
course_code: BIO-101
term: Fall 2026
featured: false          # true = spotlight on the home page
deprecated: false        # true = marked Deprecated & hidden unless toggled in catalog
hidden: false            # true = completely unlisted & redirects to catalog
tags:
  - Science
  - Biology
summary: Core cellular biology notes, lab references, and exam prep.

# Optional: pull glossary terms from another course slug into this course too
# glossary_includes:
#   - chemistry-basics
```

---

### 2. Course Overview — `_courses/<slug>/index.md` (Required)

```markdown
---
title: Overview
---

Welcome to **Biology 101**! Use the sidebar to work through each unit, or open **Glossary** under **Study Tools** to review definitions.

## How to Use These Notes

- Click any section heading to collapse or expand it.
- Click the bookmark icon on any heading to save it to **Quick Reference** or mark a **Return to** spot.
```

*(You don't need to specify `layout: course`—`_config.yml` applies it automatically to every file inside `_courses/`.)*

---

### 3. Section Folder Overview — `_courses/<slug>/01-cell-structure/index.md`

```markdown
---
title: Cell Structure
description: Organelles, membranes, and transport across the cell membrane.
---

High-level summary for this unit.

## Learning Objectives

- Identify the major eukaryotic organelles and their roles.
- Compare passive and active transport.
```

---

### 4. Lesson Page — `_courses/<slug>/01-cell-structure/01-organelles.md`

```markdown
---
title: Organelles
description: Quick breakdown of eukaryotic cell structures.
section: Cell Structure
---

Intro paragraph (optional—always stays visible above the collapsible sections).

## Energy & Metabolism

### Mitochondria

Produces ATP via cellular respiration.

### Chloroplasts

Found in plant cells; converts sunlight into chemical energy.

## Protein Synthesis

Ribosomes translate mRNA into polypeptide chains.
```

#### Optional Front Matter Flags for Any Lesson Page

| Field | Example | Effect |
| --- | --- | --- |
| `title` | `Organelles` | Page heading and sidebar link label |
| `description` | `Quick breakdown…` | Subtitle shown under the page title |
| `section` | `Cell Structure` | Small section label shown next to the course badge |
| `nav_title` | `Unit Overview` | Custom sidebar label for a folder's `index.md` (defaults to `Overview`) |
| `is_new` | `true` | Displays the blue **New** dot until the student reviews the page |
| `revision` | `2026-11-21` | Manually trigger the **Updated** indicator for returning students (also auto-detected from content changes!) |
| `glossary_autolink` | `false` | Turn off inline glossary hover popovers on this page |
| `nav_exclude` | `true` | Hide the page from the sidebar navigation |
| `hidden` | `true` | Make the page unreachable (redirects to `/courses/`) |

---

### 5. Glossary Terms — `_data/glossaries/<slug>.yml` (Optional)

The moment this file exists with at least one term, **Glossary** automatically appears under **Study Tools**, inline hover popovers activate across every lesson, and page-specific **Key Terms** cards appear on pages that mention those terms.

```yaml
- id: atp
  term: ATP
  full: Adenosine Triphosphate
  category: Metabolism
  aliases:
    - adenosine triphosphate
  definition: The primary energy-carrying molecule used by cells to power metabolic reactions.
  builds_on:
    - cellular-respiration
  related:
    - mitochondria

- id: mitochondria
  term: Mitochondria
  category: Organelles
  definition: Double-membraned organelles responsible for generating most of the cell's ATP.
  related:
    - atp
```

- **`id`**: Unique lowercase slug (used for `builds_on` / `related` links and `#term-<id>` anchors).
- **`term`** *(required)* & **`definition`** *(required)*: Main term and definition.
- **`full`** *(optional)*: Expanded name for acronyms (e.g., `ATP — Adenosine Triphosphate`).
- **`category`** *(optional)*: Powers the Glossary filter sidebar checkboxes.
- **`aliases`** *(optional)*: Alternate spellings/phrases that also match for inline popovers and Key Terms.
- **`builds_on`** & **`related`** *(optional)*: List of other term `id`s to cross-link concepts.

---

### 6. Study Links (Quizlets, Videos, Practice) & Mind Maps (Optional)

Define links centrally under `_data/links/<slug>.yml` and interactive Markmap mind maps under `_data/mindmaps/<slug>/<map-id>.yml`, then attach whichever ones apply to any course overview, glossary, section, or lesson page!

**`_data/mindmaps/<slug>/airway-management.yml`:**

```yaml
title: Airway Management Mind Map
description: Visual breakdown of airway maneuvers, adjuncts, and oxygen delivery.
content: |
  # Airway Management
  ## Manual Maneuvers
  - Head-Tilt, Chin-Lift (medical)
  - Jaw-Thrust (suspected trauma)
  ## Airway Adjuncts
  - OPA (unresponsive, no gag reflex)
  - NPA (intact gag reflex)
```

*(You can also use `image: /assets/images/...` or `embed_url: https://...` instead of `content:` for static images or embeds like Miro/Excalidraw.)*

**`_data/links/<slug>.yml`:**

```yaml
quizlet_airway:
  type: quizlet          # quizlet | anki | flashcards | video | practice | link | mindmap
  title: Airway Flashcards (Quizlet)
  url: https://quizlet.com/your-set-url

airway_mindmap:
  type: mindmap
  title: Airway Mind Map
  map: airway-management # matches _data/mindmaps/<slug>/airway-management.yml
```

**Attach to any page (Course Overview, Section Overview, or Lesson) via `links:` in front matter:**

```yaml
---
title: Airway Management
links:
  - airway_mindmap
  - quizlet_airway
---
```

*(You can also reference a mind map filename directly like `- airway-management` without adding it to `_data/links/`, or attach Glossary-specific links in `_data/courses/<slug>.yml` under `glossary_links:`.)*

---

## Writing Tips

- **Use `##` for main sections and `###` for subsections:** The site automatically turns them into collapsible, bookmarkable cards (and leaves them completely plain & expanded when printing).
- **Standard Markdown tables work great:** Tables are styled automatically for light mode, dark mode, high contrast, and print.
- **Keep file names lowercase with hyphens:** e.g. `01-manual-maneuvers.md`, never spaces or uppercase.

---

## Previewing Locally (Optional)

If you want to preview your changes on your machine before opening a Pull Request:

```bash
bundle install
bundle exec jekyll serve --livereload
```

Then open `http://localhost:4000`.

## Submitting Your Changes

1. Fork the repository (or create a branch if you have write access).
2. Add or edit your files under `_data/` and `_courses/`.
3. Open a **Pull Request** with a short summary of the course or updates you added.
