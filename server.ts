import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const departmentsToSeed = [
  { name: 'B.Com', type: 'core', years: 3 },
  { name: 'B.Com CA', type: 'core', years: 3 },
  { name: 'B.Com PA', type: 'core', years: 3 },
  { name: 'B.Com IT', type: 'core', years: 3 },
  { name: 'BBA CA', type: 'core', years: 3 },
  { name: 'B.Sc CSHM', type: 'core', years: 3 },
  { name: 'B.Sc CS', type: 'core', years: 3 },
  { name: 'B.Sc AI & ML', type: 'core', years: 3 },
  { name: 'B.Sc CSDA', type: 'core', years: 3 },
  { name: 'B.Sc IT', type: 'core', years: 3 },
  { name: 'MBA', type: 'core', years: 2 },
  { name: 'M.Sc CS', type: 'core', years: 2 },
  { name: 'M.Com', type: 'core', years: 2 }
];

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cg_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cg_departments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('core', 'common'))
    );

    CREATE TABLE IF NOT EXISTS cg_staff (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('HOD', 'Staff')),
      dept_id INTEGER REFERENCES cg_departments(id) ON DELETE SET NULL,
      max_workload INTEGER NOT NULL DEFAULT 18
    );

    CREATE TABLE IF NOT EXISTS cg_subjects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('core', 'common', 'lab')),
      dept_id INTEGER REFERENCES cg_departments(id) ON DELETE SET NULL,
      is_addon BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS cg_classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      dept_id INTEGER NOT NULL REFERENCES cg_departments(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      student_strength INTEGER NOT NULL DEFAULT 0,
      tutor_staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS cg_class_subjects (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES cg_subjects(id) ON DELETE CASCADE,
      staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL,
      hours_per_week INTEGER NOT NULL,
      is_lab_required BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (class_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS cg_labs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      dept_id INTEGER REFERENCES cg_departments(id) ON DELETE SET NULL,
      systems_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cg_lab_requirements (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES cg_subjects(id) ON DELETE CASCADE,
      duration INTEGER NOT NULL,
      requirements TEXT
    );

    CREATE TABLE IF NOT EXISTS cg_timetable_slots (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      day_order INTEGER NOT NULL,
      period INTEGER NOT NULL,
      subject_id INTEGER REFERENCES cg_subjects(id) ON DELETE SET NULL,
      staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL,
      lab_id INTEGER REFERENCES cg_labs(id) ON DELETE SET NULL,
      is_locked BOOLEAN NOT NULL DEFAULT FALSE,
      type TEXT,
      UNIQUE (class_id, day_order, period)
    );

    CREATE TABLE IF NOT EXISTS cg_placement_blocks (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      hours INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cg_placement_classes (
      placement_id INTEGER NOT NULL REFERENCES cg_placement_blocks(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      PRIMARY KEY (placement_id, class_id)
    );

    CREATE TABLE IF NOT EXISTS cg_placement_preview_slots (
      id SERIAL PRIMARY KEY,
      placement_block_id INTEGER NOT NULL REFERENCES cg_placement_blocks(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      day_order INTEGER NOT NULL,
      period INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (placement_block_id, class_id, day_order, period)
    );
  `);

  await pool.query(`
    ALTER TABLE cg_timetable_slots
    ADD COLUMN IF NOT EXISTS placement_block_id INTEGER REFERENCES cg_placement_blocks(id) ON DELETE CASCADE;
  `);
}

async function seedDefaults() {
  const defaults = {
    college_start_time: '09:45',
    college_end_time: '15:45',
    periods_per_day: '6',
    break_duration: '15',
    break_after_period: '2',
    lunch_duration: '45',
    lunch_after_period: '3'
  } as Record<string, string>;

  for (const [key, value] of Object.entries(defaults)) {
    await pool.query(
      'INSERT INTO cg_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  for (const dept of departmentsToSeed) {
    const deptInsert = await pool.query(
      'INSERT INTO cg_departments (name, type) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [dept.name, dept.type]
    );
    const deptId = deptInsert.rows[0].id as number;

    await pool.query(
      `INSERT INTO cg_staff (name, role, dept_id, max_workload)
       VALUES ($1, 'HOD', $2, 12)
       ON CONFLICT DO NOTHING`,
      [`Dr. HOD ${dept.name}`, deptId]
    );

    for (let i = 1; i <= 4; i++) {
      await pool.query(
        `INSERT INTO cg_staff (name, role, dept_id, max_workload)
         VALUES ($1, 'Staff', $2, 18)
         ON CONFLICT DO NOTHING`,
        [`Prof. ${dept.name} Staff ${i}`, deptId]
      );
    }

    for (let y = 1; y <= dept.years; y++) {
      await pool.query(
        `INSERT INTO cg_classes (name, dept_id, year, semester)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [`${y} ${dept.name}`, deptId, y, y * 2 - 1]
      );
    }
  }
}

async function seedLabSubjects() {
  // Insert all lab subjects (idempotent via ON CONFLICT (code) DO NOTHING)
  await pool.query(`
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
      ('Digital Marketing Analytics (Lab)', 'DIG-MKTG-LAB',     'lab', false),
      ('Big Data Analytics (Lab)',          'BIG-DATA-LAB',      'lab', false),
      ('Advanced Data Structures (Lab)',    'ADV-DS-LAB',        'lab', false),
      ('Advanced Java Programming (Lab)',   'ADV-JAVA-LAB',      'lab', false),
      ('Project Lab',                       'PROJECT-LAB',       'lab', false)
    ON CONFLICT (code) DO NOTHING
  `);

  // Assign lab subjects to classes
  // 1st/2nd year labs = 5 hrs/week, 3rd year labs = 6 hrs/week
  const assignments: Array<{ className: string; subjectCode: string; hours: number }> = [
    // B.Com — no specific labs, only project lab for 3rd year
    { className: '3 B.Com',         subjectCode: 'PROJECT-LAB',     hours: 6 },
    // B.Com CA
    { className: '1 B.Com CA',      subjectCode: 'OFFICE-AUTO-LAB', hours: 5 },
    { className: '2 B.Com CA',      subjectCode: 'PROG-C-LAB',      hours: 5 },
    { className: '2 B.Com CA',      subjectCode: 'DBMS-LAB',        hours: 5 },
    { className: '3 B.Com CA',      subjectCode: 'WEB-TECH-LAB',    hours: 6 },
    { className: '3 B.Com CA',      subjectCode: 'PROJECT-LAB',     hours: 6 },
    // B.Com PA
    { className: '3 B.Com PA',      subjectCode: 'ACCT-SW-LAB',     hours: 6 },
    { className: '3 B.Com PA',      subjectCode: 'PROJECT-LAB',     hours: 6 },
    // B.Com IT
    { className: '1 B.Com IT',      subjectCode: 'PROG-C-LAB',      hours: 5 },
    { className: '2 B.Com IT',      subjectCode: 'DBMS-LAB',        hours: 5 },
    { className: '2 B.Com IT',      subjectCode: 'WEB-TECH-LAB',    hours: 5 },
    { className: '3 B.Com IT',      subjectCode: 'PROJECT-LAB',     hours: 6 },
    // BBA CA
    { className: '1 BBA CA',        subjectCode: 'OFFICE-AUTO-LAB', hours: 5 },
    { className: '2 BBA CA',        subjectCode: 'PYTHON-LAB',      hours: 5 },
    { className: '3 BBA CA',        subjectCode: 'WEB-TECH-LAB',    hours: 6 },
    { className: '3 BBA CA',        subjectCode: 'PROJECT-LAB',     hours: 6 },
    // B.Sc CSHM
    { className: '1 B.Sc CSHM',     subjectCode: 'FOOD-PROD-LAB',   hours: 5 },
    { className: '2 B.Sc CSHM',     subjectCode: 'WEB-TECH-LAB',    hours: 5 },
    { className: '3 B.Sc CSHM',     subjectCode: 'PROJECT-LAB',     hours: 6 },
    // B.Sc CS
    { className: '1 B.Sc CS',       subjectCode: 'PROG-C-LAB',      hours: 5 },
    { className: '2 B.Sc CS',       subjectCode: 'DS-LAB',          hours: 5 },
    { className: '2 B.Sc CS',       subjectCode: 'DBMS-LAB',        hours: 5 },
    { className: '3 B.Sc CS',       subjectCode: 'JAVA-LAB',        hours: 6 },
    { className: '3 B.Sc CS',       subjectCode: 'PROJECT-LAB',     hours: 6 },
    // B.Sc AI & ML
    { className: '1 B.Sc AI & ML',  subjectCode: 'PYTHON-LAB',      hours: 5 },
    { className: '2 B.Sc AI & ML',  subjectCode: 'DS-LAB',          hours: 5 },
    { className: '3 B.Sc AI & ML',  subjectCode: 'ML-LAB',          hours: 6 },
    { className: '3 B.Sc AI & ML',  subjectCode: 'PROJECT-LAB',     hours: 6 },
    // B.Sc CSDA
    { className: '1 B.Sc CSDA',     subjectCode: 'JAVA-LAB',        hours: 5 },
    { className: '1 B.Sc CSDA',     subjectCode: 'ADV-OFFICE-LAB',  hours: 5 },
    { className: '2 B.Sc CSDA',     subjectCode: 'DIG-MKTG-LAB',    hours: 5 },
    { className: '3 B.Sc CSDA',     subjectCode: 'BIG-DATA-LAB',    hours: 6 },
    { className: '3 B.Sc CSDA',     subjectCode: 'PROJECT-LAB',     hours: 6 },
    // B.Sc IT
    { className: '1 B.Sc IT',       subjectCode: 'PROG-C-LAB',      hours: 5 },
    { className: '2 B.Sc IT',       subjectCode: 'DS-LAB',          hours: 5 },
    { className: '2 B.Sc IT',       subjectCode: 'DBMS-LAB',        hours: 5 },
    { className: '3 B.Sc IT',       subjectCode: 'WEB-TECH-LAB',    hours: 6 },
    { className: '3 B.Sc IT',       subjectCode: 'PROJECT-LAB',     hours: 6 },
    // M.Sc CS
    { className: '1 M.Sc CS',       subjectCode: 'ADV-DS-LAB',      hours: 5 },
    { className: '1 M.Sc CS',       subjectCode: 'ADV-JAVA-LAB',    hours: 5 },
    { className: '2 M.Sc CS',       subjectCode: 'BIG-DATA-LAB',    hours: 5 },
  ];

  for (const a of assignments) {
    await pool.query(
      `INSERT INTO cg_class_subjects (class_id, subject_id, hours_per_week, is_lab_required)
       SELECT c.id, s.id, $1, true
       FROM cg_classes c, cg_subjects s
       WHERE c.name = $2 AND s.code = $3
       ON CONFLICT (class_id, subject_id) DO NOTHING`,
      [a.hours, a.className, a.subjectCode]
    );
  }
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

type SchedulerRequest = {
  classes: number[];
  class_details?: Array<{ id: number; dept_id: number; year: number }>;
  hours: number;
  periods_per_day: number;
  days: number[];
  occupied: Record<string, Array<{ day_order: number; period: number }>>;
};

type SchedulerAssignment = {
  class_id: number;
  day_order: number;
  start_period: number;
  periods: number[];
  segment: 'morning' | 'afternoon';
  group?: string;
  subgroup?: string;
};

type SchedulerResponse =
  | { ok: true; assignments: SchedulerAssignment[] }
  | { ok: false; error: string };

type PlacementGroupInfo = {
  segment: 'morning' | 'afternoon';
  group: string;
  subgroup: string;
  dayOffset: number;
};

function chunkEvenly<T>(values: T[], chunkCount: number): T[][] {
  if (chunkCount <= 0) {
    return [];
  }

  const baseSize = Math.floor(values.length / chunkCount);
  const remainder = values.length % chunkCount;
  const chunks: T[][] = [];
  let start = 0;

  for (let index = 0; index < chunkCount; index++) {
    const size = baseSize + (index < remainder ? 1 : 0);
    if (size <= 0) {
      continue;
    }
    chunks.push(values.slice(start, start + size));
    start += size;
  }

  return chunks;
}

function nextBucketWithCapacity(startIndex: number, buckets: Array<PlacementGroupInfo & { capacity: number }>): number {
  for (let offset = 0; offset < buckets.length; offset++) {
    const idx = (startIndex + offset) % buckets.length;
    if (buckets[idx].capacity > 0) {
      return idx;
    }
  }

  throw new Error('No bucket capacity remaining for placement grouping');
}

function assignPlacementGroups(
  classEntries: Array<{ id: number; dept_id: number; year: number }>,
  days: number[]
): Record<number, PlacementGroupInfo> {
  const sorted = [...classEntries].sort((a, b) => a.id - b.id);
  const result: Record<number, PlacementGroupInfo> = {};
  const targetClassesPerSubgroup = 2;
  const maxCombinations = 3;

  const morningCount = Math.floor(sorted.length / 2);
  const afternoonCount = sorted.length - morningCount;

  const buildBuckets = (count: number, segment: 'morning' | 'afternoon', group: string) => {
    if (count <= 0) {
      return [] as Array<PlacementGroupInfo & { capacity: number }>;
    }

    const subgroupCount = Math.min(maxCombinations, Math.max(1, Math.ceil(count / targetClassesPerSubgroup)));
    const subgroupSizes = chunkEvenly(Array.from({ length: count }, (_, i) => i), subgroupCount).map(chunk => chunk.length);
    return subgroupSizes.map((size, subgroupIndex) => ({
      segment,
      group,
      subgroup: `${group}${subgroupIndex + 1}`,
      dayOffset: subgroupIndex,
      capacity: size
    }));
  };

  const buckets = [...buildBuckets(morningCount, 'morning', 'A'), ...buildBuckets(afternoonCount, 'afternoon', 'B')];
  const yearMap = new Map<number, Array<{ id: number; dept_id: number }>>();
  sorted.forEach(entry => {
    const existing = yearMap.get(entry.year) || [];
    existing.push({ id: entry.id, dept_id: entry.dept_id });
    yearMap.set(entry.year, existing);
  });

  const uniqueDayOffsets = [...new Set(buckets.map(bucket => bucket.dayOffset))].sort((a, b) => a - b);
  let yearPointer = 0;

  for (const year of [...yearMap.keys()].sort((a, b) => a - b)) {
    const entries = yearMap.get(year) || [];
    const preferredOffset = uniqueDayOffsets.length > 0 ? uniqueDayOffsets[yearPointer % uniqueDayOffsets.length] : 0;
    const deptMap = new Map<number, number[]>();

    entries.forEach(entry => {
      const ids = deptMap.get(entry.dept_id) || [];
      ids.push(entry.id);
      deptMap.set(entry.dept_id, ids);
    });

    let localPointer = 0;
    for (const deptId of [...deptMap.keys()].sort((a, b) => a - b)) {
      const ids = deptMap.get(deptId) || [];
      ids.forEach(classId => {
        const prioritized = buckets
          .map((bucket, index) => ({ ...bucket, index }))
          .filter(bucket => bucket.capacity > 0)
          .sort((left, right) => {
            const leftYearPenalty = left.dayOffset === preferredOffset ? 0 : 1;
            const rightYearPenalty = right.dayOffset === preferredOffset ? 0 : 1;
            if (leftYearPenalty !== rightYearPenalty) return leftYearPenalty - rightYearPenalty;

            const leftPointerPenalty = (left.index - localPointer + buckets.length) % buckets.length;
            const rightPointerPenalty = (right.index - localPointer + buckets.length) % buckets.length;
            return leftPointerPenalty - rightPointerPenalty;
          });

        const chosen = prioritized[0];
        const bucket = buckets[chosen.index];
        result[classId] = {
          segment: bucket.segment,
          group: bucket.group,
          subgroup: bucket.subgroup,
          dayOffset: bucket.dayOffset
        };
        bucket.capacity -= 1;
        localPointer = (chosen.index + 1) % buckets.length;
      });
    }

    yearPointer += 1;
  }

  return result;
}

function runPlacementScheduler(payload: SchedulerRequest): Promise<SchedulerResponse> {
  return new Promise((resolve, reject) => {
    const configuredPython = process.env.PYTHON_PATH;
    const workspaceVenvWindows = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const workspaceVenvUnix = path.join(process.cwd(), '.venv', 'bin', 'python');
    const pythonBinary = configuredPython
      || (fs.existsSync(workspaceVenvWindows) ? workspaceVenvWindows : '')
      || (fs.existsSync(workspaceVenvUnix) ? workspaceVenvUnix : '')
      || 'python';
    const scriptPath = path.join(process.cwd(), 'scheduler', 'placement_scheduler.py');
    const python = spawn(pythonBinary, [scriptPath]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    python.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    python.on('error', reject);

    python.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Placement scheduler failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as SchedulerResponse);
      } catch {
        reject(new Error(`Invalid scheduler output: ${stdout || stderr}`));
      }
    });

    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();
  });
}

