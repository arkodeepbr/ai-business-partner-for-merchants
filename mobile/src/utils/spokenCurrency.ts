const englishSmall = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const englishTens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const hindiSmall = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह',
  'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस', 'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस',
  'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस', 'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस',
  'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस', 'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चवालीस',
  'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास', 'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन',
  'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ', 'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ',
  'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर', 'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर',
  'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उन्नासी', 'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी',
  'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी', 'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पंचानवे',
  'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे',
];

const englishUnits = [
  {value: 10_000_000, word: 'crore'},
  {value: 100_000, word: 'lakh'},
  {value: 1_000, word: 'thousand'},
  {value: 100, word: 'hundred'},
];
const hindiUnits = [
  {value: 10_000_000, word: 'करोड़'},
  {value: 100_000, word: 'लाख'},
  {value: 1_000, word: 'हज़ार'},
  {value: 100, word: 'सौ'},
];

function numberWords(value: number, hindi: boolean, firstUnit = 0): string {
  const small = hindi ? hindiSmall : englishSmall;
  const tens = englishTens;
  if (value < 20) return small[value] ?? String(value);
  if (!hindi && value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? `-${small[value % 10]}` : ''}`;
  if (hindi && value < 100) return hindiSmall[value] ?? String(value);
  const units = hindi ? hindiUnits : englishUnits;
  for (let index = firstUnit; index < units.length; index++) {
    const unit = units[index];
    if (value >= unit.value) {
      const count = Math.floor(value / unit.value);
      const remainder = value % unit.value;
      const countWords = numberWords(count, hindi, index + 1);
      return `${countWords} ${unit.word}${remainder ? ` ${numberWords(remainder, hindi, index + 1)}` : ''}`;
    }
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const hundredWord = hindi ? 'सौ' : 'hundred';
  const base = `${small[hundreds]} ${hundredWord}`;
  return rest ? `${base} ${numberWords(rest, hindi)}` : base;
}

function spokenRupees(rawAmount: string, hindi: boolean): string {
  const westernDigits = rawAmount.replace(/[०-९]/g, digit => String('०१२३४५६७८९'.indexOf(digit)));
  const [wholeText, fractionText = ''] = westernDigits.replace(/,/g, '').split('.');
  const parsedWhole = Number.parseInt(wholeText, 10);
  if (!Number.isSafeInteger(parsedWhole) || parsedWhole > 999_999_999_999) return `${rawAmount} ${hindi ? 'रुपये' : 'rupees'}`;

  const negative = parsedWhole < 0;
  const whole = Math.abs(parsedWhole);
  const paise = Number((fractionText + '00').slice(0, 2));
  const wholeWords = numberWords(whole, hindi);
  let result: string;
  if (hindi) {
    result = `${wholeWords} ${whole === 1 ? 'रुपया' : 'रुपये'}`;
    if (paise) result += ` और ${numberWords(paise, true)} ${paise === 1 ? 'पैसा' : 'पैसे'}`;
    if (negative) result = `माइनस ${result}`;
  } else {
    result = `${wholeWords} ${whole === 1 ? 'rupee' : 'rupees'}`;
    if (paise) result += ` and ${numberWords(paise, false)} ${paise === 1 ? 'paisa' : 'paise'}`;
    if (negative) result = `minus ${result}`;
  }
  return result;
}

export function spokenCurrencyText(text: string): string {
  const hindi = /[\u0900-\u097f]/.test(text);
  const amount = '[+-]?[0-9०-९][0-9०-९,]*(?:\\.[0-9०-९]{1,2})?';
  const convert = (_match: string, rawAmount: string) => spokenRupees(rawAmount, hindi);
  let result = text
    .replace(new RegExp(`₹\\s*(${amount})`, 'g'), convert)
    .replace(new RegExp(`\\b(?:Rs\\.?|INR)\\s*(${amount})`, 'gi'), convert)
    .replace(new RegExp(`(${amount})\\s*(?:INR|Rs\\.?|rupees?|रुपये|रुपया|रुपए)`, 'gi'), convert);

  // Answers from some models omit the currency marker for a decimal amount.
  const moneyContext = '(?:\\b(?:total|balance|collection|collections|refund|refunds|settlement|settlements|payment|payments|amount|owed|pending|cash|sales|revenue|expenses?|profit|income|receipts?|due)\\b|राशि|कुल|बकाया|जमा|कलेक्शन|सेटलमेंट|भुगतान|रिफंड|पेमेंट|नकद|बिक्री|कमाई|मुनाफ़ा|आय|प्राप्ति)';
  result = result.replace(new RegExp(`(${moneyContext})([^\\d\\n]{0,24})([0-9०-९][0-9०-९,]*\\.[0-9०-९]{1,2})(?![0-9०-९%])`, 'gi'),
    (_match, context: string, separator: string, rawAmount: string) => `${context}${separator}${spokenRupees(rawAmount, hindi)}`);

  return result
    .replace(/₹/g, hindi ? 'रुपये' : 'rupees')
    .replace(/\b(?:Rs\.?|INR)\b/gi, hindi ? 'रुपये' : 'rupees');
}
