# Stage CLI Output — Locked Design (implemented 2026-11-22)

> This file now documents the **implemented** design, not proposals.
> Code: `soma/machinetalk/progress.py` (formatting, `StageTimer`, `_STAGE_STEPS`),
> `soma/machinetalk/ascii_dividers.py` (art/phrase pools).
> Applies to all four receptors: distiller, introbeaver, planbeaver, outrobeaver.

---

## **Locked Design**

### **Line format (ASCII, fixed width 100)**
```
[SES-001] step description        ~~~ <DI-01> ~05s~
```
- `[SES-001]` — bold cyan, left side, on every line.
- `<DI-01>` — bold cyan, right side, on every line.
- `~` filler — dim, pads so the right side lands at a fixed column.
- `~05s~` — dim elapsed seconds, padded to 2 digits. `~ERROR~` (red) on failure.
- Long step text is truncated with `...`; error messages and log links are
  **not** truncated (they overflow).

### **Per-stage block**
1. **Divider** — random ASCII art (dim) + random phrase (cyan), printed
   before **every** stage including the first. Pools in `ascii_dividers.py`.
2. **Header line** — `[SES-001] DISTILLER: Reminder of steps (mistral-large-3) <DI-01> ~00s~`
3. **Step lines** — paced over ~30s while the model call is in flight.
   Seconds are pacing, not measurements (real duration is in the status line).
   All steps print even if the stage fails early; the failure line follows.
4. **Failure line** (on failure) — `✗ FAILED: <reason> <DI-01> ~ERROR~`
5. **Status line** — `✓ Status: DONE  start 12:00:00  duration  50.0s <DI-01> ~50s~`
6. **Log line** — `Log: file:///.../SES-001_DI-01.log <DI-01>` (clickable, own line)

### **Between stages**
A blank line separates stage blocks (the divider of the next stage provides
the visual break).

---

## **Original analysis (kept for reference)**

### **1. Telemetry Header (Start of Stage)**

### **1. Telemetry Header (Start of Stage)**
Printed at the beginning of every Distiller run. Example:
```
════════════════════════════════════════
  [SES-001][DI-01] DISTILLER
════════════════════════════════════════
  start     2026-11-21 14:30:00
  session   SES-001
  stage     DI-01
  chatset   CS1
  chars in  12,345
  model     mistral-large-3
  provider  mistral
════════════════════════════════════════
```

### **2. Live Progress Steps (While Running)**
11 hardcoded steps, printed at **paced intervals** (not tied to actual work). Example:
```
  2026-11-21T14:30:05Z ✓ [SES-001][DI-01] [01/11] hashing input ............ 5s
  2026-11-21T14:30:10Z ✓ [SES-001][DI-01] [02/11] extracting heredocs, metadata, constraints 10s
```
**Issue**: These steps are **not real milestones**—they’re just visual placeholders while waiting for the model. The pacing is artificial (e.g., 1.5s per step), so users may assume progress is happening when the model is still thinking.

### **3. Live Timer (Below Steps)**
A spinning character with elapsed time. Example:
```
  [SES-001][DI-01] DISTILLER · mistral-large-3 [⏳ 15s elapsed]
```
**Issue**: Doesn’t explain what the stage is doing (e.g., "waiting for model" vs. "processing").

### **4. Telemetry Result (On Completion)**
Printed after the model returns. Example:
```
════════════════════════════════════════
  started    2026-11-21 14:30:00
  finished   2026-11-21 14:30:20
  duration   19.5s
  chars out  4,567 (0.37x)
  tokens     prompt 12,345  completion 567  total 12,912
  model      mistral-large-3
  provider   mistral
  verdict    PASS
  status     DONE
════════════════════════════════════════
```
**Issue**: Verdict and status are buried in the middle of the block. Token counts are confusing (e.g., "reply shorter than token count" is dim and easy to miss).

### **5. Distiller Summary (Custom Block)**
Printed after the telemetry result. Example:
```
  decision      PROCESSED
  chars in      12,345
  signal qual   0.87
  intent        build a CLI tool
  extracted     directives=3 constraints=2 questions=1
  soma          file:///home/flintx/soma-nov21/soma/output/...
```
**Issue**: No emphasis on **why** it was skipped (if applicable) or **key decisions** (e.g., intent anchor).

### **6. Completion Glyph**
- `✓` (green) for DONE
- `⚠` (yellow) for SKIPPED
- `✗` (red) for FAILED
**Issue**: This is the **only immediate visual cue** of success/failure. Users must scan multiple lines to confirm the result.

