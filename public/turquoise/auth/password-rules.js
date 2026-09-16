// The app's password rule, for the reset page — iOS `PasswordStrength` (Turquoise/Onboarding/AccountRules.swift), which is
// Android's, rule for rule.
//
// Why it is here at all (found 2026-09-16): Firebase's own reset page takes any six characters, so "123456" set there was a
// password neither app would let anyone choose. The two apps and this page guard one account space; the weakest of the three
// is the rule.
//
// Parity is measured, not assumed: test/fixtures/password-vectors.json was written by the Swift code itself, and
// test/password-rules.test.js checks every row here. One known gap, outside any real password: Swift counts a CJK numeral
// such as 一 as a digit (Unicode numeric type), JavaScript's \p{N} does not.

export const MIN_LENGTH = 8;
export const MIN_CLASSES = 3;

const graphemes = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

/** What a person would count as characters — Swift's `String.count`. */
export function characters(password) {
  return graphemes ? Array.from(graphemes.segment(password), (s) => s.segment) : Array.from(password);
}

/** Five kinds, three required; a letter with no case (Chinese, Arabic, Hebrew) is a kind of its own. */
export function characterClasses(password) {
  let lower = false, upper = false, caseless = false, digit = false, symbol = false;
  for (const character of characters(password)) {
    // The first scalar decides, as Swift's Character properties do: "é" written as e + ◌́ is a lower-case letter.
    const first = String.fromCodePoint(character.codePointAt(0));
    if (/\p{N}/u.test(first)) digit = true;
    else if (/\p{Lowercase}/u.test(first)) lower = true;
    else if (/\p{Uppercase}/u.test(first)) upper = true;
    else if (/\p{Alphabetic}/u.test(first)) caseless = true;
    else symbol = true;
  }
  return [lower, upper, caseless, digit, symbol].filter(Boolean).length;
}

/** aaaaaaaa, 12345678, 87654321 — by Unicode scalar, as Swift reads `unicodeScalars`. */
export function isTrivialSequence(password) {
  const scalars = Array.from(password, (c) => c.codePointAt(0));
  if (scalars.length < 2) return true;
  if (scalars.every((s) => s === scalars[0])) return true;
  let ascending = true, descending = true;
  for (let i = 1; i < scalars.length; i++) {
    const step = scalars[i] - scalars[i - 1];
    if (step !== 1) ascending = false;
    if (step !== -1) descending = false;
  }
  return ascending || descending;
}

export function isAcceptable(password) {
  return characters(password).length >= MIN_LENGTH
    && !isTrivialSequence(password)
    && characterClasses(password) >= MIN_CLASSES;
}

/**
 * What is still missing, as [catalogue key, number to put in it], or null once the password passes. Nothing is said about
 * an empty box.
 */
export function problem(password) {
  if (password.length === 0) return null;
  if (characters(password).length < MIN_LENGTH) return ["Passwords need at least %d characters.", MIN_LENGTH];
  if (isTrivialSequence(password)) return ["That is a sequence — try something less predictable.", null];
  if (characterClasses(password) < MIN_CLASSES) {
    return ["Mix at least %d of: lower case, upper case, digits, symbols.", MIN_CLASSES];
  }
  return null;
}
