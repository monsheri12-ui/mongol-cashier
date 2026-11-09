import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedAnswers, checkAnswer, explainDifference, formatAmount, normalizeAnswer } from '../dist/numbers.js';

// Literal fixtures were reviewed against the primary grammar sources recorded
// in MONGOLIAN-SOURCES.txt; none is calculated by the implementation under test.
const FIXTURES = [
  [0, 'тэг', 'тэг төгрөг'],
  [1, 'нэг', 'нэг төгрөг'],
  [2, 'хоёр', 'хоёр төгрөг'],
  [3, 'гурав', 'гурван төгрөг'],
  [4, 'дөрөв', 'дөрвөн төгрөг'],
  [5, 'тав', 'таван төгрөг'],
  [6, 'зургаа', 'зургаан төгрөг'],
  [7, 'долоо', 'долоон төгрөг'],
  [8, 'найм', 'найман төгрөг'],
  [9, 'ес', 'есөн төгрөг'],
  [10, 'арав', 'арван төгрөг'],
  [11, 'арван нэг', 'арван нэгэн төгрөг'],
  [20, 'хорь', 'хорин төгрөг'],
  [30, 'гуч', 'гучин төгрөг'],
  [40, 'дөч', 'дөчин төгрөг'],
  [50, 'тавь', 'тавин төгрөг'],
  [60, 'жар', 'жаран төгрөг'],
  [70, 'дал', 'далан төгрөг'],
  [80, 'ная', 'наян төгрөг'],
  [90, 'ер', 'ерэн төгрөг'],
  [46, 'дөчин зургаа', 'дөчин зургаан төгрөг'],
  [78, 'далан найм', 'далан найман төгрөг'],
  [100, 'зуу', 'зуун төгрөг'],
  [101, 'зуун нэг', 'зуун нэгэн төгрөг'],
  [110, 'зуун арав', 'зуун арван төгрөг'],
  [200, 'хоёр зуу', 'хоёр зуун төгрөг'],
  [300, 'гурван зуу', 'гурван зуун төгрөг'],
  [500, 'таван зуу', 'таван зуун төгрөг'],
  [596, 'таван зуун ерэн зургаа', 'таван зуун ерэн зургаан төгрөг'],
  [721, 'долоон зуун хорин нэг', 'долоон зуун хорин нэгэн төгрөг'],
  [801, 'найман зуун нэг', 'найман зуун нэгэн төгрөг'],
  [999, 'есөн зуун ерэн ес', 'есөн зуун ерэн есөн төгрөг'],
  [1000, 'мянга', 'мянган төгрөг'],
  [1001, 'мянга нэг', 'мянга нэг төгрөг'],
  [1011, 'мянга арван нэг', 'мянга арван нэгэн төгрөг'],
  [1100, 'мянга зуу', 'мянга зуун төгрөг'],
  [1200, 'мянга хоёр зуу', 'мянга хоёр зуун төгрөг'],
  [5000, 'таван мянга', 'таван мянган төгрөг'],
  [10000, 'арван мянга', 'арван мянган төгрөг'],
  [10100, 'арван мянга зуу', 'арван мянга зуун төгрөг'],
  [11000, 'арван нэгэн мянга', 'арван нэгэн мянган төгрөг'],
  [12500, 'арван хоёр мянга таван зуу', 'арван хоёр мянга таван зуун төгрөг'],
  [21501, 'хорин нэгэн мянга таван зуун нэг', 'хорин нэгэн мянга таван зуун нэгэн төгрөг'],
  [65134, 'жаран таван мянга зуун гучин дөрөв', 'жаран таван мянга зуун гучин дөрвөн төгрөг'],
  [74255, 'далан дөрвөн мянга хоёр зуун тавин тав', 'далан дөрвөн мянга хоёр зуун тавин таван төгрөг'],
  [100000, 'зуун мянга', 'зуун мянган төгрөг'],
  [101001, 'зуун нэгэн мянга нэг', 'зуун нэгэн мянга нэг төгрөг'],
  [117431, 'зуун арван долоон мянга дөрвөн зуун гучин нэг', 'зуун арван долоон мянга дөрвөн зуун гучин нэгэн төгрөг'],
  [382746, 'гурван зуун наян хоёр мянга долоон зуун дөчин зургаа', 'гурван зуун наян хоёр мянга долоон зуун дөчин зургаан төгрөг'],
  [800000, 'найман зуун мянга', 'найман зуун мянган төгрөг'],
  [999999, 'есөн зуун ерэн есөн мянга есөн зуун ерэн ес', 'есөн зуун ерэн есөн мянга есөн зуун ерэн есөн төгрөг'],
];

