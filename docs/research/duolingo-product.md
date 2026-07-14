# Duolingo Product & UX Research — Source Spec for a Lebanese Arabic Vocab Clone

Compiled 2026-07-13. This document is source material for implementers who have never used Duolingo. It describes, as precisely as possible, how the real Duolingo app looks and behaves, so the team can decide what to replicate, adapt, or intentionally simplify for a single-user Next.js "Duolingo-style" web app teaching Lebanese Arabic vocabulary. Notes marked **[Adapt]** call out where our app should deliberately diverge (no owl mascot, no audio, single-user instead of social/leagues, etc.).

---

## 0. Product summary

Duolingo is a gamified language-learning app. The two dominant screens are:

1. **Home / Learning Path** — a vertical, winding path of circular "nodes," grouped into **Units**, that the learner scrolls through and taps into.
2. **Lesson Session** — a full-screen, one-exercise-at-a-time quiz flow with a top progress bar, hearts (lives), immediate right/wrong feedback, and an end-of-lesson results screen awarding XP.

Everything else (streaks, leagues, gems, quests, achievements, profile) is gamification wrapped around that loop to drive daily return visits.

---

## 1. Learning path / home screen

### 1.1 Overall layout

- The path is a **single scrollable column**, vertically centered, with nodes connected by a **thick dashed/solid line that curves left-right-left ("S-curve" / winding river)** as it descends — it is not a straight vertical line. Roughly every 2–4 nodes the path bends to the opposite side of the screen, alternating left-of-center and right-of-center anchor points, which visually breaks up monotony and creates the sense of a "journey" or trail.
- The background behind the path is a solid, muted flat color **per unit** (each unit has its own theme color — e.g. a unit might sit on a light blue field, the next on a light green field, next on light purple) that changes with a gradient/hard transition as you scroll from one unit into the next. This is how learners perceive "unit boundaries" spatially, in addition to the header banner (below).
- The path is populated with small decorative **character illustrations** (Duolingo's mascot cast) standing next to nodes, plus scenery props (chests, signposts, banners) that have no functional purpose — pure texture/delight.
- A **floating circular "jump to current lesson" button** (a downward or upward arrow chevron in a white pill/circle) appears when the user scrolls away from their current active node, letting them snap back to it in one tap.
- Top of the home screen (persistent header bar, not part of the scroll): from left to right — **streak flame counter** (with current streak number), **gem counter**, **heart counter** (with a "+" affordance to refill), and on some layouts a flag icon indicating the course being studied. This header stays fixed while the path scrolls beneath it.

### 1.2 Units and sections

- A full course is divided into **Sections** (broad thematic arcs, e.g. "Section 1: Basics"), and each Section contains multiple **Units** (e.g. "Unit 3: Order food," "Unit 4: Talk about family"). Each Unit is further divided into **Levels**, and each Level is one or more **Lessons**.
- **Unit header ("banner")**: a full-width rounded rectangle card that sits at the top of each unit's block of nodes as you scroll to it. It shows:
  - The unit's ordinal + title in bold rounded type (e.g. "Unit 4" / "Order food").
  - A short one-line description of what you'll learn.
  - A **book/"Guidebook" icon button** in the top-right corner of the banner — tapping it opens a modal/page with grammar tips, vocabulary notes, and example sentences for that unit before you start it (this is the old "tips" content, now attached per-unit instead of per-skill).
  - The banner is colored with a solid saturated brand color that matches that unit's theme (rotates through the palette: green, blue, purple, red, orange, etc.), with white text.

### 1.3 Node types and states

Nodes are circles (~64–80px diameter on mobile, larger on desktop/web, roughly 88–96px) laid out along the path. Each node type has a distinct icon:

| Node type | Icon | Behavior |
|---|---|---|
| **Standard lesson** | A star or dumbbell-like glyph | Opens a normal lesson session |
| **Personalized practice** | A circular arrows/refresh glyph | Adaptive review pulling from previously-missed or weak vocabulary |
| **Story** | An open-book icon | Opens an interactive reading/listening mini-story (skippable in our clone — no audio) |
| **Checkpoint / Unit review test** | A shield or trophy icon, usually larger than normal nodes | A longer, harder test gating progress to the next unit |
| **Legendary challenge** | A distinct gold/purple star with a small crown | Unlocked only after a unit's normal path is 100% gold; replaying it awards bonus XP and turns the unit's crown gold/legendary colored |
| **Chest / reward node** | A treasure chest icon | Passive reward pickup (gems, occasionally a streak freeze) that doesn't require an exercise |

Node **states** (visual treatment):

- **Locked**: rendered in flat gray (approx `#E5E5E5` fill, `#AFAFAF`/`#CCCCCC` icon), non-interactive or shows a lock glyph overlay; tapping it (if allowed) shows a small "complete the previous lesson to unlock" tooltip.
- **Active / current**: the single node the learner should do next. Rendered in the unit's bright theme color (e.g. feather green `#58CC02`), often with a pulsing "START" pill/button hovering just above or below it, and sometimes a subtle bounce/idle animation to draw the eye.
- **Completed**: rendered filled gold/yellow (`#FFC800` bee yellow, or a golden-star fill) once finished — colloquially "getting gold" on a level. A checkmark or filled star sits inside.
- **Legendary / Gilded**: after doing the optional harder legendary run, the node (or whole unit's crown/banner) turns a distinct gold-with-shine treatment, sometimes with a small crown icon, signaling mastery beyond "gold."
- **In-progress (partial crowns / levels within a node)**: older versions showed small dots/segments around the node ring indicating how many of N levels within that node are done; the modern redesign generally uses one circle = one lesson, so this is simplified to filled vs. unfilled.

### 1.4 Scrolling behavior

- Standard vertical scroll (touch drag / trackpad / scrollbar), inertial on mobile.
- The path auto-opens roughly centered on the learner's current active node on first load.
- Scrolling past a unit boundary triggers a **background color crossfade** to the next unit's theme.
- The **jump-to-current** floating button appears/disappears based on scroll distance from the active node (appears once you've scrolled it out of the viewport).

**[Adapt]** For a single-learner Lebanese Arabic clone: keep the winding vertical path, unit banners with guidebook icon, and the locked/active/completed/legendary node states — this is the core "shape" of Duolingo and is highly reproducible in CSS/SVG (an SVG or CSS `clip-path`/transform zig-zag line with absolutely-positioned circular nodes along calculated x/y coordinates). Skip stories/speaking nodes or reuse the icon slot for "listening (skipped)" placeholders if desired.

---

## 2. Lesson session UX

### 2.1 Session chrome (persistent across every exercise screen)

Fixed header row at the top of the full-screen lesson modal, left to right:

1. **Close (X) button** — top-left; tapping it opens a confirmation ("Are you sure you want to end this session? Your progress will be saved" or similar) then exits to the home path, keeping progress made so far in some modes, or discarding the in-progress lesson in others (behavior differs by lesson type; for our clone, simplest to just save whatever was answered correctly so far and drop the learner back on the path).
2. **Progress bar** — a thick, pill-shaped, rounded-full horizontal bar (gray track, ~12–16px tall) filling the remaining width of the header. It fills **left-to-right in feather green** (`#58CC02`) as exercises are completed; each correct completion advances the fill by one segment/fraction (1 / total exercises). Some versions render small tick/notch divisions in the bar so the learner can see discrete steps rather than a smooth continuous fill.
3. **Heart counter** — top-right; a small red heart icon (`#FF4B4B` cardinal) + remaining count (e.g. "❤️ 4"), or infinite/plus-icon for subscribers. Decrements by one with a small "shake/lose" animation on a wrong answer.

### 2.2 One exercise per screen

- Only one exercise is visible at a time, centered in the viewport, with generous whitespace/padding (mobile-first single column, max content width ~600–700px even on desktop, centered).
- Each exercise screen has this vertical structure: **prompt/instruction line** (small, e.g. "Translate this sentence" / "Select the correct translation" / "Tap what you hear" in eel-gray `#4B4B4B` uppercase-ish or medium-weight text) → **main content area** (sentence, audio button, image, or word bank depending on type) → **answer input area** (word bank tiles, text field, or multiple-choice option cards) → a fixed **bottom action bar** containing the primary button.
- The **bottom action bar** is a fixed/sticky footer, white background separated from the exercise content by a thin `#E5E5E5` top border, containing the right-aligned primary button: **"CHECK"** while unanswered (button disabled/grayed until the learner has provided some answer, then turns solid feather green and becomes tappable), and **"SKIP"** as a lower-emphasis text-link alternative in some cases.

### 2.3 Immediate feedback banner

After tapping **Check**, the bottom action bar area **expands upward into a colored banner** that slides up from the bottom (~150–250ms ease-out), covering roughly the bottom quarter to third of the screen:

- **Correct answer:**
  - Banner background: light-to-solid green, feather green `#58CC02` (or a light green tint like `#D7FFB8` as backdrop with a green accent bar).
  - Bold headline text: **"Nice!"** / **"Great!"** / **"Correct!"** / **"Excellent!"** (Duolingo rotates a small pool of positive exclamations).
  - A small XP gain sometimes flashes (e.g. "+1 XP" chip) especially on combo milestones.
  - Primary button label changes to **"CONTINUE"**, still bottom-right, now colored white-on-green or a darker green, matching the banner.
  - A subtle sound/animation (owl bounce in real Duolingo — **[Adapt]**: substitute our mascot's idle-happy animation) plays; not applicable if we skip audio, but the visual bounce/confetti-sparkle on the banner should remain.
- **Incorrect answer:**
  - Banner background: cardinal red `#FF4B4B` (solid) or a light red/pink tint (`#FFDFE0`) with red accent.
  - Bold headline text: **"Incorrect"** / **"Oops!"** / **"Correct solution:"**.
  - Directly below the headline, the banner shows the **correct answer** explicitly, e.g. "Correct solution: [correct sentence/word]" — this is critical: the learner always sees the right answer immediately, never just "wrong, try again."
  - A **heart is deducted** (heart icon in the top-right counter animates a small shake/pop and the count decrements) at the same moment the banner appears.
  - Primary button also changes to **"CONTINUE"**.
  - Optionally a secondary small button/link like "Explain my answer" (AI feature in modern Duolingo — **[Adapt]**: omit, not needed for a vocab clone) appears next to Continue.
- Tapping **Continue** slides the banner back down / the whole screen transitions (slide-left / crossfade, ~200–300ms) to the next exercise, and the top progress bar animates its fill increasing.

### 2.4 Combo / in-lesson streak bonus

- Consecutive correct answers within a single lesson build a **combo counter**. Hitting certain thresholds (commonly every 5th correct answer in a row, i.e. 5, 10, 15…) triggers a small on-screen flourish (e.g. a "🔥 5 in a row!" toast or animated flame/spark burst near the top of the screen) to reinforce momentum.
- The combo streak does **not** reduce hearts lost or otherwise change scoring per-exercise; instead the **maximum combo reached during the lesson** determines a flat **Combo Bonus** of XP added once at the end of the lesson (historically ranging roughly +1 to +5 XP, scaling with how high the streak got — a full-length lesson with zero mistakes yields the max bonus).
- A single wrong answer resets the in-lesson combo counter back to 0 (it does not end the lesson, just resets the streak count used for the bonus).

### 2.5 End-of-lesson celebration screen

Once every exercise (including all re-queued missed ones — see §5) has been answered correctly, the session ends on a **results screen**:

- Full-screen, festive: confetti animation, a large happy mascot illustration, and a headline like **"Lesson Complete!"** or **"Unit review complete!"**.
- A stat breakdown card lists, typically in a 3–4 column row of stat chips:
  - **Total XP earned** (big number, e.g. "+15 XP"), broken down into contributing lines such as "Base XP," "Combo Bonus," "Perfect Lesson Bonus" (if zero mistakes were made), and any active XP-boost multiplier.
  - **Accuracy** percentage for the session.
  - **Current streak** (flame + day count), often with a small animation if this lesson extended the streak for the day.
  - Occasionally a "New personal best" or achievement unlock toast if a record was broken.
- A single full-width primary button at the bottom, **"CONTINUE"**, returns the learner to the home path, where the just-completed node now renders in its gold "completed" state and the path auto-scrolls/highlights the next node as the new "active" one.
- If the lesson was completed with **zero mistakes** ("Perfect Lesson"), an extra gold ribbon/badge and bonus XP line is shown; this is a good, easy-to-implement gamification hook for our clone.

---

## 3. Exercise types (vocab/sentence-relevant subset)

Below are the exercise types worth implementing for a text-only Lebanese Arabic vocab clone (audio-dependent ones are noted but explicitly deprioritized).

### 3.1 Multiple choice — "Select the correct translation"

- Prompt: a single word or short phrase in the source language (could be Arabic or English depending on direction) shown large at the top, sometimes with a small image/emoji illustrating it.
- Below, **3–4 vertically stacked answer option cards**, each a full-width rounded rectangle button (white background, `1–2px` light-gray border `#E5E5E5`, ~12–16px border radius) containing one candidate translation.
- Tapping an option: the card's border/background highlights (light blue `#DDF4FF` background with macaw-blue `#1CB0F6` border) to show it's selected, but does **not** auto-submit — the learner still must press Check. (Some Duolingo variants auto-advance on tap for single-answer MC; either behavior is acceptable for our clone, but showing a selected state before Check is closer to the real product.)
- On Check: correct choice's card turns green-bordered/green-filled; if the learner picked wrong, their chosen card turns red and the correct card is simultaneously highlighted green so both are visible at once.

### 3.2 Word bank / tap-to-translate — "Translate this sentence" (assemble via word bank)

This is the signature Duolingo exercise and the most important one to get exactly right:

- Top: the source sentence to translate, shown as static text (plus a speaker/audio icon in real Duolingo — omit or gray-out/disable for our clone).
- Middle: an empty **"answer line"** — a horizontal row with a light-gray bottom-border/underline (or a bordered box) where the assembled translation will appear, initially empty (sometimes shows a placeholder blinking cursor or just blank space with a faint bottom rule).
- Bottom: the **word bank** — a wrapped grid/row of individual **word/phrase tiles** (rounded-rectangle chips/pills, white fill, light gray border, ~8–12px radius, comfortable tap padding ~12x8px), presented in **shuffled/randomized order**, containing the correct words plus (in harder modes) a few distractor tiles not needed for the correct answer.
- **Interaction sequence (exact):**
  1. Learner taps a tile in the word bank.
  2. That tile **animates/moves up from the bank into the next empty slot on the answer line** (a smooth transform/translate, ~150ms), in the order tapped.
  3. The tile is **removed from the bank** (it disappears from that grid — the remaining bank tiles reflow to fill the gap) and **appears in the answer line** at the end of the current sequence.
  4. Tapping a tile **already placed on the answer line** removes it from the answer line and **returns it to the word bank** (reappending it visually — typically back in its original bank position, though many implementations just append it back to the end of the bank; either is acceptable), sliding the remaining answer-line tiles left to close the gap.
  5. The learner repeats until all needed words are on the answer line in the correct order; extra distractor tiles may remain unused in the bank.
  6. The Check button activates once at least one tile has been placed (some versions require the bank to be emptied of all "needed" tiles, but the simplest faithful rule is: Check becomes tappable once ≥1 tile is on the answer line).
  7. On Check: if the sequence of words on the answer line matches an accepted correct ordering, it's correct; otherwise incorrect, and the feedback banner shows the correct full sentence.
- **Reverse direction** ("Type the word bank sentence into the other language") uses the identical tile mechanic; only source/target language swap.
- No drag-and-drop is required or expected — it is strictly **tap-to-move**, which is simpler to implement (no DnD library needed) and is exactly how Duolingo's mobile/web version behaves.

### 3.3 Type the translation (free-text input, both directions)

- Prompt: a sentence or word in the source language.
- A single **text input field** below (rounded rectangle, light border, placeholder like "Type in [Language]"), full width, with a blinking cursor and the on-screen/native keyboard.
- Learner types their answer freely (no tiles/word bank).
- On Check: exact-match (with light normalization — case-insensitive, forgiving of punctuation, extra whitespace, and commonly at least single-character typo tolerance/"almost correct" detection in real Duolingo) determines correct/incorrect.
- "Almost correct" is a real Duolingo behavior worth including: a minor typo yields a **yellow/orange "You have a typo" banner** distinct from full green or full red, still counted as correct but flagged. **[Adapt]** — nice-to-have, not essential for MVP; can be implemented with a simple edit-distance threshold (e.g. Levenshtein distance ≤ 1–2 relative to string length).
- Used for both directions: "type the Arabic" (harder — requires knowing the target script/transliteration) and "type the English meaning" (recall direction).

### 3.4 Matching pairs ("Tap the pairs" / "Match Madness")

- Layout: a **grid of tiles** (commonly a 2-column x N-row grid, or a scattered/shuffled grid) containing, in total, an even number of tiles — half showing source-language words/phrases, half showing their target-language translations, all randomly interspersed (not simply split left/right column by language necessarily, though a common layout is left column = one language, right column = other language, both independently shuffled vertically).
- For a 5-pair set: **10 tiles total** (5 words + 5 translations), each tile a rounded rectangular card with the word/phrase centered.
- **Interaction sequence:**
  1. Learner taps any tile (from either language) — it highlights (light blue border/background) to show it's "selected."
  2. Learner taps a second tile.
  3. If the two tiles are a correct pair: both tiles **animate out** (fade/scale down and disappear, or turn green briefly then vanish), and the remaining tiles reflow/collapse to fill the gap (or simply remain in place with empty/disabled slots — implementation choice; Duolingo's "Match Madness" reflows).
  4. If the two tiles are **not** a matching pair: both flash red momentarily / shake, then deselect and return to normal state — **no heart is lost and there's no hard penalty** for a wrong match in the standard (untimed) matching exercise; it simply requires trying again. (The timed "Match Madness" variant penalizes for speed/streak but is a separate bonus mode, not a core lesson exercise — can be skipped.)
  5. The exercise auto-completes (auto-advances, sometimes with no explicit Check button since correctness is validated per-pair in real time) once all pairs have been matched.
- This is one of the best exercise types for **pure vocabulary drilling** and should be a first-class exercise type in the clone, exactly matching the "5 pairs, tap to match" requirement.

### 3.5 Listening / speaking exercises (exist in real Duolingo, SKIPPED here — no audio data)

For completeness/documentation only:

- **"Tap what you hear"**: audio plays a word/sentence; learner assembles the transcription from a word bank (same tile mechanic as §3.2) purely from audio, no text prompt shown.
- **"Type what you hear"**: same audio prompt, but free-text input instead of tiles.
- **"Speak this sentence"**: text/audio prompt shown; learner speaks into the microphone; speech-recognition scores pronunciation.
- **[Adapt]**: Since our clone has no audio assets/TTS/ASR, these exercise types should either be entirely omitted from the exercise pool, or reused as text-only variants (e.g. treat "listening" node icon slot as just another word-bank/multiple-choice exercise) with a code comment noting they are stand-ins. Do not attempt speech recognition.

---

## 4. Gamification systems

### 4.1 XP (experience points)

- A standard lesson completion awards a **base XP** amount (historically 10–20 XP depending on lesson length/type; simplest is a flat value like **10 XP per lesson**, or scale by number of exercises, e.g. 1 XP per exercise).
- **Combo bonus**: up to a further **+1 to +5 XP** based on the highest correct-answer streak reached during the lesson (see §2.4).
- **Perfect lesson bonus**: extra flat XP (e.g. +5–10 XP) if zero mistakes were made in the whole lesson.
- XP is purely cumulative and drives: total XP shown on profile, weekly XP shown on leaderboard/league, and daily-goal progress.
- **[Adapt]** Keep XP totals simple: `lessonXP = baseXP + comboBonus + (perfect ? perfectBonus : 0)`. Store a running lifetime total and a per-day total.

### 4.2 Daily goal

- Each user sets a personal daily target, typically expressed as **an XP amount per day** (Duolingo offers presets like "Casual" 10 XP/day, "Regular" 20 XP/day, "Serious" 30 XP/day, "Intense" 50 XP/day — exact labels/values have varied over time but the tiered-XP-target model is consistent).
- Progress toward the daily goal is shown as a **circular ring/progress indicator** (a donut chart that fills clockwise as XP accrues that day) typically near the streak flame icon in the top bar and prominently on the profile/stats screen.
- Completing the daily goal is usually the trigger that "banks" the day for streak purposes (see 4.3) and often triggers its own small celebratory toast ("Daily goal complete!").

### 4.3 Streak + streak freeze

- **Streak**: a counter of **consecutive calendar days** on which the learner has met their daily goal (or, in simpler implementations, completed at least one lesson). Displayed as a **flame icon 🔥 + number** in the top bar and on the profile screen; the flame icon typically renders in fox-orange/red-orange when active for the current day and a duller/gray flame if the day's goal isn't met yet.
- Missing a full day **resets the streak to 0** (loss-aversion is the core psychological hook — longer streaks feel more costly to lose than the marginal value of one more day).
- **Streak freeze**: a consumable power-up (bought with gems or granted as a reward) that, if held, **automatically protects the streak for one missed day** — i.e., if the learner does no lessons on a given day but owns a streak freeze, the streak is not reset; the freeze is consumed instead. Modern Duolingo also has a paid subscription perk of an always-on/auto-renewing streak freeze.
- Data point worth preserving in our design rationale: apps with a working streak-freeze mechanic see meaningfully higher day-7+ retention on the streak (roughly 17 vs 12 average days sustained in third-party analyses) — i.e., freezes materially help retention and are worth implementing even in a single-user clone as a simple "streak protection" toggle/item.
- **[Adapt]** Single-user, no server-authoritative daily cron needed — compute streak client-side (or via a lightweight server cron/date check) by comparing `lastCompletedDate` to "today" in the user's local timezone: if yesterday, increment; if today already counted, no-op; if gap >1 day and no freeze available, reset to 0; if gap is exactly the freeze-covered gap, consume a freeze and preserve streak.

### 4.4 Hearts (lives)

- Learners start each lesson with a pool of **hearts** — classic value is **5 max hearts**, though Duolingo has also experimented with an "Energy" system (a larger pool, e.g. 25 units, spent per mistake, regained mostly by answering correctly) as an evolution of the same idea. For a clone, the simple **5-heart model** is easiest to reason about and matches the most widely recognized version of the product.
- **One heart is lost per wrong answer** during a lesson (not per exercise attempt — i.e., getting it right on a subsequent try doesn't restore the heart already lost).
- If hearts reach **0**, the lesson session is interrupted — the learner is blocked from continuing normally and must either: wait for regeneration, use gems to refill, watch an ad (real Duolingo, not applicable here), or (real Duolingo) do a "practice" lesson to earn hearts back. **[Adapt]** simplest: at 0 hearts, show a "Out of hearts" modal offering "Practice to refill" (a free-form review of previously missed words that restores hearts) or simply "Restart lesson," since our app has no monetization.
- **Regeneration**: hearts refill **over time**, historically about **1 heart every 4–5 hours** up to the max, i.e. a fully-depleted pool takes roughly 20-24 hours to fully restore passively.
- **Gems can buy hearts** (a full refill for a flat gem price, e.g. ~350-650 gems for 5 hearts in various versions) — **[Adapt]**: since there's no monetization pressure in a single-user app, this can be a free/instant "refill hearts" debug-style action, or omitted entirely with hearts simply auto-regenerating faster (e.g. 1 per hour) to keep the loop fun without friction.
- Practice/review lessons (redoing already-completed content) typically do **not** cost hearts, or cost them more leniently, since their purpose is reinforcement.

### 4.5 Gems (in-app currency)

- Earned from: completing lessons (small amounts), leveling up, unit chests on the path, quests, and league placement rewards.
- Spent on: streak freezes, heart refills, timed-challenge unlocks, "Legendary" mode retries, cosmetic outfits for the mascot.
- **[Adapt]**: implement as a simple integer balance awarded per lesson/quest completion; used to "purchase" a streak freeze or heart refill in a lightweight in-app shop screen. Non-essential for MVP but easy and adds gamification texture.

### 4.6 Leagues / leaderboards

- Weekly cohorts of roughly **20–30 users** are grouped into one of **10 league tiers** (Bronze → Silver → Gold → Sapphire → Ruby → Emerald → Amethyst → Pearl → Obsidian → Diamond), ranked by XP earned that week.
- The leaderboard resets weekly (historically Monday, sometimes referenced as a Sunday/Monday boundary depending on timezone handling); top performers (roughly top 10–30% depending on tier) **promote** to the next league up, bottom performers **demote**, middle performers stay.
- Rewards for finishing top-3 in a league typically include a gem bonus.
- **[Adapt]**: This is inherently a **multiplayer/social feature and does not make sense for a single-user app**. Recommended approach: **skip leagues entirely**, or fake a lightweight, purely-cosmetic **"personal weekly XP bar"** (e.g. "This week: 340 / 500 XP toward your best week") with no real opponents — this preserves the "weekly competitive cadence" psychological hook without needing other users. Do not build real matchmaking/backend for this.

### 4.7 Daily quests

- **3 quests per day**, refreshing daily, each usually XP- or action-based (e.g. "Earn 20 XP," "Get 5 in a row correct," "Complete 3 lessons"). Completing each quest opens a small **treasure chest** reward (bronze → silver → gold tiers for 1st/2nd/3rd quest of the day) containing gems and/or a temporary XP-boost. Completing all 3 in a day sometimes grants an extra bonus chest.
- **[Adapt]**: straightforward to implement as a small deterministic daily quest generator (pick 3 from a pool: "Earn N XP today," "Complete N lessons today," "Get a perfect lesson," "Practice N words") reset at local midnight, rewarding gems.

### 4.8 Achievements

- Two categories: **Personal records** (e.g. longest streak ever, most XP in a single day, most languages studied) and **Awards/badges** (milestone badges unlocked at thresholds — e.g. "Wildfire" badge tiers at 3/7/30/50/100/365-day streaks; "Sage"/"Scholar" for total XP milestones; "Champion" for league finishes; "Wildfire," "Sharpshooter" [accuracy], "Overachiever" [daily goal streaks], etc.).
- Displayed as a **grid of badge icons** on the profile/achievements screen, grayed-out/locked until earned, with a progress ring or "3/10" style counter for multi-tier badges.
- **[Adapt]**: implement a small fixed set relevant to vocab learning — e.g. streak badges (3/7/30/100 days), words-learned badges (50/200/500/1000 words), perfect-lesson badges, total-XP badges. Straightforward metadata-driven system: badge definition = {id, name, tiers: [threshold, iconState]}, evaluated against user stats after each lesson.

---

## 5. Wrong-answer re-queuing (precise mechanic)

This is one of Duolingo's most important and precise mechanics, and it must be replicated exactly for a faithful clone:

1. A lesson is built from an ordered **queue of exercises** (e.g. 15-20 exercises drawn from the unit's vocabulary/skill pool for that lesson).
2. The learner proceeds through the queue **one exercise at a time**, front to back.
3. Whenever the learner answers an exercise **incorrectly** (first attempt wrong, regardless of whether they figure it out on a second attempt within the same screen):
   - A heart is deducted (see §4.4).
   - The correct answer is shown in the red feedback banner.
   - Critically, **that exercise (or an equivalent variant testing the same word/concept) is appended back onto the end of the current lesson's queue**, rather than being dropped. It is not necessarily the identical exercise instance — Duolingo often re-injects a **different exercise type drilling the same vocabulary item** (e.g. if a multiple-choice question on the word "بيت" (house) was missed, the re-queued version later in the lesson might instead be a type-the-translation or word-bank exercise using "بيت"), reinforcing the missed concept without simply repeating verbatim.
   - The learner continues forward through the rest of the original queue as normal — the re-queued item(s) do **not** interrupt immediately; they appear later, at the end.
4. The lesson's progress bar accounts for this: the total denominator can grow when items are re-queued (or, in a simplified implementation, the progress bar is based on a fixed "must clear N *unique* concepts" count rather than raw exercise count, so re-queued repeats don't make the bar appear to move backwards — this is the detail worth getting right: **the progress bar should still feel monotonically forward-moving even though the queue length increased**, typically achieved by counting distinct concepts mastered rather than total screens shown).
5. The lesson only reaches its **end-of-lesson celebration screen** (§2.5) once **every exercise/concept in the queue — including all re-queued ones — has been answered correctly at least once**. In other words, you cannot "finish" a lesson while any word remains in a missed/unresolved state; you must eventually get it right to complete the session (short of running out of hearts and being blocked, §4.4).
6. If the learner gets the **same re-queued item wrong again**, it is re-queued yet again (appended to the end again), so a persistently-missed word can recur multiple times within one lesson until answered correctly.

**Implementation recipe for our clone:**
```
queue = shuffle(initialExercisesForLesson)   // e.g. 10-15 exercises covering N vocab items
i = 0
completedCount = 0
totalUniqueConcepts = N
while queue not fully cleared:
  exercise = queue[i]
  show exercise
  if answer correct:
    mark exercise's concept as "mastered" (if not already)
    advance progress bar to masteredConcepts / totalUniqueConcepts
    i += 1
  else:
    deduct heart
    show correct answer banner
    requeue: push a (possibly different-type) exercise for the same concept onto the end of queue
    i += 1  // still move forward through the queue, don't retry same slot immediately
end loop -> show results screen
```

---

## 6. Visual design language

### 6.1 Color palette (verified hex codes)

Primary brand colors (from Duolingo's public brand guidelines and design references):

| Name | Hex | Typical usage |
|---|---|---|
| **Feather Green** (primary brand green) | `#58CC02` | Primary CTAs, active path nodes, logo, correct-answer states, checkmarks |
| Feather Green (light tint / "Mask"/"Green Light") | `#89E219` / `#D7FFB8` | Hover/lighter backgrounds, highlighted/active-state tints behind green elements |
| **Macaw Blue** | `#1CB0F6` | Secondary buttons, links, selected-state highlight (e.g. selected MC option), info accents |
| Macaw light tint | `#DDF4FF` | Selected-option background tint |
| **Cardinal Red** | `#FF4B4B` | Hearts icon, incorrect-answer banner/state, destructive actions, error text |
| Cardinal light tint | `#FFDFE0` | Incorrect-answer banner light background variant |
| **Bee Yellow** | `#FFC800` | Gold/completed node fill, XP icon accents, streak-freeze icon, gem-adjacent highlights |
| **Fox Orange / "Wildfire" orange** | `#FF9600` | Streak flame icon, warning/typo-tolerance ("almost correct") banner accent |
| **Eel** (primary text gray, near-black) | `#4B4B4B` | Primary body text, instruction labels |
| **Hare / Wolf** (secondary gray) | `#777777` (mid gray, commonly cited as ~`#6F6F6F`–`#AFAFAF` depending on source) | Secondary/placeholder text, disabled button label |
| **Swan** (light gray, near-white surface) | `#F7F7F7` / `#E5E5E5` | Card borders, dividers, locked-node fill, progress-bar track background |
| **Polar / Snow** (background white) | `#FFFFFF` | Page/card backgrounds |
| Beetle (purple accent, seen in some units/leagues) | `#CE82FF` | Alternate unit theme color, decorative accents |
| Humpback (deep blue accent) | `#2B70C9` | Alternate unit theme color, some pressed/darker button states |

Additional secondary palette values seen in Duolingo's broader brand kit (useful for extra unit-theme variety and less critical to get pixel-perfect): `#7AC70C`, `#8EE000`, `#FAA918`, `#D33131`, `#E53838`, `#14D4F4`, `#8549BA`, `#A560E8`.

**Practical palette to hard-code in the clone's design tokens** (CSS variables / Tailwind theme):
```
--color-primary-green:      #58CC02
--color-primary-green-dark: #58A700   /* darker shade for button's 3D bottom edge */
--color-blue:                #1CB0F6
--color-blue-dark:           #1899D6
--color-red:                  #FF4B4B
--color-red-dark:             #EA2B2B
--color-yellow:               #FFC800
--color-yellow-dark:          #E6B400
--color-orange:               #FF9600
--color-purple:               #CE82FF
--color-text:                 #4B4B4B  /* "eel" */
--color-text-secondary:       #777777
--color-border:               #E5E5E5
--color-bg-subtle:            #F7F7F7
--color-bg:                   #FFFFFF
```

### 6.2 Buttons — the "chunky 3D bordered button"

This is Duolingo's single most recognizable UI signature and must be replicated:

- Buttons are **rounded rectangles** (border-radius roughly **12–16px**), with generous padding (e.g. `16px` vertical, `24-32px` horizontal), bold/heavy rounded font, and **no visible top border** — the 3D effect comes entirely from the **bottom edge**.
- Structure: the button has a **flat-colored top face** (e.g. feather green `#58CC02`) and a **solid-colored "shelf"/bottom edge** roughly **4px tall**, in a **darker shade of the same hue** (e.g. `#58A700` beneath a `#58CC02` face) — visually this reads as a chunky, slightly-3D, "keycap" or "gumdrop" button standing up off the page.
- Implementation is most robustly done with `box-shadow: 0 4px 0 <darker-shade>;` on the resting state (rather than a literal `border-bottom`, since box-shadow doesn't affect layout/box-sizing and looks identical), combined with `transform: translateY(0)`.
- **Press interaction**: on `:active` (mousedown/touchstart), the button **moves down** by translating `translateY(4px)` (matching the shadow depth) while **simultaneously reducing the box-shadow to 0** (or to a much smaller offset) — this creates the illusion that the button has been physically pushed down flush with its own shelf, then springs back up (shadow returns, translateY resets to 0) on release. This should use `transform`/`box-shadow` transitions (~50-100ms) rather than animating `top`/`margin` for smooth, hardware-accelerated motion.
- **Text**: bold, centered, usually **uppercase** (e.g. "CHECK", "CONTINUE", "START", "GOT IT") in white (on colored buttons) or in the brand color (on white/outline buttons).
- **Color variants**: primary green (main CTA — Check/Continue/Start), blue (secondary/alternate action), red (destructive, e.g. "End session"), gray/white-with-border (tertiary/"Skip" or disabled state — gray face `#E5E5E5`, gray shelf `#CCCCCC`, gray text).
- **Disabled state**: desaturated gray face/shelf, no press interaction, non-interactive cursor, used for Check button before any answer is given.

### 6.3 Cards, borders, radii

- Nearly everything is **rounded** — cards, buttons, input fields, chips, avatars, progress bars, modals. Border-radius scale roughly: small chips/tiles `8-12px`, buttons/cards `12-16px`, large modal sheets/bottom sheets `16-24px` (sometimes only top corners rounded for bottom sheets), circular elements (avatars, node icons, streak flame badge) fully round (`border-radius: 999px` / `9999px`/`50%`).
- Cards typically: white background, `1-2px` `#E5E5E5` border **or** a soft drop shadow instead of a border (`box-shadow: 0 2px 0 #E5E5E5` echoing the button's bottom-edge language, or a subtle `0 1px 2px rgba(0,0,0,0.06)`), consistent internal padding (`16-20px`).
- Selected/active states generally swap the border color to the brand hue (blue or green) and add a light tinted background fill rather than heavy shadows or glows.

### 6.4 Typography

- Duolingo's real brand system uses two custom/paired typefaces: **"Feather Bold"** (a custom display face inspired by the owl mascot's wing shapes, used for short headlines/big numbers/logo-adjacent moments) and **"DIN Next Rounded"** (used for body copy, UI labels, longer headlines).
- Both are proprietary/licensed fonts. **The closest freely-available substitute for implementers is Google Fonts' "Nunito"** (or "Nunito Sans" for the more neutral/body-text moments) — a rounded, geometric, humanist sans-serif with soft terminals that reads very similarly to DIN Next Rounded / Feather Bold's friendly, pill-like letterforms. **Baloo 2** is a secondary good alternative for extra-bold display headlines if something even chunkier than Nunito ExtraBold is desired.
- Recommended weight usage: **Nunito ExtraBold (800) or Black (900)** for headlines, buttons, node labels, XP numbers, streak counts; **Nunito SemiBold (600) or Bold (700)** for body copy, instructions, card titles; avoid thin/light weights entirely — Duolingo's type system has almost no light-weight text, everything skews bold/friendly/chunky.
- Font sizes (typical scale): body ~16px, instruction/prompt text ~14-15px (often gray, all-caps or small-caps styling for labels like "SELECT THE CORRECT TRANSLATION"), section/unit headers ~20-24px bold, big numeric displays (XP totals, streak count) ~28-40px extra-bold.

### 6.5 Progress bar style

- A **pill/rounded-full horizontal bar**, track color light gray (`#E5E5E5`), fill color feather green (`#58CC02`), height roughly **12-16px**, fully rounded ends (`border-radius: 999px`).
- Fill animates smoothly left-to-right on each correct answer (`transition: width 300ms ease-out` or similar), rather than jumping instantly, to feel rewarding.
- Optionally shows small circular "notch" markers along the track indicating discrete exercise boundaries (a nice-to-have, not essential).

### 6.6 Mascot usage — **[Adapt: do NOT copy the owl]**

- Real Duolingo's entire visual identity is built around **Duo**, a green owl mascot, plus a supporting cast of quirky character illustrations (Duo's family/friends) that appear throughout onboarding, streak reminders, notifications, and the path.
- **For this Lebanese Arabic clone, do not use an owl** (trademark/identity concerns aside, it's simply not our brand). Recommended alternative directions:
  1. **A cedar tree mascot** — thematically resonant with Lebanon (the cedar is the national symbol, on the flag). Could be a simple friendly cartoon cedar tree character (round, soft-shaped canopy, root "feet," blob-style limbs in the same rounded/soft illustration language Duolingo uses for its own cast) used for celebration screens, empty states, and streak reminders.
  2. **A generic bird** (unrelated species to an owl — e.g. a stylized swallow, hoopoe [a bird found in the Levant], or simply an abstract friendly bird-blob) if an animal mascot is still wanted for animation/expressiveness reasons (birds are easy to give idle/happy/sad bounce animations).
  3. **Simplest MVP path**: use an emoji as a placeholder mascot (e.g. 🌲/🌳/🕊️/🦅) in place of custom illustration work — emoji require zero art asset production and can be swapped for custom SVG illustration later without any architectural change (keep the mascot rendering behind a single `<Mascot mood="happy"|"sad"|"neutral" />` component so the visual asset is swappable).
- Whatever the mascot, preserve the **functional role** it plays in real Duolingo: appears on the end-of-lesson celebration screen, on the "out of hearts"/encouragement screens, idle on the home path cheering the learner along, and in empty/zero states — the mascot is a reusable "emotional feedback" component, not just decoration.

### 6.7 Iconography

- Icons throughout are simple, filled, rounded, two-tone (not thin-line/outline style) — flame for streak, gem/crystal for currency, heart for lives, shield/trophy for checkpoints, open book for guidebook/stories, closed treasure chest for rewards, circular arrows for practice/refresh.
- Recommend using a rounded icon set (e.g. Phosphor Icons "fill" variant, or Heroicons solid, or Lucide with rounded strokes) rather than thin-line icon sets to match the chunky, friendly aesthetic.

---

## 7. Stats / profile screen elements

The profile/stats screen typically surfaces, in a card-based layout:

- **Avatar** (circular, user-selectable), **display name/username**, **join date** ("Learning since March 2024").
- **Streak flame counter**: large flame icon + current streak day-count, often with a "best/longest streak" secondary stat nearby.
- **Total XP**: a big cumulative lifetime number, sometimes paired with current league or per-day average.
- **Daily goal ring**: circular progress donut showing today's XP progress against the personal daily target, often duplicated in miniature in the top navigation bar for constant visibility.
- **"Words learned" / "Day streak" / "Total XP" / "Current league"** are commonly shown as a **row of 3-4 stat tiles/chips** near the top of the profile (icon + big number + small label underneath), e.g.:
  - 🔥 Day streak — `47`
  - ⭐ Total XP — `12,480`
  - 📚 Words learned — `320` (course-specific vocabulary count — highly relevant to surface prominently for our vocab-focused clone)
  - 🏆 Current league / weekly rank — (or, per §4.6 Adapt note, a "personal weekly XP goal" bar instead)
- **Achievements/badges grid**: a scrollable grid of circular or shield-shaped badge icons, locked ones grayed out, tapping one shows its unlock criteria and progress.
- **Course/language row**: flag icon + language name + a "practice" shortcut button, relevant for multi-course Duolingo but reducible to a single fixed "Lebanese Arabic" badge for our single-course clone.
- **Friends / following list**: social feature, **[Adapt] skip entirely** for a single-user app — no need for follow/friend infrastructure.
- **Calendar/streak history view**: some versions show a small monthly calendar grid with filled dots on days the goal was met — nice optional addition for visualizing consistency over time, easy to build from a `completedDates: Date[]` array.

**[Adapt] Recommended minimal profile screen for our clone**: avatar + name, 4 stat chips (day streak, total XP, words learned, lessons completed), daily-goal ring, streak calendar heatmap (like a mini GitHub-contributions-style grid), and an achievements grid. Omit leagues/friends/social entirely, or fake the weekly-XP-bar as described in §4.6.

---

## 8. Summary of explicit adaptation decisions for this clone

| Real Duolingo feature | Recommendation for our Lebanese Arabic clone |
|---|---|
| Owl mascot ("Duo") | Replace with a cedar-tree character or generic bird/emoji mascot; keep the same functional slots (celebration, encouragement, idle path presence) |
| Leagues/leaderboards (social, multi-user) | Skip, or fake a personal "weekly XP goal" bar with no real opponents |
| Friends / social features | Skip entirely |
| Listening exercises (audio) | Skip, or restyle node icon as a stand-in with no audio requirement |
| Speaking exercises (ASR) | Skip entirely — no microphone/speech recognition |
| Monetization (ads, gem purchases, subscription) | Skip; make hearts/gems free/generous since there's no business model to protect |
| Hearts system | Keep — simple 5-max-hearts, -1 per mistake, regenerate hourly-ish (looser than real Duolingo since no monetization pressure) |
| Streak + streak freeze | Keep — core retention hook, cheap to implement client-side |
| XP, combo bonus, perfect-lesson bonus | Keep — directly reusable scoring model |
| Daily quests, achievements | Keep — good low-cost gamification, redefine around vocab milestones (words learned) instead of generic Duolingo actions |
| Wrong-answer re-queue-to-end-of-lesson | Keep exactly as described in §5 — this is core to the pedagogical feel |
| Winding path, units, node states, unit banners/guidebook | Keep — highly reproducible in CSS/SVG, core to "feels like Duolingo" |
| Word-bank tap-to-place/tap-to-remove mechanic | Keep exactly as described in §3.2 — no drag-and-drop needed |
| Matching pairs (5 pairs) | Keep — great fit for vocab drilling |
| Chunky 3D bordered buttons, rounded Nunito typography, feather-green/macaw-blue/cardinal-red palette | Keep — this is the visual "language" that reads as Duolingo-like without copying any trademarked asset |

---

## Sources

- [Color - Duolingo Brand Guidelines](https://design.duolingo.com/identity/color)
- [Typography - Duolingo Brand Guidelines](https://design.duolingo.com/identity/typography)
- [Duolingo Color Palette (Hex and RGB) — Design Pieces](https://www.designpieces.com/palette/duolingo-color-palette-hex-and-rgb/)
- [Duolingo Brand Color Palette: Hex, RGB, CMYK and UIs — Mobbin](https://mobbin.com/colors/brand/duolingo)
- [Duolingo Brand Colors: Hex Codes & Color Palette — Pick Color Online](https://pickcoloronline.com/brands/duolingo/)
- [Introducing the new Duolingo learning path — Duolingo Blog](https://blog.duolingo.com/new-duolingo-home-screen-design/)
- [Guide to understanding Duolingo's new learning path — Duolingo Support](https://support.duolingo.com/hc/en-us/articles/6448984613773-Guide-to-understanding-Duolingo-s-new-learning-path)
- [The Duolingo Learning Path — What It Is, How It Works — duoplanet](https://duoplanet.com/duolingo-learning-path/)
- [What is the Duolingo Legendary Level — Happily Ever Travels](https://happilyevertravels.com/duolingo-legendary-level/)
- [Exercise — Duolingo Wiki (Fandom)](https://duolingo.fandom.com/wiki/Exercise)
- [Learning to Write in Another Language: Tips from Duolingo](https://blog.duolingo.com/covering-all-the-bases-duolingos-approach-to-writing-skills/)
- [Learn How Duolingo Teaches Speaking Skills — Duolingo Blog](https://blog.duolingo.com/covering-all-the-bases-duolingos-approach-to-speaking-skills/)
- [Listening Practice in Another Language: Tips from Duolingo](https://blog.duolingo.com/covering-all-the-bases-duolingos-approach-to-listening-skills/)
- [Hearts — Duolingo Wiki (Fandom)](https://duolingo.fandom.com/wiki/Hearts)
- [What Happens When You Run Out Of Hearts On Duolingo?](https://duolingoguides.com/what-happens-when-you-run-out-of-hearts-on-duolingo/)
- [Duolingo Gamification Strategy: A Full Case Study (2026) — Trophy](https://trophy.so/blog/duolingo-gamification-case-study)
- [Duolingo — Streak System Detailed Breakdown & Design — Medium](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)
- [Duolingo Streaks: How the Mechanic Drives 2x Daily Retention — Deconstructor of Fun](https://duolingo.deconstructoroffun.com/mechanics/streaks)
- [How To Beat The Heart System On Duolingo — duoplanet](https://duoplanet.com/how-to-beat-the-heart-system-on-duolingo/)
- [Combo bonus — Duolingo Wiki (Fandom)](https://duolingo.fandom.com/wiki/Combo_bonus)
- [Duolingo XP - The COMPLETE Guide — duoplanet](https://duoplanet.com/duolingo-xp-guide/)
- [XP — Duolingo Wiki (Fandom)](https://duolingo.fandom.com/wiki/XP)
- [Start earning brand-new Achievements on Duolingo! — Duolingo Blog](https://blog.duolingo.com/achievement-badges/)
- [How Duolingo Leaderboards and Leagues Work — Duolingo Blog](https://blog.duolingo.com/duolingo-leagues-leaderboards/)
- [What are leaderboards and leagues? — Duolingo Help Center](https://www.duolingo.com/help/leaderboards-and-league)
- [League — Duolingo Wiki (Fandom)](https://duolingo.fandom.com/wiki/League)
- [Duolingo Leagues: How Weekly Leaderboards Drive +25% Lesson Completion — Deconstructor of Fun](https://duolingo.deconstructoroffun.com/mechanics/leagues)
- [Achievements — Duolingo Wiki (Fandom)](https://duolingo.fandom.com/wiki/Achievements)
- [Quests — Duolingo Wiki (Fandom)](https://duolingo.fandom.com/wiki/Quests)
- [Introducing Friends Quests — Duolingo Blog](https://blog.duolingo.com/friends-quests/)
- [Duolingo Quests Guide: Daily, Friend & Monthly Challenges — duolingoguides](https://duolingoguides.com/what-is-a-quest-in-duolingo/)
- [Replicating Duolingo's Iconic Button in Pure CSS — Medium](https://medium.com/@lilskyjuicebytes/clone-the-ui-1-replicating-duolingos-button-in-pure-css-bd37a97edb7e)
- [Building a Magical 3D Button with HTML and CSS — Josh W. Comeau](https://www.joshwcomeau.com/animation/3d-button/)
- [Duolingo custom font 'Feather' is inspired by their owl mascot — Monotype](https://www.monotype.com/resources/duolingo-custom-font-inspired-their-owl-mascot-duo)
- [What Font Does Duolingo Use? — duolingoguides](https://duolingoguides.com/what-font-does-duolingo-use/)
- [DuoLingo Design System — Figma Community](https://www.figma.com/community/file/1460744749282136015/duolingo-design-system)
- [Duolingo design system — Refero Styles](https://styles.refero.design/style/7088d695-362b-4e09-b325-fa8136d4f350)
- [duolingo's Design System: design guidelines — Adele/UXPin](https://adele.uxpin.com/duolingo-design-guidelines)