---

## **Problems to Fix**

### **1. Fake Progress Steps**
- **Problem**: The 11 steps are **not tied to actual work**. They’re printed at fixed intervals to simulate progress, but the Distiller is actually just **one model call**. This misleads users into thinking the stage is "doing step 5" when it’s really still waiting for the model.
- **Impact**: Users can’t tell if the stage is **stuck** or **actually progressing**.

### **2. No Clear "Model Call Started" Indicator**
- **Problem**: There’s no explicit message like:
  ```
  [SES-001][DI-01] → Sending request to mistral-large-3...
  ```
- **Impact**: Users don’t know when the LLM call begins vs. setup (e.g., loading invariants).

### **3. "Waiting for Response" State is Unclear**
- **Problem**: After all 11 steps print, the timer keeps spinning with:
  ```
  [SES-001][DI-01] DISTILLER · mistral-large-3 [⏳ 60s elapsed]
  ```
  But there’s no explicit message like:
  ```
  [SES-001][DI-01] ✓ All steps submitted. Waiting for model response...
  ```
- **Impact**: Users wonder: "Is it still processing, or is it stuck?"

### **4. Token Counts Are Confusing**
- **Problem**:
  - "reply shorter than token count" note is **dim and easy to miss**. 
  - No explanation for **why** completion tokens may far exceed chars out (e.g., reasoning tokens).
- **Impact**: Users may assume a bug in token counting.

### **5. Verdict and Intent Are Buried**
- **Problem**: The **verdict** (PASS/SKIP/QUARANTINE) and **intent** (first directive/constraint) appear in the telemetry block, which is long and generic.
- **Impact**: Users must scan multiple lines to confirm if the stage passed or failed.

### **6. No Explanation for Skips**
- **Problem**: If the Distiller skips a chatset (e.g., `NO_SIGNAL`), the **reason** appears in the telemetry block but isn’t highlighted.
- **Impact**: Users don’t immediately know *why* a chatset was skipped.

### **7. Noise Counts Are Missing**
- **Problem**: The Distiller drops noise segments (e.g., greetings, apologies), but this isn’t reported.
- **Impact**: Users can’t see how much data was filtered out.

### **8. No Visual Hierarchy**
- **Problem**: All output is **flat**—no clear separation between:
  - **Setup** (e.g., validating input)
  - **Model Call** (e.g., sending request, waiting for response)
  - **Post-Processing** (e.g., parsing output, writing to Soma)
- **Impact**: Hard to understand the workflow.

### **9. Errors Aren’t Highlighted**
- **Problem**: Critical errors (e.g., `QUARANTINE`, `SCHEMA_FAILURE`) use the same formatting as warnings or info.
- **Impact**: Users may miss failures in the output.

### **10. Output Ends Abruptly**
- **Problem**: The stage output ends with the distiller summary, but there’s no clear "Done" footer or timestamp.
- **Impact**: Feels incomplete.

---

## **Proposed Improvements**

### **1. Replace Paced Steps with Real Milestones**
**Current**: 11 hardcoded steps printed at fixed intervals.
**Proposed**: Replace with **real, observable events** from the Distiller’s workflow:
```
  [SES-001][DI-01] → Preparing input: NFC-normalizing content...
  [SES-001][DI-01] ✓ Input validated (0.1s)
  [SES-001][DI-01] → Sending request to mistral-large-3...
  [SES-001][DI-01] ⏳ Waiting for model response... (15s elapsed)
  [SES-001][DI-01] ✓ Model response received (12,345 prompt tokens, 1,485 completion tokens)
  [SES-001][DI-01] → Parsing output: Extracting signals...
  [SES-001][DI-01] → Applying gates: Validating JSON, checking hashes...
  [SES-001][DI-01] → Writing to Soma: Persisting results...
```
**Why this helps**:
- Users see **actual progress**, not fake pacing.
- Clear separation between **setup**, **model call**, and **post-processing**.

**Implementation**:
- Use the existing `_emit` callback in `engine.py` to print these milestones **as they happen**.
- Remove `_DISTILLER_STEPS` and `StageTimer._distiller_steps`.

---

### **2. Add Explicit "Model Call Started" Timestamp**
**Current**: No indication of when the model call begins.
**Proposed**: Print a line like:
```
  [SES-001][DI-01] → Model call started at 14:30:05 (mistral-large-3)
```
**Why this helps**:
- Users can measure **exact model latency** (not just stage duration).
- Clarifies when the LLM is actually working vs. setup.

