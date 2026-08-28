"""
web-01-patched — the PATCHED control twin of web-01. Self-owned arena infrastructure.

This is byte-for-byte the same app as arena/web-01 EXCEPT the login query is parameterized
(bound parameters instead of string interpolation). That single change closes the SQL-injection
auth bypass. Its purpose is differential validation: the exact same exploit payload that captures
the flag on web-01 (`username=admin'--`) must FAIL here (HTTP 401, no flag).

Why this matters: it proves The Crucible is a *validator*, not a flag-pattern-matcher. A real
security tool must be able to report a target as NOT exploitable — a correct negative result is the
evidence that the positive result on web-01 was earned, not assumed. See arena/verify-differential.sh.

There is no flag to capture here by design; a patched target has nothing to give up.
"""

from flask import Flask, request, jsonify
import sqlite3

app = Flask(__name__)


def fresh_db() -> sqlite3.Connection:
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE users (username TEXT, password TEXT, role TEXT)")
    con.execute("INSERT INTO users VALUES ('admin', 's3cr3t-not-guessable-9f2a', 'admin')")
    return con


@app.get("/challenge.json")
def challenge():
    return jsonify(
        {
            "id": "web-01-patched",
            "title": "Login Bypass (patched control)",
            "category": "web",
            "points": 0,
            "description": "Patched twin of web-01: the SQLi auth bypass is fixed. Not exploitable.",
            "connection": {"host": "web-01-patched", "port": 5000, "path": "/login"},
        }
    )


@app.post("/login")
def login():
    username = request.form.get("username", "")
    password = request.form.get("password", "")
    con = fresh_db()
    # THE FIX: parameterized query. `username`/`password` are bound values, never SQL. The classic
    # `admin'--` payload is now just a username that does not exist -> no row -> 401. Same shape as
    # web-01, one line different — so the differential isolates the vulnerability, nothing else.
    query = "SELECT role FROM users WHERE username = ? AND password = ?"
    try:
        row = con.execute(query, (username, password)).fetchone()
    except sqlite3.Error:
        return jsonify({"ok": False, "error": "query error"}), 400
    finally:
        con.close()

    if row and row[0] == "admin":
        # Legitimate auth still works with real credentials — but there is no flag on a patched box.
        return jsonify({"ok": True, "authenticated": True}), 200
    return jsonify({"ok": False}), 401


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
