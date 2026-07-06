import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export default defineTool({
  name: "retrieve_share",
  title: "Retrieve share",
  description:
    "Retrieve a DropZone share by its 6-character room code. Returns the shared text, or metadata for files and encrypted shares.",
  inputSchema: {
    roomCode: z
      .string()
      .min(6)
      .max(6)
      .describe("The 6-character room code."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ roomCode }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: rows, error } = await supabase.rpc("get_shared_item", {
      _code: roomCode.toUpperCase(),
    });

    if (error) {
      return { content: [{ type: "text", text: `Lookup failed: ${error.message}` }], isError: true };
    }
    const data = Array.isArray(rows) ? rows[0] : null;
    if (!data) {
      return { content: [{ type: "text", text: "Not found or expired." }], isError: true };
    }

    if (data.encrypted) {
      return {
        content: [
          { type: "text", text: `Share ${data.code} is end-to-end encrypted. Retrieve it in the DropZone app using the full token that includes the decryption key.` },
        ],
        structuredContent: {
          roomCode: data.code,
          type: data.type,
          encrypted: true,
          fileName: data.file_name,
          expiresAt: data.expires_at,
        },
      };
    }

    if (data.type === "file") {
      return {
        content: [
          { type: "text", text: `File share "${data.file_name}" (${data.file_type ?? "unknown type"}). Download it in the DropZone app.` },
        ],
        structuredContent: {
          roomCode: data.code,
          type: "file",
          fileName: data.file_name,
          fileType: data.file_type,
          expiresAt: data.expires_at,
        },
      };
    }

    return {
      content: [{ type: "text", text: data.content }],
      structuredContent: {
        roomCode: data.code,
        type: "text",
        text: data.content,
        expiresAt: data.expires_at,
      },
    };
  },
});
