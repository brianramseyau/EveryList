/** `alexa-verifier` ships no types (plain ESM JS) — see app/services/alexa/signature_verifier.ts. */
declare module 'alexa-verifier' {
  export default function alexaVerifier(
    certUrl: string,
    signature: string,
    requestBody: string
  ): Promise<void>
}
