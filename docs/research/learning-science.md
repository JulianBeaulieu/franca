# Learning Science: Spaced Repetition & Vocabulary Acquisition

Research notes for a single-user, Duolingo-style web app teaching Lebanese Arabic vocabulary
(Next.js + Postgres). Data: 2,412 vocab words, 1,181 sentences, 565 verbs (8-person
conjugations). This document specifies **exactly** what to build. Read sections 1, 2, and 6
first — they are the implementable core. Sections 3–5 are design rationale.

> Hard product requirement honored throughout: **items answered wrong must be re-tested
> relatively soon within the same lesson** (see §2), *and* must be short-circuited in the
> cross-day scheduler (see §1).

---

## 0. TL;DR recommendations

- **Cross-session scheduler:** SM-2, modified ("SM-2-Lite"). ~150 LOC of pure TS, unit-testable.
  FSRS is better but needs a fitted 17–21-parameter model and 1k+ reviews before it beats
  SM-2 defaults; not worth it for a single user on day one. Keep the schema FSRS-compatible so
  you can swap later. (§1)
- **In-lesson miss handling:** re-queue a missed item **+3 positions** later, and require it to
  be answered correctly **twice** (not necessarily consecutively) before it clears the lesson;
  a second miss re-queues it again and adds an end-of-lesson repeat. (§2)
- **Lesson composition:** 12–15 exercises, **~75% review / ~25% new**, max **6 new words** per
  lesson, interleave vocab/sentence/conjugation, difficulty ramps recognition → recall →
  production **within the lesson for each new word**. (§3, §4)
- **Introduction order:** frequency-rank ascending, chunked into ~thematic units. (§4)

---

## 1. Spaced-repetition algorithms

### 1.1 Leitner boxes (baseline, rejected)
N boxes; a card in box *i* is reviewed every `interval[i]` days (e.g. 1, 2, 4, 8, 16…).
Correct → promote to box *i+1*; wrong → demote to box 1. Dead simple, but intervals are
discrete/global and ignore per-item ease. Duolingo's first version used Leitner; their HLR
paper reports HLR roughly **halved** the recall-prediction error vs. Leitner. Use as a mental
model only.

### 1.2 SM-2 (SuperMemo 2, Woźniak 1987) — full algorithm
State per item: `reps` (n, consecutive correct), `EF` (ease factor, ≥1.3), `interval` (days).
Grade each review `q ∈ {0..5}` (5 perfect … 0 blackout).

**Ease-factor update (the EF formula):**
```
EF' = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))
if EF' < 1.3 then EF' = 1.3          # hard floor; below 1.3 cards resurface uselessly often
```
Worked deltas: q=5 → +0.10; q=4 → +0.00; q=3 → −0.14; q=2 → −0.32; q=1 → −0.54; q=0 → −0.80.

**Interval update:**
```
if q < 3:                 # FAIL → reset the schedule
    reps = 0
    interval = 1          # (EF is left unchanged in classic SM-2)
else:                     # PASS
    if reps == 0: interval = 1
    elif reps == 1: interval = 6
    else: interval = round(interval_prev × EF')
    reps = reps + 1
due_date = today + interval
```
Recurrence: `I(1)=1, I(2)=6, I(n)=round(I(n−1)·EF)`. With EF=2.5 the sequence is
1, 6, 15, 37, 94 days. Note SM-2's known wart: a single lapse throws away the whole interval
history (back to 1 day), which is punishing — we soften this below.

### 1.3 FSRS (Free Spaced Repetition Scheduler) — the modern SOTA
DSR memory model — **D**ifficulty, **S**tability, **R**etrievability — fit by ML to 700M+ real
Anki reviews (Jarrett Ye; Anki default since v23.10, Nov 2023).

- **Retrievability** R(t,S): probability you recall *right now*, a power forgetting curve.
  FSRS-4.5/6: `R(t,S) = (1 + FACTOR · t/S)^DECAY` with `DECAY = −0.5`,
  `FACTOR = 0.9^(1/DECAY) − 1 = 19/81`. So at `t = S`, R = 0.9 by construction.
