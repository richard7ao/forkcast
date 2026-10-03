import { createHash } from "node:crypto";
import { ForecastFile } from "../data/files";

/** JSON with object keys sorted at every depth and arrays kept in order, so equal data always hashes equal. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sha256Hex = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Stamps sealedAt and hashes every other field. Parsing first means a forecast with a gap
 * (a missing segment, a probability outside 0-1) throws here instead of being pre-registered.
 */
export function sealForecast(unsealed: Omit<ForecastFile, "sealedAt" | "sha256">, now = new Date()): ForecastFile {
  const body = ForecastFile.omit({ sha256: true }).parse({ ...unsealed, sealedAt: now.toISOString() });
  return { ...body, sha256: sha256Hex(canonicalJson(body)) };
}

/** True when the file's sha256 matches its content. Pass the raw parsed JSON so an added field also breaks it. */
export function verifySeal(file: ForecastFile): boolean {
  const { sha256, ...body } = file;
  return sha256Hex(canonicalJson(body)) === sha256;
}
