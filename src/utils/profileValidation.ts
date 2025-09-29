const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const PHONE_DIGIT_COUNT = 10;
export const EMAIL_MAX_LENGTH = 100;

export const normalizePhoneDigits = (value: string | null | undefined): string =>
  (value ?? "").replace(/\D/g, "");

export const sanitizePhoneInput = (value: string | null | undefined): string => {
  const digits = normalizePhoneDigits(value);
  if (digits.length <= PHONE_DIGIT_COUNT) {
    return digits;
  }
  return digits.slice(-PHONE_DIGIT_COUNT);
};

export const sanitizeEmailInput = (value: string | null | undefined): string =>
  (value ?? "").trim().slice(0, EMAIL_MAX_LENGTH);

export const isValidPhone = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  const digits = normalizePhoneDigits(value);
  return digits.length === PHONE_DIGIT_COUNT;
};

export const isValidEmail = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  const sanitized = sanitizeEmailInput(value);
  if (sanitized.length === 0 || sanitized.length > EMAIL_MAX_LENGTH) {
    return false;
  }
  return EMAIL_PATTERN.test(sanitized);
};

export const sanitizeProfileFieldValue = (
  field: "name" | "email" | "phone",
  value: string | null | undefined
): string => {
  const base = typeof value === "string" ? value : "";
  switch (field) {
    case "email":
      return sanitizeEmailInput(base);
    case "phone":
      return sanitizePhoneInput(base);
    default:
      return base.trim();
  }
};
