import { randomBytes } from "node:crypto";

/** Lesbares Alphabet ohne verwechselbare Zeichen (0/O, 1/l/I). */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export function shortId(length = 7): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export const ID_PATTERN = /^[23456789a-zA-Z]{6,12}$/;
