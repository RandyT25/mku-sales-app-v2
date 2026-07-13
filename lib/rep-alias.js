// Shared by the browser (lib/auth.js) and the Node seed script
// (scripts/seed-reps.mjs) so alias derivation can never drift between them.
export function deriveLoginAlias(name) {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '@mkuv2.internal';
}
