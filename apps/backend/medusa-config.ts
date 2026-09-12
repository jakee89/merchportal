import {
  ContainerRegistrationKeys,
  loadEnv,
  defineConfig,
  Modules,
} from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,

    databaseDriverOptions: {
      ssl: false,
      sslmode: "disable",
    },

    redisUrl: process.env.REDIS_URL,

    workerMode: process.env.MEDUSA_WORKER_MODE as
      | "shared"
      | "worker"
      | "server",

    cookieOptions: {
      sameSite: "lax",
      secure: false,
    },

    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,

      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,

      authMethodsPerActor: {
        user: ["emailpass"],
        customer: ["emailpass"],
      },
    },
  },

  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",

    // Admin is served by the same Medusa backend.
    // "/" prevents the compiled admin from accidentally pointing
    // to localhost or an incorrect NAS address.
    backendUrl: "/",
  },

  modules: [
    {
      resolve: "@medusajs/medusa/file",

      options: {
        providers: [
          {
            resolve: "@medusajs/file-s3",
            id: "s3",

            options: {
              file_url:
                process.env.S3_FILE_URL ||
                `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}`,

              access_key_id: process.env.S3_ACCESS_KEY_ID,
              secret_access_key: process.env.S3_SECRET_ACCESS_KEY,

              region: process.env.S3_REGION || "us-east-1",

              bucket: process.env.S3_BUCKET,
              endpoint: process.env.S3_ENDPOINT,

              prefix: "client-artwork/",

              additional_client_config: {
                forcePathStyle: true,
              },
            },
          },
        ],
      },
    },

    {
      resolve: "./src/modules/merchportal",
    },

    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl: process.env.EVENTS_REDIS_URL || process.env.REDIS_URL,
        workerOptions: {
          concurrency: 5,
          lockDuration: 3_600_000,
          stalledInterval: 300_000,
        },
        jobOptions: {
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400, count: 1000 },
        },
      },
    },
    {
      resolve: "@medusajs/medusa/auth",

      dependencies: [
        Modules.CACHE,
        ContainerRegistrationKeys.LOGGER,
      ],

      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/auth-emailpass",
            id: "emailpass",
          },
        ],
      },
    },
  ],
})