---

### **3. Improve Token Count Clarity**
**Current**:
```
  tokens      prompt 12,345  completion 1,485  total 13,830
```
**Proposed**:
```
  tokens      prompt 12,345  completion 1,485 (includes 1,000 reasoning tokens)  total 13,830
```
**Why this helps**:
- Explains why completion tokens may exceed chars out.
- Avoids confusion about "missing" output.

**Implementation**:
- If the model provides a `reasoning_tokens` field, use it.
- Otherwise, add a note when `completion_tokens / chars_out > 2.0`.

---

### **4. Highlight Verdict and Intent in a Dedicated Line**
**Current**: Verdict and intent appear in the telemetry block.
**Proposed**: Add a **dedicated, bold line** at the top of the result block:
```
  [SES-001][DI-01] ✓ DISTILLER DONE in 19.5s → VERDICT: PASS | INTENT: "build a CLI tool"
```
**Why this helps**:
- **Immediate feedback** on success/failure.
- Users don’t need to scan the full telemetry block.

---

### **5. Add a Structured Distiller Summary Block**
**Current**: Generic summary with minimal formatting.
**Proposed**: A **dedicated, visually distinct block** with:
- **Status**: ✓ DONE / ⚠ SKIPPED / ✗ FAILED
- **Verdict**: PASS / SKIP / QUARANTINE
- **Decision**: PROCESSED / NO_SIGNAL / etc.
- **Intent Anchor**: First directive/constraint (truncated if long).
- **Signal Types**: Counts of directives, constraints, questions, etc.
- **Signal Quality**: Numerically + **visual bar** (e.g., `[■■■■■■■■□□□] 0.70`).
- **Noise Dropped**: Count + breakdown (e.g., `5 segments (greetings=2, fillers=3)`).

**Example**:
```
─────────────────────────────── DISTILLER RESULT ───────────────────────────────
  Status:        ✓ DONE
  Verdict:       PASS
  Decision:      PROCESSED
  Intent:        build a zero-dependency Python CLI
  Signals:       directives=3  constraints=2  questions=1
  Noise Dropped: 5 segments (greetings=2, apologies=1, fillers=2)
  Quality:       0.78 [■■■■■■■■□□] (good)
────────────────────────────────────────────────────────────────────────────────
```
**Why this helps**:
- All key information is **grouped and easy to parse**.
- **Visual hierarchy** makes it scannable.

---

### **6. Color-Code Critical Errors**
**Current**: All messages use the same color scheme.
**Proposed**:
- **Red**: `QUARANTINE`, `FAILED`, `ERROR`
- **Yellow**: `SKIPPED`, `WARNING`
- **Green**: `PASS`, `DONE`
- **Cyan**: Info (e.g., milestones, timer)

**Example**:
```
  [SES-001][DI-01] ✗ DISTILLER FAILED → VERDICT: QUARANTINE (SCHEMA_FAILURE: missing chatset_hash)
  [SES-001][DI-01] ⚠ DISTILLER SKIPPED → VERDICT: NO_SIGNAL (no directives or constraints found)
```
**Why this helps**:
- Users **instantly** see successes vs. failures.
- Errors **stand out** in logs.

---

### **7. Group Related Metrics**
**Current**: Metrics are scattered in the telemetry block.
**Proposed**: Organize into logical groups:
```
  Input:
    chars in        12,345
    chatset hash    a91f0c3e5b7d2418...
  
  Output:
    chars out       4,567 (0.37x compression)
    tokens          prompt 12,345  completion 1,485 (includes 1,000 reasoning tokens)
  
  Model:
    name            mistral-large-3
    provider        mistral
    latency         19.5s (model call: 18.2s, overhead: 1.3s)
```
**Why this helps**:
- Easier to compare **input vs. output**.
- Clear separation of **model performance** from other metrics.

---

### **8. Add a "Done" Footer with Log Link**
**Current**: Output ends abruptly with the distiller summary.
**Proposed**: Add a **clear footer** with:
- **Log link**: Absolute `file://` path.
- **Completion timestamp**: ISO 8601 format.

**Example**:
```
  ├─ Log:       file:///home/flintx/soma-nov21/soma/output/logs/distiller/SES-001_DI-01.log
  └─ Done at:   2026-11-21T14:30:20Z
═══════════════════════════════════════════════════
```
**Why this helps**:
- Users know **exactly where to find logs**.
- Provides a **clear end marker** for the stage.

