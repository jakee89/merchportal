import { authenticate, defineMiddlewares } from "@medusajs/framework/http"
import { securityHeaders, throttleAuth } from "../modules/merchportal/auth-security"

export default defineMiddlewares({
  routes: [
    { matcher: "/*", middlewares: [securityHeaders] },
    { matcher: "/auth*", methods: ["POST"], middlewares: [throttleAuth] },
    {
      matcher: "/portal-api/artwork",
      methods: ["POST"],
      bodyParser: { sizeLimit: "14mb" },
    },
    {
      matcher: "/admin/merchportal*",
      middlewares: [
        authenticate("user", ["session", "bearer", "api-key"], {
          requireMfa: true,
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
