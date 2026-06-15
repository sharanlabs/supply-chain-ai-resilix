import { noStoreJson } from "@/lib/server/http";
import { getDecisionPacket } from "@/lib/server/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const packet = await getDecisionPacket(id);
  if (!packet) {
    return noStoreJson({ error: "NOT_FOUND" }, { status: 404 });
  }
  return noStoreJson({ packet });
}
