/**
 * Modern Khalkha Mongolian cardinal numbers, 0–999999.
 * Source decisions and accepted grammatical alternatives: ../MONGOLIAN-SOURCES.txt.
 * Acceptance uses complete grammatical strings, never a fuzzy spelling match.
 */
const FREE_UNITS = ['', 'нэг', 'хоёр', 'гурав', 'дөрөв', 'тав', 'зургаа', 'долоо', 'найм', 'ес'];
const BOUND_UNITS = ['', 'нэг', 'хоёр', 'гурван', 'дөрвөн', 'таван', 'зургаан', 'долоон', 'найман', 'есөн'];
const FREE_TENS = ['', 'арав', 'хорь', 'гуч', 'дөч', 'тавь', 'жар', 'дал', 'ная', 'ер'];
const BOUND_TENS = ['', 'арван', 'хорин', 'гучин', 'дөчин', 'тавин', 'жаран', 'далан', 'наян', 'ерэн'];
const MODES = new Set(['number_only', 'number_and_currency']);
const CYRILLIC_WORDS = /^[\p{Script=Cyrillic} ]+$/u;
const MAX_ANSWER_LENGTH = 500;

function validate(amount, mode) {
  if (!Number.isInteger(amount) || amount < 0 || amount > 999999) {
    throw new RangeError('Сумма должна быть целым числом от 0 до 999999.');
  }
  if (!MODES.has(mode)) {
    throw new RangeError('Неизвестный режим записи числа.');
  }
}

const join = (...parts) => parts.filter(Boolean).join(' ');
const unique = values => [...new Set(values)];

/** All attested alternatives of one group. bound means it modifies a noun/scale. */
function groupVariants(value, bound) {
  if (value < 10) return [bound ? BOUND_UNITS[value] : FREE_UNITS[value]];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const units = value % 10;
    if (!units) return [bound ? BOUND_TENS[tens] : FREE_TENS[tens]];
    const last = bound && units === 1 ? 'нэгэн' : (bound ? BOUND_UNITS[units] : FREE_UNITS[units]);
    return [join(BOUND_TENS[tens], last)];
  }

  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  // нэг may be present or omitted before зуу; it does not become нэгэн here.
  const multipliers = hundreds === 1 ? ['', 'нэг'] : [BOUND_UNITS[hundreds]];
  const hundredWord = rest || bound ? 'зуун' : 'зуу';
  // In x01 used before a noun, both нэгэн and нэг are documented.
  const endings = !rest ? [''] : bound && rest === 1 ? ['нэгэн', 'нэг'] : groupVariants(rest, bound);
  return multipliers.flatMap(multiplier => endings.map(ending => join(multiplier, hundredWord, ending)));
}

function numberVariants(amount, bound) {
  if (amount === 0) return ['тэг', 'ноль'];
  if (amount < 1000) return groupVariants(amount, bound);
  const thousands = Math.floor(amount / 1000);
  const rest = amount % 1000;
  // мянга takes -н only when it directly modifies the following noun.
  // Before lower number groups it always remains мянга.
  const scale = bound && rest === 0 ? 'мянган' : 'мянга';
  const multipliers = thousands === 1 ? ['', 'нэг'] : groupVariants(thousands, true);
  const endings = rest ? groupVariants(rest, bound) : [''];
  return unique(multipliers.flatMap(multiplier => endings.map(ending => join(multiplier, scale, ending))));
}

/** Canonical lower-case answer. Optional нэг is omitted in the canonical form. */
export function formatAmount(amount, mode = 'number_and_currency') {
  return acceptedAnswers(amount, mode)[0];
}

/** Returns independent copies of complete accepted word strings, canonical first. */
export function acceptedAnswers(amount, mode = 'number_and_currency') {
  validate(amount, mode);
  const bound = mode === 'number_and_currency';
  return numberVariants(amount, bound).map(words => bound ? `${words} төгрөг` : words);
}

/** Only case, whitespace and one final ASCII full stop are ignored. */
export function normalizeAnswer(text) {
  return String(text ?? '').normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim().replace(/\.$/u, '').trim();
}

const FAMILIES = new Map();
for (let i = 1; i < 10; i += 1) {
  FAMILIES.set(FREE_UNITS[i], i);
  FAMILIES.set(BOUND_UNITS[i], i);
  FAMILIES.set(FREE_TENS[i], i * 10);
  FAMILIES.set(BOUND_TENS[i], i * 10);
}
for (const [word, value] of [['нэгэн', 1], ['зуу', 100], ['зуун', 100], ['мянга', 1000], ['мянган', 1000], ['тэг', 0], ['ноль', 0]]) {
  FAMILIES.set(word, value);
}

function wordDifferences(actualText, expectedText) {
  const actual = actualText ? actualText.split(' ') : [];
  const expected = expectedText.split(' ');
  const distance = Array.from({ length: actual.length + 1 }, () => Array(expected.length + 1).fill(0));
  for (let i = 0; i <= actual.length; i += 1) distance[i][0] = i;
  for (let j = 0; j <= expected.length; j += 1) distance[0][j] = j;
  for (let i = 1; i <= actual.length; i += 1) {
    for (let j = 1; j <= expected.length; j += 1) {
      distance[i][j] = Math.min(
        distance[i - 1][j] + 1,
        distance[i][j - 1] + 1,
        distance[i - 1][j - 1] + (actual[i - 1] === expected[j - 1] ? 0 : 1)
      );
    }
  }
  const differences = [];
  let i = actual.length;
  let j = expected.length;
  while (i || j) {
    if (i && j && actual[i - 1] === expected[j - 1]) { i -= 1; j -= 1; continue; }
    if (i && j && distance[i][j] === distance[i - 1][j - 1] + 1) {
      differences.push({ type: 'replace', actual: actual[i - 1], expected: expected[j - 1], index: i - 1 });
      i -= 1; j -= 1;
    } else if (j && distance[i][j] === distance[i][j - 1] + 1) {
      differences.push({ type: 'missing', actual: '', expected: expected[j - 1], index: i });
      j -= 1;
    } else {
      differences.push({ type: 'extra', actual: actual[i - 1], expected: '', index: i - 1 });
      i -= 1;
    }
  }
  return differences.reverse();
}

