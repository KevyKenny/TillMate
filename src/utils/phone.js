const ZW_PREFIX = '+263';

/**
 * Accepts +2637xxxxxxxx, 2637xxxxxxxx, 07xxxxxxxx, or 7xxxxxxxx
 * and normalizes to +2637xxxxxxxx.
 * @param {string} raw
 */
export function normalizeZimbabwePhone(raw) {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+263')) {
    return `+${digits.slice(1).replace(/^2630?/, '263')}`;
  }
  if (digits.startsWith('263')) {
    return `+${digits.replace(/^2630?/, '263')}`;
  }
  if (digits.startsWith('07')) {
    return `${ZW_PREFIX}${digits.slice(1)}`;
  }
  if (digits.startsWith('7')) {
    return `${ZW_PREFIX}${digits}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/** @param {string} normalized */
export function isValidZimbabwePhone(normalized) {
  return /^\+2637\d{8}$/.test(String(normalized ?? '').trim());
}

export function validateZimbabwePhoneInput(raw) {
  const phone = normalizeZimbabwePhone(raw);
  if (!isValidZimbabwePhone(phone)) {
    throw new Error('Enter a valid phone number (e.g. 0771234567 or 712345678).');
  }
  return phone;
}
