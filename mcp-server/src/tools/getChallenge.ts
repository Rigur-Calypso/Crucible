/**
 * get_challenge — full description + connection info + hints for one challenge.
 * STUB: fetch the container's /challenge.json over the arena network via the sandbox/proxy.
 */

export interface ChallengeDetail {
  id: string;
  title: string;
  category: string;
  points: number;
  description: string;
  connection: { host: string; port: number; path?: string };
  hints?: string[];
}

export function getChallenge(challengeId: string): ChallengeDetail | { error: string } {
  if (challengeId !== "web-01") return { error: "unknown challenge" };
  // TODO: return live data pulled from web-01:/challenge.json rather than this stub.
  return {
    id: "web-01",
    title: "Login Bypass",
    category: "web",
    points: 100,
    description: "Authenticate as admin to retrieve the protected resource.",
    connection: { host: "web-01", port: 5000, path: "/login" },
  };
}
