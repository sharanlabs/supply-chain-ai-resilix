import { renameSync, writeFileSync } from "node:fs";

// atomicWriteFileSync -- stage to a sibling temp file, then rename into place (EV-11,
// 2026-07-16 re-review). The fixture recorders BILL real money and run for minutes; a
// direct writeFileSync that is interrupted (Ctrl-C, an OOM, a thrown assertion mid-write)
// leaves a TRUNCATED JSON on disk that then loads as a silently-corrupt fixture. rename(2)
// is atomic on POSIX, so a crash leaves EITHER the previous complete file OR the new
// complete one -- never a half-written one. The temp name carries the pid so two recorders
// writing the same dir cannot collide on the staging file.
export function atomicWriteFileSync(path: string, contents: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, path);
}