- **Stability** S: interval (days) at which R falls to 0.90. Grows on each successful review as
  a function of current S, D, R and the grade.
- **Difficulty** D ∈ [1,10]: intrinsic hardness, nudged per grade toward an equilibrium.
- **Scheduling:** pick next interval so R hits a target retention `RT` (default 0.9):
  `I = (S / FACTOR) · (RT^(1/DECAY) − 1)`.

**Why FSRS beats SM-2:** it predicts recall probability instead of applying a hand-tuned
heuristic; benchmarks show ~20–30% fewer reviews for the same retention, and even *unfitted*
defaults out-predict SM-2 for ~99% of users. It also degrades gracefully on lapses (stability
drops, not to zero). Cost: ~19 trainable weights, more math, and it wants review history to
personalize.

### 1.4 Duolingo HLR ("half-life regression") + Birdbrain
HLR (Settles & Meeder, ACL 2016) models a word's memory **half-life** `h = 2^(θ·x)` where `x`
is a feature vector (times seen, times correct/incorrect, lexeme id…) and θ are learned
weights. Predicted recall: `p = 2^(−Δ/h)` with Δ = days since last practice. Trained by
regressing observed recall against `2^(−Δ/h)`. **Birdbrain** is the separate model deciding
*what* to show (difficulty targeting per learner). Great at Duolingo's scale (billions of
reviews); overkill for one learner with no training corpus.

### 1.5 Recommendation: **SM-2-Lite** (pick this)

Rationale for a **single user, cold start, ~200 LOC budget**: FSRS/HLR need data you won't have
for weeks and add real complexity; SM-2 is pure, deterministic, trivially unit-testable, and
"good enough" — with two well-known tweaks it removes SM-2's worst behavior. Keep columns that
make a later FSRS migration painless.

**State variables per item (one row per `(item_id, direction)`):**
| field | type | meaning |
|-------|------|---------|
| `reps` | int | consecutive successful reviews (SM-2 n) |
| `ease` | float | ease factor, start 2.5, floor 1.3 |
| `interval` | float | current interval in days |
| `due_at` | date | next review date |
| `lapses` | int | lifetime count of failures (leech detection) |
| `last_grade` | int | last q, for analytics/debug |
| `last_reviewed_at` | timestamp | for elapsed-time / future FSRS |
| `state` | enum | `new` \| `learning` \| `review` \| `relearning` |

