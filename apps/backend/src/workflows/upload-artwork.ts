import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { MedusaError } from "@medusajs/framework/utils";

type Input = { filename: string; mime_type: string; content: string };

export async function uploadArtwork(container: any, input: Input) {
  const allowed = new Set([
    "image/png",
    "image/jpeg",
    "application/pdf",
    "image/svg+xml",
  ]);
  if (!allowed.has(input.mime_type))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Artwork must be a PDF, PNG, JPG, or SVG file",
    );
  const size = Buffer.from(input.content, "base64").byteLength;
  if (!size || size > 10 * 1024 * 1024)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Artwork must be smaller than 10 MB",
    );
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
  const { result } = await uploadFilesWorkflow(container).run({
    input: {
      files: [
        {
          filename: `artwork-${Date.now()}-${safeName}`,
          mimeType: input.mime_type,
          content: input.content,
          access: "private",
        },
      ],
    },
  });
  return result[0];
}
