import { getAvailableShells } from "../../../utils/shells";

export const runtime = "nodejs";

export function GET() {
  return Response.json(getAvailableShells());
}