**Grade mapping** (we don't ask users to self-rate 0–5; derive q from behavior):
```
correct, first try, fast      → q = 5
correct, first try            → q = 4
correct, but slow / after hint→ q = 3
wrong once then corrected     → q = 2      (still counts as a lapse for interval purposes)
wrong (cleared later)         → q = 1
```
Anything `q < 3` = FAIL.

**Tweak 1 — soft lapse (fixes SM-2's "reset to 1 day").** On fail, don't zero the interval;
enter `relearning` and shrink instead of obliterate:
```
on FAIL (q < 3):
    lapses     += 1
    ease        = max(1.3, ease − 0.20)          # penalize ease, gently
    reps        = 0
    interval    = max(1, round(interval × 0.30))  # keep some memory of prior strength
    state       = relearning
    due_at      = today + interval
```

**Tweak 2 — first-two intervals + fuzz.** Keep SM-2's 1-day / 6-day graduation, but apply
±15% "fuzz" to `interval` so many items introduced the same day don't clump on the same future
day:
```
on PASS (q >= 3):
    ease     = clamp(ease + (0.1 − (5−q)×(0.08 + (5−q)×0.02)), 1.3, 2.7)
    if reps == 0: interval = 1
    elif reps == 1: interval = 6
    else:          interval = round(interval × ease)
    interval = round(interval × uniform(0.85, 1.15))   # fuzz
    reps    += 1
    state    = review
    due_at   = today + interval
```
(Optional ease ceiling 2.7 keeps intervals from ballooning early; drop it if you prefer vanilla.)

**Leech rule:** when `lapses >= 8`, flag the item (`state='leech'` or a boolean) — surface it
for a manual "reset / suspend" decision or auto-lower its target. Prevents a hard word from
eating every lesson forever.

This is ~120–180 LOC of pure functions: `gradeFromResult(result) → q`, `scheduleReview(state,
q, today, rng) → newState`. All deterministic given an injected `rng` seed → 100% unit-testable.

---

## 2. Within-session repetition of misses (the hard requirement)

**Research basis.** Retrieval practice (the testing effect) beats re-study, and the benefit
*grows* with successful retrievals — two studies here: retrieval consistently beat re-study on
2-day delayed tests regardless of word difficulty, and the effect increased with more learning
rounds. On timing *within* a session: immediate re-test helps short-term but **spaced/expanding
re-test within the session wins on delayed tests** — massed re-test looks great on an immediate
check and worse two days later. Practical implication: re-test a miss **soon but not
immediately** (a few items later), then again near the end — an expanding schedule inside the
lesson. This is exactly Anki's learning-steps model (default 1min → 10min; "Again" bounces the
card back through the steps) and Duolingo's in-session re-queue.

**Concrete in-lesson algorithm ("re-queue + 2-to-clear").** The lesson is a mutable queue of
*exercise instances*. Each targeted item carries an in-lesson counter.

```
Per item in the lesson, track:
    needed   = 1          # correct answers still required to clear the lesson
    seen     = 0
Constants:
    REQUEUE_GAP      = 3      # positions to skip ahead when re-queuing a miss (tune 2–4)
    CLEAR_AFTER_MISS = 2      # a missed item must be answered correctly this many times
    MAX_REQUEUES     = 3      # safety cap so one item can't trap the learner

On answering an exercise for item X:
    seen += 1
    if CORRECT:
        needed -= 1
        if needed <= 0:  X is cleared (drops out of the lesson queue)
    else:  # MISS
        record a lapse for SRS (see §6 writeback)
        needed = CLEAR_AFTER_MISS            # now must get it right twice more
        if requeues(X) < MAX_REQUEUES:
            insert a fresh exercise for X at (current_index + REQUEUE_GAP)
            requeues(X) += 1
        # AND guarantee an end-of-lesson retest:
        ensure one exercise for X exists in the final 20% of the queue
```

Rules restated crisply:
1. **First exposure correct** → item needs no further reps this lesson (`needed` reaches 0).
2. **Miss** → item must now be answered correctly **twice** to clear (`CLEAR_AFTER_MISS = 2`),
   satisfying "really teach them."
3. The first retest lands **+3 positions later** (close, but 2–3 other items intervene → the
   desirable-difficulty gap, not a giveaway).
4. A **second** miss re-queues again (up to 3×) and forces an **end-of-lesson** occurrence.
5. `MAX_REQUEUES` guarantees termination; if hit, the item still leaves the lesson but is marked
   for a shorter SRS `due_at` (surfaces again tomorrow) rather than trapping the session.
6. On the retest, **escalate difficulty** (recognition → recall → production; see §3) if the
   item has a higher-tier exercise available — a harder retrieval is a more durable one.

Termination guarantee: the queue length is bounded by
`initial + Σ requeues ≤ initial + MAX_REQUEUES × distinct_items`, and every insert moves the
retest strictly forward, so the loop always drains.

---

## 3. Lesson composition

**New vs. review mix.** Retention research and SRS practice converge on **~70–80% review,
20–30% new**. New material is expensive in working memory; reviews are where durable memory is
actually built. Use **75/25**. If the review backlog (due items) exceeds capacity, drop new to
0% that day and pure-review until caught up — never let the backlog rot.

**Lesson length.** 12–15 exercise *slots* is the sweet spot (Duolingo lessons run ~12–20;
cognitive-load research says keep new-item load small). Re-queued misses (§2) can push the
*actual* count higher — cap the hard ceiling at ~22 exercises so a bad day still ends.

**How many new words.** Working-memory limits: **max 6 new words per lesson** (direct-instruction
research lands at ~8–10 new words *per week* for deep learning; 5–7 per session is the common
SRS ceiling). Default **5**, absolute max **6**. Verbs (with 8-person tables) count as heavier —
treat one new verb as ~2 new-word slots.

**Interleaving.** Mix item *types* (vocab word / sentence / conjugation) and topics rather than
blocking. Interleaving raises retrieval difficulty and discrimination and improves delayed
retention. Concretely: don't put all 5 new vocab words back-to-back; alternate new-word intros
with reviews and sentence items so each new word gets a spacing gap before its first retest.

**Difficulty progression (recognition → recall → production).** MC recognition *overestimates*
real knowledge (~20% inflation vs. gap-fill); productive tasks build stronger memory. So ramp
each new word through tiers across its exposures:
1. **Recognition** — multiple-choice (see arabizi → pick English, or audio → pick word).
2. **Cued recall** — word-bank / tile assembly (arrange tiles to form the answer).
3. **Production** — free-typed answer (type the arabizi / type the translation).

First *exposure* of a brand-new word = tier 1. Its in-lesson retests and its future-day reviews
climb the ladder. A word in `review` state with high ease should be tested at tier 2–3;
low-ease/relearning items drop back a tier to rebuild confidence.

---

## 4. Word-introduction ordering

- **Frequency first.** Introduce words in ascending frequency rank (most common first) — highest
  utility per word learned and best coverage of real Lebanese Arabic. If the vocab dataset lacks
  a frequency column, derive a proxy rank from occurrence counts across the 1,181 sentences (a
  word appearing in many sentences is both frequent *and* immediately reusable in sentence
  exercises — a bonus for interleaving).
- **Chunk into thematic / CEFR-like units.** Group the frequency-ordered list into small units
  (~30–50 words) by theme (greetings, food, family, numbers, verbs of daily life…). Thematic
  clustering aids some learners but *excessive* semantic clustering of near-synonyms in one
  session causes interference — keep clusters loose, and don't teach 5 near-synonyms together.
- **New words per lesson:** 5 default, 6 max (§3). At 5/day the 2,412-word corpus is ~1.3 years
  of daily lessons before running out of *new* material — plenty of runway; reviews fill the rest.
- **Gate new words on review load:** only introduce new words when today's due-review count is
  below the lesson's review budget (see §6). This auto-throttles intake during heavy weeks.

---

## 5. Retrieval practice, the testing effect & desirable difficulties (rationale)

- **Testing effect:** actively retrieving an answer produces more durable memory than re-reading.
  Every exercise should demand a *produced* answer, never passive "tap to reveal."
- **Desirable difficulties (Bjork):** learning that requires effort — spacing, interleaving,
  production over recognition, letting memory partially decay before review — feels harder and
  yields *worse* immediate performance but *better* long-term retention. This justifies: the +3
  re-queue gap (not immediate), the recognition→production ramp, interleaving, and SM-2's
  expanding intervals. Don't optimize for a smooth in-lesson feeling; optimize for the 2-day and
  2-week delayed retest.
- **Spacing effect:** distributing exposures across days beats massing them — the entire premise
  of the §1 scheduler. Within a session, an *expanding* micro-schedule (retest soon, then later)
  beats massed repetition on delayed tests.

---

## 6. Next-lesson generator — implementable spec

Given Postgres SRS state, assemble today's lesson. Pseudocode is close to TS; treat `db` as a
repository layer.

### 6.1 Schema (essentials)
```sql
-- one row per (item, direction). item_type ∈ ('vocab','sentence','conjugation')
CREATE TABLE srs_state (
  id               bigserial PRIMARY KEY,
  item_id          bigint NOT NULL,
  item_type        text   NOT NULL,
  direction        text   NOT NULL,        -- 'recognition' | 'production' | 'l1_to_l2' ...
  reps             int     NOT NULL DEFAULT 0,
  ease             real    NOT NULL DEFAULT 2.5,
  interval         real    NOT NULL DEFAULT 0,
  due_at           date,                    -- NULL = never introduced (new)
  lapses           int     NOT NULL DEFAULT 0,
  last_grade       int,
  last_reviewed_at timestamptz,
  state            text    NOT NULL DEFAULT 'new',
  UNIQUE (item_id, item_type, direction)
);
CREATE INDEX ON srs_state (due_at) WHERE state <> 'new';
```

### 6.2 Config
```
LESSON_SLOTS       = 14
NEW_RATIO          = 0.25          # target share of new
MAX_NEW            = 6
DEFAULT_NEW        = 5
REVIEW_BUDGET      = ceil(LESSON_SLOTS * (1 - NEW_RATIO))   # = 11
```

### 6.3 Assemble the lesson
```
function generateLesson(today):
    # --- 1. Due reviews first (most overdue → most at-risk of being forgotten) ---
    due = db.query(
        "SELECT * FROM srs_state
         WHERE state <> 'new' AND due_at <= :today
         ORDER BY due_at ASC, ease ASC")        # oldest & hardest first
    reviews = due[0 : REVIEW_BUDGET]

    # --- 2. Decide how many new words to add ---
    review_shortfall = REVIEW_BUDGET - len(reviews)
    if len(due) > REVIEW_BUDGET:
        new_count = 0                            # backlog: pure review day
    else:
        new_count = min(DEFAULT_NEW, MAX_NEW, LESSON_SLOTS - len(reviews))

    # --- 3. Pick new items by frequency order, skip already-introduced ---
    new_items = db.query(
        "SELECT * FROM items
         WHERE id NOT IN (SELECT item_id FROM srs_state)
         ORDER BY frequency_rank ASC
         LIMIT :new_count")

    # --- 4. Build exercise instances with tiered difficulty ---
    exercises = []
    for it in new_items:
        exercises.append(makeExercise(it, tier = RECOGNITION))   # new word: easiest tier
    for r in reviews:
        tier = tierForState(r)                                   # see below
        exercises.append(makeExercise(r, tier))

    # --- 5. Interleave: avoid adjacency of same item_type / same new word ---
    queue = interleave(exercises)     # round-robin by item_type, spread new words apart

    # --- 6. Run the lesson with the §2 re-queue engine ---
    return new LessonRunner(queue)    # holds needed/seen/requeues per item

function tierForState(r):
    if r.state in ('relearning','learning'): return RECOGNITION   # rebuild
    if r.ease < 2.0 or r.reps < 2:           return CUED_RECALL
    return PRODUCTION                                             # strong item → hardest
```

### 6.4 Writeback (called by LessonRunner on every answer)
Two-level writeback: **in-lesson** counters (§2, transient) and **SRS** state (§1, persisted).
Persist SRS on the item's *first* graded answer of the lesson so a mid-lesson quit still records
progress; refine `due_at` at lesson end from the item's best in-lesson grade.

```
function onAnswer(item, result, today, rng):
    q = gradeFromResult(result)          # §1 grade mapping
    # (a) in-lesson engine (§2)
    lessonRunner.applyResult(item, result)   # updates needed/seen, re-queues on miss
    # (b) SRS scheduler (§1) — persist once per item per lesson
    st = db.getState(item)               # create row if state='new'
    if not item.gradedThisLesson:
        st = scheduleReview(st, q, today, rng)   # pure fn: PASS/FAIL branches from §1.5
        item.gradedThisLesson = true
    else:
        # subsequent in-lesson answers only *downgrade* on a miss (lapse), never upgrade
        if q < 3: st = applyLapse(st, today)
    db.saveState(st)

# New item introduced this lesson: on its first PASS it transitions new → learning/review
# via scheduleReview (reps 0 → interval 1 → due tomorrow). A brand-new word missed on first
# exposure stays low-interval (due tomorrow) so it recurs fast across days too.
```

### 6.5 End-of-lesson reconciliation
```
function finalizeLesson(runner, today):
    for item in runner.itemsSeen:
        # if an item was missed then cleared with 2 correct, its persisted state already
        # reflects the lapse; optionally bump due_at in by 1 day for items that needed
        # multiple in-lesson attempts (they're shaky):
        if runner.requeues(item) > 0:
            st = db.getState(item)
            st.due_at = min(st.due_at, today + 1)   # re-test tomorrow, don't wait the full interval
            db.saveState(st)
    db.logSession(runner.stats)   # accuracy, counts → future FSRS training corpus
```

### 6.6 Properties this guarantees
- **Product requirement:** any miss is retested **+3 positions later** *and* again at lesson end,
  needs **2 corrects** to clear (§2), *and* its cross-day `due_at` is pulled in to **tomorrow**
  (§6.5) — repeated both within the lesson and closely across days.
- **Review-first, throttled intake:** due reviews always fill the budget before any new word;
  new intake auto-drops to 0 under backlog (§6.3 step 2).
- **Deterministic + testable:** `scheduleReview`, `gradeFromResult`, `tierForState`,
  `interleave` are pure; inject `rng` for the fuzz so tests are reproducible.
- **FSRS-ready:** `last_reviewed_at`, `lapses`, `last_grade`, and `logSession` capture the review
  history needed to fit FSRS later without a schema migration.

---

## Sources
- SM-2 algorithm & EF formula — [dev.to explainer](https://dev.to/umangsinha12/how-spaced-repetition-actually-works-the-sm-2-algorithm-1ge3), [Anki FAQ](https://faqs.ankiweb.net/what-spaced-repetition-algorithm), [Implementing SM-2 in Rust](https://borretti.me/article/implementing-sm2-in-rust)
- FSRS / DSR model — [awesome-fsrs wiki: The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm), [FSRS scheduler repo](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler), [Expertium: technical explanation](https://expertium.github.io/Algorithm.html), [Implementing FSRS in 100 Lines](https://borretti.me/article/implementing-fsrs-in-100-lines), [FSRS vs SM-2 (Memstride)](https://memstride.com/blog/fsrs-vs-sm2-algorithm-comparison/)
- Duolingo HLR / Birdbrain — [Settles & Meeder, ACL 2016 (PDF)](https://research.duolingo.com/papers/settles.acl16.pdf), [halflife-regression repo](https://github.com/duolingo/halflife-regression)
- Retrieval practice, spacing, delayed testing — [Retrieval & spaced practice (Glasgow TILE)](https://tile.psy.gla.ac.uk/2021/02/11/transforming-the-learning-journey-with-retrieval-and-spaced-practice/), [Retrieval interval & vocabulary difficulty (Current Psychology)](https://link.springer.com/article/10.1007/s12144-026-09632-2), [Retrieval practice & word learning (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11087082/)
- Anki learning/relearning steps & leeches — [What Anki learning steps to use](https://eshapard.github.io/anki/what-anki-learning-steps-to-use.html), [Best Anki settings](https://leananki.com/best-settings/)
- Desirable difficulties (Bjork) — [Wikipedia: Desirable difficulty](https://en.wikipedia.org/wiki/Desirable_difficulty)
- New-words-per-lesson & load limits — [How many words per lesson (English Nook)](https://the-english-nook.com/2026/02/03/how-many-words-should-you-learn-per-language-lesson/), [IRIS Vanderbilt: Vocabulary](https://iris.peabody.vanderbilt.edu/module/rti03/cresource/q3/p07/), [The Language Gym](https://gianfrancoconti.com/2017/01/08/how-many-new-words-should-you-teach-per-lesson-the-wrong-question/)
- Recognition → recall → production progression — [High-Frequency Vocabulary: Recognition to Recall (SAGE)](https://journals.sagepub.com/doi/10.1177/21582440241242604), [Semantic clustering & incidental vocab (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9556891/)
