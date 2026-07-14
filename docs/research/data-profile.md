# Data Profile: Lebanese Arabic (Arabizi) Seed Data

Analysis of `vocab.csv`, `sentences.csv`, `conjugations.csv` in the repo root, produced to
support implementation of the seed script. All row/line numbers below refer to 1-indexed
lines in the raw files (line 1 = header).

## 0. Summary

All three files are well-formed CSVs (RFC 4180 style, comma-delimited, `"..."` quoting used
only where a field contains a comma). No BOM, no malformed rows, no empty fields, no stray
whitespace was found. The main things a seeding implementer needs to handle are not "broken
rows" but **data modeling decisions**: duplicate English translations (many-to-one collisions),
slash-separated alternate answers embedded in a single translation field, parenthetical
gender/context notes, and one base_verb that doesn't literally match its vocab.csv row.

---

## 1. File integrity

### 1.1 Row counts and headers

| File | Data rows | Header |
|---|---|---|
| `vocab.csv` | 2412 | `arabizi_word,english_translation` |
| `sentences.csv` | 1181 | `arabizi_sentence,english_translation` |
| `conjugations.csv` | 565 | `base_verb,english_meaning,ana,ni7na,inta,inte,into,huwe,hiyye,hinne` (10 columns) |

Counts match the task description (~2412 / ~1181 / ~565) exactly.

### 1.2 Encoding / BOM

No BOM on any file (`xxd` of the first bytes shows the header text starting immediately, no
`EF BB BF`). All files are valid UTF-8 (no encoding errors surfaced when read as UTF-8 in
Python). No non-ASCII letters were found in the arabizi columns themselves — Lebanese Arabic
sounds are represented purely with ASCII letters + digits (2/3/7), consistent with arabizi
transliteration convention.

### 1.3 Malformed rows / wrong column counts

**None found.** Parsing each file with a proper CSV reader (`csv.reader`, which respects
quoting) yields exactly 2 columns for every vocab/sentences row and exactly 10 columns for
every conjugations row. (A naive `split(',')` would incorrectly appear to produce extra
columns on ~11 vocab rows and many sentence rows because those fields contain literal commas
— see 1.4. Any seed script **must use a real CSV parser**, not manual string splitting.)

### 1.4 Quoting / embedded commas

- `vocab.csv`: 11 rows have a quoted `english_translation` containing a comma, e.g. line 164
  `3id,"celebration, holiday"`, line 1825 `ta,"to, in order to"`. These are legitimate
  double-gloss translations, not errors.
- `sentences.csv`: quoting is pervasive (many sentences and translations contain commas,
  e.g. line 8 `"Ma ande chi l'yom, nushkur allah."`). 1420 raw `"` characters appear across the
  file; every one of them is part of correct RFC4180 quoting — csv.reader parses all 1181 rows
  cleanly with no ragged rows.
- `conjugations.csv`: only 2 rows use quoting, both because `english_meaning` contains a comma
  (line 389 `yesma7,"to allow, permit",...`; line 417 `yetlob,"to order, request",...`).

### 1.5 Empty fields / whitespace

Zero empty fields in any file. Zero fields with leading/trailing whitespace. Zero fields with
internal double-spaces. The data is unusually clean on this front — no trimming logic is
strictly required, but a defensive `.strip()` during seeding is still good practice in case
future data additions aren't as clean.

### 1.6 Duplicate keys

- **`vocab.arabizi_word`**: 0 duplicates — all 2412 arabizi words are unique (case-insensitive).
  Safe to use as a natural key / unique constraint.
- **`vocab.english_translation`**: **228 distinct translations are duplicated across 507 rows**
  (i.e. ~21% of vocab rows share a translation with at least one other row). Top offenders:
  `to believe` (4x), `hand` (4x), `to live` (4x), `to know` (4x), `without` (4x), `to eat` (4x),
  `to hide` (4x), `to lose` (4x), `to go` (4x), plus 219 more pairs/triples (`to say` 3x, `food`
  3x, `village` 3x, `room` 3x, `son` 3x, etc.). **Implication:** you cannot safely reverse-look-up
  a vocab row by English translation, and multiple-choice "pick the English translation" screens
  must be built by row id, not by string — otherwise two synonymous Arabizi words could both
  "correctly" match a single English prompt.
- **`sentences.arabizi_sentence`**: 0 duplicates — all 1181 sentences are unique.
- **`sentences.english_translation`**: 7 duplicated translations across 14 rows (e.g. "Easter
  break is near.", "their table is expensive.", "i am afraid of him." each appear twice from two
  different Arabizi sentences — likely paraphrase pairs or conjugation-pattern drills). Not an
  error, but multiple-choice screens keyed on English text could have two valid Arabizi answers.
