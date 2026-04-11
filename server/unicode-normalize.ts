/**
 * Converts Unicode "styled" alphanumeric characters (mathematical bold, italic,
 * sans-serif, monospace, script, Fraktur, double-struck variants) back to plain
 * ASCII. Telegram channel captions frequently use these for visual styling.
 *
 * Examples:
 *   𝐓𝐡𝐞 𝐏𝐞𝐛𝐛𝐥𝐞  → The Pebble
 *   𝑼𝒏𝒍𝒐𝒄𝒌𝒆𝒅    → Unlocked
 *   𝗔𝗴𝗲𝗻𝘁       → Agent
 */
function mathUnicodeToAscii(cp: number): string | null {
  // ── Mathematical Bold ─────────────────────────── (no gaps)
  if (cp >= 0x1D400 && cp <= 0x1D419) return String.fromCharCode(65 + cp - 0x1D400); // A-Z
  if (cp >= 0x1D41A && cp <= 0x1D433) return String.fromCharCode(97 + cp - 0x1D41A); // a-z

  // ── Mathematical Italic ──────────────────────── (gap: h at U+210E)
  if (cp >= 0x1D434 && cp <= 0x1D44D) return String.fromCharCode(65 + cp - 0x1D434); // A-Z
  if (cp >= 0x1D44E && cp <= 0x1D454) return String.fromCharCode(97 + cp - 0x1D44E); // a-g
  if (cp === 0x210E) return 'h';                                                        // italic h
  if (cp >= 0x1D456 && cp <= 0x1D467) return String.fromCharCode(105 + cp - 0x1D456);// i-z

  // ── Mathematical Bold Italic ─────────────────── (no gaps)
  if (cp >= 0x1D468 && cp <= 0x1D481) return String.fromCharCode(65 + cp - 0x1D468); // A-Z
  if (cp >= 0x1D482 && cp <= 0x1D49B) return String.fromCharCode(97 + cp - 0x1D482); // a-z

  // ── Mathematical Script Capitals ─────────────── (several gaps — handled individually)
  if (cp === 0x1D49C) return 'A';
  if (cp === 0x1D49E) return 'C';
  if (cp === 0x1D49F) return 'D';
  if (cp === 0x1D4A2) return 'G';
  if (cp === 0x1D4A5) return 'J';
  if (cp === 0x1D4A6) return 'K';
  if (cp >= 0x1D4A9 && cp <= 0x1D4AC) return String.fromCharCode(78 + cp - 0x1D4A9); // N-Q
  if (cp >= 0x1D4AE && cp <= 0x1D4B5) return String.fromCharCode(83 + cp - 0x1D4AE); // S-Z

  // ── Mathematical Script Lowercase ────────────── (gaps: e U+212F, g U+210A, o U+2134)
  if (cp >= 0x1D4B6 && cp <= 0x1D4B9) return String.fromCharCode(97 + cp - 0x1D4B6); // a-d
  if (cp === 0x212F) return 'e';
  if (cp === 0x1D4BB) return 'f';
  if (cp === 0x210A) return 'g';
  if (cp >= 0x1D4BD && cp <= 0x1D4C3) return String.fromCharCode(104 + cp - 0x1D4BD);// h-n
  if (cp === 0x2134) return 'o';
  if (cp >= 0x1D4C5 && cp <= 0x1D4CF) return String.fromCharCode(112 + cp - 0x1D4C5);// p-z

  // ── Mathematical Bold Script ─────────────────── (no gaps)
  if (cp >= 0x1D4D0 && cp <= 0x1D4E9) return String.fromCharCode(65 + cp - 0x1D4D0); // A-Z
  if (cp >= 0x1D4EA && cp <= 0x1D503) return String.fromCharCode(97 + cp - 0x1D4EA); // a-z

  // ── Mathematical Fraktur Capitals ────────────── (gaps: C U+212D, H U+210C, I U+2111, R U+211C, Z U+2128)
  if (cp >= 0x1D504 && cp <= 0x1D505) return String.fromCharCode(65 + cp - 0x1D504); // A-B
  if (cp === 0x212D) return 'C';
  if (cp >= 0x1D507 && cp <= 0x1D50A) return String.fromCharCode(68 + cp - 0x1D507); // D-G
  if (cp === 0x210C) return 'H';
  if (cp === 0x2111) return 'I';
  if (cp >= 0x1D50D && cp <= 0x1D514) return String.fromCharCode(74 + cp - 0x1D50D); // J-Q
  if (cp === 0x211C) return 'R';
  if (cp >= 0x1D516 && cp <= 0x1D51C) return String.fromCharCode(83 + cp - 0x1D516); // S-Y
  if (cp === 0x2128) return 'Z';

  // ── Mathematical Fraktur Lowercase ───────────── (no gaps)
  if (cp >= 0x1D51E && cp <= 0x1D537) return String.fromCharCode(97 + cp - 0x1D51E); // a-z

  // ── Mathematical Double-Struck Capitals ──────── (gaps: C U+2102, H U+210D, N U+2115, P U+2119, Q U+211A, R U+211D, Z U+2124)
  if (cp === 0x1D538) return 'A';
  if (cp === 0x1D539) return 'B';
  if (cp === 0x2102) return 'C';
  if (cp >= 0x1D53B && cp <= 0x1D53E) return String.fromCharCode(68 + cp - 0x1D53B); // D-G
  if (cp === 0x210D) return 'H';
  if (cp >= 0x1D540 && cp <= 0x1D544) return String.fromCharCode(73 + cp - 0x1D540); // I-M
  if (cp === 0x2115) return 'N';
  if (cp === 0x1D546) return 'O';
  if (cp === 0x2119) return 'P';
  if (cp === 0x211A) return 'Q';
  if (cp === 0x211D) return 'R';
  if (cp >= 0x1D54A && cp <= 0x1D550) return String.fromCharCode(83 + cp - 0x1D54A); // S-Y
  if (cp === 0x2124) return 'Z';

  // ── Mathematical Double-Struck Lowercase ─────── (no gaps)
  if (cp >= 0x1D552 && cp <= 0x1D56B) return String.fromCharCode(97 + cp - 0x1D552); // a-z

  // ── Mathematical Bold Fraktur ────────────────── (no gaps)
  if (cp >= 0x1D56C && cp <= 0x1D585) return String.fromCharCode(65 + cp - 0x1D56C); // A-Z
  if (cp >= 0x1D586 && cp <= 0x1D59F) return String.fromCharCode(97 + cp - 0x1D586); // a-z

  // ── Mathematical Sans-Serif ──────────────────── (no gaps)
  if (cp >= 0x1D5A0 && cp <= 0x1D5B9) return String.fromCharCode(65 + cp - 0x1D5A0); // A-Z
  if (cp >= 0x1D5BA && cp <= 0x1D5D3) return String.fromCharCode(97 + cp - 0x1D5BA); // a-z

  // ── Mathematical Sans-Serif Bold ─────────────── (no gaps) — common in Telegram
  if (cp >= 0x1D5D4 && cp <= 0x1D5ED) return String.fromCharCode(65 + cp - 0x1D5D4); // A-Z
  if (cp >= 0x1D5EE && cp <= 0x1D607) return String.fromCharCode(97 + cp - 0x1D5EE); // a-z

  // ── Mathematical Sans-Serif Italic ───────────── (no gaps)
  if (cp >= 0x1D608 && cp <= 0x1D621) return String.fromCharCode(65 + cp - 0x1D608); // A-Z
  if (cp >= 0x1D622 && cp <= 0x1D63B) return String.fromCharCode(97 + cp - 0x1D622); // a-z

  // ── Mathematical Sans-Serif Bold Italic ──────── (no gaps)
  if (cp >= 0x1D63C && cp <= 0x1D655) return String.fromCharCode(65 + cp - 0x1D63C); // A-Z
  if (cp >= 0x1D656 && cp <= 0x1D66F) return String.fromCharCode(97 + cp - 0x1D656); // a-z

  // ── Mathematical Monospace ───────────────────── (no gaps)
  if (cp >= 0x1D670 && cp <= 0x1D689) return String.fromCharCode(65 + cp - 0x1D670); // A-Z
  if (cp >= 0x1D68A && cp <= 0x1D6A3) return String.fromCharCode(97 + cp - 0x1D68A); // a-z

  // ── Digits in all mathematical styles ────────────────────────────────────────
  if (cp >= 0x1D7CE && cp <= 0x1D7D7) return String.fromCharCode(48 + cp - 0x1D7CE); // Bold
  if (cp >= 0x1D7D8 && cp <= 0x1D7E1) return String.fromCharCode(48 + cp - 0x1D7D8); // Double-struck
  if (cp >= 0x1D7E2 && cp <= 0x1D7EB) return String.fromCharCode(48 + cp - 0x1D7E2); // Sans-serif
  if (cp >= 0x1D7EC && cp <= 0x1D7F5) return String.fromCharCode(48 + cp - 0x1D7EC); // Sans-serif Bold
  if (cp >= 0x1D7F6 && cp <= 0x1D7FF) return String.fromCharCode(48 + cp - 0x1D7F6); // Monospace

  // ── Letterlike symbols used as styled capitals ───────────────────────────────
  if (cp === 0x212C) return 'B'; // ℬ Script capital B
  if (cp === 0x2130) return 'E'; // ℰ Script capital E
  if (cp === 0x2131) return 'F'; // ℱ Script capital F
  if (cp === 0x210B) return 'H'; // ℋ Script capital H
  if (cp === 0x2110) return 'I'; // ℐ Script capital I
  if (cp === 0x2112) return 'L'; // ℒ Script capital L
  if (cp === 0x2133) return 'M'; // ℳ Script capital M
  if (cp === 0x211B) return 'R'; // ℛ Script capital R

  return null;
}

/**
 * Normalizes a filename by converting Unicode styled characters to ASCII
 * and collapsing any runs of whitespace.
 */
export function normalizeFileName(text: string): string {
  if (!text) return text;
  const result = [...text] // spread handles surrogate pairs (math chars are > U+FFFF)
    .map(ch => mathUnicodeToAscii(ch.codePointAt(0)!) ?? ch)
    .join('');
  return result.replace(/\s+/g, ' ').trim();
}
