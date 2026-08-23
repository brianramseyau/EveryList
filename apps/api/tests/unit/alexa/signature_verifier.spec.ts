import { test } from '@japa/runner'
import { alexaSignatureVerifier } from '#services/alexa/signature_verifier'

test.group('alexaSignatureVerifier', () => {
  test('rejects an obviously invalid signature/cert without needing a real Amazon request', async ({
    assert,
  }) => {
    // `alexa-verifier` rejects a non-base64 signature before ever fetching the certificate, so
    // this exercises the real (non-mocked) implementation without any network access.
    await assert.rejects(() =>
      alexaSignatureVerifier.verify(
        'https://s3.amazonaws.com/echo.api/cert.pem',
        'not-base64!!',
        '{}'
      )
    )
  })
})
