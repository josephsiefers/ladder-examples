/** Number formats the clause-variant library renders: "twenty-four", "two (2)", "third", "3rd". */

const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Ordinals that are not the cardinal plus "th". */
const IRREGULAR_ORDINALS: Record<string, string> = {
  one: "first",
  two: "second",
  three: "third",
  five: "fifth",
  eight: "eighth",
  nine: "ninth",
  twelve: "twelfth",
};

function belowHundred(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const ones = n % 10;
  const tens = TENS[Math.floor(n / 10)] ?? "";
  return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return belowHundred(rest);
  const head = `${ONES[hundreds]} hundred`;
  return rest === 0 ? head : `${head} and ${belowHundred(rest)}`;
}

/** British English cardinal words for 1..9999, e.g. 2025 → "two thousand and twenty-five". */
export function cardinalWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 9999) throw new Error(`Cannot write ${n} in words`);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  if (thousands === 0) return belowThousand(rest);
  const head = `${ONES[thousands]} thousand`;
  if (rest === 0) return head;
  return rest < 100 ? `${head} and ${belowHundred(rest)}` : `${head} ${belowThousand(rest)}`;
}

/** A count as contracts write it: words, then numerals in brackets, e.g. "twenty-four (24)". */
export function wordsWithNumerals(n: number): string {
  return `${cardinalWords(n)} (${n})`;
}

/** An ordinal in words, e.g. 21 → "twenty-first". */
export function ordinalWords(n: number): string {
  const words = cardinalWords(n);
  const lastWord = /[a-z]+$/.exec(words)?.[0] ?? "";
  const stem = words.slice(0, words.length - lastWord.length);
  const irregular = IRREGULAR_ORDINALS[lastWord];
  if (irregular) return `${stem}${irregular}`;
  if (lastWord.endsWith("y")) return `${stem}${lastWord.slice(0, -1)}ieth`;
  return `${words}th`;
}

/** An ordinal in numerals, e.g. 3 → "3rd", 11 → "11th". */
export function ordinalSuffix(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
