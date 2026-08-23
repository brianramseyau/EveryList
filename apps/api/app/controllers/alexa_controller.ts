import User from '#models/user'
import { Secret } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { say, linkAccountRequired } from '#services/alexa/response_builder'
import {
  handleAddItem,
  handleRemoveOrComplete,
  handleReadList,
} from '#services/alexa/intent_router'

type AlexaRequestBody = {
  context?: {
    System?: { application?: { applicationId?: string }; user?: { accessToken?: string } }
  }
  session?: { user?: { accessToken?: string } }
  request: {
    type: 'LaunchRequest' | 'IntentRequest' | 'SessionEndedRequest'
    intent?: { name: string; slots?: Record<string, { value?: string } | undefined> }
  }
}

function slotValues(intent?: { slots?: Record<string, { value?: string } | undefined> }) {
  const slots: Record<string, string | undefined> = {}
  for (const [name, slot] of Object.entries(intent?.slots ?? {})) {
    slots[name] = slot?.value
  }
  return slots
}

/** Handles the Alexa custom skill's `LaunchRequest`/`IntentRequest`/`SessionEndedRequest`
 * (PHASE16_PLAN.md Stage 2). Reached only after `AlexaSignatureMiddleware` has confirmed the
 * request actually came from Amazon. */
export default class AlexaController {
  async handle({ request, response }: HttpContext) {
    const body = request.body() as AlexaRequestBody

    // Reads `process.env` directly (rather than `#start/env`) so the test suite can toggle it
    // per-call — same convention as `mail_configured.ts`'s SMTP2GO check.
    const skillId = process.env.ALEXA_SKILL_ID
    if (skillId && body.context?.System?.application?.applicationId !== skillId) {
      return response.unauthorized({ message: 'Unrecognized skill application id' })
    }

    const accessTokenValue =
      body.context?.System?.user?.accessToken ?? body.session?.user?.accessToken
    if (!accessTokenValue) {
      return response.ok(linkAccountRequired())
    }

    const token = await User.personalAccessTokens.verify(new Secret(accessTokenValue))
    if (!token || token.isExpired()) {
      return response.ok(linkAccountRequired())
    }

    switch (body.request.type) {
      case 'LaunchRequest':
        return response.ok(
          say("Welcome to EveryList. You can say things like 'add milk' or 'what's on my list'.", {
            reprompt: 'What would you like to do?',
          })
        )

      case 'SessionEndedRequest':
        return response.ok({ version: '1.0', response: {} })

      case 'IntentRequest':
        return response.ok(await this.#routeIntent(token, body.request))

      /* c8 ignore next 2 -- Alexa's request.type is a closed enum; no other value is ever sent. */
      default:
        return response.ok(say("Sorry, I didn't understand that."))
    }
  }

  async #routeIntent(token: AccessToken, alexaRequest: AlexaRequestBody['request']) {
    const intentName = alexaRequest.intent?.name ?? ''
    const slots = slotValues(alexaRequest.intent)

    switch (intentName) {
      case 'AddItemIntent':
        return handleAddItem(token, slots)
      case 'RemoveItemIntent':
        return handleRemoveOrComplete(token, slots, 'remove')
      case 'CompleteItemIntent':
        return handleRemoveOrComplete(token, slots, 'complete')
      case 'ReadListIntent':
        return handleReadList(token, slots)
      case 'AMAZON.HelpIntent':
        return say("You can say 'add milk to my list' or 'what's on my list'.", {
          reprompt: 'What would you like to do?',
        })
      case 'AMAZON.CancelIntent':
      case 'AMAZON.StopIntent':
        return say('Goodbye.')
      default:
        return say(
          "Sorry, I didn't understand that. You can say 'add milk' or 'what's on my list'."
        )
    }
  }
}
