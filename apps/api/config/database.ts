import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'
import env from '#start/env'

const dbConfig = defineConfig({
  /**
   * Default connection used for all queries.
   */
  connection: 'sqlite',

  connections: {
    /**
     * SQLite connection (default).
     */
    sqlite: {
      client: 'better-sqlite3',

      connection: {
        // Overridden to /config/everylist.sqlite3 in the production image
        // (see docker/Dockerfile) so the database survives container
        // recreation on the persistent /config volume — see
        // foundational/PLAN.md §5. Defaults to a tmp file for local dev.
        filename: env.get('DATABASE_FILENAME', app.tmpPath('db.sqlite3')),
      },

      /**
       * Required by Knex for SQLite defaults.
       */
      useNullAsDefault: true,

      /**
       * better-sqlite3 doesn't enforce FK constraints (or ON DELETE
       * CASCADE/SET NULL) unless "PRAGMA foreign_keys" is turned on per
       * connection — required so e.g. deleting a folder correctly nulls out
       * `lists.folder_id`. Left OFF during `console` (ace) commands: SQLite
       * implements most `ALTER TABLE` column additions that carry an inline
       * FK reference by rebuilding the table (create new, copy rows, DROP
       * the old one, rename) — and with enforcement on, dropping the old
       * `lists` table cascade-deletes every row in `items`/`list_members`/
       * etc. that referenced it, even though the "drop" is just a migration
       * implementation detail rather than a real delete. This wiped
       * production data via the folder_id migration (see incident writeup).
       * `web`/`test` still enforce normally since real hard-delete cascades
       * only happen from HTTP controllers.
       */
      pool: {
        afterCreate: (
          connection: { pragma: (statement: string) => unknown },
          done: (error: Error | null, connection: unknown) => void
        ) => {
          const enforceForeignKeys = app.getEnvironment() !== 'console'
          connection.pragma(`foreign_keys = ${enforceForeignKeys ? 'ON' : 'OFF'}`)
          done(null, connection)
        },
      },

      migrations: {
        /**
         * Sort migration files naturally by filename.
         */
        naturalSort: true,

        /**
         * Paths containing migration files.
         */
        paths: ['database/migrations'],
      },

      schemaGeneration: {
        /**
         * Enable schema generation from Lucid models.
         */
        enabled: true,

        /**
         * Custom schema rules file paths.
         */
        rulesPaths: ['./database/schema_rules.js'],
      },
    },

    /**
     * PostgreSQL connection.
     * Install package to switch: npm install pg
     */
    // pg: {
    //   client: 'pg',
    //   connection: {
    //     host: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * MySQL / MariaDB connection.
     * Install package to switch: npm install mysql2
     */
    // mysql: {
    //   client: 'mysql2',
    //   connection: {
    //     host: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * Microsoft SQL Server connection.
     * Install package to switch: npm install tedious
     */
    // mssql: {
    //   client: 'mssql',
    //   connection: {
    //     server: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * libSQL (Turso) connection.
     * Install package to switch: npm install @libsql/client
     */
    // libsql: {
    //   client: 'libsql',
    //   connection: {
    //     url: env.get('LIBSQL_URL'),
    //     authToken: env.get('LIBSQL_AUTH_TOKEN'),
    //   },
    //   useNullAsDefault: true,
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },
  },
})

export default dbConfig
