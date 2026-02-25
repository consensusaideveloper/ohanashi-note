// Sanitizes sensitive information (credit cards, PINs, passwords, account numbers)
// from text content flowing through the relay.

const REDACTION_MARKER = "[保護済み]";

// Credit card numbers: 16 digits with optional separators
const CREDIT_CARD_PATTERN = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;

// PIN / password patterns (Japanese and English keywords followed by values)
const PIN_PASSWORD_PATTERN =
  /(暗証番号|パスワード|pin|password)\s*[:：=]?\s*[\d\w]+/gi;

// Long digit sequences (account numbers, etc.)
const LONG_DIGIT_PATTERN = /\b\d{7,}\b/g;

/**
 * Sanitize sensitive information from text content.
 * Replaces credit card numbers, PINs/passwords, and long digit sequences
 * with a redaction marker.
 */
export function sanitizeText(text: string): string {
  let result = text;
  result = result.replace(CREDIT_CARD_PATTERN, REDACTION_MARKER);
  result = result.replace(PIN_PASSWORD_PATTERN, REDACTION_MARKER);
  result = result.replace(LONG_DIGIT_PATTERN, REDACTION_MARKER);
  return result;
}
