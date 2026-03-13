#!/usr/bin/env python3
"""Default-only seeder for Campus Grid.

Usage:
    python seed_data.py

This script only inserts default settings into cg_settings.
It does not insert or modify any other data.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def ensure_project_venv_python() -> None:
    project_root = Path(__file__).resolve().parent
    if os.name == "nt":
        venv_python = project_root / ".venv" / "Scripts" / "python.exe"
    else:
        venv_python = project_root / ".venv" / "bin" / "python"

    if not venv_python.exists():
        return

    current_python = Path(sys.executable).resolve()
    target_python = venv_python.resolve()
    if str(current_python).lower() == str(target_python).lower():
        return

    if os.environ.get("CAMPUS_SEED_REEXEC") == "1":
        return

    os.environ["CAMPUS_SEED_REEXEC"] = "1"
    os.execv(str(target_python), [str(target_python), str(Path(__file__).resolve()), *sys.argv[1:]])


ensure_project_venv_python()

try:
    import psycopg
except ImportError:
    print("Missing dependency: psycopg")
    print(f"Current interpreter: {sys.executable}")
    print("Install it in this interpreter with:")
    print("  python -m pip install psycopg[binary]")
    print("Then run with:")
    print("  python seed_data.py")
    sys.exit(1)




def load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def get_db_url() -> str:
    load_env_file(Path(".env"))
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("Missing SUPABASE_DB_URL or DATABASE_URL (.env)")
    return db_url


def seed_defaults(cur: psycopg.Cursor) -> None:
    defaults = {
        "college_start_time": "09:45",
        "college_end_time": "15:45",
        "periods_per_day": "6",
        "break_duration": "15",
        "break_after_period": "2",
        "lunch_duration": "45",
        "lunch_after_period": "3",
    }

    for key, value in defaults.items():
        cur.execute(
            """
            INSERT INTO cg_settings (key, value)
            VALUES (%s, %s)
            ON CONFLICT (key) DO NOTHING
            """,
            (key, value),
        )

def main() -> None:
    db_url = get_db_url()
    # Avoid prepared statement name collisions on pooled/proxied Postgres connections.
    with psycopg.connect(db_url, sslmode="require", prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            seed_defaults(cur)
        conn.commit()
    print("Seed completed: default settings only. No other data was inserted or modified.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Seed failed: {exc}")
        sys.exit(1)
