/** Printed receipt language is independent of the exercise answer format. */
const COPY = {
  ru: { lang: 'ru', store: 'Монгольский магазин', receipt: 'Чек', purchase: 'Покупка', amount: 'Сумма', total: 'Итого', due: 'К оплате', paid: 'Оплачен' },
  mn: { lang: 'mn', store: 'Монгол дэлгүүр', receipt: 'Баримт', purchase: 'Барааны нэр', amount: 'Дүн', total: 'Нийт дүн', due: 'Төлөх дүн', paid: 'Төлөгдсөн' },
};

const UNITS = { 'шт.': 'ш', 'уп.': 'ш', 'бут.': 'ш', 'пак.': 'ш', 'бух.': 'ш', 'плит.': 'ш', 'кочан': 'ш', 'бан.': 'ш', 'стак.': 'ш', 'связ.': 'багц', 'кг': 'кг', 'л': 'л' };

export function receiptCopy(receipt) {
  return COPY[receipt?.receiptLanguage === 'mn' ? 'mn' : 'ru'];
}

export function receiptUnit(item, receipt) {
  if (receipt?.receiptLanguage === 'mn') {
    if (item.productId === 'banana') return 'багц';
    return UNITS[item.unit] || item.unit;
  }
  return item.productId === 'banana' ? 'связ.' : item.unit;
}

export function receiptName(item, receipt) {
  return item.productId === 'banana' && receipt?.productLanguage !== 'mn' ? 'Бананы, связка' : item.name;
}
