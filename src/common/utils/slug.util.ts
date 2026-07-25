/**
 * Cyrillic → latin transliteration for URL-friendly slugs.
 */
const CYRILLIC_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Builds a URL-safe slug from a human-readable title/name. */
export function generateSlug(value: string, maxLength = 160): string {
  return value
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC_MAP[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
}

/** True when the value looks like a UUID v1–v8. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Root-level segments reserved by API routes under /catalog/*.
 * Nested categories may still use these as sibling slugs.
 */
export const RESERVED_CATEGORY_SLUGS = new Set([
  'categories',
  'products',
  'search',
  'api',
]);

export function isReservedCategorySlug(
  slug: string,
  isRoot: boolean,
): boolean {
  return isRoot && RESERVED_CATEGORY_SLUGS.has(slug);
}
