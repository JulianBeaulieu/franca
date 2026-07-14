import { UNIT_THEME_COLORS } from './config';
import type { SentenceRow, VocabRow } from './csv';
import { parseGloss } from './normalize';

export const UNIT_MAX_WORDS = 40;

/** High-frequency grammatical scaffolding — always Unit 1 (data-profile §6). */
const FUNCTION_WORDS = new Set<string>([
  'bi', 'ma', 'ana', '3a', 'la', 'bas', 'ktir', 'fi', 'ma3', 'men',
  'ta', 'shi', '3am', 'yom', 'yalli', 'kil', 'ba3ed', 'mish', 'nes', 'hiyye',
]);

/**
 * Ordered theme keyword lists (first match wins — see assignTheme). Originally derived
 * from data-profile §6 for the Lebanese Arabic course; broadened to cover common A1-B1
 * vocabulary shared across the German/Italian/Spanish/French courses (verbs of
 * communication/cognition/daily-routine, shopping, body/health, clothing, travel, etc).
 *
 * Matching is plain substring (`gloss.includes(keyword)`) against the English primary
 * gloss, so THEME ORDER MATTERS: a keyword that is a substring of an unrelated word
 * (e.g. "one" inside "phone", "ear" inside "to hear", "how" inside "to show") must be
 * reached only after the theme that should rightfully claim that unrelated word. Verb
 * keywords are written as full "to X" phrases (matching the original convention) since
 * that avoids most accidental collisions with nouns/adjectives that merely contain the
 * bare verb stem (e.g. "to show" vs. "shower", "to clean" vs. "clean"). Where a bare
 * noun keyword is unavoidably collision-prone (e.g. "hen" inside "then", "bee" inside
 * "beer", "hi" inside "which"), it has been left out rather than risk an absurd
 * cross-theme misassignment — those words fall through to "More vocabulary".
 */
