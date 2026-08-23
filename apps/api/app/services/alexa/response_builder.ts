/** Minimal shape of an Alexa skill response envelope — only the fields this skill ever sets. */
type AlexaResponse = {
  version: '1.0'
  response: {
    outputSpeech: { type: 'PlainText'; text: string }
    reprompt?: { outputSpeech: { type: 'PlainText'; text: string } }
    card?: { type: 'Simple' | 'LinkAccount'; title?: string; content?: string }
    shouldEndSession: boolean
  }
}

/** A spoken response. Defaults to ending the session — pass `reprompt` to keep it open instead. */
export function say(speechText: string, options: { reprompt?: string } = {}): AlexaResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text: speechText },
      ...(options.reprompt
        ? { reprompt: { outputSpeech: { type: 'PlainText', text: options.reprompt } } }
        : {}),
      card: { type: 'Simple', title: 'EveryList', content: speechText },
      shouldEndSession: options.reprompt === undefined,
    },
  }
}

/** Prompts the user to link their EveryList account via the Alexa app — sent whenever a request
 * arrives with no (or a revoked) account-linked token, instead of a raw auth error. */
export function linkAccountRequired(): AlexaResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: 'Please link your EveryList account in the Alexa app to continue.',
      },
      card: { type: 'LinkAccount' },
      shouldEndSession: true,
    },
  }
}
