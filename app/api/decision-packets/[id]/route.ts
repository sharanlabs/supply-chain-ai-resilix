import { noStoreJson } from "@/lib/server/http";
import { getDecisionPacket } from "@/lib/server/store";

// Packet ids are minted as DP-<uuid> (2026-07-16 re-review, B-08): validate the shape
// before touching the store, so arbitrary strings never reach a lookup. Reads stay
// unauthenticated by the recorded demo posture (synthetic packets; hosted-demo auth is
// an owner decision) — the shape gate is hygiene, not access control.
const PACKET_ID_SHAPE = /^DP-[A-Za-z0-9-]{8,64}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!PACKET_ID_SHAPE.test(id)) {
    return noStoreJson({ error: "NOT_FOUND" }, { status: 404 });
  }
  const packet = await getDecisionPacket(id);
  if (!packet) {
    return noStoreJson({ error: "NOT_FOUND" }, { status: 404 });
  }
  return noStoreJson({ packet });
}
