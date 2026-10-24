import { getDomain, getPublicSuffix } from "tldts";
export interface DirectoryEntry {
  methods: string[];
  documentation?: string;
}
export type Directory = Record<string, DirectoryEntry>;
export function safeLink(input?: string): string | undefined {
  if (!input) return;
  try {
    const u = new URL(input);
    if (u.protocol === "https:" && !u.username && !u.password) return u.href;
  } catch {
    /* Invalid upstream link is not shown. */
  }
}
export function lookup(
  address: string,
  directory: Directory,
): { domain: string; entry: DirectoryEntry } | undefined {
  try {
    const url = new URL(address);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const domain = getDomain(host, { allowPrivateDomains: true });
    if (!domain) return;
    const suffix = getPublicSuffix(host, { allowPrivateDomains: true });
    let candidate = host;
    while (candidate && candidate !== suffix) {
      const entry = Object.hasOwn(directory, candidate)
        ? directory[candidate]
        : undefined;
      if (entry?.methods.length) return { domain: candidate, entry };
      if (candidate === domain) break;
      candidate = candidate.slice(candidate.indexOf(".") + 1);
    }
  } catch {
    /* Unsupported or malformed address. */
  }
}
let dataset: Promise<Directory> | undefined;
export function loadDirectory(): Promise<Directory> {
  return (dataset ??= fetch(new URL("/directory.json", import.meta.url)).then(
    (r) => {
      if (!r.ok) throw new Error("Bundled directory unavailable.");
      return r.json() as Promise<Directory>;
    },
  ));
}