const THEME_KEYWORDS: { theme: string; keywords: string[] }[] = [
  {
    // First so 'teacher' beats Food's 'tea', 'backpack' beats Body's 'back', and
    // 'business' beats Travel's 'bus'. No bare 'pen' — it would swallow "open",
    // "expensive", and "to happen".
    theme: 'Work & school',
    keywords: [
      'work', 'school', 'lesson', 'book', 'pencil', 'notebook', 'teacher', 'student', 'office', 'study',
      'to teach', 'to learn', 'exam', 'university', 'class', 'page', 'professor', 'pupil', 'homework',
      'grade', 'diploma', 'question', 'library', 'story', 'history', 'backpack', 'business', 'research',
    ],
  },
  {
    // Before Animals so 'million' is not swallowed by 'lion', and before Numbers
    // ("money" contains "one") and Travel ("card" contains "car").
    theme: 'Money & shopping',
    keywords: [
      'pay', 'buy', 'sell', 'shop', 'money', 'price', 'bill', 'market', 'cost', 'discount', 'receipt',
      'cash', 'purchase', 'card', 'cheap', 'expensive', 'euro', 'to spend', 'million',
    ],
  },
  {
    // Before Food & drink: "butterfly" contains "butter".
    theme: 'Animals',
    keywords: [
      'bird', 'horse', 'dog', 'cat', 'chicken', 'animal', 'fish', 'cow', 'pig', 'sheep', 'bear', 'lion',
      'mouse', 'rabbit', 'elephant', 'tiger', 'monkey', 'snake', 'spider', 'insect', 'butterfly', 'duck',
      'mosquito',
    ],
  },
  {
    // Before House & furniture ("vegetable" contains "table"), Time & calendar
    // ("chocolate"/"plate" contain "late"), and Numbers ("honey" contains "one").
    // 'to eat' not bare 'eat' — "weather" and "theater" contain "eat".
    theme: 'Food & drink',
    keywords: [
      'food', 'to eat', 'drink', 'coffee', 'milk', 'bread', 'water', 'meal', 'fruit', 'meat', 'sugar',
      'egg', 'cheese', 'vegetable', 'apple', 'tomato', 'potato', 'rice', 'pasta', 'pizza', 'dessert',
      'sweet', 'ice cream', 'chocolate', 'breakfast', 'lunch', 'dinner', 'dish', 'plate', 'cup', 'fork',
      'knife', 'restaurant', 'hunger', 'hungry', 'thirst', 'thirsty', 'honey', 'wine', 'beer', 'juice',
      'tea', 'salt', 'onion', 'banana', 'carrot', 'strawberry', 'soup', 'salad', 'butter', 'cake',
      'pepper', 'oil', 'wheat', 'ingredient', 'yogurt',
    ],
  },
  {
    // Before Family & people ("moment" contains "mom"), Numbers ("often" contains
    // "ten"), and Nature ("Sunday" contains "sun" but also "day").
    theme: 'Time & calendar',
    keywords: [
      'day', 'month', 'year', 'time', 'week', 'hour', 'morning', 'night', 'holiday', 'today', 'tomorrow',
      'yesterday', 'afternoon', 'evening', 'spring', 'summer', 'autumn', 'winter', 'minute', 'early',
      'late', 'soon', 'immediately', 'always', 'sometimes', 'already', 'still', 'finally', 'next', 'last',
      'often', 'moment', 'birthday', 'date', 'weekend', 'since', 'during', 'january', 'february', 'march',
      'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    ],
  },
  {
    // Indefinite person words ('someone', 'nobody', ...) live here so Numbers' "one"
    // does not swallow them.
    theme: 'Family & people',
    keywords: [
      'family', 'mother', 'father', 'brother', 'sister', 'uncle', 'aunt', 'son', 'daughter', 'child',
      'friend', 'wife', 'husband', 'grandma', 'grandpa', 'cousin', 'dad', 'mom', 'neighbor', 'colleague',
      'boss', 'customer', 'employee', 'waiter', 'boy', 'girl', 'baby', 'people', 'partner', 'someone',
      'everyone', 'anyone', 'nobody', 'no one',
    ],
  },
  {
    // Before Communication & tech: "to shower" contains "to show". Before Clothing:
    // "to get dressed" contains "dress".
    theme: 'Daily routine',
    keywords: ['to wake', 'to sleep', 'to wash', 'to shower', 'to get up', 'to get dressed', 'to rest', 'to brush', 'to sit', 'to stand'],
  },
  {
    // Before Clothing ("address" contains "dress"), Body parts ("to hear" contains
    // "ear"), Numbers ("to listen" contains "ten"), and Nature ("electricity" contains
    // "city"). 'to read' not bare 'read' — "bread" and "already" contain "read".
    theme: 'Communication & tech',
    keywords: [
      'say', 'talk', 'speak', 'call', 'phone', 'write', 'to read', 'letter', 'word', 'to ask', 'answer',
      'to tell', 'to explain', 'to show', 'to listen', 'to hear', 'to greet', 'name', 'message', 'email',
      'computer', 'internet', 'website', 'video', 'television', 'photo', 'conversation', 'language',
      'voice', 'address', 'electric',
    ],
  },
  {
    // Before Emotions & feelings ("glove" contains "love"), Body parts ("wear"
    // contains "ear"), Travel ("scarf" contains "car"), and Prepositions ("underwear"
    // contains "under"). No bare 'hat' — it would swallow "that" and "what".
    theme: 'Clothing',
    keywords: ['suit', 'dress', 'clothes', 'clothing', 'shirt', 'shoe', 'belt', 'coat', 'jacket', 'pants', 'skirt', 'sock', 'scarf', 'glove', 'wear'],
  },
  {
    // Cognition + emotion verbs. Before Prepositions ("to understand" contains
    // "under"). Bare 'think' (not 'to think') so "thinking" lands here too.
    theme: 'Emotions & feelings',
    keywords: [
      'love', 'happy', 'sad', 'angry', 'afraid', 'worry', 'feel', 'hope', 'fear', 'think', 'to know',
      'to believe', 'to understand', 'to want', 'to like', 'to hate', 'to prefer', 'to need', 'need',
      'to remember', 'to forget', 'to seem', 'to wish', 'desire', 'to dream', 'dream', 'anger', 'emotion',
      'joy', 'surprise', 'happiness', 'trust', 'truth',
    ],
  },
  {
    theme: 'Verbs of motion',
    keywords: ['to go', 'to come', 'to enter', 'to leave', 'to walk', 'to run', 'to return', 'to arrive', 'to move', 'to travel', 'to drive', 'to fly', 'to swim', 'to fall', 'to jump', 'to climb'],
  },
  {
    // The generic "to X" bucket: high-frequency action verbs that do not fit a more
    // specific theme. Before Adjectives ("to clean" contains "clean", "to open"
    // contains "open"), Body parts ("to search"/"to appear" contain "ear"), Colors
    // ("to reduce" contains "red"), and Nature ("to start" contains "star").
    theme: 'Common verbs & actions',
    keywords: [
      'to do', 'to make', 'to have', 'to give', 'to take', 'to put', 'to get', 'to become', 'to stay',
      'to remain', 'to try', 'to use', 'to help', 'to find', 'to begin', 'to start', 'to finish', 'to end',
      'to continue', 'to stop', 'to choose', 'to accept', 'to allow', 'to build', 'to break', 'to fix',
      'to grow', 'to lose', 'to win', 'to send', 'to receive', 'to bring', 'to let', 'to keep', 'to happen',
      'to occur', 'to change', 'to increase', 'to improve', 'to protect', 'to produce', 'to solve',
      'to serve', 'to achieve', 'to touch', 'to pass', 'to raise', 'to cut', 'to count', 'to compare',
      'to consider', 'to describe', 'to discover', 'to exist', 'to follow', 'to form', 'to interest',
      'to offer', 'to prepare', 'to present', 'to promise', 'to reach', 'to recognize', 'to refuse',
      'to suppose', 'to turn out', 'to celebrate', 'to invite', 'to heal', 'to cough', 'to snow',
      'to carry', 'to depart', 'to plan', 'to belong', 'to mean', 'to introduce', 'to imagine', 'to lie',
      'to shine', 'to set', 'to sing', 'to laugh', 'to cry', 'to smile', 'to dance', 'to visit', 'to look',
      'to meet', 'to die', 'to be born', 'to close', 'to open', 'to clean', 'to cook', 'to check',
      'to search', 'to appear', 'to reduce',
    ],
  },
  {
    // Before Question words ("whole" contains "who"), House ("comfortable" contains
    // "table"), Body parts ("clear"/"warm" contain "ear"/"arm"), Numbers ("alone"
    // contains "one"), Colors ("bored"/"tired" contain "red"), and Travel ("busy"
    // contains "bus", "scary" contains "car"). No bare 'hot' — it would swallow
    // "hotel".
    theme: 'Adjectives',
    keywords: [
      'nice', 'beautiful', 'old', 'new', 'big', 'small', 'good', 'bad', 'tall', 'short', 'hard', 'easy',
      'difficult', 'important', 'interesting', 'likeable', 'strong', 'clean', 'dirty', 'empty', 'full',
      'free', 'quiet', 'busy', 'boring', 'funny', 'pretty', 'dangerous', 'delicious', 'narrow', 'wide',
      'weak', 'thin', 'fat', 'kind', 'serious', 'favorite', 'intelligent', 'calm', 'delighted', 'poor',
      'rich', 'young', 'high', 'low', 'cold', 'fast', 'slow', 'near', 'far', 'clear', 'bored', 'tired',
      'alone', 'other', 'whole', 'careful', 'care', 'natural', 'direct', 'simple', 'safe', 'certain',
      'right', 'wrong', 'warm', 'shared', 'retired', 'scary', 'open', 'comfortable',
    ],
  },
  {
    theme: 'Question words',
    keywords: ['who', 'what', 'where', 'when', 'why', 'how', 'which'],
  },
  {
    // Before Body parts ("chair" contains "hair") and Nature ("window" contains
    // "wind").
    theme: 'House & furniture',
    keywords: [
      'house', 'room', 'door', 'wall', 'window', 'table', 'chair', 'bed', 'kitchen', 'bathroom',
      'apartment', 'sofa', 'lamp', 'mirror', 'closet', 'key', 'basement', 'roof', 'garage', 'shelf',
      'rug', 'stairs', 'wardrobe',
    ],
  },
  {
    // Before Body parts: "pharmacy" contains "arm". 'illness' not bare 'ill' — it
    // would swallow "village", "skill", and "to kill". No 'flu' — "influence"
    // contains it.
    theme: 'Health & body',
    keywords: ['doctor', 'medicine', 'sick', 'health', 'pain', 'hospital', 'illness', 'fever', 'prescription', 'pharmacy'],
  },
  {
    // Before Numbers & quantities: "bone" contains "one".
    theme: 'Body parts',
    keywords: ['heart', 'hand', 'eye', 'head', 'foot', 'leg', 'arm', 'face', 'hair', 'mouth', 'ear', 'nose', 'finger', 'knee', 'shoulder', 'tooth', 'tongue', 'chest', 'skin', 'stomach', 'neck', 'back', 'bone'],
  },
  {
    // Before Nature & places: "train" contains "rain".
    theme: 'Travel',
    keywords: ['airport', 'airplane', 'ticket', 'hotel', 'passport', 'taxi', 'subway', 'bus', 'bicycle', 'trip', 'station', 'boat', 'car', 'luggage', 'train'],
  },
  {
    // Before Numbers & quantities: "stone" contains "one".
    theme: 'Nature & places',
    keywords: [
      'sea', 'land', 'sun', 'rain', 'storm', 'wind', 'mountain', 'river', 'tree', 'sky', 'weather',
      'city', 'village', 'town', 'street', 'road', 'beach', 'forest', 'cloud', 'snow', 'star', 'moon',
      'grass', 'field', 'corner', 'lake', 'island', 'park', 'garden', 'stone', 'thunder',
    ],
  },
  {
    // Before Colors: "hundred" contains "red".
    theme: 'Numbers & quantities',
    keywords: [
      'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
      'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
      'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'zero',
      'many', 'few', 'much', 'number', 'first', 'second', 'third',
    ],
  },
  {
    theme: 'Colors',
    keywords: ['red', 'white', 'green', 'blue', 'black', 'yellow', 'color', 'brown', 'gray', 'orange', 'pink', 'purple'],
  },
  {
    theme: 'Religion & holidays',
    keywords: ['church', 'god', 'easter', 'pray', 'holy', 'feast'],
  },
  {
    theme: 'Prepositions & location',
    keywords: ['against', 'between', 'behind', 'next to', 'under', 'over', 'through', 'around', 'in front of', 'toward', 'inside', 'outside', 'down', 'without'],
  },
  {
    theme: 'Greetings & courtesy',
    keywords: ['thank you', 'hello', 'bye', 'please', 'excuse me', 'sorry', "you're welcome", 'welcome'],
  },
];

const DESCRIPTIONS: Record<string, string> = {
  'Everyday essentials': 'Core function words used in almost every sentence.',
  'Daily routine': 'Verbs for everyday routines like waking, washing, and resting.',
  'Common verbs & actions': 'High-frequency action verbs used in everyday sentences.',
  'Question words': 'Words used to ask questions.',
  'Travel': 'Words for getting around — airports, hotels, and tickets.',
  'Prepositions & location': 'Words that describe where something is.',
  'Greetings & courtesy': 'Common greetings and polite expressions.',
};

export interface RankedVocab {
  arabiziWord: string;
  englishTranslation: string;
  primaryGloss: string;
  acceptedAnswers: string[];
  sentenceFreq: number;
  freqRank: number;
  theme: string;
  isVerb: boolean;
  isPhrase: boolean;
  lengthBucket: string;
}

export interface UnitPlan {
  ordinal: number;
  title: string;
  description: string;
  themeColor: string;
  words: string[];
}

export function tokenizeSentence(s: string): string[] {
  // Unicode-aware letter class (\p{L}) so accented content (German ß/ü,
  // French/Italian/Spanish accents, transliteration marks like é/ī/ḥ) is not
  // dropped or truncated. Digits and apostrophes keep their original semantics:
  // ASCII digits still tokenize as before and an apostrophe stays inside a token
  // (e.g. "l'acqua" is one token), so pure-ASCII/arabizi output is byte-identical.
  return s.toLowerCase().match(/[\p{L}0-9']+/gu) ?? [];
}

export function computeSentenceFrequencies(
  vocab: VocabRow[],
  sentences: SentenceRow[],
): Map<string, number> {
  const freq = new Map<string, number>();
  for (const v of vocab) freq.set(v.arabiziWord.toLowerCase(), 0);
  for (const s of sentences) {
    const seen = new Set(tokenizeSentence(s.arabiziSentence));
    for (const token of seen) {
      const cur = freq.get(token);
      if (cur !== undefined) freq.set(token, cur + 1);
    }
  }
  return freq;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function lengthBucket(word: string): string {
  const n = word.length;
  if (n <= 3) return '1-3';
  if (n <= 5) return '4-5';
  if (n <= 7) return '6-7';
  if (n <= 9) return '8-9';
  return '10+';
}

function assignTheme(word: string, gloss: string): string {
  if (FUNCTION_WORDS.has(word.toLowerCase())) return 'Everyday essentials';
  const g = gloss.toLowerCase();
  for (const { theme, keywords } of THEME_KEYWORDS) {
    if (keywords.some((k) => g.includes(k))) return theme;
  }
  return 'More vocabulary';
}

export function rankVocab(vocab: VocabRow[], sentences: SentenceRow[]): RankedVocab[] {
  const freq = computeSentenceFrequencies(vocab, sentences);
  const enriched = vocab.map((v, originalIndex) => {
    const { primary, accepted } = parseGloss(v.englishTranslation);
    const sentenceFreq = freq.get(v.arabiziWord.toLowerCase()) ?? 0;
    return {
      arabiziWord: v.arabiziWord,
      englishTranslation: v.englishTranslation,
      primaryGloss: primary,
      acceptedAnswers: accepted,
      sentenceFreq,
      isVerb: v.englishTranslation.trim().toLowerCase().startsWith('to '),
      isPhrase: v.arabiziWord.includes(' '),
      lengthBucket: lengthBucket(v.arabiziWord),
      theme: assignTheme(v.arabiziWord, primary),
      originalIndex,
    };
  });

  const sorted = [...enriched].sort((a, b) => {
    if (b.sentenceFreq !== a.sentenceFreq) return b.sentenceFreq - a.sentenceFreq;
    if (a.sentenceFreq > 0) return compareStrings(a.arabiziWord, b.arabiziWord);
    return a.originalIndex - b.originalIndex;
  });

  return sorted.map((e, i) => ({
    arabiziWord: e.arabiziWord,
    englishTranslation: e.englishTranslation,
    primaryGloss: e.primaryGloss,
    acceptedAnswers: e.acceptedAnswers,
    sentenceFreq: e.sentenceFreq,
    freqRank: i + 1,
    theme: e.theme,
    isVerb: e.isVerb,
    isPhrase: e.isPhrase,
    lengthBucket: e.lengthBucket,
  }));
}

export function buildUnits(ranked: RankedVocab[]): {
  units: UnitPlan[];
  vocabUnit: Map<string, { ordinal: number; order: number }>;
} {
  const byTheme = new Map<string, RankedVocab[]>();
  for (const r of ranked) {
    const list = byTheme.get(r.theme) ?? [];
    list.push(r);
    byTheme.set(r.theme, list);
  }
  for (const list of byTheme.values()) list.sort((a, b) => a.freqRank - b.freqRank);

  const avgFreq = (list: RankedVocab[]): number =>
    list.reduce((sum, r) => sum + r.sentenceFreq, 0) / Math.max(1, list.length);

  const themeOrder = [...byTheme.keys()].sort((a, b) => {
    if (a === 'Everyday essentials') return -1;
    if (b === 'Everyday essentials') return 1;
    const listA = byTheme.get(a) ?? [];
    const listB = byTheme.get(b) ?? [];
    const diff = avgFreq(listB) - avgFreq(listA);
    if (diff !== 0) return diff;
    return compareStrings(a, b);
  });

  const units: UnitPlan[] = [];
  const vocabUnit = new Map<string, { ordinal: number; order: number }>();
  let ordinal = 0;

  for (const theme of themeOrder) {
    const list = byTheme.get(theme) ?? [];
    for (let start = 0; start < list.length; start += UNIT_MAX_WORDS) {
      const chunk = list.slice(start, start + UNIT_MAX_WORDS);
      ordinal += 1;
      const partNumber = String(Math.floor(start / UNIT_MAX_WORDS) + 1);
      const part = list.length > UNIT_MAX_WORDS ? ` (part ${partNumber})` : '';
      const title = `${theme}${part}`;
      const words = chunk.map((r) => r.arabiziWord);
      chunk.forEach((r, i) => vocabUnit.set(r.arabiziWord, { ordinal, order: i }));
      units.push({
        ordinal,
        title,
        description: DESCRIPTIONS[theme] ?? `Learn words about ${theme.toLowerCase()}.`,
        themeColor: UNIT_THEME_COLORS[(ordinal - 1) % UNIT_THEME_COLORS.length] ?? '#58CC02',
        words,
      });
    }
  }
  return { units, vocabUnit };
}
