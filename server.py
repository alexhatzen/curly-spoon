#!/usr/bin/env python3
"""Tiny backend for the fishing log: serves the static frontend and a
REST API backed by a SQLite database.

Usage: python3 server.py [port]   (defaults to 8000)

Env vars (used in deployment, e.g. Fly.io):
  PORT     - port to listen on, overrides the CLI arg
  DB_PATH  - path to the SQLite file, e.g. a mounted volume like /data/fishing.db
"""
import json
import os
import sqlite3
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "public")
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "db", "fishing.db"))


def get_conn():
    if not os.path.exists(DB_PATH):
        raise RuntimeError("Database not found. Run: python3 db/seed.py")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, fmt, *args):
        pass

    def _cors_headers(self):
        # Frontend (Netlify) and backend (Fly.io) live on different origins.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # ---- routing ----
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/catches":
            return self.list_catches()
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/catches":
            return self.create_catch()
        self.send_error(404)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/catches/"):
            catch_id = path.rsplit("/", 1)[-1]
            return self.update_catch(catch_id)
        self.send_error(404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/catches/"):
            catch_id = path.rsplit("/", 1)[-1]
            return self.delete_catch(catch_id)
        self.send_error(404)

    # ---- handlers ----
    def list_catches(self):
        conn = get_conn()
        rows = conn.execute("""
            SELECT c.id, c.date, c.weight_kg, c.length_cm, c.bait, c.notes,
                   s.name AS species, l.name AS location
            FROM catches c
            JOIN species s ON s.id = c.species_id
            LEFT JOIN locations l ON l.id = c.location_id
            ORDER BY c.date DESC, c.id DESC
        """).fetchall()
        conn.close()
        self._json(200, [dict(r) for r in rows])

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length) or b"{}")

    def _upsert_species_and_location(self, cur, species, location):
        cur.execute("INSERT OR IGNORE INTO species (name) VALUES (?)", (species,))
        species_id = cur.execute(
            "SELECT id FROM species WHERE name = ?", (species,)
        ).fetchone()["id"]

        location_id = None
        if location:
            cur.execute("INSERT OR IGNORE INTO locations (name) VALUES (?)", (location,))
            location_id = cur.execute(
                "SELECT id FROM locations WHERE name = ?", (location,)
            ).fetchone()["id"]
        return species_id, location_id

    def create_catch(self):
        try:
            body = self._read_json_body()
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid JSON"})

        species = (body.get("species") or "").strip()
        location = (body.get("location") or "").strip()
        catch_date = (body.get("date") or "").strip()
        if not species or not catch_date:
            return self._json(400, {"error": "species and date are required"})

        conn = get_conn()
        cur = conn.cursor()
        species_id, location_id = self._upsert_species_and_location(cur, species, location)

        cur.execute(
            """INSERT INTO catches
               (species_id, location_id, date, weight_kg, length_cm, bait, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (species_id, location_id, catch_date,
             body.get("weight_kg"), body.get("length_cm"),
             (body.get("bait") or "").strip(), (body.get("notes") or "").strip()),
        )
        conn.commit()
        new_id = cur.lastrowid
        conn.close()
        self._json(201, {"id": new_id})

    def update_catch(self, catch_id):
        try:
            body = self._read_json_body()
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid JSON"})

        species = (body.get("species") or "").strip()
        location = (body.get("location") or "").strip()
        catch_date = (body.get("date") or "").strip()
        if not species or not catch_date:
            return self._json(400, {"error": "species and date are required"})

        conn = get_conn()
        cur = conn.cursor()
        existing = cur.execute("SELECT id FROM catches WHERE id = ?", (catch_id,)).fetchone()
        if not existing:
            conn.close()
            return self._json(404, {"error": "catch not found"})

        species_id, location_id = self._upsert_species_and_location(cur, species, location)

        cur.execute(
            """UPDATE catches
               SET species_id = ?, location_id = ?, date = ?, weight_kg = ?,
                   length_cm = ?, bait = ?, notes = ?
               WHERE id = ?""",
            (species_id, location_id, catch_date,
             body.get("weight_kg"), body.get("length_cm"),
             (body.get("bait") or "").strip(), (body.get("notes") or "").strip(),
             catch_id),
        )
        conn.commit()
        conn.close()
        self._json(200, {"id": int(catch_id)})

    def delete_catch(self, catch_id):
        conn = get_conn()
        conn.execute("DELETE FROM catches WHERE id = ?", (catch_id,))
        conn.commit()
        conn.close()
        self._json(200, {"deleted": catch_id})


def main():
    cli_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    port = int(os.environ.get("PORT", cli_port))
    if not os.path.exists(DB_PATH):
        print("No database found — seeding one now...")
        sys.path.insert(0, os.path.join(BASE_DIR, "db"))
        import seed
        seed.main()
    with ThreadingHTTPServer(("", port), Handler) as httpd:
        print(f"Fishing log running at http://localhost:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
