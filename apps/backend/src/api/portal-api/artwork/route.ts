import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal";
import { uploadArtwork } from "../../../workflows/upload-artwork";

type Body = { filename?: string; mime_type?: string; content?: string };

export async function POST(
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse,
) {
  const actorId = req.auth_context?.actor_id;
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any;
  const memberships = await service.listMemberships(
    { actor_id: actorId, actor_type: "customer", status: "active" },
    { take: 1 },
  );
  if (!actorId || !memberships.length)
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Active company membership required",
    );
  if (!req.body.filename || !req.body.mime_type || !req.body.content)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Choose an artwork file",
    );
  try {
    const file = await uploadArtwork(req.scope, {
      filename: req.body.filename,
      mime_type: req.body.mime_type,
      content: req.body.content,
    });
    res
      .status(201)
      .json({ file: { id: file.id, filename: req.body.filename } });
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      error instanceof Error ? error.message : "Artwork upload failed",
    );
  }
}
