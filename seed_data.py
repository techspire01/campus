#!/usr/bin/env python3
"""Manual data seeder for Campus Grid.

Usage:
  python seed_data.py

This script inserts/updates initial data (settings, departments, staff, classes,
lab subjects, and class-lab mappings). It is safe to run multiple times.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import psycopg
except ImportError:
    print("Missing dependency: psycopg")
    print("Install it with: pip install psycopg[binary]")
    sys.exit(1)


DEPARTMENTS_TO_SEED = [
    {"name": "B.Com", "type": "core", "years": 3},
    {"name": "B.Com CA", "type": "core", "years": 3},
    {"name": "B.Com PA", "type": "core", "years": 3},
    {"name": "B.Com IT", "type": "core", "years": 3},
    {"name": "BBA CA", "type": "core", "years": 3},
    {"name": "B.Sc CSHM", "type": "core", "years": 3},
    {"name": "B.Sc CS", "type": "core", "years": 3},
    {"name": "B.Sc AI & ML", "type": "core", "years": 3},
    {"name": "B.Sc CSDA", "type": "core", "years": 3},
    {"name": "B.Sc IT", "type": "core", "years": 3},
    {"name": "MBA", "type": "core", "years": 2},
    {"name": "M.Sc CS", "type": "core", "years": 2},
    {"name": "M.Com", "type": "core", "years": 2},
]

LAB_ASSIGNMENTS = [
    ("3 B.Com", "PROJECT-LAB", 6),
    ("1 B.Com CA", "OFFICE-AUTO-LAB", 5),
    ("2 B.Com CA", "PROG-C-LAB", 5),
    ("2 B.Com CA", "DBMS-LAB", 5),
    ("3 B.Com CA", "WEB-TECH-LAB", 6),
    ("3 B.Com CA", "PROJECT-LAB", 6),
    ("3 B.Com PA", "ACCT-SW-LAB", 6),
    ("3 B.Com PA", "PROJECT-LAB", 6),
    ("1 B.Com IT", "PROG-C-LAB", 5),
    ("2 B.Com IT", "DBMS-LAB", 5),
    ("2 B.Com IT", "WEB-TECH-LAB", 5),
    ("3 B.Com IT", "PROJECT-LAB", 6),
    ("1 BBA CA", "OFFICE-AUTO-LAB", 5),
    ("2 BBA CA", "PYTHON-LAB", 5),
    ("3 BBA CA", "WEB-TECH-LAB", 6),
    ("3 BBA CA", "PROJECT-LAB", 6),
    ("1 B.Sc CSHM", "FOOD-PROD-LAB", 5),
    ("2 B.Sc CSHM", "WEB-TECH-LAB", 5),
    ("3 B.Sc CSHM", "PROJECT-LAB", 6),
    ("1 B.Sc CS", "PROG-C-LAB", 5),
    ("2 B.Sc CS", "DS-LAB", 5),
    ("2 B.Sc CS", "DBMS-LAB", 5),
    ("3 B.Sc CS", "JAVA-LAB", 6),
    ("3 B.Sc CS", "PROJECT-LAB", 6),
    ("1 B.Sc AI & ML", "PYTHON-LAB", 5),
    ("2 B.Sc AI & ML", "DS-LAB", 5),
    ("3 B.Sc AI & ML", "ML-LAB", 6),
    ("3 B.Sc AI & ML", "PROJECT-LAB", 6),
    ("1 B.Sc CSDA", "JAVA-LAB", 5),
    ("1 B.Sc CSDA", "ADV-OFFICE-LAB", 5),
    ("2 B.Sc CSDA", "DIG-MKTG-LAB", 5),
    ("3 B.Sc CSDA", "BIG-DATA-LAB", 6),
    ("3 B.Sc CSDA", "PROJECT-LAB", 6),
    ("1 B.Sc IT", "PROG-C-LAB", 5),
    ("2 B.Sc IT", "DS-LAB", 5),
    ("2 B.Sc IT", "DBMS-LAB", 5),
    ("3 B.Sc IT", "WEB-TECH-LAB", 6),
    ("3 B.Sc IT", "PROJECT-LAB", 6),
    ("1 M.Sc CS", "ADV-DS-LAB", 5),
    ("1 M.Sc CS", "ADV-JAVA-LAB", 5),
    ("2 M.Sc CS", "BIG-DATA-LAB", 5),
]


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

    for dept in DEPARTMENTS_TO_SEED:
        cur.execute(
            """
            INSERT INTO cg_departments (name, type)
            VALUES (%s, %s)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
            """,
            (dept["name"], dept["type"]),
        )
        dept_id = cur.fetchone()[0]

        hod_name = f"Dr. HOD {dept['name']}"
        cur.execute(
            """
            INSERT INTO cg_staff (name, role, dept_id, max_workload)
            SELECT %s, 'HOD', %s, 12
            WHERE NOT EXISTS (
              SELECT 1 FROM cg_staff WHERE name = %s AND role = 'HOD' AND dept_id = %s
            )
            """,
            (hod_name, dept_id, hod_name, dept_id),
        )

        for i in range(1, 5):
            staff_name = f"Prof. {dept['name']} Staff {i}"
            cur.execute(
                """
                INSERT INTO cg_staff (name, role, dept_id, max_workload)
                SELECT %s, 'Staff', %s, 18
                WHERE NOT EXISTS (
                  SELECT 1 FROM cg_staff WHERE name = %s AND role = 'Staff' AND dept_id = %s
                )
                """,
                (staff_name, dept_id, staff_name, dept_id),
            )

        for year in range(1, dept["years"] + 1):
            cur.execute(
                """
                INSERT INTO cg_classes (name, dept_id, year, semester)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (name) DO NOTHING
                """,
                (f"{year} {dept['name']}", dept_id, year, year * 2 - 1),
            )


def seed_lab_subjects(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
        INSERT INTO cg_subjects (name, code, type, is_addon) VALUES
          ('Office Automation (Lab)',           'OFFICE-AUTO-LAB',   'lab', false),
          ('Programming in C (Lab)',            'PROG-C-LAB',        'lab', false),
          ('Database Management System (Lab)',  'DBMS-LAB',          'lab', false),
          ('Web Technology (Lab)',              'WEB-TECH-LAB',      'lab', false),
          ('Accounting Software (Lab)',         'ACCT-SW-LAB',       'lab', false),
          ('Python Programming (Lab)',          'PYTHON-LAB',        'lab', false),
          ('Food Production (Lab)',             'FOOD-PROD-LAB',     'lab', false),
          ('Data Structures (Lab)',             'DS-LAB',            'lab', false),
          ('Java Programming (Lab)',            'JAVA-LAB',          'lab', false),
          ('Machine Learning (Lab)',            'ML-LAB',            'lab', false),
          ('Advanced Office Suite (Lab)',       'ADV-OFFICE-LAB',    'lab', false),
          ('Digital Marketing Analytics (Lab)', 'DIG-MKTG-LAB',      'lab', false),
          ('Big Data Analytics (Lab)',          'BIG-DATA-LAB',      'lab', false),
          ('Advanced Data Structures (Lab)',    'ADV-DS-LAB',        'lab', false),
          ('Advanced Java Programming (Lab)',   'ADV-JAVA-LAB',      'lab', false),
          ('Project Lab',                       'PROJECT-LAB',       'lab', false)
        ON CONFLICT (code) DO NOTHING
        """
    )

    for class_name, subject_code, hours in LAB_ASSIGNMENTS:
        cur.execute(
            """
            INSERT INTO cg_class_subjects (class_id, subject_id, hours_per_week, is_lab_required)
            SELECT c.id, s.id, %s, true
            FROM cg_classes c, cg_subjects s
            WHERE c.name = %s AND s.code = %s
            ON CONFLICT (class_id, subject_id) DO UPDATE
              SET is_lab_required = true, hours_per_week = EXCLUDED.hours_per_week
            """,
            (hours, class_name, subject_code),
        )


def main() -> None:
    db_url = get_db_url()
    with psycopg.connect(db_url, sslmode="require") as conn:
        with conn.cursor() as cur:
            seed_defaults(cur)
            seed_lab_subjects(cur)
        conn.commit()
    print("Seed completed: defaults, departments/staff/classes, and lab mappings inserted.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Seed failed: {exc}")
        sys.exit(1)
