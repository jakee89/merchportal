import { authenticate, defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/merchportal*",
      middlewares: [
        authenticate("user", ["session", "bearer", "api-key"], {
          requireMfa: false,
        }),
      ],
    },
    {
      matcher: "/portal-api*",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          requireMfa: false,
        }),
      ],
    },
  ],
})
