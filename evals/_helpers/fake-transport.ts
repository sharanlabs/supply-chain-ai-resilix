import type {
  ActionTransport,
  TransportMessage,
  TransportReceipt
} from "@/lib/server/action-transport";

// Test-only ActionTransport. Records every deliver() call (so a test can assert the
// transport fired EXACTLY ONCE) and never touches the network. In "throw" mode it
// raises a typed error to exercise the executor's fail-closed FAILED path. This is
// the dependency-injected fake the task mandates -- no real Slack/email/n8n is ever
// reachable from a test.
export class FakeTransport implements ActionTransport {
  readonly name: string;
  readonly calls: TransportMessage[] = [];
  private readonly mode: "deliver" | "throw";

  constructor(name = "fake", mode: "deliver" | "throw" = "deliver") {
    this.name = name;
    this.mode = mode;
  }

  get callCount(): number {
    return this.calls.length;
  }

  async deliver(message: TransportMessage): Promise<TransportReceipt> {
    this.calls.push(message);
    if (this.mode === "throw") {
      throw new FakeTransportError("simulated transport failure");
    }
    return {
      transport: this.name,
      providerRef: `fake-${message.idempotencyKey}`,
      delivered: true
    };
  }
}

export class FakeTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FakeTransportError";
  }
}
