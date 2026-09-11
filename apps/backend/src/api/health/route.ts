import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export const GET = (_request: MedusaRequest, response: MedusaResponse) => {
  response.status(200).json({
    status: "ok",
    service: "merchportal-backend",
    mode: process.env.MEDUSA_WORKER_MODE ?? "shared",
  });
};
