import { UserHassLinkSchema } from '#database/schema'

/**
 * One row per user who has linked their EveryList account to a Home Assistant username — either
 * by one-click-confirming Supervisor's own detected Ingress identity, or by completing the
 * explicit `auth_api` password-validated sign-in (see `ha_auth_controller.ts` and
 * `ha_link_controller.ts`). Most users will never have a row here — this only matters under the
 * HA add-on. See PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
 */
export default class UserHassLink extends UserHassLinkSchema {}
