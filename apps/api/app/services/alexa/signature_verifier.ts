import alexaVerifier from 'alexa-verifier'

/**
 * Wraps `alexa-verifier` behind a plain object (rather than calling the
 * import directly from the middleware) so functional tests can monkey-patch
 * `.verify` to skip real certificate-chain fetching/crypto — the plan calls
 * for mocking `alexa-verifier` itself rather than trusting it end-to-end,
 * since chasing a real cert chain in Japa is impractical.
 *
 * Amazon's own docs cover request-signature verification; `alexa-verifier`
 * additionally rejects a request whose `request.timestamp` is more than 150s
 * old, so no separate replay check is needed here.
 */
export const alexaSignatureVerifier = {
  verify: (certUrl: string, signature: string, rawBody: string): Promise<void> =>
    alexaVerifier(certUrl, signature, rawBody),
}
