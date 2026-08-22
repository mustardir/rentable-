import { createHash } from "node:crypto";

import type { AuditEvent, JsonValue } from "./types";

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(",")}}`;
}

export function canonicalPayload(payload: JsonValue): string {
  return canonicalize(payload);
}

export function auditHashInput(event: Pick<AuditEvent, "sequence" | "eventType" | "entityType" | "entityId" | "payload" | "previousHash">): string {
  return [
    event.sequence.toString(),
    event.eventType,
    event.entityType,
    event.entityId,
    canonicalPayload(event.payload),
    event.previousHash ?? "",
  ].join("|");
}

export function computeAuditHash(event: Pick<AuditEvent, "sequence" | "eventType" | "entityType" | "entityId" | "payload" | "previousHash">): string {
  return createHash("sha256").update(auditHashInput(event), "utf8").digest("hex");
}
