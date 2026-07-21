#!/usr/bin/env python3
"""Creates the SQLite database and fills it with synthetic fishing data.
All measurements are metric: weight in kilograms, length in centimeters.

Usage: python3 db/seed.py
"""
import os
import random
import sqlite3
from datetime import date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "fishing.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

random.seed(42)

LOCATIONS = [
    "Lake Travis", "Lake Austin", "Colorado River",
    "Guadalupe River", "Lake Texoma", "Canyon Lake",
]

BAITS = [
    "Spinnerbait", "Plastic worm", "Crankbait", "Live shad", "Powerbait",
    "Fly", "Topwater frog", "Worm", "Chicken liver", "Cut bait", "Jig", "Spoon lure",
]

# (species, weight_kg range, length_cm range, how many to generate)
SPECIES = [
    ("Largemouth Bass", (0.5, 3.2), (25, 55), 16),
    ("Smallmouth Bass", (0.3, 2.0), (20, 45), 8),
    ("Rainbow Trout",   (0.2, 1.8), (20, 50), 10),
    ("Brown Trout",     (0.3, 2.5), (25, 55), 6),
    ("Northern Pike",   (1.0, 6.5), (45, 95), 7),
    ("Channel Catfish", (1.0, 8.5), (40, 100), 9),
    ("Bluegill",        (0.05, 0.5), (10, 25), 8),
    ("European Perch",  (0.1, 0.8), (12, 35), 6),
]

NOTE_POOL = [
    "", "", "", "",  # most catches have no notes
    "Caught near the dam early morning",
    "Stocked section, fought hard",
    "Slow day otherwise",
    "Released after a quick photo",
    "Water was murky after rain",
    "Caught right at sunset",
]

TODAY = date(2026, 7, 21)


def random_date_within(days_back):
    offset = random.randint(0, days_back)
    return (TODAY - timedelta(days=offset)).isoformat()


def build_catches():
    rows = []
    for species, (w_lo, w_hi), (l_lo, l_hi), count in SPECIES:
        best_weight = 0
        entries = []
        for _ in range(count):
            weight = round(random.uniform(w_lo, w_hi), 2)
            length = round(random.uniform(l_lo, l_hi), 1)
            entries.append((species, weight, length))
            best_weight = max(best_weight, weight)

        for species, weight, length in entries:
            note = random.choice(NOTE_POOL)
            if weight == best_weight:
                note = "Personal best!"
            rows.append({
                "species": species,
                "location": random.choice(LOCATIONS),
                "date": random_date_within(365),
                "weight_kg": weight,
                "length_cm": length,
                "bait": random.choice(BAITS),
                "notes": note,
            })
    rows.sort(key=lambda r: r["date"])
    return rows


def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    with open(SCHEMA_PATH) as f:
        conn.executescript(f.read())

    cur = conn.cursor()
    species_ids = {}
    for species, *_ in SPECIES:
        cur.execute("INSERT INTO species (name) VALUES (?)", (species,))
        species_ids[species] = cur.lastrowid

    location_ids = {}
    for loc in LOCATIONS:
        cur.execute("INSERT INTO locations (name) VALUES (?)", (loc,))
        location_ids[loc] = cur.lastrowid

    rows = build_catches()
    for r in rows:
        cur.execute(
            """INSERT INTO catches
               (species_id, location_id, date, weight_kg, length_cm, bait, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (species_ids[r["species"]], location_ids[r["location"]], r["date"],
             r["weight_kg"], r["length_cm"], r["bait"], r["notes"]),
        )

    conn.commit()
    conn.close()
    print(f"Seeded {len(rows)} catches across {len(SPECIES)} species into {DB_PATH}")


if __name__ == "__main__":
    main()
