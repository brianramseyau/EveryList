import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import type { ListDto } from '@everylist/shared'
import { alexaSignatureVerifier } from '#services/alexa/signature_verifier'
import { addMember, bodyData, signupAndGetUser } from './helpers.js'

const CERT_URL = 'https://s3.amazonaws.com/echo.api/echo-api-cert.pem'

type Envelope = {
  applicationId?: string
  accessToken?: string
  accessTokenLocation?: 'session' | 'context' | 'none'
  type:
    'LaunchRequest' | 'IntentRequest' | 'SessionEndedRequest' | 'Alexa.Presentation.APL.UserEvent'
  intentName?: string
  slots?: Record<string, string | undefined>
  /** Declares `Alexa.Presentation.APL` support on the requesting device (PHASE16_PLAN.md Stage 3). */
  hasDisplay?: boolean
  /** How `hasDisplay` is declared — real Echo Hub devices use `Viewports`, leaving
   * `supportedInterfaces` empty; defaults to the legacy `supportedInterfaces` convention. */
  displayVia?: 'supportedInterfaces' | 'viewports'
  /** `request.arguments` for an `Alexa.Presentation.APL.UserEvent` (a tap on-screen). */
  args?: unknown[]
}

function buildEnvelope(options: Envelope) {
  const accessTokenLocation = options.accessTokenLocation ?? 'session'
  const userWithToken =
    options.accessToken !== undefined
      ? { user: { accessToken: options.accessToken } }
      : { user: {} }

  const displayVia = options.displayVia ?? 'supportedInterfaces'

  return {
    version: '1.0',
    session: accessTokenLocation === 'session' ? userWithToken : { user: {} },
    context: {
      ...(options.hasDisplay && displayVia === 'viewports'
        ? { Viewports: [{ type: 'APL', id: 'medHub' }] }
        : {}),
      System: {
        application: { applicationId: options.applicationId ?? 'test-skill-id' },
        ...(accessTokenLocation === 'context' ? userWithToken : { user: {} }),
        device: {
          supportedInterfaces:
            options.hasDisplay && displayVia === 'supportedInterfaces'
              ? { 'Alexa.Presentation.APL': {} }
              : {},
        },
      },
    },
    request: {
      type: options.type,
      timestamp: new Date().toISOString(),
      ...(options.intentName
        ? {
            intent: {
              name: options.intentName,
              // Real Alexa requests omit `slots` entirely for an intent that declares none
              // (AMAZON.HelpIntent, etc.) rather than sending an empty object.
              ...(options.slots
                ? {
                    slots: Object.fromEntries(
                      Object.entries(options.slots).map(([name, value]) => [name, { value }])
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(options.args ? { arguments: options.args } : {}),
    },
  }
}

async function postAlexa(
  client: ApiClient,
  envelope: unknown,
  headers: { signature?: string | null; certUrl?: string | null } = {}
): Promise<ApiResponse> {
  let request = client.post('/api/v1/alexa').json(envelope)
  if (headers.certUrl !== null) {
    request = request.header('signaturecertchainurl', headers.certUrl ?? CERT_URL)
  }
  if (headers.signature !== null) {
    request = request.header('signature-256', headers.signature ?? 'dGVzdA==')
  }
  return request
}

async function createList(client: ApiClient, token: string, name: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name })
  return bodyData<ListDto>(response).id
}

async function mintPat(
  client: ApiClient,
  token: string,
  listIds: number[],
  role: 'editor' | 'viewer' = 'editor'
): Promise<string> {
  const response = await client
    .post('/api/v1/tokens')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Alexa', listIds, role })
  return bodyData<{ token: string }>(response).token
}

async function addItem(client: ApiClient, token: string, listId: number, name: string) {
  await client
    .post(`/api/v1/lists/${listId}/items`)
    .header('Authorization', `Bearer ${token}`)
    .json({ name })
}

test.group('Alexa skill endpoint', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  group.each.setup(() => {
    const original = alexaSignatureVerifier.verify
    alexaSignatureVerifier.verify = async () => {}
    return () => {
      alexaSignatureVerifier.verify = original
    }
  })

  test('rejects a request missing signature headers', async ({ client, assert }) => {
    const response = await postAlexa(client, buildEnvelope({ type: 'LaunchRequest' }), {
      certUrl: null,
    })
    response.assertStatus(400)
    assert.equal(response.body().message, 'Missing Alexa request signature headers')
  })

  test('rejects a request with an invalid signature', async ({ client }) => {
    const original = alexaSignatureVerifier.verify
    alexaSignatureVerifier.verify = async () => {
      throw new Error('bad signature')
    }
    try {
      const response = await postAlexa(client, buildEnvelope({ type: 'LaunchRequest' }))
      response.assertStatus(400)
    } finally {
      alexaSignatureVerifier.verify = original
    }
  })

  test('rejects a request from a different skill application id', async ({ client }) => {
    const original = process.env.ALEXA_SKILL_ID
    process.env.ALEXA_SKILL_ID = 'our-real-skill-id'
    try {
      const response = await postAlexa(
        client,
        buildEnvelope({ type: 'LaunchRequest', applicationId: 'someone-elses-skill' })
      )
      response.assertStatus(401)
    } finally {
      if (original === undefined) delete process.env.ALEXA_SKILL_ID
      else process.env.ALEXA_SKILL_ID = original
    }
  })

  test('accepts a request matching the configured skill application id', async ({ client }) => {
    const original = process.env.ALEXA_SKILL_ID
    process.env.ALEXA_SKILL_ID = 'our-real-skill-id'
    try {
      const response = await postAlexa(
        client,
        buildEnvelope({ type: 'LaunchRequest', applicationId: 'our-real-skill-id' })
      )
      response.assertStatus(200)
    } finally {
      if (original === undefined) delete process.env.ALEXA_SKILL_ID
      else process.env.ALEXA_SKILL_ID = original
    }
  })

  test('LaunchRequest returns a welcome prompt', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'LaunchRequest', accessToken: pat })
    )
    response.assertStatus(200)
    assert.include(response.body().response.outputSpeech.text, 'Welcome to EveryList')
    assert.isFalse(response.body().response.shouldEndSession)
  })

  test('SessionEndedRequest acks with an empty response', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'SessionEndedRequest', accessToken: pat })
    )
    response.assertStatus(200)
    assert.deepEqual(response.body(), { version: '1.0', response: {} })
  })

  test('a request with no account-linked token prompts to link the account', async ({
    client,
    assert,
  }) => {
    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'LaunchRequest', accessTokenLocation: 'none' })
    )
    response.assertStatus(200)
    assert.equal(response.body().response.card.type, 'LinkAccount')
  })

  test('a request with an unrecognized token prompts to link the account', async ({
    client,
    assert,
  }) => {
    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'LaunchRequest', accessToken: 'elt_bogus.doesnotexist' })
    )
    response.assertStatus(200)
    assert.equal(response.body().response.card.type, 'LinkAccount')
  })

  test('reads the account-linked token from context.System.user as well as session.user', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'LaunchRequest', accessToken: pat, accessTokenLocation: 'context' })
    )
    response.assertStatus(200)
    assert.include(response.body().response.outputSpeech.text, 'Welcome')
  })

  test('AddItemIntent adds a new item, and speaking it again avoids a duplicate', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const first = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'AddItemIntent',
        slots: { ItemName: 'Milk' },
      })
    )
    first.assertStatus(200)
    assert.include(first.body().response.outputSpeech.text, 'Added Milk to Groceries')

    const second = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'AddItemIntent',
        slots: { ItemName: 'Milk' },
      })
    )
    assert.include(second.body().response.outputSpeech.text, 'already on Groceries')

    const items = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
    assert.lengthOf(bodyData<unknown[]>(items), 1)
  })

  test('AddItemIntent restores a deleted item and un-checks a checked one', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])
    await addItem(client, owner.token, listId, 'Eggs')

    // Check it off, then re-add it by voice.
    const items = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
    const eggs = bodyData<{ id: number }[]>(items)[0]!
    await client
      .patch(`/api/v1/lists/${listId}/items/${eggs.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ checked: true })

    const uncheck = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'AddItemIntent',
        slots: { ItemName: 'Eggs' },
      })
    )
    assert.include(uncheck.body().response.outputSpeech.text, 'already on Groceries')

    // Now remove it, then re-add by voice: should restore, not duplicate.
    await client
      .delete(`/api/v1/lists/${listId}/items/${eggs.id}`)
      .header('Authorization', `Bearer ${owner.token}`)

    const restore = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'AddItemIntent',
        slots: { ItemName: 'Eggs' },
      })
    )
    assert.include(restore.body().response.outputSpeech.text, 'Added Eggs to Groceries')

    const after = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
    assert.lengthOf(bodyData<unknown[]>(after), 1)
  })

  test('AddItemIntent with no ItemName slot asks for clarification', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'AddItemIntent' })
    )
    assert.include(response.body().response.outputSpeech.text, "didn't catch what to add")
  })

  test('AddItemIntent and RemoveItemIntent report a not-found list the same way ReadListIntent does', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const add = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'AddItemIntent',
        slots: { ItemName: 'Milk', ListName: 'Nonexistent' },
      })
    )
    assert.include(add.body().response.outputSpeech.text, "couldn't find that list")

    const remove = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'RemoveItemIntent',
        slots: { ItemName: 'Milk', ListName: 'Nonexistent' },
      })
    )
    assert.include(remove.body().response.outputSpeech.text, "couldn't find that list")
  })

  test('a viewer-scoped token cannot add, remove, or complete items', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId], 'viewer')

    const add = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'AddItemIntent',
        slots: { ItemName: 'Milk' },
      })
    )
    assert.include(add.body().response.outputSpeech.text, 'only have view access')

    const remove = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'RemoveItemIntent',
        slots: { ItemName: 'Milk' },
      })
    )
    assert.include(remove.body().response.outputSpeech.text, 'only have view access')
  })

  test('RemoveItemIntent and CompleteItemIntent act on a fuzzy-matched item name', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])
    await addItem(client, owner.token, listId, 'Milk')
    await addItem(client, owner.token, listId, 'Bread')

    const complete = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'CompleteItemIntent',
        slots: { ItemName: 'miilk' },
      })
    )
    assert.include(complete.body().response.outputSpeech.text, 'Marked Milk as done')

    const remove = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'RemoveItemIntent',
        slots: { ItemName: 'Bread' },
      })
    )
    assert.include(remove.body().response.outputSpeech.text, 'Removed Bread')

    const missing = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'RemoveItemIntent',
        slots: { ItemName: 'Watermelon' },
      })
    )
    assert.include(missing.body().response.outputSpeech.text, "couldn't find Watermelon")
  })

  test('RemoveItemIntent with no ItemName slot asks for clarification', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'RemoveItemIntent' })
    )
    assert.include(response.body().response.outputSpeech.text, "didn't catch which item")
  })

  test('ReadListIntent summarizes a short list, a long list, and an empty list', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const empty = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'ReadListIntent' })
    )
    assert.include(empty.body().response.outputSpeech.text, 'Groceries is empty')

    for (const name of ['Milk', 'Bread', 'Eggs']) {
      await addItem(client, owner.token, listId, name)
    }
    const short = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'ReadListIntent' })
    )
    const shortText = short.body().response.outputSpeech.text
    assert.include(shortText, 'Milk')
    assert.notInclude(shortText, 'more item')

    for (const name of ['A', 'B', 'C', 'D']) {
      await addItem(client, owner.token, listId, name)
    }
    const long = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'ReadListIntent' })
    )
    assert.include(long.body().response.outputSpeech.text, 'more items')
  })

  test('ReadListIntent reports exactly one remaining item in the singular', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
      await addItem(client, owner.token, listId, name)
    }

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'ReadListIntent' })
    )
    assert.include(response.body().response.outputSpeech.text, '1 more item.')
  })

  test('with no ListName slot and exactly one accessible list, that list is used implicitly', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'ReadListIntent' })
    )
    assert.include(response.body().response.outputSpeech.text, 'Groceries')
  })

  test('with no ListName slot and several accessible lists, asks to disambiguate', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listAId = await createList(client, owner.token, 'Groceries')
    const listBId = await createList(client, owner.token, 'Hardware')
    const pat = await mintPat(client, owner.token, [listAId, listBId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'ReadListIntent' })
    )
    assert.include(response.body().response.outputSpeech.text, 'Which list did you mean')
    assert.include(response.body().response.outputSpeech.text, 'Groceries')
    assert.include(response.body().response.outputSpeech.text, 'Hardware')
  })

  test('an explicit ListName slot resolves by fuzzy match', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listAId = await createList(client, owner.token, 'Groceries')
    const listBId = await createList(client, owner.token, 'Hardware')
    const pat = await mintPat(client, owner.token, [listAId, listBId])

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'ReadListIntent',
        slots: { ListName: 'groceriez' },
      })
    )
    assert.include(response.body().response.outputSpeech.text, 'Groceries')
  })

  test('an explicit ListName slot with no match reports the list as not found', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'ReadListIntent',
        slots: { ListName: 'Something Completely Different' },
      })
    )
    assert.include(response.body().response.outputSpeech.text, "couldn't find that list")
  })

  test('a token whose grant points at a since-deleted list reports not found', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])
    await client.delete(`/api/v1/lists/${listId}`).header('Authorization', `Bearer ${owner.token}`)

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'ReadListIntent' })
    )
    assert.include(response.body().response.outputSpeech.text, "couldn't find that list")
  })

  test('a viewer accessing a shared list (not just their own) can still use voice control', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const editorMember = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Household')
    await addMember(listId, editorMember.id, 'editor')

    const pat = await mintPat(client, owner.token, [listId], 'editor')
    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        intentName: 'AddItemIntent',
        slots: { ItemName: 'Batteries' },
      })
    )
    assert.include(response.body().response.outputSpeech.text, 'Added Batteries to Household')
  })

  test('AMAZON.HelpIntent, CancelIntent, StopIntent, and an unrecognized intent', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const help = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'AMAZON.HelpIntent' })
    )
    assert.include(help.body().response.outputSpeech.text, 'You can say')

    const cancel = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'AMAZON.CancelIntent' })
    )
    assert.equal(cancel.body().response.outputSpeech.text, 'Goodbye.')

    const stop = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'AMAZON.StopIntent' })
    )
    assert.equal(stop.body().response.outputSpeech.text, 'Goodbye.')

    const unknown = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat, intentName: 'SomeUnknownIntent' })
    )
    assert.include(unknown.body().response.outputSpeech.text, "didn't understand that")
  })

  test('an IntentRequest with no intent object at all is treated as unrecognized', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'IntentRequest', accessToken: pat })
    )
    assert.include(response.body().response.outputSpeech.text, "didn't understand that")
  })

  test('a non-screen device never gets a display directive', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'LaunchRequest', accessToken: pat, hasDisplay: false })
    )
    assert.include(response.body().response.outputSpeech.text, 'Welcome to EveryList')
    assert.isUndefined(response.body().response.directives)
  })

  test('LaunchRequest on a screen device with one accessible list shows it immediately', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'LaunchRequest', accessToken: pat, hasDisplay: true })
    )
    assert.include(response.body().response.outputSpeech.text, "Here's Groceries")
    const directives = response.body().response.directives
    assert.lengthOf(directives, 1)
    assert.equal(directives[0].type, 'Alexa.Presentation.APL.RenderDocument')
    assert.equal(directives[0].token, `list-${listId}`)
    assert.equal(directives[0].datasources.listData.properties.listName, 'Groceries')
  })

  test('LaunchRequest on an Echo Hub-style device declaring APL via Viewports (not supportedInterfaces) also shows the list', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'LaunchRequest',
        accessToken: pat,
        hasDisplay: true,
        displayVia: 'viewports',
      })
    )
    assert.include(response.body().response.outputSpeech.text, "Here's Groceries")
    const directives = response.body().response.directives
    assert.lengthOf(directives, 1)
    assert.equal(directives[0].type, 'Alexa.Presentation.APL.RenderDocument')
  })

  test('LaunchRequest on a screen device with several lists asks to disambiguate and shows nothing', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listAId = await createList(client, owner.token, 'Groceries')
    const listBId = await createList(client, owner.token, 'Hardware')
    const pat = await mintPat(client, owner.token, [listAId, listBId])

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'LaunchRequest', accessToken: pat, hasDisplay: true })
    )
    assert.include(response.body().response.outputSpeech.text, 'Which list did you mean')
    assert.isUndefined(response.body().response.directives)
  })

  test('LaunchRequest on a screen device with no accessible list shows nothing', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])
    await client.delete(`/api/v1/lists/${listId}`).header('Authorization', `Bearer ${owner.token}`)

    const response = await postAlexa(
      client,
      buildEnvelope({ type: 'LaunchRequest', accessToken: pat, hasDisplay: true })
    )
    assert.include(response.body().response.outputSpeech.text, "couldn't find that list")
    assert.isUndefined(response.body().response.directives)
  })

  test('AddItemIntent on a screen device refreshes the display with the new item', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        hasDisplay: true,
        intentName: 'AddItemIntent',
        slots: { ItemName: 'Milk' },
      })
    )
    assert.include(response.body().response.outputSpeech.text, 'Added Milk to Groceries')
    const rows = response.body().response.directives[0].datasources.listData.properties.rows
    assert.deepInclude(rows, { type: 'header', text: 'Other' })
    assert.isTrue(rows.some((row: { name?: string }) => row.name === 'Milk'))
  })

  test('an ambiguous or not-found list outcome on a screen device attaches no directive', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listAId = await createList(client, owner.token, 'Groceries')
    const listBId = await createList(client, owner.token, 'Hardware')
    const pat = await mintPat(client, owner.token, [listAId, listBId])

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'IntentRequest',
        accessToken: pat,
        hasDisplay: true,
        intentName: 'ReadListIntent',
      })
    )
    assert.include(response.body().response.outputSpeech.text, 'Which list did you mean')
    assert.isUndefined(response.body().response.directives)
  })

  test('tapping an item on-screen (a UserEvent) marks it done and refreshes the display', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])
    await addItem(client, owner.token, listId, 'Milk')

    const items = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
    const milk = bodyData<{ id: number }[]>(items)[0]!

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'Alexa.Presentation.APL.UserEvent',
        accessToken: pat,
        hasDisplay: true,
        args: ['complete', milk.id, listId],
      })
    )
    assert.include(response.body().response.outputSpeech.text, 'Marked Milk as done')
    const rows = response.body().response.directives[0].datasources.listData.properties.rows
    assert.isTrue(
      rows.some((row: { name?: string; checked?: boolean }) => row.name === 'Milk' && row.checked)
    )

    const after = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
    assert.isTrue(bodyData<{ checked: boolean }[]>(after)[0]!.checked)
  })

  test('a UserEvent with no arguments at all is treated as unrecognized', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'Alexa.Presentation.APL.UserEvent',
        accessToken: pat,
        hasDisplay: true,
      })
    )
    assert.include(response.body().response.outputSpeech.text, "didn't understand that")
  })

  test('a UserEvent with an action other than "complete" is treated as unrecognized', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'Alexa.Presentation.APL.UserEvent',
        accessToken: pat,
        hasDisplay: true,
        args: ['delete', 1, listId],
      })
    )
    assert.include(response.body().response.outputSpeech.text, "didn't understand that")
    assert.isUndefined(response.body().response.directives)
  })

  test('a UserEvent from a viewer-scoped token cannot complete an item', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId], 'viewer')
    await addItem(client, owner.token, listId, 'Milk')

    const items = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
    const milk = bodyData<{ id: number }[]>(items)[0]!

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'Alexa.Presentation.APL.UserEvent',
        accessToken: pat,
        hasDisplay: true,
        args: ['complete', milk.id, listId],
      })
    )
    assert.include(response.body().response.outputSpeech.text, "don't have permission")
    assert.isUndefined(response.body().response.directives)
  })

  test('a UserEvent for an item that no longer exists refreshes the display anyway', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'Alexa.Presentation.APL.UserEvent',
        accessToken: pat,
        hasDisplay: true,
        args: ['complete', 999999, listId],
      })
    )
    assert.include(response.body().response.outputSpeech.text, "couldn't find that item")
    assert.lengthOf(response.body().response.directives, 1)
  })

  test('a UserEvent for a list that no longer exists attaches no directive', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token, 'Groceries')
    const pat = await mintPat(client, owner.token, [listId])
    await client.delete(`/api/v1/lists/${listId}`).header('Authorization', `Bearer ${owner.token}`)

    const response = await postAlexa(
      client,
      buildEnvelope({
        type: 'Alexa.Presentation.APL.UserEvent',
        accessToken: pat,
        hasDisplay: true,
        args: ['complete', 1, listId],
      })
    )
    assert.include(response.body().response.outputSpeech.text, "couldn't find that list")
    assert.isUndefined(response.body().response.directives)
  })
})