function closestDifferences(text, answers) {
  let best = null;
  let bestScore = Infinity;
  for (const answer of answers) {
    const differences = wordDifferences(text, answer);
    // Prefer a same-value form correction over an unrelated number word on ties.
    const score = differences.reduce((sum, item) => sum + (
      item.type === 'replace' && FAMILIES.has(item.actual) && FAMILIES.get(item.actual) === FAMILIES.get(item.expected) ? 0.8 : 1
    ), 0);
    if (score < bestScore) { best = differences; bestScore = score; }
  }
  return best;
}

function grammarExplanation(difference, canonical, mode) {
  const { actual, expected } = difference;
  if (actual === 'мянган' && expected === 'мянга') {
    return `Здесь нужна форма «мянга»: перед меньшими разрядами и в конце самостоятельного числа она пишется без н. Правильно: «${canonical}».`;
  }
  if (expected === 'мянган') {
    return `Непосредственно перед «төгрөг» нужна форма «мянган». Правильно: «${canonical}».`;
  }
  if (expected === 'зуун') {
    return `Перед следующим числительным или существительным нужна форма «зуун». Правильно: «${canonical}».`;
  }
  if (mode === 'number_only' && canonical.split(' ').at(-1) === expected && [...FREE_UNITS, ...FREE_TENS, 'зуу', 'мянга'].includes(expected)) {
    return `В конце самостоятельного числа нужна форма «${expected}», а не «${actual}». Правильно: «${canonical}».`;
  }
  if (expected === 'нэгэн') {
    return `В этой составной трёхзначной группе перед следующим словом нужна форма «нэгэн». Правильно: «${canonical}».`;
  }
  if (expected === 'нэг') {
    return `Когда трёхзначная группа равна единице, используется «нэг». Правильно: «${canonical}».`;
  }
  return `Проверьте форму числительного: здесь нужно «${expected}», а не «${actual}». Правильно: «${canonical}».`;
}

function reasonFor(text, canonical, mode, differences) {
  if (!text) return 'Введите сумму монгольскими словами.';
  if (text.length > MAX_ANSWER_LENGTH) return `Ответ слишком длинный. Запишите только сумму: «${canonical}».`;
  if (/\p{N}/u.test(text)) return `Запишите сумму словами: «${canonical}». Цифры в этом упражнении не засчитываются.`;
  if (/\p{Script=Latin}/u.test(text)) return `Используйте монгольскую кириллицу: «${canonical}». Латинская транслитерация не засчитывается.`;
  if (!CYRILLIC_WORDS.test(text)) return `Запишите только монгольские слова через пробел. Допустима одна точка в конце. Правильно: «${canonical}».`;
  const words = text.split(' ');
  if (mode === 'number_and_currency' && !words.includes('төгрөг')) {
    return `В режиме «С валютой» напишите сумму вместе со словом «төгрөг» и проверьте форму перед ним: «${canonical}».`;
  }
  if (mode === 'number_only' && words.includes('төгрөг')) {
    return `В режиме «Только число» ответ заканчивается самим числительным: «${canonical}».`;
  }
  const formErrors = differences.filter(item => item.type === 'replace' && FAMILIES.has(item.actual) && FAMILIES.get(item.actual) === FAMILIES.get(item.expected));
  if (formErrors.length && formErrors.length === differences.length) {
    return grammarExplanation(formErrors[0], canonical, mode);
  }
  if (differences.some(item => item.type === 'replace' && FAMILIES.has(item.actual) && FAMILIES.has(item.expected))) {
    return `Получилась другая сумма. Проверьте тысячи, сотни, десятки и единицы. Нужная запись: «${canonical}».`;
  }
  if (differences.length === 1) {
    const item = differences[0];
    if (item.type === 'replace') return `Проверьте написание: нужно «${item.expected}» вместо «${item.actual}». Буквы ө, о, ү и у различаются. Правильно: «${canonical}».`;
    if (item.type === 'missing') return `Пропущено слово «${item.expected}». Правильно: «${canonical}».`;
    return `Лишнее слово «${item.actual}». Правильно: «${canonical}».`;
  }
  return `Проверьте состав и порядок слов. Нужная запись: «${canonical}».`;
}

/**
 * reason is a Russian learner-facing string. differences contains zero-based
 * input word indexes and compares with the closest accepted complete variant.
 */
export function checkAnswer(text, amount, mode = 'number_and_currency') {
  const answers = acceptedAnswers(amount, mode);
  const canonical = answers[0];
  const normalized = normalizeAnswer(text);
  const correct = answers.includes(normalized);
  const differences = correct ? [] : closestDifferences(normalized.slice(0, MAX_ANSWER_LENGTH + 1), answers);
  return {
    correct,
    canonical,
    normalized,
    reason: correct ? 'Верно!' : reasonFor(normalized, canonical, mode, differences),
    differences,
  };
}

export function explainDifference(text, amount, mode = 'number_and_currency') {
  return checkAnswer(text, amount, mode).reason;
}
