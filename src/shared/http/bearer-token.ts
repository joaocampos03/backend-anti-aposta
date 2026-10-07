const BEARER_PREFIX = 'Bearer ';

/** Reads `Authorization: Bearer <token>`; anything else is no token at all. */
export function readBearerToken(header: string | undefined): string {
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
    return '';
  }

  return header.slice(BEARER_PREFIX.length).trim();
}