test('independent fixtures: standalone and noun-bound forms across every magnitude', () => {
  for (const [amount, standalone, currency] of FIXTURES) {
    assert.equal(formatAmount(amount, 'number_only'), standalone, `${amount}: standalone`);
    assert.equal(formatAmount(amount, 'number_and_currency'), currency, `${amount}: currency`);
    assert.equal(checkAnswer(standalone, amount, 'number_only').correct, true);
    assert.equal(checkAnswer(currency, amount).correct, true);
  }
});

test('attested optional нэг is accepted at the correct hundred/thousand position', () => {
  const cases = [
    ['нэг зуу', 100, 'number_only'],
    ['нэг зуун төгрөг', 100, 'number_and_currency'],
    ['нэг зуун гучин дөрөв', 134, 'number_only'],
    ['нэг мянган төгрөг', 1000, 'number_and_currency'],
    ['нэг мянга нэг зуун төгрөг', 1100, 'number_and_currency'],
    ['мянга нэг зуун төгрөг', 1100, 'number_and_currency'],
    ['арван мянга нэг зуун төгрөг', 10100, 'number_and_currency'],
    ['нэг зуун мянган төгрөг', 100000, 'number_and_currency'],
    ['жаран таван мянга нэг зуун гучин дөрөв', 65134, 'number_only'],
  ];
  for (const [answer, amount, mode] of cases) assert.equal(checkAnswer(answer, amount, mode).correct, true, answer);
  assert.equal(checkAnswer('нэгэн мянган төгрөг', 1000).correct, false);
  assert.equal(checkAnswer('нэгэн зуун төгрөг', 100).correct, false);
  assert.equal(checkAnswer('нэг таван мянган төгрөг', 5000).correct, false);
});

test('нэгэн is contextual: compound one, x01 variation and singleton lower groups', () => {
  for (const [answer, amount] of [
    ['найман зуун нэг төгрөг', 801],
    ['найман зуун нэгэн төгрөг', 801],
    ['хорин нэгэн мянга таван зуун нэг төгрөг', 21501],
    ['хорин нэгэн мянга таван зуун нэгэн төгрөг', 21501],
    ['зуун нэг мянган төгрөг', 101000],
    ['зуун нэгэн мянган төгрөг', 101000],
  ]) assert.equal(checkAnswer(answer, amount).correct, true, answer);
  for (const [answer, amount] of [
    ['нэгэн төгрөг', 1],
    ['хоёр мянга нэгэн төгрөг', 2001],
    ['хорин нэг төгрөг', 21],
    ['хорин нэг мянган төгрөг', 21000],
  ]) assert.equal(checkAnswer(answer, amount).correct, false, answer);
});

test('normalization tolerates only case, whitespace and one harmless final stop', () => {
  assert.equal(normalizeAnswer(' \nТАВАН\t МЯНГАН  ТӨГРӨГ. \n'), 'таван мянган төгрөг');
  assert.equal(checkAnswer(' ТАВАН\u00a0МЯНГАН   ТӨГРӨГ . ', 5000).correct, true);
  assert.equal(normalizeAnswer(null), '');
  assert.equal(normalizeAnswer('дөрөв ө ү о у'), 'дөрөв ө ү о у');
  for (const answer of [
    'таван мянган төгрөг..', 'таван, мянган төгрөг', 'таван-мянган төгрөг',
    'таван мянган төгрөг!', 'таван мянган төгрөг。', 'таван\u200bмянган төгрөг',
  ]) assert.equal(checkAnswer(answer, 5000).correct, false, answer);
});

test('words and Mongolian Cyrillic are mandatory; no digits, symbols or transliteration', () => {
  for (const answer of [
    '5000', '5000 төгрөг', '5 мянган төгрөг', '٥٠٠٠ төгрөг',
    'таван мянган ₮', 'tavan myangan tugrug', 'таван мянган тoгрөг',
    'таван мянган тогрог', 'таван мянган төгрүг', 'дөрвөн мянган төгрөг',
    'таван мянган төгрөгүүд',
  ]) assert.equal(checkAnswer(answer, 5000).correct, false, answer);
});

test('wrong bound forms cannot pass even when their numerical value is unchanged', () => {
  const wrongForms = [
    ['тав мянган төгрөг', 5000],
    ['таван мянга төгрөг', 5000],
    ['таван зуу төгрөг', 500],
    ['таван мянган таван зуун төгрөг', 5500],
    ['арван хоёр мянган таван зуун төгрөг', 12500],
    ['арван мянган зуун төгрөг', 10100],
    ['хорь мянган төгрөг', 20000],
    ['гурван зуу хорин төгрөг', 320],
    ['гурван зуун хорь төгрөг', 320],
  ];
  for (const [answer, amount] of wrongForms) assert.equal(checkAnswer(answer, amount).correct, false, answer);
  for (const [answer, amount] of [['таван мянган', 5000], ['таван зуун', 500], ['арван', 10], ['гучин таван', 35]]) {
    assert.equal(checkAnswer(answer, amount, 'number_only').correct, false, answer);
  }
});

