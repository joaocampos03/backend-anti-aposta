const BASIC_PREFIX = 'Basic ';
const SEPARATOR = ':';

export interface ClientCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * RFC 6749 §2.3.1: HTTP Basic with each half form-encoded first, or the two
 * values in the body. Anything else is no credentials at all, and the token
 * endpoint answers `invalid_client`.
 */
export function readClientCredentials(
  authorization: string | undefined,
  body: { readonly client_id?: string | undefined; readonly client_secret?: string | undefined },
): ClientCredentials {
  if (authorization?.startsWith(BASIC_PREFIX) === true) {
    return fromBasic(authorization.slice(BASIC_PREFIX.length).trim());
  }

  return { clientId: body.client_id ?? '', clientSecret: body.client_secret ?? '' };
}

function fromBasic(encoded: string): ClientCredentials {
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separator = decoded.indexOf(SEPARATOR);

  if (separator < 0) {
    return { clientId: '', clientSecret: '' };
  }

  return {
    clientId: safelyDecoded(decoded.slice(0, separator)),
    clientSecret: safelyDecoded(decoded.slice(separator + 1)),
  };
}

function safelyDecoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed escapes are not credentials anyone was issued.
    return '';
  }
}
