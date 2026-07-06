import { defineMcp } from "@lovable.dev/mcp-js";
import createTextShareTool from "./tools/create-text-share";
import retrieveShareTool from "./tools/retrieve-share";

export default defineMcp({
  name: "dropzone-mcp",
  title: "DropZone MCP",
  version: "0.1.0",
  instructions:
    "DropZone is an ephemeral text/file sharing service. Use `create_text_share` to store a short text snippet and receive a 6-character room code, and `retrieve_share` to fetch a share by its room code. Encrypted shares require the full token from the DropZone app.",
  tools: [createTextShareTool, retrieveShareTool],
});
