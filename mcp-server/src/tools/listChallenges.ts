/**
 * list_challenges — lightweight metadata only, to keep the agent's initial context lean.
 * STUB: read from the arena / a manifest instead of this hard-coded list.
 */

export interface ChallengeSummary {
  id: string;
  title: string;
  category: string;
  points: number;
}

export function listChallenges(): ChallengeSummary[] {
  // TODO: source from the arena manifest / each container's /challenge.json.
  return [
    { id: "web-01", title: "Login Bypass", category: "web", points: 100 },
    // crypto-01 is a NON-LIVE, static-analysis challenge: solved via fetch_file + local reasoning
    // (single-byte XOR), no network action, no approval gate. Shows the loop generalizes beyond web.
    { id: "crypto-01", title: "XOR is not encryption", category: "crypto", points: 75 },
  ];
}

/** The authoritative set of known challenge ids — used to authorize challenge-scoped access. */
export function knownChallengeIds(): ReadonlySet<string> {
  return new Set(listChallenges().map((c) => c.id));
}

/** Ownership/existence check: is this a challenge the arena actually serves? */
export function isKnownChallenge(challengeId: string): boolean {
  return knownChallengeIds().has(challengeId);
}
