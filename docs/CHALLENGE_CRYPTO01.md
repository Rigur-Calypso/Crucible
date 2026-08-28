# crypto-01 — "XOR is not encryption" (non-live challenge)

A secondary challenge that answers a fair judging question — *does the investigation loop only do the
one web thing?* — **without** adding a second flaky live exploit. crypto-01 resolves entirely through
`fetch_file` + local reasoning: no network action, no live target, and therefore no approval gate.

## The challenge

A flag was obfuscated with **single-byte XOR**: every byte of `crucible{…}` was XORed with one
unknown key byte (`0x00`–`0xFF`). The ciphertext ships as
[`cipher.bin`](../mcp-server/challenge-files/crypto-01/cipher.bin) (35 bytes) alongside a
[`brief.txt`](../mcp-server/challenge-files/crypto-01/brief.txt).

## The intended solve (the agent's path)

1. `list_challenges` → sees `crypto-01` (category `crypto`).
2. `get_challenge crypto-01` → learns it is static-analysis, with files `brief.txt`, `cipher.bin`.
3. `fetch_file crypto-01 cipher.bin` → gets the bytes **base64-encoded**; decode to raw ciphertext.
4. Brute-force all 256 keys; exactly one decode is printable ASCII shaped like `crucible{…}`.
5. `submit_flag crypto-01 <recovered>` → validated **server-side** (constant-time compare); the
   agent never decides correctness itself.

This is proven end-to-end in [`test/crypto01.test.ts`](../mcp-server/test/crypto01.test.ts), which
runs exactly that path **through the real MCP tool calls** (a linked in-memory client/server pair
calling `fetch_file` and `submit_flag`, so registration, schemas, wiring, and serialization are all
covered) and asserts a single well-formed key recovers a flag that validates server-side.

## Python reference implementation (provenance)

[`arena/crypto-01/challenge.py`](../arena/crypto-01/challenge.py) is the Python primary entrypoint for
crypto-01 (alongside web-01's Flask app): it **generates** the ciphertext (`generate`), **solves** it
(`solve`), and **verifies** the served artifact recovers exactly the flag (`verify`). It lives under
`arena/` — deliberately **not** under `mcp-server/challenge-files/` — so it is never served by
`fetch_file`: the agent receives only `cipher.bin`, never the solver or the plaintext. Running
`python arena/crypto-01/challenge.py generate` reproduces the committed `cipher.bin` byte-for-byte,
so the artifact's provenance is reproducible.

## Why it is safe and why it earns its place

- **No live action.** It never calls `connect` / `http_request`, so it exercises the read-only side
  of the tool surface and the server-side flag validation, with zero network exposure.
- **Self-owned, non-secret.** The artifact is generated in-repo; the flag gates nothing sensitive.
- **Generalization, cheaply.** It shows recon → hypothesis → evidence → validated finding works
  beyond web, which is the honest answer to "is this a one-trick agent?" — and it does so without a
  second live target that could flake on camera.

The tool surface is unchanged (still exactly six tools); crypto-01 is data + registry entries only.
