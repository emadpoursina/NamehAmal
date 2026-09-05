import { appendFile } from "node:fs/promises";

const DEBUG_LOG_PATH = "/opt/cursor/logs/debug.log";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    await appendFile(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`, "utf8");
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Unable to write debug log" }, { status: 400 });
  }
}
