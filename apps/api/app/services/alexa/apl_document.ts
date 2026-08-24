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
 * Deliberately uses only core APL primitives (Container/Sequence/Text/Frame/Image/TouchWrapper)
 * with inline styling rather than the `alexa-layouts` responsive component package, to avoid
 * depending on an external package's exact prop shapes that can't be verified from this repo. A
 * single top-level `Sequence` iterates one flattened array of `{type: 'header'|'item', ...}`
 * rows (built by `apl_view.ts`) rather than nesting a `Sequence` per category — APL doesn't
 * support nesting scrollable `Sequence`s cleanly, and flattening with a `when` conditional per
 * row template is the standard APL pattern for a sectioned list.
 *
 * Styled to match the main app's own dark theme (`apps/web/src/routes/layout.css`: background
 * `#1b1d1f`, text `#edeae3`) rather than the generic `#1e1e1e`/`#ffffff` this started with. The
 * app's colored bottom-border underline under each category heading (drawn in the list's own
 * `color`, not a fixed brand color) is approximated here with a thin `Frame` beneath the header
 * text, since APL text components have no `borderBottom` property. Category/list icons are
 * images fetched from `alexa_icons_controller.ts`, which rasterizes the app's own MDI glyphs —
 * APL can't render arbitrary SVG icon libraries directly, only fetch real images by URL.
 * APL has no custom font loading (Amazon's own bundled fonts only), so no `fontFamily` is set
 * anywhere here — the app's actual typefaces (Space Grotesk/Public Sans) aren't reproducible.
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
        backgroundColor: '#1b1d1f',
        items: [
          {
            type: 'Container',
            direction: 'row',
            alignItems: 'center',
            paddingTop: '24dp',
            paddingLeft: '24dp',
            paddingBottom: '12dp',
            items: [
              {
                type: 'Image',
                when: '${payload.listData.properties.listIconUrl != ""}',
                source: '${payload.listData.properties.listIconUrl}',
                width: '40dp',
                height: '40dp',
                paddingRight: '12dp',
              },
              {
                type: 'Text',
                text: '${payload.listData.properties.listName}',
                fontSize: '32dp',
                fontWeight: 'bold',
                color: '#edeae3',
              },
            ],
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
                type: 'Container',
                when: "${data.type == 'header'}",
                paddingTop: '16dp',
                paddingBottom: '6dp',
                items: [
                  {
                    type: 'Container',
                    direction: 'row',
                    alignItems: 'center',
                    items: [
                      {
                        type: 'Image',
                        source: '${data.iconUrl}',
                        width: '24dp',
                        height: '24dp',
                        paddingRight: '8dp',
                      },
                      {
                        type: 'Text',
                        text: '${data.text}',
                        fontSize: '20dp',
                        fontWeight: '600',
                        color: '${payload.listData.properties.listColor}',
                      },
                    ],
                  },
                  {
                    type: 'Frame',
                    height: '2dp',
                    width: '100%',
                    marginTop: '4dp',
                    backgroundColor: '${payload.listData.properties.listColor}',
                  },
                ],
              },
              {
                type: 'TouchWrapper',
                when: "${data.type == 'item'}",
                onPress: [
                  {
                    type: 'SendEvent',
                    arguments: [
                      "${data.checked ? 'uncheck' : 'complete'}",
                      '${data.id}',
                      '${payload.listData.properties.listId}',
                    ],
                  },
                ],
                items: [
                  {
                    type: 'Container',
                    direction: 'row',
                    alignItems: 'center',
                    paddingTop: '8dp',
                    paddingBottom: '8dp',
                    items: [
                      {
                        type: 'Frame',
                        width: '26dp',
                        height: '26dp',
                        borderRadius: '6dp',
                        borderWidth: '${data.checked ? 0 : 2}dp',
                        borderColor: '#6d6d6d',
                        backgroundColor: "${data.checked ? '#2e8b57' : 'transparent'}",
                      },
                      {
                        // Explicit spacer, not a `marginRight` on the checkbox `Frame` above —
                        // real-device testing (Echo Show) showed `marginRight` values up to 36dp
                        // on that Frame producing no visible gap at all, while sibling `fontSize`
                        // changes in the same document did render, so this sidesteps whatever
                        // margin-support gap that device/firmware has by using a component that
                        // must occupy layout space to render at all.
                        type: 'Frame',
                        width: '36dp',
                        height: '1dp',
                      },
                      {
                        type: 'Text',
                        text: "${data.checked ? '<s>' + data.name + '</s>' : data.name}",
                        fontSize: '32dp',
                        color: "${data.checked ? '#6d6d6d' : '#edeae3'}",
                      },
                    ],
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