async function startServer() {
  if (!process.env.SUPABASE_DB_URL && !process.env.DATABASE_URL) {
    throw new Error('Missing SUPABASE_DB_URL or DATABASE_URL in .env');
  }

  await ensureSchema();
  await seedDefaults();
  await seedLabSubjects();

  const app = express();
  app.use(express.json());
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    return next(err);
  });
  const PORT = 3000;

  app.get('/api/settings', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT key, value FROM cg_settings');
      const map = rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      res.json(map);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/settings', async (req, res) => {
    try {
      const updates = req.body as Record<string, any>;
      await inTransaction(async client => {
        for (const [key, value] of Object.entries(updates)) {
          await client.query(
            `INSERT INTO cg_settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [key, String(value)]
          );
        }
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/departments', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM cg_departments ORDER BY name');
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/departments', async (req, res) => {
    try {
      const { name, type } = req.body;
      const { rows } = await pool.query(
        'INSERT INTO cg_departments (name, type) VALUES ($1, $2) RETURNING id',
        [name, type]
      );
      res.json({ id: rows[0].id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/departments/:id', async (req, res) => {
    try {
      const deptId = Number(req.params.id);
      const existing = await pool.query('SELECT id FROM cg_departments WHERE id = $1', [deptId]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Department not found' });

      await inTransaction(async client => {
        const classes = await client.query('SELECT id FROM cg_classes WHERE dept_id = $1', [deptId]);
        const ids = classes.rows.map((r: { id: number }) => r.id);
        if (ids.length > 0) {
          await client.query('DELETE FROM cg_timetable_slots WHERE class_id = ANY($1::int[])', [ids]);
          await client.query('DELETE FROM cg_class_subjects WHERE class_id = ANY($1::int[])', [ids]);
          await client.query('DELETE FROM cg_lab_requirements WHERE class_id = ANY($1::int[])', [ids]);
          await client.query('DELETE FROM cg_placement_classes WHERE class_id = ANY($1::int[])', [ids]);
          await client.query('DELETE FROM cg_classes WHERE id = ANY($1::int[])', [ids]);
        }
        await client.query('UPDATE cg_staff SET dept_id = NULL WHERE dept_id = $1', [deptId]);
        await client.query('UPDATE cg_subjects SET dept_id = NULL WHERE dept_id = $1', [deptId]);
        await client.query('DELETE FROM cg_departments WHERE id = $1', [deptId]);
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/staff', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT s.*, d.name AS dept_name,
               COALESCE((SELECT SUM(hours_per_week) FROM cg_class_subjects WHERE staff_id = s.id), 0) AS current_workload
        FROM cg_staff s
        LEFT JOIN cg_departments d ON s.dept_id = d.id
        ORDER BY s.name
      `);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/staff', async (req, res) => {
    try {
      const { name, role, dept_id, max_workload } = req.body;
      const { rows } = await pool.query(
        'INSERT INTO cg_staff (name, role, dept_id, max_workload) VALUES ($1, $2, $3, $4) RETURNING id',
        [name, role, dept_id || null, max_workload]
      );
      res.json({ id: rows[0].id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/subjects', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM cg_subjects ORDER BY name');
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/subjects', async (req, res) => {
    try {
      const { name, code, type, dept_id, is_addon } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO cg_subjects (name, code, type, dept_id, is_addon)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name?.trim(), code?.trim(), type, dept_id ? Number(dept_id) : null, !!is_addon]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/subjects/:id', async (req, res) => {
    try {
      const subjectId = Number(req.params.id);
      const existing = await pool.query('SELECT id FROM cg_subjects WHERE id = $1', [subjectId]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Subject not found' });

      await inTransaction(async client => {
        await client.query('DELETE FROM cg_timetable_slots WHERE subject_id = $1', [subjectId]);
        await client.query('DELETE FROM cg_class_subjects WHERE subject_id = $1', [subjectId]);
        await client.query('DELETE FROM cg_lab_requirements WHERE subject_id = $1', [subjectId]);
        await client.query('DELETE FROM cg_subjects WHERE id = $1', [subjectId]);
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/classes', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT c.*, d.name AS dept_name, t.name AS tutor_name
        FROM cg_classes c
        JOIN cg_departments d ON c.dept_id = d.id
        LEFT JOIN cg_staff t ON c.tutor_staff_id = t.id
        ORDER BY c.name
      `);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/classes', async (req, res) => {
    try {
      const { name, dept_id, year, semester, student_strength, tutor_staff_id } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO cg_classes (name, dept_id, year, semester, student_strength, tutor_staff_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          name?.trim(),
          Number(dept_id),
          Number(year),
          Number(semester),
          Number(student_strength) || 0,
          tutor_staff_id ? Number(tutor_staff_id) : null
        ]
      );
      const classId = rows[0].id;
      const result = await pool.query(
        `SELECT c.*, d.name AS dept_name, t.name AS tutor_name
         FROM cg_classes c
         JOIN cg_departments d ON c.dept_id = d.id
         LEFT JOIN cg_staff t ON c.tutor_staff_id = t.id
         WHERE c.id = $1`,
        [classId]
      );
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/classes/:id', async (req, res) => {
    try {
      const classId = Number(req.params.id);
      const existing = await pool.query('SELECT * FROM cg_classes WHERE id = $1', [classId]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Class not found' });
      const current = existing.rows[0];

      const studentStrength = req.body.student_strength ?? current.student_strength;
      const tutorStaffId = req.body.tutor_staff_id === undefined
        ? current.tutor_staff_id
        : (req.body.tutor_staff_id ? Number(req.body.tutor_staff_id) : null);

      await pool.query(
        'UPDATE cg_classes SET student_strength = $1, tutor_staff_id = $2 WHERE id = $3',
        [Number(studentStrength) || 0, tutorStaffId, classId]
      );

      const updated = await pool.query(
        `SELECT c.*, d.name AS dept_name, t.name AS tutor_name
         FROM cg_classes c
         JOIN cg_departments d ON c.dept_id = d.id
         LEFT JOIN cg_staff t ON c.tutor_staff_id = t.id
         WHERE c.id = $1`,
        [classId]
      );
      res.json(updated.rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/classes/:id/subjects', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT cs.*, s.name AS subject_name, s.code AS subject_code, st.name AS staff_name
        FROM cg_class_subjects cs
        JOIN cg_subjects s ON cs.subject_id = s.id
        LEFT JOIN cg_staff st ON cs.staff_id = st.id
        WHERE cs.class_id = $1
        ORDER BY s.name
      `, [Number(req.params.id)]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/classes/:id/subjects', async (req, res) => {
    try {
      const classId = Number(req.params.id);
      const { subject_id, staff_id, hours_per_week, is_lab_required } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO cg_class_subjects (class_id, subject_id, staff_id, hours_per_week, is_lab_required)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (class_id, subject_id) DO UPDATE
         SET staff_id = EXCLUDED.staff_id,
             hours_per_week = EXCLUDED.hours_per_week,
             is_lab_required = EXCLUDED.is_lab_required
         RETURNING id`,
        [classId, Number(subject_id), staff_id ? Number(staff_id) : null, Number(hours_per_week), !!is_lab_required]
      );
      res.json({ id: rows[0].id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/classes/:id/subjects/bulk', async (req, res) => {
    try {
      const classId = Number(req.params.id);
      const subjects = req.body.subjects as any[];
      await inTransaction(async client => {
        for (const subject of subjects) {
          await client.query(
            `INSERT INTO cg_class_subjects (class_id, subject_id, staff_id, hours_per_week, is_lab_required)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (class_id, subject_id) DO NOTHING`,
            [
              classId,
              Number(subject.subject_id),
              subject.staff_id ? Number(subject.staff_id) : null,
              Number(subject.hours_per_week || 3),
              !!subject.is_lab_required
            ]
          );
        }
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/subjects-and-assign', async (req, res) => {
    try {
      const { name, code, type, dept_id, class_id, staff_id, hours_per_week, is_lab_required } = req.body;
      const subject = await inTransaction(async client => {
        const created = await client.query(
          `INSERT INTO cg_subjects (name, code, type, dept_id, is_addon)
           VALUES ($1, $2, $3, $4, FALSE)
           RETURNING *`,
          [name?.trim(), code?.trim(), type, dept_id ? Number(dept_id) : null]
        );
        const subjectId = created.rows[0].id;

        await client.query(
          `INSERT INTO cg_class_subjects (class_id, subject_id, staff_id, hours_per_week, is_lab_required)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (class_id, subject_id) DO NOTHING`,
          [Number(class_id), subjectId, staff_id ? Number(staff_id) : null, Number(hours_per_week || 3), !!is_lab_required]
        );

        return created.rows[0];
      });

      res.json(subject);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/classes/:classId/subjects/:classSubjectId', async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      const classSubjectId = Number(req.params.classSubjectId);
      const { staff_id, hours_per_week, is_lab_required } = req.body;

      const existing = await pool.query(
        'SELECT * FROM cg_class_subjects WHERE id = $1 AND class_id = $2',
        [classSubjectId, classId]
      );
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Class subject not found' });
      const current = existing.rows[0];

      const updatedHours = hours_per_week !== undefined ? Number(hours_per_week) : current.hours_per_week;
      const updatedStaff = staff_id !== undefined ? (staff_id ? Number(staff_id) : null) : current.staff_id;
      const updatedLab = is_lab_required !== undefined ? !!is_lab_required : current.is_lab_required;

      await pool.query(
        `UPDATE cg_class_subjects
         SET staff_id = $1, hours_per_week = $2, is_lab_required = $3
         WHERE id = $4`,
        [updatedStaff, updatedHours, updatedLab, classSubjectId]
      );

      const updated = await pool.query(`
        SELECT cs.*, s.name AS subject_name, s.code AS subject_code, st.name AS staff_name
        FROM cg_class_subjects cs
        JOIN cg_subjects s ON cs.subject_id = s.id
        LEFT JOIN cg_staff st ON cs.staff_id = st.id
        WHERE cs.id = $1
      `, [classSubjectId]);

      res.json(updated.rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/classes/:classId/subjects/:classSubjectId', async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      const classSubjectId = Number(req.params.classSubjectId);
      const existing = await pool.query(
        'SELECT id FROM cg_class_subjects WHERE id = $1 AND class_id = $2',
        [classSubjectId, classId]
      );
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Class subject not found' });

      await pool.query('DELETE FROM cg_class_subjects WHERE id = $1', [classSubjectId]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/labs', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM cg_labs ORDER BY name');
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/labs', async (req, res) => {
    try {
      const { name, dept_id, systems_count } = req.body;
      const { rows } = await pool.query(
        'INSERT INTO cg_labs (name, dept_id, systems_count) VALUES ($1, $2, $3) RETURNING id',
        [name, dept_id ? Number(dept_id) : null, Number(systems_count)]
      );
      res.json({ id: rows[0].id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/labs/:id', async (req, res) => {
    try {
      const labId = Number(req.params.id);
      const existing = await pool.query('SELECT id FROM cg_labs WHERE id = $1', [labId]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Lab not found' });

      const usage = await pool.query('SELECT COUNT(*)::int AS count FROM cg_timetable_slots WHERE lab_id = $1', [labId]);
      if ((usage.rows[0].count as number) > 0) {
        return res.status(400).json({ error: 'This lab is already used in the timetable and cannot be deleted.' });
      }

      await pool.query('DELETE FROM cg_labs WHERE id = $1', [labId]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/timetable/:classId', async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      const { rows } = await pool.query(`
        SELECT ts.*, s.name AS subject_name, s.code AS subject_code, st.name AS staff_name, l.name AS lab_name
        FROM cg_timetable_slots ts
        LEFT JOIN cg_subjects s ON ts.subject_id = s.id
        LEFT JOIN cg_staff st ON ts.staff_id = st.id
        LEFT JOIN cg_labs l ON ts.lab_id = l.id
        WHERE ts.class_id = $1
      `, [classId]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/timetable/assign', async (req, res) => {
    try {
      const { class_id, day_order, period, subject_id, staff_id, lab_id, type, is_locked } = req.body;

      if (staff_id) {
        const clash = await pool.query(
          `SELECT id FROM cg_timetable_slots
           WHERE staff_id = $1 AND day_order = $2 AND period = $3 AND class_id != $4
           LIMIT 1`,
          [Number(staff_id), Number(day_order), Number(period), Number(class_id)]
        );
        if (clash.rowCount) return res.status(400).json({ error: 'Staff already assigned to another class at this time' });
      }

      if (lab_id) {
        const labClash = await pool.query(
          `SELECT id FROM cg_timetable_slots
           WHERE lab_id = $1 AND day_order = $2 AND period = $3 AND class_id != $4
           LIMIT 1`,
          [Number(lab_id), Number(day_order), Number(period), Number(class_id)]
        );
        if (labClash.rowCount) return res.status(400).json({ error: 'Lab already occupied at this time' });
      }

      await pool.query(
        `INSERT INTO cg_timetable_slots (class_id, day_order, period, subject_id, staff_id, lab_id, type, is_locked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (class_id, day_order, period) DO UPDATE
         SET subject_id = EXCLUDED.subject_id,
             staff_id = EXCLUDED.staff_id,
             lab_id = EXCLUDED.lab_id,
             type = EXCLUDED.type,
             is_locked = EXCLUDED.is_locked`,
        [
          Number(class_id),
          Number(day_order),
          Number(period),
          subject_id ? Number(subject_id) : null,
          staff_id ? Number(staff_id) : null,
          lab_id ? Number(lab_id) : null,
          type ?? null,
          !!is_locked
        ]
      );

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/placement/blocks', async (req, res) => {
    try {
      const blocks = await pool.query('SELECT * FROM cg_placement_blocks ORDER BY id DESC');
      const result = [] as any[];
      for (const block of blocks.rows) {
        const classes = await pool.query(
          `SELECT c.*, d.name AS dept_name FROM cg_classes c
           JOIN cg_placement_classes pc ON c.id = pc.class_id
           JOIN cg_departments d ON d.id = c.dept_id
           WHERE pc.placement_id = $1`,
          [block.id]
        );
        const preview = await pool.query(
          'SELECT COUNT(*)::int AS count FROM cg_placement_preview_slots WHERE placement_block_id = $1',
          [block.id]
        );
        result.push({
          ...block,
          classes: classes.rows,
          has_preview: Number(preview.rows[0].count) > 0
        });
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/placement/blocks', async (req, res) => {
    try {
      const { name, hours, class_ids } = req.body as { name: string; hours: number; class_ids: number[] };

      if (!Array.isArray(class_ids) || class_ids.length === 0) {
        return res.status(400).json({ error: 'Select at least one class for placement.' });
      }

      const normalizedHours = Number(hours);
      if (!Number.isInteger(normalizedHours) || normalizedHours < 2) {
        return res.status(400).json({ error: 'Placement block must be at least 2 consecutive hours.' });
      }

      const blockId = await inTransaction(async client => {
        const dedupedClassIds = [...new Set(class_ids.map(id => Number(id)).filter(Boolean))];
        const block = await client.query(
          'INSERT INTO cg_placement_blocks (name, hours) VALUES ($1, $2) RETURNING id',
          [name, normalizedHours]
        );
        const placementId = block.rows[0].id as number;

        for (const classId of dedupedClassIds) {
          await client.query(
            'INSERT INTO cg_placement_classes (placement_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [placementId, Number(classId)]
          );
        }

        return placementId;
      });

      res.json({ id: blockId });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/placement/blocks/:id/generate-preview', async (req, res) => {
    try {
      const blockId = Number(req.params.id);

      const generated = await inTransaction(async client => {
        const blockRows = await client.query('SELECT id, hours FROM cg_placement_blocks WHERE id = $1', [blockId]);
        if (blockRows.rowCount === 0) {
          throw new Error('Placement block not found');
        }

        const block = blockRows.rows[0] as { id: number; hours: number };
        const classRows = await client.query(
          `SELECT pc.class_id, c.dept_id, c.year
           FROM cg_placement_classes pc
           JOIN cg_classes c ON c.id = pc.class_id
           WHERE pc.placement_id = $1
           ORDER BY pc.class_id`,
          [blockId]
        );
        const classDetails = classRows.rows as Array<{ class_id: number; dept_id: number; year: number }>;
        const classIds = classDetails.map(r => r.class_id);
        if (classIds.length === 0) {
          throw new Error('No classes assigned to this placement block');
        }

        const settingsRows = await client.query('SELECT key, value FROM cg_settings');
        const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
          acc[row.key] = row.value;
          return acc;
        }, {});
        const periodsPerDay = Number(settings.periods_per_day || 6);

        const occupiedRows = await client.query(
          `SELECT class_id, day_order, period, type, placement_block_id
           FROM cg_timetable_slots
           WHERE class_id = ANY($1::int[])
             AND NOT (type = 'placement' AND placement_block_id = $2)`,
          [classIds, blockId]
        );

        const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
        const blockedBySubjects: Record<string, Array<{ day_order: number; period: number }>> = {};
        for (const classId of classIds) {
          occupied[String(classId)] = [];
          blockedBySubjects[String(classId)] = [];
        }

        for (const row of occupiedRows.rows as Array<{ class_id: number; day_order: number; period: number; type: string | null }>) {
          occupied[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
          if (row.type !== 'placement') {
            blockedBySubjects[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
          }
        }

        const schedule = await runPlacementScheduler({
          classes: classIds,
          class_details: classDetails.map(item => ({ id: item.class_id, dept_id: item.dept_id, year: item.year })),
          hours: Number(block.hours),
          periods_per_day: periodsPerDay,
          days: [1, 2, 3, 4, 5, 6],
          occupied
        });

        if (!schedule.ok) {
          const errorMessage = 'error' in schedule ? schedule.error : 'Placement scheduler failed';
          throw new Error(errorMessage);
        }

        await client.query('DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1', [blockId]);

        for (const assignment of schedule.assignments) {
          for (const period of assignment.periods) {
            await client.query(
              `INSERT INTO cg_placement_preview_slots (placement_block_id, class_id, day_order, period)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (placement_block_id, class_id, day_order, period) DO NOTHING`,
              [blockId, assignment.class_id, assignment.day_order, period]
            );
          }
        }

        return {
          assignments: schedule.assignments,
          blocked_by_subjects: blockedBySubjects,
          periods_per_day: periodsPerDay,
          hours: Number(block.hours)
        };
      });

      res.json(generated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/placement/blocks/:id/preview', async (req, res) => {
    try {
      const blockId = Number(req.params.id);

      const result = await inTransaction(async client => {
        const blockRows = await client.query('SELECT id, hours FROM cg_placement_blocks WHERE id = $1', [blockId]);
        if (blockRows.rowCount === 0) {
          throw new Error('Placement block not found');
        }

        const classRows = await client.query(
          `SELECT pc.class_id, c.dept_id, c.year
           FROM cg_placement_classes pc
           JOIN cg_classes c ON c.id = pc.class_id
           WHERE pc.placement_id = $1
           ORDER BY pc.class_id`,
          [blockId]
        );
        const classDetails = classRows.rows as Array<{ class_id: number; dept_id: number; year: number }>;
        const classIds = classDetails.map(r => r.class_id);
        if (classIds.length === 0) {
          throw new Error('No classes assigned to this placement block');
        }

        const settingsRows = await client.query('SELECT key, value FROM cg_settings');
        const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
          acc[row.key] = row.value;
          return acc;
        }, {});
        const periodsPerDay = Number(settings.periods_per_day || 6);

        const blockedRows = await client.query(
          `SELECT class_id, day_order, period, type
           FROM cg_timetable_slots
           WHERE class_id = ANY($1::int[])
             AND NOT (type = 'placement' AND placement_block_id = $2)`,
          [classIds, blockId]
        );

        const blockedBySubjects: Record<string, Array<{ day_order: number; period: number }>> = {};
        for (const classId of classIds) {
          blockedBySubjects[String(classId)] = [];
        }

        for (const row of blockedRows.rows as Array<{ class_id: number; day_order: number; period: number; type: string | null }>) {
          if (row.type !== 'placement') {
            blockedBySubjects[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
          }
        }

        const previewRows = await client.query(
          `SELECT class_id, day_order, period
           FROM cg_placement_preview_slots
           WHERE placement_block_id = $1
           ORDER BY class_id, day_order, period`,
          [blockId]
        );

        const grouped = new Map<string, number[]>();
        for (const row of previewRows.rows as Array<{ class_id: number; day_order: number; period: number }>) {
          const key = `${row.class_id}-${row.day_order}`;
          const values = grouped.get(key) || [];
          values.push(Number(row.period));
          grouped.set(key, values);
        }

        const groupInfo = assignPlacementGroups(
          classDetails.map(item => ({ id: item.class_id, dept_id: item.dept_id, year: item.year })),
          [1, 2, 3, 4, 5, 6]
        );

        const assignments: Array<{
          class_id: number;
          day_order: number;
          start_period: number;
          periods: number[];
          segment: 'morning' | 'afternoon';
          group?: string;
          subgroup?: string;
        }> = [];

        for (const [key, periods] of grouped.entries()) {
          const [classIdRaw, dayRaw] = key.split('-');
          const classId = Number(classIdRaw);
          const dayOrder = Number(dayRaw);
          periods.sort((a, b) => a - b);
          if (periods.length === 0) continue;
          const info = groupInfo[classId];
          const segment: 'morning' | 'afternoon' = info?.segment || (periods[0] <= Math.floor(periodsPerDay / 2) ? 'morning' : 'afternoon');

          assignments.push({
            class_id: classId,
            day_order: dayOrder,
            start_period: periods[0],
            periods,
            segment,
            group: info?.group,
            subgroup: info?.subgroup
          });
        }

        return {
          assignments,
          blocked_by_subjects: blockedBySubjects,
          periods_per_day: periodsPerDay,
          hours: Number(blockRows.rows[0].hours)
        };
      });

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/placement/blocks/:id/fix-slots', async (req, res) => {
    try {
      const blockId = Number(req.params.id);
      const { assignments } = req.body as {
        assignments: Array<{ class_id: number; day_order: number; periods: number[] }>;
      };

      if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ error: 'No generated assignments provided to fix.' });
      }

      await inTransaction(async client => {
        const blockRows = await client.query('SELECT id FROM cg_placement_blocks WHERE id = $1', [blockId]);
        if (blockRows.rowCount === 0) {
          throw new Error('Placement block not found');
        }

        const hoursRows = await client.query('SELECT hours FROM cg_placement_blocks WHERE id = $1', [blockId]);
        const blockHours = Number(hoursRows.rows[0].hours || 0);

        const classRows = await client.query('SELECT class_id FROM cg_placement_classes WHERE placement_id = $1', [blockId]);
        const allowedClassIds = new Set(classRows.rows.map((r: { class_id: number }) => r.class_id));

        await client.query('DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1', [blockId]);

        for (const a of assignments) {
          if (!allowedClassIds.has(Number(a.class_id))) {
            throw new Error(`Class ${a.class_id} is not part of this placement block`);
          }

          const periods = (a.periods || []).map(Number).sort((x, y) => x - y);
          if (periods.length < 2) {
            throw new Error(`Class ${a.class_id} must have at least 2 consecutive placement periods`);
          }
          for (let i = 1; i < periods.length; i++) {
            if (periods[i] !== periods[i - 1] + 1) {
              throw new Error(`Class ${a.class_id} placement periods must be consecutive`);
            }
          }

          for (const p of periods) {
            const clash = await client.query(
              `SELECT id
               FROM cg_timetable_slots
               WHERE class_id = $1
                 AND day_order = $2
                 AND period = $3
                 AND NOT (type = 'placement' AND placement_block_id = $4)
               LIMIT 1`,
              [Number(a.class_id), Number(a.day_order), Number(p), blockId]
            );

            if (clash.rowCount > 0) {
              throw new Error(
                `Conflict detected for class ${a.class_id} at Day ${a.day_order}, Period ${p}.`
              );
            }

            await client.query(
              `INSERT INTO cg_placement_preview_slots (placement_block_id, class_id, day_order, period)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (placement_block_id, class_id, day_order, period) DO NOTHING`,
              [blockId, Number(a.class_id), Number(a.day_order), Number(p)]
            );
          }
        }

        const previewRows = await client.query(
          `SELECT class_id, day_order, period
           FROM cg_placement_preview_slots
           WHERE placement_block_id = $1
           ORDER BY class_id, day_order, period`,
          [blockId]
        );

        if (previewRows.rowCount === 0) {
          throw new Error('No preview slots found to fix. Generate preview first.');
        }

        const grouped = new Map<string, number[]>();
        for (const row of previewRows.rows as Array<{ class_id: number; day_order: number; period: number }>) {
          const key = `${row.class_id}-${row.day_order}`;
          const periods = grouped.get(key) || [];
          periods.push(Number(row.period));
          grouped.set(key, periods);
        }

        const classToDays = new Map<number, number>();
        for (const [key, periods] of grouped.entries()) {
          periods.sort((x, y) => x - y);
          if (periods.length !== blockHours) {
            throw new Error(`Preview hours mismatch for ${key}. Expected ${blockHours} periods.`);
          }
          for (let i = 1; i < periods.length; i++) {
            if (periods[i] !== periods[i - 1] + 1) {
              throw new Error(`Preview periods must be consecutive for ${key}.`);
            }
          }
          const classId = Number(key.split('-')[0]);
          classToDays.set(classId, (classToDays.get(classId) || 0) + 1);
        }

        for (const classId of allowedClassIds.values()) {
          if ((classToDays.get(classId) || 0) !== 1) {
            throw new Error(`Class ${classId} must have exactly one preview block before fixing.`);
          }
        }

        await client.query('DELETE FROM cg_timetable_slots WHERE placement_block_id = $1', [blockId]);

        for (const row of previewRows.rows as Array<{ class_id: number; day_order: number; period: number }>) {
          await client.query(
            `INSERT INTO cg_timetable_slots (class_id, day_order, period, type, is_locked, placement_block_id, subject_id, staff_id, lab_id)
             VALUES ($1, $2, $3, 'placement', TRUE, $4, NULL, NULL, NULL)
             ON CONFLICT (class_id, day_order, period) DO UPDATE
             SET type = EXCLUDED.type,
                 is_locked = EXCLUDED.is_locked,
                 placement_block_id = EXCLUDED.placement_block_id,
                 subject_id = NULL,
                 staff_id = NULL,
                 lab_id = NULL`,
            [Number(row.class_id), Number(row.day_order), Number(row.period), blockId]
          );
        }

        await client.query('DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1', [blockId]);
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/placement/blocks/:id', async (req, res) => {
    try {
      const blockId = Number(req.params.id);
      await inTransaction(async client => {
        const classes = await client.query('SELECT class_id FROM cg_placement_classes WHERE placement_id = $1', [blockId]);

        const taggedDelete = await client.query('DELETE FROM cg_timetable_slots WHERE placement_block_id = $1', [blockId]);
        await client.query('DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1', [blockId]);

        if (taggedDelete.rowCount === 0) {
          for (const c of classes.rows as Array<{ class_id: number }>) {
            await client.query("DELETE FROM cg_timetable_slots WHERE class_id = $1 AND type = 'placement'", [c.class_id]);
          }
        }

        await client.query('DELETE FROM cg_placement_classes WHERE placement_id = $1', [blockId]);
        await client.query('DELETE FROM cg_placement_blocks WHERE id = $1', [blockId]);
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/placement/blocks/:id/classes/:classId', async (req, res) => {
    try {
      const blockId = Number(req.params.id);
      const classId = Number(req.params.classId);

      await inTransaction(async client => {
        const taggedDelete = await client.query(
          'DELETE FROM cg_timetable_slots WHERE class_id = $1 AND placement_block_id = $2',
          [classId, blockId]
        );

        if (taggedDelete.rowCount === 0) {
          await client.query("DELETE FROM cg_timetable_slots WHERE class_id = $1 AND type = 'placement'", [classId]);
        }

        await client.query(
          'DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1 AND class_id = $2',
          [blockId, classId]
        );

        await client.query('DELETE FROM cg_placement_classes WHERE placement_id = $1 AND class_id = $2', [blockId, classId]);

        const remain = await client.query('SELECT COUNT(*)::int AS count FROM cg_placement_classes WHERE placement_id = $1', [blockId]);
        if ((remain.rows[0].count as number) === 0) {
          await client.query('DELETE FROM cg_placement_blocks WHERE id = $1', [blockId]);
        }
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/timetable/move-slot', async (req, res) => {
    try {
      const { class_id, from_day, from_period, to_day, to_period } = req.body;
      await inTransaction(async client => {
        const slot = await client.query(
          `SELECT * FROM cg_timetable_slots WHERE class_id = $1 AND day_order = $2 AND period = $3`,
          [Number(class_id), Number(from_day), Number(from_period)]
        );
        if (slot.rowCount === 0) throw new Error('Source slot not found');

        const occupied = await client.query(
          `SELECT 1 FROM cg_timetable_slots WHERE class_id = $1 AND day_order = $2 AND period = $3`,
          [Number(class_id), Number(to_day), Number(to_period)]
        );
        if (occupied.rowCount > 0) throw new Error('Destination slot is already occupied');

        await client.query(
          'UPDATE cg_timetable_slots SET day_order = $1, period = $2 WHERE id = $3',
          [Number(to_day), Number(to_period), slot.rows[0].id]
        );
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/timetable/generate', async (req, res) => {
    try {
      await inTransaction(async client => {
        await client.query("DELETE FROM cg_timetable_slots WHERE type IS NULL OR type != 'placement'");

        const classes = await client.query('SELECT * FROM cg_classes');
        const settingsRows = await client.query('SELECT key, value FROM cg_settings');
        const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
          acc[row.key] = row.value;
          return acc;
        }, {});

        const periodsPerDay = Number(settings.periods_per_day || 6);
        const days = [1, 2, 3, 4, 5, 6];

        for (const cls of classes.rows) {
          const subjects = await client.query(
            `SELECT cs.*, s.type AS subject_type
             FROM cg_class_subjects cs
             JOIN cg_subjects s ON cs.subject_id = s.id
             WHERE cs.class_id = $1`,
            [cls.id]
          );

          let poolItems: Array<{ subject_id: number; staff_id: number | null; type: string }> = [];
          for (const cs of subjects.rows) {
            for (let i = 0; i < Number(cs.hours_per_week); i++) {
              poolItems.push({
                subject_id: cs.subject_id,
                staff_id: cs.staff_id,
                type: cs.subject_type
              });
            }
          }

          poolItems = poolItems.sort(() => Math.random() - 0.5);
          let poolIndex = 0;

          for (const day of days) {
            for (let period = 1; period <= periodsPerDay; period++) {
              if (poolIndex >= poolItems.length) break;
              const item = poolItems[poolIndex];

              const staffBusy = item.staff_id
                ? await client.query(
                    'SELECT 1 FROM cg_timetable_slots WHERE staff_id = $1 AND day_order = $2 AND period = $3 LIMIT 1',
                    [item.staff_id, day, period]
                  )
                : { rowCount: 0 };

              if (!staffBusy.rowCount) {
                await client.query(
                  `INSERT INTO cg_timetable_slots (class_id, day_order, period, subject_id, staff_id, type)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (class_id, day_order, period) DO NOTHING`,
                  [cls.id, day, period, item.subject_id, item.staff_id, item.type]
                );
                poolIndex++;
              }
            }
            if (poolIndex >= poolItems.length) break;
          }
        }
      });

      res.json({ success: true, message: 'Timetable generated successfully' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/timetable/clear', async (req, res) => {
    try {
      await inTransaction(async client => {
        await client.query('DELETE FROM cg_timetable_slots');
        await client.query('DELETE FROM cg_placement_classes');
        await client.query('DELETE FROM cg_placement_blocks');
      });
      res.json({ success: true, message: 'All timetables cleared' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
