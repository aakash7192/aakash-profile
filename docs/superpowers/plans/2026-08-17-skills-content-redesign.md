# Skills Content Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **This run:** executed via sky-powers:spawn-workflow — dynamic Workflow, explicit model per agent.

**Goal:** Rebuild the skills section, marquee strip, and hero terminal lines with the owner's 2026 skill set, ranked by market demand, with outdated items removed.

**Architecture:** Content-only change. Copy is drafted by a creative panel (Workflow A: writers + judges), synthesized by Fable in the main loop, then applied by a mechanical implementer and verified (Workflow B). No layout, styling, or component changes.

**Tech Stack:** Vite 6 vanilla site — `index.html` (skills section, marquee ×2 duplicate blocks), `src/main.js` (terminal `script` array).

**Spec:** Approved in-chat (bounded path). Summary: (1) skills core panel re-ranked by market pull with new items; (2) foundation panel gains GitHub Actions, Docker, AWS roles·SSH; cuts: JUnit & Mockito, MVVM & Clean Architecture, Temperature & sampling control; (3) marquee re-ranked to market order with new keywords; (4) terminal lines AI-weighted + golden achievements. skypowers repo link goes in even though it 404s today (owner making it public soon).

## Global Constraints

- No commits and no pushes — working tree only; the user commits when ready. (Harness rule overrides the per-task commit steps below.)
- Never use the word "demo" in site copy. No self-flattering adjectives or multiplier claims (no "12x", "expert", "world-class").
- Do not reintroduce commit counts or "end-to-end" more than once per paragraph.
- Marquee content exists twice (second copy `aria-hidden="true"`); both copies must remain byte-identical.
- Preserve all existing markup structure, classes, and inline styles — copy replacement only.
- Terminal `script` lines are lowercase, `·`-separated, terse log idiom.
- Skills list items keep the existing `<li>` structure with two-digit index spans.
- skypowers link: `https://github.com/aakash7192/skypowers`, styled like existing links (skills panel is on `--surface`; plain `<a>` inherits global link style — acceptable).

## Content Baseline (panel refines wording, not facts)

**Core panel (ranked by 2026 market pull):**
01 Agentic pipelines — multi-agent orchestration · dynamic workflows · LangGraph
02 Claude Code — custom agents · skills · hooks · headless & unattended runs
03 skypowers — my own Claude Code plugin (linked)
04 MCP — tool integration · Figma MCP for automated UI/UX
05 Claude Design → Claude Code handoff — pixel-perfect UI
06 Model routing — right model, right effort, careful prompting
07 Context engineering — caching · memory files & agents · context management
08 Token-efficiency discipline for long-running agents
09 Supabase — database integration
10 Generative media — Nano Banana · Veo 3 APIs
11 LLM pipeline design · tool use & API integration

**Foundation panel:** Android · Kotlin · Java / iOS · Swift / Flutter · Dart / Python · full stack / REST APIs & backend integration / GitHub Actions — CI/CD / Docker deployments / AWS — deployment · IAM roles · SSH / System design / Debugging — root-cause discipline

**Marquee (market order):** Claude Code / MCP · Figma MCP / agentic pipelines / Python / Supabase / Docker / GitHub Actions / AWS / Flutter / Gemini API / Nano Banana · image gen / Veo 3 · video gen

**Terminal (7 lines, AI-first then golden wins):** page-built-by-agents · radiant world 90% · figma mcp + claude design handoff · skypowers plugin · model routing/context caching · docsmart 10k+ users no missed deadlines · closing line ("shipped. no human in the loop. all day." may stay).

---

### Task 1: Creative panel drafts copy (Workflow A) — complexity: complex

**Files:** none (produces copy only)

**Interfaces:**
- Consumes: Content Baseline above + Global Constraints (verbatim in agent prompts).
- Produces: JSON per writer `{core: string[11], foundation: string[10], marquee: string[12], terminal: string[7]}`; judges return `{top: [{id, score, why}], blend?}`.

- [ ] **Step 1:** Launch Workflow A: 3 writers (`model: 'opus'`, lenses: recruiter-scan, engineer-terse, market-signal) each produce a full content set; barrier; 2 judges (`model: 'opus'`, lenses: skeptic hiring manager, positioning/ranking accuracy) score all sets.
- [ ] **Step 2:** Fable synthesizes the winning set in the main loop (may splice lines across sets). Output: final exact strings for all four surfaces.

### Task 2: Apply content (Workflow B, implementer) — complexity: easy (mechanical, copy provided)

**Files:**
- Modify: `index.html` — skills section `<ul>` items (both panels), marquee spans (both duplicate blocks)
- Modify: `src/main.js` — `const script = [...]` array (7 strings)

**Interfaces:**
- Consumes: final strings from Task 1 synthesis, embedded verbatim in the dispatch prompt.
- Produces: edited working tree.

- [ ] **Step 1:** Dispatch implementer (`model: 'sonnet'`) with exact old→new content for every `<li>`, both marquee blocks, and the full new `script` array. No commits.
- [ ] **Step 2:** Implementer runs `npm run build` — expected: `✓ built` with no errors.

### Task 3: Verify (Workflow B, reviewer) — complexity: standard → reviewer `model: 'sonnet'`

**Files:** read-only review of the Task 2 diff + live checks

**Interfaces:**
- Consumes: Task 2 diff (`git diff -- index.html src/main.js`), dev server at `http://localhost:5173/aakash-profile/`.
- Produces: verdict `{pass: boolean, issues: string[]}`.

- [ ] **Step 1:** Grep served page: new items present (`skypowers`, `Figma MCP`, `Supabase`, `Docker`, `GitHub Actions`); removed items absent (`JUnit`, `Mockito`, `MVVM`, `Temperature`); both marquee copies identical; `script` array has 7 lines, no "demo"/"12x"/commit counts anywhere.
- [ ] **Step 2:** Report verdict; failures return to Fable (main loop) for fixes.

## Self-Review

Spec coverage: skills panels (T1/T2), marquee (T1/T2), terminal (T1/T2), cuts + verification (T3) — covered. Placeholders: none; baseline carries actual content. Type consistency: writer/judge schemas consistent across tasks.
