import User from '#models/user'
import { Secret } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { say, linkAccountRequired, type AlexaResponse } from '#services/alexa/response_builder'
import {
  handleAddItem,
  handleRemoveOrComplete,
  handleReadList,
  handleSetDefaultList,
  handleLaunchWithDisplay,
  type IntentResult,
} from '#services/alexa/intent_router'
import { buildListDisplay } from '#services/alexa/apl_view'
import { handleTouchEvent } from '#services/alexa/apl_touch_handler'

type AlexaRequestBody = {
  context?: {
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
    logger.debug(
      { requestType: body.request.type, intentName: body.request.intent?.name },
      'Alexa request received'
    )

    const skillId = process.env.ALEXA_SKILL_ID
    const requestSkillId = body.context?.System?.application?.applicationId
    if (skillId && requestSkillId !== skillId) {
      logger.warn({ expected: skillId, actual: requestSkillId }, 'Alexa skill id mismatch')
      return response.unauthorized({ message: 'Unrecognized skill application id' })
    }

    const accessTokenValue =
      body.context?.System?.user?.accessToken ?? body.session?.user?.accessToken
    if (!accessTokenValue) {
      logger.debug('Alexa request has no linked-account access token, prompting to link account')
      return response.ok(linkAccountRequired())
    }

    const token = await User.personalAccessTokens.verify(new Secret(accessTokenValue))
    if (!token || token.isExpired()) {
      // Not distinguishing "not found" from "expired" in the log: Alexa PATs
      // are minted with no `expiresIn` (see `user.ts`), so `isExpired()` is a
      // defensive check with no real path to `true` today — computing which
      // case this is would add a branch with no way to exercise it.
      logger.warn('Alexa request access token is missing or expired, prompting to re-link account')
      return response.ok(linkAccountRequired())
    }

    // `context.Viewports` can list an `APL`-typed viewport (e.g. an Echo Hub's overlay/widget
    // surface) even when the device can't actually render a skill's APL RenderDocument directive
    // — confirmed by a real Echo Hub rejecting one with "The device does not support
    // Alexa.Presentation.APL directives" despite declaring a Viewports entry. supportedInterfaces
    // is the only reliable signal.
    const hasDisplay = Boolean(
      body.context?.System?.device?.supportedInterfaces?.['Alexa.Presentation.APL']
    )

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
          await withDisplay(await this.#routeIntent(token, body.request, logger), hasDisplay)
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
    alexaRequest: AlexaRequestBody['request'],
    logger: HttpContext['logger']
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
      case 'SetDefaultListIntent':
        return handleSetDefaultList(token, slots)
      case 'AMAZON.HelpIntent':
        return {
          response: say(
            "You can say 'add milk to my list', 'what's on my list', or 'set groceries as my default list'.",
            { reprompt: 'What would you like to do?' }
          ),
        }
      case 'AMAZON.CancelIntent':
      case 'AMAZON.StopIntent':
        return { response: say('Goodbye.') }
      default:
        // A real Alexa request never sends a name outside the interaction
        // model (Amazon validates that server-side before the request ever
        // reaches us), so hitting this branch means our own model and this
        // switch have drifted apart — see #88's "interaction model slot
        // conflicts" fix, which was found the hard way without this log.
        logger.warn({ intentName }, 'Alexa request named an unrecognized intent')
        return {
          response: say(
            "Sorry, I didn't understand that. You can say 'add milk' or 'what's on my list'."
          ),
        }
    }
  }
}
