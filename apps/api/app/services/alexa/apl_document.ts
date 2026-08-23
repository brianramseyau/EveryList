/**
 * The APL document rendered on screen devices (Echo Show/Hub) for a list view
 * (PHASE16_PLAN.md Stage 3). A plain TS object rather than a standalone `.json` file: the
 * production Docker image's build stage only copies `apps/api/` (see `docker/Dockerfile`), not
 * the repo-root `alexa/` deployment-assets directory, so anything the running server needs at
 * request time has to live inside `apps/api` — this is sent inline in every
 * `Alexa.Presentation.APL.RenderDocument` directive rather than registered as a separate
 * document resource in the skill manifest, which keeps deployment to just `alexa/skill.json` +
 * `alexa/interaction-model.json` with no extra console/`ask-cli` step.
 *
 * Deliberately uses only core APL primitives (Container/Sequence/Text/TouchWrapper) with inline
 * styling rather than the `alexa-layouts` responsive component package, to avoid depending on an
 * external package's exact prop shapes that can't be verified from this repo. A single top-level
 * `Sequence` iterates one flattened array of `{type: 'header'|'item', ...}` rows (built by
 * `apl_view.ts`) rather than nesting a `Sequence` per category — APL doesn't support nesting
 * scrollable `Sequence`s cleanly, and flattening with a `when` conditional per row template is
 * the standard APL pattern for a sectioned list.
 *
 * Only verifiable by actually rendering it — via the Alexa Developer Console's APL simulator, or
 * the standalone APL Authoring Tool — neither of which this repo can run; treat the exact visual
 * result (spacing, whether the `<s>`/`<strike>` markup below renders as a strikethrough on every
 * device) as unconfirmed until checked there.
 */
export const LIST_VIEW_DOCUMENT = {
  type: 'APL',
  version: '2024.2',
  mainTemplate: {
    parameters: ['payload'],
    items: [
      {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#1e1e1e',
        items: [
          {
            type: 'Text',
            text: '${payload.listData.properties.listName}',
            fontSize: '32dp',
            fontWeight: 'bold',
            color: '#ffffff',
            paddingTop: '24dp',
            paddingLeft: '24dp',
            paddingBottom: '12dp',
          },
          {
            type: 'Sequence',
            grow: 1,
            width: '100%',
            paddingLeft: '24dp',
            paddingRight: '24dp',
            data: '${payload.listData.properties.rows}',
            items: [
              {
                type: 'Text',
                when: "${data.type == 'header'}",
                text: '${data.text}',
                fontSize: '20dp',
                color: '#9d9d9d',
                paddingTop: '16dp',
                paddingBottom: '6dp',
              },
              {
                type: 'TouchWrapper',
                when: "${data.type == 'item'}",
                onPress: [
                  {
                    type: 'SendEvent',
                    arguments: ['complete', '${data.id}', '${payload.listData.properties.listId}'],
                  },
                ],
                items: [
                  {
                    type: 'Text',
                    text: "${data.checked ? '<s>' + data.name + '</s>' : data.name}",
                    fontSize: '26dp',
                    color: "${data.checked ? '#6d6d6d' : '#ffffff'}",
                    paddingTop: '8dp',
                    paddingBottom: '8dp',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
} as const
