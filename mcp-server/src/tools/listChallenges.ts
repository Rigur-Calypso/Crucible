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
  return [{ id: "web-01", title: "Login Bypass", category: "web", points: 100 }];
}