---

## **Full Example of Improved Output**

```
═══════════════════════════════════════════════════
  [SES-001][DI-01] DISTILLER
═══════════════════════════════════════════════════
  start       2026-11-21 14:30:00
  session     SES-001
  chatset     CS1
  chars in    12,345
  model       mistral-large-3 (Mistral)
═══════════════════════════════════════════════════

  [SES-001][DI-01] → Preparing input: NFC-normalizing content...
  [SES-001][DI-01] ✓ Input validated (0.1s)
  [SES-001][DI-01] → Model call started at 14:30:00.5 (mistral-large-3)
  [SES-001][DI-01] ⏳ Waiting for model response... (15s elapsed)
  [SES-001][DI-01] ⏳ Waiting for model response... (30s elapsed)
  [SES-001][DI-01] ✓ Model response received (12,345 prompt tokens, 1,485 completion tokens)
  [SES-001][DI-01] → Parsing output: Extracting signals...
  [SES-001][DI-01] → Applying gates: Validating JSON, checking hashes...
  [SES-001][DI-01] → Writing to Soma: Persisting results...

  [SES-001][DI-01] ✓ DISTILLER DONE in 19.5s → VERDICT: PASS | INTENT: "build a zero-dependency Python CLI"

─────────────────────────────── DISTILLER RESULT ───────────────────────────────
  Status:        ✓ DONE
  Verdict:       PASS
  Decision:      PROCESSED
  Intent:        build a zero-dependency Python CLI that reads Apache logs
  Signals:       directives=3  constraints=2  questions=1
  Noise Dropped: 5 segments (greetings=2, apologies=1, fillers=2)
  Quality:       0.78 [■■■■■■■■□□] (good)
────────────────────────────────────────────────────────────────────────────────

  Input:
    chars in        12,345
    chatset hash    a91f0c3e5b7d2418...
  
  Output:
    chars out       4,567 (0.37x compression)
    tokens          prompt 12,345  completion 1,485 (includes 1,000 reasoning tokens)
  
  Model:
    name            mistral-large-3
    provider        mistral
    latency         18.2s (model call) + 1.3s (overhead)

  ├─ Log:       file:///home/flintx/soma-nov21/soma/output/logs/distiller/SES-001_DI-01.log
  └─ Done at:   2026-11-21T14:30:20Z
═══════════════════════════════════════════════════
```

---

## **Error Example**

If the Distiller fails (e.g., `SCHEMA_FAILURE`):
```
═══════════════════════════════════════════════════
  [SES-001][DI-01] DISTILLER
═══════════════════════════════════════════════════
  start       2026-11-21 14:30:00
  session     SES-001
  chatset     CS1
  chars in    12,345
  model       mistral-large-3
  provider    mistral
═══════════════════════════════════════════════════

  [SES-001][DI-01] → Preparing input: NFC-normalizing content...
  [SES-001][DI-01] ✗ Input validation failed: missing chatset_hash

  [SES-001][DI-01] ✗ DISTILLER FAILED → VERDICT: QUARANTINE (SCHEMA_FAILURE)

─────────────────────────────── DISTILLER RESULT ───────────────────────────────
  Status:        ✗ FAILED
  Verdict:       QUARANTINE
  Decision:      SCHEMA_FAILURE (missing chatset_hash)
  Intent:        —
  Signals:       directives=0  constraints=0  questions=0
  Noise Dropped: 0 segments
  Quality:       —
────────────────────────────────────────────────────────────────────────────────

  Input:
    chars in        12,345
    chatset hash    — (MISSING)

  ├─ Log:       file:///home/flintx/soma-nov21/soma/output/logs/distiller/SES-001_DI-01.log
  └─ Done at:   2026-11-21T14:30:01Z
═══════════════════════════════════════════════════
```

---

## **Skip Example**

If the Distiller skips a chatset (e.g., `NO_SIGNAL`):
```
  [SES-001][DI-01] ✓ DISTILLER DONE in 2.1s → VERDICT: SKIP (NO_SIGNAL)

─────────────────────────────── DISTILLER RESULT ───────────────────────────────
  Status:        ⚠ SKIPPED
  Verdict:       SKIP
  Decision:      NO_SIGNAL (no directives or constraints found)
  Intent:        —
  Signals:       directives=0  constraints=0  questions=0
  Noise Dropped: 12 segments (all classified as noise)
  Quality:       —
────────────────────────────────────────────────────────────────────────────────
```

