import User from '#models/user'
import { Secret } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { say, linkAccountRequired, type AlexaResponse } from '#services/alexa/response_builder'
import {
  handleAddItem,
  handleRemoveOrComplete,
  handleReadList,
  handleLaunchWithDisplay,
  type IntentResult,
} from '#services/alexa/intent_router'
import { buildListDisplay } from '#services/alexa/apl_view'
import { handleTouchEvent } from '#services/alexa/apl_touch_handler'

type AlexaRequestBody = {
  context?: {
    Viewports?: { type?: string }[]
    System?: {
      application?: { applicationId?: string }
      user?: { accessToken?: string }
      device?: { supportedInterfaces?: Record<string, unknown> }
    }
  }
  session?: { user?: { accessToken?: string } }
  request: {
    type:
      'LaunchRequest' | 'IntentRequest' | 'SessionEndedRequest' | 'Alexa.Presentation.APL.UserEvent'
    intent?: { name: string; slots?: Record<string, { value?: string } | undefined> }
    arguments?: unknown[]
  }
}

function slotValues(intent?: { slots?: Record<string, { value?: string } | undefined> }) {
  const slots: Record<string, string | undefined> = {}
  for (const [name, slot] of Object.entries(intent?.slots ?? {})) {
    slots[name] = slot?.value
  }
  return slots
}

/**
 * Merges an APL display directive into an intent's speech response — only when the requesting
 * device declared `Alexa.Presentation.APL` support and the intent resolved a list to show
 * (PHASE16_PLAN.md Stage 3). Non-screen devices, and outcomes with no resolved list
 * (not-found/ambiguous/no-slot-yet), pass through unchanged — `response_builder.ts` itself never
 * knows about displays at all.
 */
async function withDisplay(result: IntentResult, hasDisplay: boolean): Promise<AlexaResponse> {
  if (!hasDisplay || !result.list) return result.response

  const directive = await buildListDisplay(result.list)
  return {
    ...result.response,
    response: { ...result.response.response, directives: [directive] },
  }
}

/** Handles the Alexa custom skill's `LaunchRequest`/`IntentRequest`/`SessionEndedRequest`
 * (PHASE16_PLAN.md Stage 2) and, for screen devices, `Alexa.Presentation.APL.UserEvent` touch
 * events (Stage 3). Reached only after `AlexaSignatureMiddleware` has confirmed the request
 * actually came from Amazon. */
export default class AlexaController {
  async handle({ request, response, logger }: HttpContext) {
    const body = request.body() as AlexaRequestBody

    const skillId = process.env.ALEXA_SKILL_ID
    const requestSkillId = body.context?.System?.application?.applicationId
    if (skillId && requestSkillId !== skillId) {
      logger.warn({ expected: skillId, actual: requestSkillId }, 'Alexa skill id mismatch')
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

    // Multimodal/Hub-style devices (e.g. Echo Hub) declare APL support via a `Viewports` entry
    // in `context`, leaving the legacy `System.device.supportedInterfaces` map empty — confirmed
    // against real Echo Hub traffic, not just the documented single-viewport convention. Check
    // both so older single-purpose Show/Spot-style devices and newer Hub devices are covered.
    const hasDisplay =
      Boolean(body.context?.System?.device?.supportedInterfaces?.['Alexa.Presentation.APL']) ||
      Boolean(body.context?.Viewports?.some((viewport) => viewport.type === 'APL'))

    switch (body.request.type) {
      case 'LaunchRequest': {
        if (!hasDisplay) {
          return response.ok(
            say(
              "Welcome to EveryList. You can say things like 'add milk' or 'what's on my list'.",
              {
                reprompt: 'What would you like to do?',
              }
            )
          )
        }
        return response.ok(await withDisplay(await handleLaunchWithDisplay(token), hasDisplay))
      }

      case 'SessionEndedRequest':
        return response.ok({ version: '1.0', response: {} })

      case 'IntentRequest':
        return response.ok(
          await withDisplay(await this.#routeIntent(token, body.request), hasDisplay)
        )

      case 'Alexa.Presentation.APL.UserEvent':
        return response.ok(
          await withDisplay(await handleTouchEvent(token, body.request.arguments ?? []), hasDisplay)
        )

      /* c8 ignore next 2 -- Alexa's request.type is a closed enum; no other value is ever sent. */
      default:
        return response.ok(say("Sorry, I didn't understand that."))
    }
  }

  async #routeIntent(
    token: AccessToken,
    alexaRequest: AlexaRequestBody['request']
  ): Promise<IntentResult> {
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
        return {
          response: say("You can say 'add milk to my list' or 'what's on my list'.", {
            reprompt: 'What would you like to do?',
          }),
        }
      case 'AMAZON.CancelIntent':
      case 'AMAZON.StopIntent':
        return { response: say('Goodbye.') }
      default:
        return {
          response: say(
            "Sorry, I didn't understand that. You can say 'add milk' or 'what's on my list'."
          ),
        }
    }
  }
}