- **`conjugations.base_verb`**: 0 duplicates — all 565 base verbs are unique.

### 1.7 Cross-file consistency (conjugations vs vocab)

- 564/565 (99.8%) `conjugations.base_verb` values exist verbatim (case-insensitive) in
  `vocab.arabizi_word`.
- The one exception: conjugations line 173, `nisi,to forget,...` — vocab.csv has no `nisi`
  entry. Vocab instead has `yensa` (line 2168) = "to forget", a different verb-form
  transliteration (imperfect/present root `y-` vs. the perfect/dictionary root `nisi`). **Seed
  script note:** if you intend to join conjugations to vocab by exact string match, `nisi` will
  fail to join; you'll need either a manual alias row or to treat conjugations.csv as
  self-sufficient (it already carries its own `english_meaning`, so a failed join isn't fatal).
- Of the 564 matches, 19 rows have an `english_meaning` in conjugations.csv that is **worded
  differently** from the matching vocab.csv translation (mostly harmless formatting variance:
  "to research" vs "research", "to like/love" vs "to like / love"). One is a genuine **semantic
  collision worth flagging**: conjugations line for `sa7eb` gives "to pull/drag/withdraw", while
  vocab.csv's `sa7eb` means "friend" (a noun) — same spelling, unrelated meanings. If the seed
  script displays both a noun and verb card for `sa7eb`, disambiguate them (e.g. show conjugated
  forms alongside the verb card) so learners don't see contradictory glosses.

### 1.8 Rows to skip/clean during seeding

**None require skipping.** There are no malformed, truncated, or empty rows in any file. The
only two "cleanup-adjacent" items are:
- conjugations.csv line 173 (`nisi`) — decide on a join strategy per 1.7, don't skip the row.
- The `sa7eb` homonym (vocab.csv line ~1614-ish "friend" entry vs conjugations `sa7eb` "to
  pull/drag") — no line needs deleting, just be aware both are legitimate, unrelated words.

---

## 2. Character inventory & normalization

### 2.1 Digits

Lebanese arabizi conventionally uses digits to represent sounds with no Latin equivalent:
`2` = ء/ق (hamza/qaf), `3` = ع (ayn), `7` = ح (7a). This data set uses **only these three**
phonetically:

| Digit | vocab.csv (word) | conjugations.csv (base_verb) | sentences.csv |
|---|---|---|---|
| 2 | 348 | 116 | 637 |
| 3 | 388 | 105 | 1368 |
| 7 | 255 | 81 | 766 |

`sentences.csv` additionally contains digits `0,1,4,5,6,8,9` (9, 16, 5, 4, 3, 6, 15
occurrences respectively) — but these are **literal numerals** (years like `1936`, `1958`,
times like `se3a 10`, `se3a 8`, or a highway name `I5 freeway`), not phonetic transliteration.
A normalization function should **not** strip digits generically — `2`, `3`, `7` are meaningful
letters within a word (e.g. `2aal`, `3andak`, `7abibi`) and must be preserved for matching, while
literal number tokens are just incidental content within sentences (not part of the answer key
for word-level exercises).

### 2.2 Special characters

| Char | vocab (word) | sentences (sentence) | conjugations (base_verb) |
|---|---|---|---|
| `-` (hyphen) | 9 | 831 | 0 |
| `'` (apostrophe) | 1 | 46 | 0 |
| `.` `,` `?` `!` `"` `:` `;` `&` `/` | 0 | 981/381/58/26/26/14/4/4/1 | 0 |

- **Hyphens** in `vocab.csv` occur in compound/phrase entries: `3ilm el-falak`, `ash-har`,
  `bi l-akher`, `bi l-awal`, `bil-zabet`, `el-yom`, `la l-abad`, `mhara-hara`, `udet l-a3de`
  (9 rows total, all multi-morpheme phrases using `el-`/`l-` as "the"). In `sentences.csv`,
  hyphens are far more common (831 occurrences in 476 sentences, e.g. `l-beb`, `El-taleb`,
  `3ashen`) because the definite article `l-`/`el-` is written with a hyphen throughout running
  text.
- **Apostrophes**: rare in vocab.csv (only `z'hoorat`, line 2381), but appear 46 times in
  sentences.csv, almost always as the contracted definite article `l'` before a vowel (`l'yom`,
  `l'kitab`, `l'beite`, `l'mat3am`) — functionally identical to the hyphenated `l-` form, just a
  different orthographic convention for the same morpheme.
- **Sentence punctuation** (`.`, `,`, `?`, `!`, `"`) is normal end-of-sentence/clause punctuation
  and quotation marks; not present at all in vocab.csv or conjugations.csv (single words/verb
  forms have no punctuation).
- Vocab/conjugations arabizi text has **zero uppercase letters** anywhere; sentences.csv is
  naturally capitalized (sentence-initial caps, proper nouns like `Mira`, `Naji`, `Starbucks`).

### 2.3 Recommended normalization function (typing-answer comparison)

```
normalize(s):
  1. Unicode-normalize (NFC) and lowercase.
  2. Trim leading/trailing whitespace; collapse internal runs of whitespace to a single space.
  3. Strip trailing sentence punctuation: . , ! ? ; : " '  (only at the very end of the string —
     don't strip a mid-word apostrophe like l'yom).
  4. Normalize the definite-article variants so l- and l' compare equal: replace a leading
     "l-" or "l'" (and "el-") with a single canonical form (e.g. "l-") before comparing, OR strip
     hyphens/apostrophes entirely and compare the bare letters (li'yom -> lyom, l-yom -> lyom).
     Recommend the latter (strip all hyphens/apostrophes from both sides before compare) since
     users typing on a phone keyboard are unlikely to reliably reproduce el-/l-/l' distinctions.
  5. Do NOT strip digits 2/3/7 — they are phonemic and distinguish real minimal pairs
     (e.g. "3a" vs "2a"). Digits 0/1/4/5/6/8/9 only appear in sentence-level literal numbers, so
     this is moot for single-word answer keys (vocab/conjugations never contain them).
  6. For vocab/conjugations answers containing "/" (see 3.3 below) or parenthetical notes,
     split into an accepted-answers list rather than treating the raw field as one string.
```

Yes — typing answers should tolerate apostrophe/hyphen variants (per step 4) and trailing
punctuation (step 3), but should NOT be lenient about the 2/3/7 digits, since those encode real
phonemic contrasts a learner should be tested on.

---

## 3. Length / word-count distributions

### 3.1 Vocab word length (characters)

min 2, max 14, mean 5.78, median 6.

| Bucket | Count | % |
|---|---|---|
| 1-3 chars | 91 | 3.8% |
| 4-5 chars | 1036 | 43.0% |
| 6-7 chars | 1010 | 41.9% |
| 8-9 chars | 227 | 9.4% |
| 10+ chars | 48 | 2.0% |

40 vocab entries (1.7%) are multi-word phrases (contain a space), e.g. `3al akid`, `3ala kil`,
`bi khsoos`, `ahla w sahla`. These should probably be excluded from single-word tap exercises
(they read as a fixed expression) but work fine as flashcards/typing prompts.

### 3.2 Sentence word-count distribution (naive whitespace/punctuation tokenization)

min 1, max 39 words, mean 9.2, median 8.

| Bucket | Count | % |
|---|---|---|
| 1-2 words | 39 | 3.3% |
| 3-5 words | 283 | 24.0% |
| 6-10 words (ideal word-bank) | 468 | 39.6% |
| 11-15 words | 253 | 21.4% |
| 16+ words | 138 | 11.7% |

**751 sentences (63.6%) fall in the 3-10 word "ideal for tap-the-word-bank" range** — a solid
pool. The 39 very-short sentences (1-2 words, e.g. `Wayna?`, `Tfadale.`, `Akalna`, `3afwan`) are
better suited to flashcard/listening exercises than word-bank reconstruction. The 138
sentences at 16+ words include noticeably harder/longer historical-narrative content (see 3.3)
that reads as advanced/optional material — good candidates for a "bonus" or late-unit tier
rather than early word-bank drills.

### 3.3 A note on content register

The longest sentences are stylistically different from the rest of the corpus — they read as
encyclopedic/historical narration (Lebanese political history, Kellogg's cereal trivia, WWII-era
biography) rather than conversational drill sentences, e.g.: *"Bi l-2aren tase3 3ashar, ken
Kellogg ydir masa77a bi Battle Creek bi America, w ken mou2men bi nazariye gharibe 3ajibe..."*
These are linguistically rich but heavier — flag them as an advanced-tier subset rather than
mixing them into beginner word-bank/multiple-choice exercises.

---

## 4. Overlap analysis (vocab <-> sentences <-> conjugations)

Tokenization used: lowercase, `re.findall(r"[a-z0-9']+", text)` (keeps digits 2/3/7 attached to
words, keeps apostrophes, splits on all other punctuation/hyphens).

- **93.6% of sentences (1106/1181) contain at least one exact-token vocab word.** The remaining
  ~6.4% either use inflected/conjugated forms not present verbatim in vocab.csv, or use words
  outside the vocab list entirely.
- **Average of 3.50 distinct vocab words matched per sentence** (median 3).
- **934 of 2412 vocab words (38.7%) appear as an exact token at least once in sentences.csv.**
  Conversely, **1478 vocab words (61.3%) never appear in any sentence** — these are "vocab-only"
  words that a seed script can't rely on sentence exposure for; they'll need their own
  flashcard/matching exercises since they won't get reinforcement via sentence-building drills.
- Because tokenization is exact-string matching, this **undercounts real overlap**: sentences
  use conjugated/inflected forms of a vocab root (e.g. vocab `yensa` "to forget" vs conjugated
  `bensa`/`btense` forms actually appearing in text) that won't match token-for-token. Treat the
  38.7%/93.6% figures as a floor, not a ceiling, on true lexical overlap.
- **Most frequent vocab words in sentences** (function words / high-frequency grammar, expected):
  `bi` (275), `ma` (182), `ana` (142), `3a` (137), `la` (121), `bas` (88), `ktir` (87), `fi` (73),
  `ma3` (67), `men` (67), `ta` (54), `shi` (52), `3am` (51), `yom` (50), `yalli` (50), `kil` (48),
  `ba3ed` (41), `mish` (39), `nes` (37), `hiyye` (31). These are strong candidates for Unit 1
  (see section 6).
- **Conjugations <-> vocab**: 564/565 (99.8%) base_verbs match a vocab.csv word exactly
  (see 1.7 for the one exception, `nisi`).

---

## 5. Distractor generation guidance (multiple choice)

For a plausible-but-wrong multiple-choice option pool, use `vocab.csv` (or `conjugations.csv`
for conjugation quizzes) filtered by:

1. **Same approximate word length** (± 1-2 characters) as the correct answer, using the length
   buckets in 3.1 (4-5, 6-7, 8-9 chars) as pre-computed pools — avoids "obviously too
   short/long" distractors.
2. **Shared prefix** (first 1-2 letters, especially shared digit-letter like `2`/`3`/`7` prefix)
   — e.g. distractors for `2aal` ("to say") could be pulled from the 75 vocab words starting
   with `2`. This exploits the phonetic digit system: confusing `2` and `3` onset words is a
   realistic learner mistake, so pairing `2abar` (to bury) against `3abar`/`3amal`-style
   distractors tests real discrimination rather than trivial elimination.
3. **Part-of-speech guess via translation pattern**: 555/2412 vocab translations (23.0%) start
   with `"to "`, a reliable verb marker. Filter distractors for a verb prompt to the other 554
   `"to "`-prefixed rows (never mix a verb prompt with a noun distractor — too easy). For
   non-verb prompts, exclude all `"to "`-prefixed rows from the distractor pool.
4. **Avoid true synonyms as distractors**: because 228 translations are duplicated (1.6), don't
   pull a distractor whose English gloss equals (or is a duplicate-set sibling of) the correct
   answer's gloss — that produces a technically-correct "wrong" answer. Build the duplicate-set
   lookup once (translation.lower() -> [row ids]) and exclude same-set rows from candidate
   distractors.
5. Vocab translations containing `/` (461 rows, e.g. "to turn/flip", "few/little") or
   parentheses (39 rows, e.g. "red (f)", "aunt (paternal)") encode **multiple acceptable
   answers or a disambiguating note** — when using these as the "correct" answer text, show only
   the primary gloss (text before `/` or before ` (`) as the displayed correct choice, and treat
   the alternates as acceptable-but-not-canonical for typing-answer matching, so it doesn't
   accidentally get used as a "wrong" option for a different word with an overlapping partial
   gloss (e.g. "hard/tough" vs. a separate word meaning literally "tough").

---

## 6. Recommended thematic / unit grouping

A keyword pass over all 2412 vocab translations (approximate — string/regex matching on
English gloss, not authoritative POS tagging) found clear, evenly-populated thematic clusters.
Coverage isn't exhaustive (only ~19% of rows matched a keyword list), but it's enough to
confirm thematic grouping is viable and to seed initial unit buckets:

| Theme | Approx. matches | Example words |
|---|---|---|
| Time & calendar | 50 | `3abukra` (early morning), `7zayran` (June), `3otle` (holiday/day off) |
| Food & drink | 49 | `2ahwe`/`ahwe` (coffee), `2akel`/`akel` (food), `7aleeb` (milk) |
| Verbs of motion | 48 | `2arrab` (to come near), `dakhal` (to enter), `fall`/`fet` (to leave/pass) |
| Family & people | 39 | `3amm` (uncle), `3ayle` (family), `7amet` (mother-in-law) |
| Emotions & feelings | 34 | `7abb` (to love), `7azeen` (sad), `2ele2` (to worry) |
| General adjectives | 30 | `7elo` (nice/beautiful), `2adim` (old), `a7la` (more beautiful) |
| Work & school | 28 | `daftar` (notebook), `alam`/`2alam` (pen), `dars` (lesson) |
| Weather & nature | 25 | `2ard`/`ard` (land), `3asfe` (storm), `ba7er` (sea) |
| Numbers & quantities | 24 | `3ashra` (ten), `arb3a` (four), `alef` (thousand) |
| Body parts | 23 | `2alb` (heart), `2id` (hand), `3ayn` (eye) |
| House & furniture | 23 | `2ude` (room), `7amem` (bathroom), `7eit` (wall) |
| Money & shopping | 22 | `dafa3` (to pay), `dekene`/`dukkan` (shop), `7seb` (bill) |
| Communication/tech | 19 | `2aal` (to say), `7aki` (talk/speech), `da3a` (to call for) |
| Health & body | 15 | `7akim`/`hakim` (doctor), `dawa` (medicine), `mareed` (sick) |
| Religion & holidays | 12 | `3eed`/`3id` (holiday), `kanise` (church), `fose7` (Easter) |
| Abstract nouns | 10 | `3ilm` (knowledge), `7urriyye` (freedom), `ha2i2a` (truth) |
| Colors | 10 | `a7mar` (red), `abyad` (white), `akhdar` (green) |
| Animals | 9 | `3asfoor` (bird), `7san` (horse), `djej` (chicken) |
| Clothing | 5 | `badle` (suit), `fistan` (dress), `tyab` (clothes) |

That's 18 clean thematic buckets from keyword matching alone; a manual pass (or an LLM
classification pass over the full 2412-row translation list) would likely surface several more
implicit themes visible on manual inspection of the random 100-word sample pulled during this
analysis — e.g. **professions/roles** (designer, doctrine/ideology, general/public), **abstract
social/political vocabulary** (empathy, sustainability, resilience, mandate, investment,
charity) which is unusually well-represented for a "basic vocab" list, and **modern/tech
loanwords** (digital, dialect, university). Recommend targeting **18-22 units total**: the 18
keyword-confirmed themes above, plus 2-4 additional units for "modern/abstract vocabulary" and
"professions & roles" to mop up the higher-register words that don't fit concrete categories.

**Unit ordering recommendation**: since thematic grouping is only ~19% complete via automatic
means, use a **hybrid approach** — order the ~18-22 thematic units by the frequency-of-appearance-
in-sentences metric from section 4 (i.e., front-load units whose vocab words score highest on
average sentence-frequency) so early units reinforce words learners will actually recognize in
the sentence-building/word-bank exercises, then fill in low-sentence-frequency thematic units
(e.g. Colors, Clothing, Animals — lower average hits per word in section 4's top-20 list) later
as supplementary/optional units. The very-high-frequency function words (`bi`, `ma`, `ana`,
`3a`, `la`, `bas`, `ktir`, `fi`, `ma3`, `men` — see section 4) should form Unit 1 regardless of
theme, since they're grammatical scaffolding needed to parse almost every sentence in the corpus.

---

## 7. Rows to skip/clean — final checklist

No rows require deletion or repair. For completeness, the only two data-quality footnotes an
implementer should encode as explicit handling (not skip) are:

1. **conjugations.csv line 173** (`nisi,to forget,...`) — does not exact-match any
   `vocab.arabizi_word` (vocab has `yensa` instead, vocab.csv line 2168). Either add a manual
   alias mapping in the seed script or treat conjugations.csv rows as independently seedable
   (they already carry `english_meaning` and don't require a vocab.csv join to be useful).
2. **`sa7eb` homonym**: vocab.csv defines `sa7eb` = "friend" (noun); conjugations.csv defines
   `sa7eb` = "to pull/drag/withdraw" (verb). Same spelling, unrelated meanings — not an error,
   but don't auto-generate a "conjugate this vocab word" exercise linking the two, since it will
   present as a contradiction.

Everything else — headers, column counts, quoting, encoding, empty fields, whitespace, and
primary-key uniqueness on `arabizi_word` / `arabizi_sentence` / `base_verb` — checked out clean
across all 2412 + 1181 + 565 rows.