---

## **Implementation Plan**

### **Files to Modify**
All changes are in **`soma/machinetalk/progress.py`**:

| **Component**               | **Function/Class**               | **Change**                                                                                     |
|-----------------------------|----------------------------------|-----------------------------------------------------------------------------------------------|
| Live Steps                  | `StageTimer._distiller_steps`    | Replace paced steps with **real milestones** (or remove entirely).                          |
|                             | `_DISTILLER_STEPS`                | Remove hardcoded steps (no longer needed).                                                     |
| Model Call Start            | `telemetry_header`                | Add **explicit "Model call started" timestamp**.                                            |
| Waiting State               | `StageTimer._spin`                | Replace timer with **dynamic "Waiting for model response" messages**.                     |
| Token Counts                | `telemetry_result`               | Add **reasoning token note** and improve formatting.                                          |
| Verdict/Intent Line         | `StageTimer.finish`              | Add **dedicated header line** for verdict and intent.                                        |
| Distiller Summary           | `distiller_summary`              | Expand to include **noise counts, quality bar, structured layout**.                         |
| Color Coding                | `_verdict_glyph`                 | Extend to use **red for QUARANTINE/FAILED**, yellow for SKIPPED.                            |
| Metric Grouping             | `telemetry_result`               | Reorganize into **Input/Output/Model** sections.                                             |
| Done Footer                 | `StageTimer.finish`              | Add **log link + completion timestamp**.                                                   |

### **Key Functions to Update**
1. **`telemetry_header`**: Add model call start time.
2. **`StageTimer.start`**: Print initial milestones (e.g., "Preparing input...").
3. **`StageTimer._distiller_steps`**: Remove paced steps; replace with real events via `_emit` callback.
4. **`StageTimer.finish`**: Add verdict/intent line and done footer.
5. **`distiller_summary`**: Expand to include noise counts, quality bar, and reasoning.

### **Dependencies**
- **No new dependencies**: Use existing ANSI color codes (`_C_GREEN`, `_C_RED`, etc.) and formatting helpers.
- **Use `_emit` callback**: Already passed from `engine.py` to print milestones as they happen.

---

## **Minimal Changes for Maximum Impact**

If you want to **start small**, prioritize these changes:

1. **Replace paced steps with real milestones** (Eliminates fake progress).
   - Remove `_DISTILLER_STEPS` and `StageTimer._distiller_steps`.
   - Use `_emit` to print actual events (e.g., "Sending request to {model}...").

2. **Add verdict/intent line** (Immediate feedback).
   - Add a single line at the top of the result block:
     ```
     [SES-001][DI-01] ✓ DISTILLER DONE in 19.5s → VERDICT: PASS | INTENT: "build a CLI tool"
     ```

3. **Color-code errors** (Visual clarity).
   - Use red for `QUARANTINE`/`FAILED`, yellow for `SKIPPED`.

4. **Add noise counts** (Transparency).
   - Report how many segments were dropped as noise.

---

## **Next Steps**

Would you like me to:
1. **Draft the exact code changes** for any of these improvements?
2. **Focus on one area** (e.g., just the live progress or just the distiller summary)?
3. **Create a mockup** for another stage (e.g., introbeaver, planbeaver)?
4. **Implement a subset** of these changes (e.g., only the real milestones + verdict line)?

---

## **Appendix: Current Code References**

### **Key Functions in `progress.py`**
- `StageTimer.__init__`: Initializes the timer for a stage.
- `StageTimer.start`: Starts the live timer and (for Distiller) the paced steps.
- `StageTimer._distiller_steps`: Prints the 11 fake steps at paced intervals.
- `StageTimer.finish`: Prints the final result block.
- `telemetry_header`: Prints the stage start block.
- `telemetry_result`: Prints the stage end block.
- `distiller_summary`: Prints the Distiller-specific summary.

### **Key Functions in `engine.py`**
- `Engine._run_chatset_stage`: Orchestrates the stage execution.
- `Engine._emit`: Callback to print live events (used for milestones).

### **ANSI Color Codes (in `progress.py`)**
```python
_C_RESET = "\033[0m"
_C_BOLD = "\033[1m"
_C_DIM = "\033[2m"
_C_CYAN = "\033[36m"
_C_GREEN = "\033[32m"
_C_YELLOW = "\033[33m"
_C_RED = "\033[31m"
```