test('wrong amounts, ordering and missing words are rejected without fuzzy acceptance', () => {
  for (const [answer, amount] of [
    ['таван мянган төгрөг', 5001], ['тавин мянган төгрөг', 5000],
    ['таван зуун төгрөг', 5000], ['арван хоёр мянга тавин төгрөг', 12500],
    ['хоёр арван мянган төгрөг', 12000], ['арван мянга хоёр төгрөг', 12000],
    ['таван таван мянган төгрөг', 5000], ['төгрөг', 5000],
  ]) assert.equal(checkAnswer(answer, amount).correct, false, `${amount}: ${answer}`);
});

test('modes require their own exact grammar and currency presence', () => {
  for (const amount of [2, 5, 10, 21, 100, 5000, 10100, 12500]) {
    assert.equal(checkAnswer(formatAmount(amount, 'number_only'), amount).correct, false);
    assert.equal(checkAnswer(formatAmount(amount), amount, 'number_only').correct, false);
  }
});

test('diagnostics provide useful Russian guidance and word-level differences', () => {
  const result = checkAnswer('таван мянга төгрөг', 5000);
  assert.deepEqual(result.differences, [{ type: 'replace', actual: 'мянга', expected: 'мянган', index: 1 }]);
  assert.match(result.reason, /мянган/u);
  assert.equal(explainDifference('таван мянга төгрөг', 5000), result.reason);
  assert.match(explainDifference('таван мянган төгрөг', 6000), /другая сумма/u);
  assert.match(explainDifference('5000 төгрөг', 5000), /словами/u);
  assert.match(explainDifference('tavan', 5000), /кириллицу/u);
  assert.match(explainDifference('', 5000), /Введите/u);
  assert.equal(checkAnswer('таван мянган төгрөг', 5000).reason, 'Верно!');
  assert.deepEqual(checkAnswer('таван мянган төгрөг', 5000).differences, []);
});

test('zero is optional in gameplay but both documented words are accepted', () => {
  assert.equal(checkAnswer('ноль', 0, 'number_only').correct, true);
  assert.equal(checkAnswer('ноль төгрөг', 0).correct, true);
  assert.equal(checkAnswer('тэгэн төгрөг', 0).correct, false);
});

test('range and mode validation prevent silently spelling an invalid amount', () => {
  for (const amount of [-1, 0.5, 1000000, NaN, Infinity, '5000', null]) {
    assert.throws(() => formatAmount(amount), RangeError);
    assert.throws(() => checkAnswer('тав', amount), RangeError);
  }
  assert.throws(() => formatAmount(5000, 'currency'), RangeError);
  const variants = acceptedAnswers(1100);
  assert.equal(new Set(variants).size, variants.length);
  variants[0] = 'changed by caller';
  assert.equal(formatAmount(1100), 'мянга зуун төгрөг');
});

test('every amount through 999999 has the correct numerical value in both modes', () => {
  // Independent reader: sum lexical values while folding the two scale words.
  // It does not call the spelling engine or select grammatical endings.
  const values = new Map(Object.entries({
    тэг: 0, ноль: 0, нэг: 1, нэгэн: 1, хоёр: 2, гурав: 3, гурван: 3,
    дөрөв: 4, дөрвөн: 4, тав: 5, таван: 5, зургаа: 6, зургаан: 6,
    долоо: 7, долоон: 7, найм: 8, найман: 8, ес: 9, есөн: 9,
    арав: 10, арван: 10, хорь: 20, хорин: 20, гуч: 30, гучин: 30,
    дөч: 40, дөчин: 40, тавь: 50, тавин: 50, жар: 60, жаран: 60,
    дал: 70, далан: 70, ная: 80, наян: 80, ер: 90, ерэн: 90,
  }));
  function readWords(words) {
    let total = 0;
    let group = 0;
    for (const word of words.split(' ')) {
      if (word === 'төгрөг') continue;
      if (word === 'мянга' || word === 'мянган') {
        total += (group || 1) * 1000;
        group = 0;
      } else if (word === 'зуу' || word === 'зуун') {
        group = (group || 1) * 100;
      } else {
        assert.ok(values.has(word), `Unknown output word: ${word}`);
        group += values.get(word);
      }
    }
    return total + group;
  }
  for (let amount = 0; amount <= 999999; amount += 1) {
    for (const mode of ['number_only', 'number_and_currency']) {
      for (const answer of acceptedAnswers(amount, mode)) {
        assert.equal(readWords(answer), amount, `${amount}: ${answer}`);
        assert.equal(answer.trim(), answer);
        assert.equal(answer.includes('  '), false);
      }
    }
  }
});
