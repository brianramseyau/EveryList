/*
|--------------------------------------------------------------------------
| Server config bootstrap
|--------------------------------------------------------------------------
|
| Loads /config/config.yaml (if present) and applies any file-set mail
| values onto config/mail.ts's mutable config objects, so a pre-existing
| file is honored from the very first request rather than only after the
| next admin save — see server_config.ts.
|
*/

import { bootstrapServerConfig } from '#services/server_config'

bootstrapServerConfig()
