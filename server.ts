import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
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

async function startServer() {
  if (!process.env.SUPABASE_DB_URL && !process.env.DATABASE_URL) {
    throw new Error('Missing SUPABASE_DB_URL or DATABASE_URL in .env');
  }

  await ensureSchema();
  await seedDefaults();

  const app = express();
  app.use(express.json());
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
          `SELECT c.* FROM cg_classes c
           JOIN cg_placement_classes pc ON c.id = pc.class_id
           WHERE pc.placement_id = $1`,
          [block.id]
        );
        result.push({ ...block, classes: classes.rows });
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/placement/blocks', async (req, res) => {
    try {
      const { name, hours, class_ids } = req.body as { name: string; hours: number; class_ids: number[] };

      const blockId = await inTransaction(async client => {
        const block = await client.query(
          'INSERT INTO cg_placement_blocks (name, hours) VALUES ($1, $2) RETURNING id',
          [name, Number(hours)]
        );
        const placementId = block.rows[0].id as number;

        for (const classId of class_ids) {
          await client.query(
            'INSERT INTO cg_placement_classes (placement_id, class_id) VALUES ($1, $2)',
            [placementId, Number(classId)]
          );
        }

        const settingsRows = await client.query('SELECT key, value FROM cg_settings');
        const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
          acc[row.key] = row.value;
          return acc;
        }, {});
        const periodsPerDay = Number(settings.periods_per_day || 6);

        let assigned = false;
        for (let day = 1; day <= 6 && !assigned; day++) {
          for (let startP = 1; startP <= periodsPerDay - Number(hours) + 1 && !assigned; startP++) {
            let allFree = true;
            for (const classId of class_ids) {
              const occupied = await client.query(
                `SELECT 1 FROM cg_timetable_slots
                 WHERE class_id = $1 AND day_order = $2 AND period >= $3 AND period < $4
                 LIMIT 1`,
                [Number(classId), day, startP, startP + Number(hours)]
              );
              if (occupied.rowCount) {
                allFree = false;
                break;
              }
            }

            if (allFree) {
              for (const classId of class_ids) {
                for (let p = startP; p < startP + Number(hours); p++) {
                  await client.query(
                    `INSERT INTO cg_timetable_slots (class_id, day_order, period, type, is_locked)
                     VALUES ($1, $2, $3, 'placement', TRUE)
                     ON CONFLICT (class_id, day_order, period) DO UPDATE
                     SET type = EXCLUDED.type, is_locked = EXCLUDED.is_locked`,
                    [Number(classId), day, p]
                  );
                }
              }
              assigned = true;
            }
          }
        }

        if (!assigned) throw new Error('Could not find a suitable time slot for this placement block across all selected classes.');
        return placementId;
      });

      res.json({ id: blockId });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/placement/blocks/:id', async (req, res) => {
    try {
      const blockId = Number(req.params.id);
      await inTransaction(async client => {
        const classes = await client.query('SELECT class_id FROM cg_placement_classes WHERE placement_id = $1', [blockId]);
        for (const c of classes.rows) {
          await client.query("DELETE FROM cg_timetable_slots WHERE class_id = $1 AND type = 'placement'", [c.class_id]);
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
        await client.query("DELETE FROM cg_timetable_slots WHERE class_id = $1 AND type = 'placement'", [classId]);
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
