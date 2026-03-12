import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";

const db = new Database("timetable.db");

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT CHECK(type IN ('core', 'common')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT CHECK(role IN ('HOD', 'Staff')) NOT NULL,
    dept_id INTEGER,
    max_workload INTEGER NOT NULL,
    FOREIGN KEY (dept_id) REFERENCES departments(id)
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    type TEXT CHECK(type IN ('core', 'common', 'lab')) NOT NULL,
    dept_id INTEGER,
    is_addon BOOLEAN DEFAULT 0,
    FOREIGN KEY (dept_id) REFERENCES departments(id)
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    dept_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    FOREIGN KEY (dept_id) REFERENCES departments(id)
  );

  CREATE TABLE IF NOT EXISTS class_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    staff_id INTEGER,
    hours_per_week INTEGER NOT NULL,
    is_lab_required BOOLEAN DEFAULT 0,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (staff_id) REFERENCES staff(id)
  );

  CREATE TABLE IF NOT EXISTS labs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    dept_id INTEGER,
    systems_count INTEGER NOT NULL,
    FOREIGN KEY (dept_id) REFERENCES departments(id)
  );

  CREATE TABLE IF NOT EXISTS lab_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    requirements TEXT,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS timetable_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    day_order INTEGER NOT NULL,
    period INTEGER NOT NULL,
    subject_id INTEGER,
    staff_id INTEGER,
    lab_id INTEGER,
    is_locked BOOLEAN DEFAULT 0,
    type TEXT, -- 'common', 'core', 'lab', 'placement', 'activity', 'pt', 'library'
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (staff_id) REFERENCES staff(id),
    FOREIGN KEY (lab_id) REFERENCES labs(id)
  );

  CREATE TABLE IF NOT EXISTS placement_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    hours INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS placement_classes (
    placement_id INTEGER NOT NULL,
    class_id INTEGER NOT NULL,
    PRIMARY KEY (placement_id, class_id),
    FOREIGN KEY (placement_id) REFERENCES placement_blocks(id),
    FOREIGN KEY (class_id) REFERENCES classes(id)
  );
`);

// Seed initial settings if not present
const seedSettings = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
seedSettings.run("college_start_time", "09:45");
seedSettings.run("college_end_time", "15:45");
seedSettings.run("periods_per_day", "6");
seedSettings.run("break_duration", "15");
seedSettings.run("break_after_period", "2");
seedSettings.run("lunch_duration", "45");
seedSettings.run("lunch_after_period", "3");

// Seed Departments, Staff, and Classes
const departmentsToSeed = [
  { name: "B.Com", type: "core", years: 3 },
  { name: "B.Com CA", type: "core", years: 3 },
  { name: "B.Com PA", type: "core", years: 3 },
  { name: "B.Com IT", type: "core", years: 3 },
  { name: "BBA CA", type: "core", years: 3 },
  { name: "B.Sc CSHM", type: "core", years: 3 },
  { name: "B.Sc CS", type: "core", years: 3 },
  { name: "B.Sc AI & ML", type: "core", years: 3 },
  { name: "B.Sc CSDA", type: "core", years: 3 },
  { name: "B.Sc IT", type: "core", years: 3 },
  { name: "MBA", type: "core", years: 2 },
  { name: "M.Sc CS", type: "core", years: 2 },
  { name: "M.Com", type: "core", years: 2 },
];

const seedData = () => {
  const checkDept = db.prepare("SELECT id FROM departments WHERE name = ?");
  const insertDept = db.prepare("INSERT INTO departments (name, type) VALUES (?, ?)");
  const insertStaff = db.prepare("INSERT INTO staff (name, role, dept_id, max_workload) VALUES (?, ?, ?, ?)");
  const insertClass = db.prepare("INSERT INTO classes (name, dept_id, year, semester) VALUES (?, ?, ?, ?)");

  for (const dept of departmentsToSeed) {
    let deptId;
    const existing = checkDept.get(dept.name) as { id: number } | undefined;
    
    if (!existing) {
      const info = insertDept.run(dept.name, dept.type);
      deptId = info.lastInsertRowid;
      
      // Add HOD
      insertStaff.run(`Dr. HOD ${dept.name}`, "HOD", deptId, 12);
      
      // Add Staff
      for (let i = 1; i <= 4; i++) {
        insertStaff.run(`Prof. ${dept.name} Staff ${i}`, "Staff", deptId, 18);
      }
      
      // Add Classes
      for (let y = 1; y <= dept.years; y++) {
        insertClass.run(`${y} ${dept.name}`, deptId, y, y * 2 - 1); // Odd semester for now
      }
    }
  }
};

seedData();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API Routes
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsMap);
  });

  app.post("/api/settings", (req, res) => {
    const updates = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    const transaction = db.transaction((data) => {
      for (const [key, value] of Object.entries(data)) {
        stmt.run(key, String(value));
      }
    });
    transaction(updates);
    res.json({ success: true });
  });

  app.get("/api/departments", (req, res) => {
    const departments = db.prepare("SELECT * FROM departments").all();
    res.json(departments);
  });

  app.post("/api/departments", (req, res) => {
    const { name, type } = req.body;
    const stmt = db.prepare("INSERT INTO departments (name, type) VALUES (?, ?)");
    const info = stmt.run(name, type);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/staff", (req, res) => {
    const staff = db.prepare(`
      SELECT s.*, d.name as dept_name 
      FROM staff s 
      LEFT JOIN departments d ON s.dept_id = d.id
    `).all();
    res.json(staff);
  });

  app.post("/api/staff", (req, res) => {
    const { name, role, dept_id, max_workload } = req.body;
    const stmt = db.prepare("INSERT INTO staff (name, role, dept_id, max_workload) VALUES (?, ?, ?, ?)");
    const info = stmt.run(name, role, dept_id, max_workload);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/subjects", (req, res) => {
    const subjects = db.prepare("SELECT * FROM subjects").all();
    res.json(subjects);
  });

  app.post("/api/subjects", (req, res) => {
    const { name, code, type, dept_id, is_addon } = req.body;
    const stmt = db.prepare("INSERT INTO subjects (name, code, type, dept_id, is_addon) VALUES (?, ?, ?, ?, ?)");
    const info = stmt.run(name, code, type, dept_id, is_addon ? 1 : 0);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/classes", (req, res) => {
    const classes = db.prepare(`
      SELECT c.*, d.name as dept_name 
      FROM classes c 
      JOIN departments d ON c.dept_id = d.id
    `).all();
    res.json(classes);
  });

  app.post("/api/classes", (req, res) => {
    const { name, dept_id, year, semester } = req.body;
    const stmt = db.prepare("INSERT INTO classes (name, dept_id, year, semester) VALUES (?, ?, ?, ?)");
    const info = stmt.run(name, dept_id, year, semester);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/classes/:id/subjects", (req, res) => {
    const subjects = db.prepare(`
      SELECT cs.*, s.name as subject_name, s.code as subject_code, st.name as staff_name
      FROM class_subjects cs
      JOIN subjects s ON cs.subject_id = s.id
      LEFT JOIN staff st ON cs.staff_id = st.id
      WHERE cs.class_id = ?
    `).all(req.params.id);
    res.json(subjects);
  });

  app.post("/api/classes/:id/subjects", (req, res) => {
    const { subject_id, staff_id, hours_per_week, is_lab_required } = req.body;
    const stmt = db.prepare("INSERT INTO class_subjects (class_id, subject_id, staff_id, hours_per_week, is_lab_required) VALUES (?, ?, ?, ?, ?)");
    const info = stmt.run(req.params.id, subject_id, staff_id, hours_per_week, is_lab_required ? 1 : 0);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/labs", (req, res) => {
    const labs = db.prepare("SELECT * FROM labs").all();
    res.json(labs);
  });

  app.post("/api/labs", (req, res) => {
    const { name, dept_id, systems_count } = req.body;
    const stmt = db.prepare("INSERT INTO labs (name, dept_id, systems_count) VALUES (?, ?, ?)");
    const info = stmt.run(name, dept_id, systems_count);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/timetable/:classId", (req, res) => {
    const slots = db.prepare(`
      SELECT ts.*, s.name as subject_name, s.code as subject_code, st.name as staff_name, l.name as lab_name
      FROM timetable_slots ts
      LEFT JOIN subjects s ON ts.subject_id = s.id
      LEFT JOIN staff st ON ts.staff_id = st.id
      LEFT JOIN labs l ON ts.lab_id = l.id
      WHERE ts.class_id = ?
    `).all(req.params.classId);
    res.json(slots);
  });

  app.post("/api/timetable/assign", (req, res) => {
    const { class_id, day_order, period, subject_id, staff_id, lab_id, type, is_locked } = req.body;
    
    // Check for clashes
    if (staff_id) {
      const clash = db.prepare(`
        SELECT * FROM timetable_slots 
        WHERE staff_id = ? AND day_order = ? AND period = ? AND class_id != ?
      `).get(staff_id, day_order, period, class_id);
      if (clash) return res.status(400).json({ error: "Staff already assigned to another class at this time" });
    }

    if (lab_id) {
      const labClash = db.prepare(`
        SELECT * FROM timetable_slots 
        WHERE lab_id = ? AND day_order = ? AND period = ? AND class_id != ?
      `).get(lab_id, day_order, period, class_id);
      if (labClash) return res.status(400).json({ error: "Lab already occupied at this time" });
    }

    const stmt = db.prepare(`
      INSERT INTO timetable_slots (class_id, day_order, period, subject_id, staff_id, lab_id, type, is_locked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(class_id, day_order, period) DO UPDATE SET
        subject_id = excluded.subject_id,
        staff_id = excluded.staff_id,
        lab_id = excluded.lab_id,
        type = excluded.type,
        is_locked = excluded.is_locked
    `);
    // Note: SQLite doesn't have native ON CONFLICT for non-unique constraints without UNIQUE index.
    // I'll add a UNIQUE index for (class_id, day_order, period)
    
    try {
      const info = db.prepare(`
        INSERT OR REPLACE INTO timetable_slots (class_id, day_order, period, subject_id, staff_id, lab_id, type, is_locked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(class_id, day_order, period, subject_id, staff_id, lab_id, type, is_locked ? 1 : 0);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/placement/blocks", (req, res) => {
    const blocks = db.prepare("SELECT * FROM placement_blocks").all();
    const result = blocks.map((b: any) => {
      const classes = db.prepare(`
        SELECT c.* FROM classes c
        JOIN placement_classes pc ON c.id = pc.class_id
        WHERE pc.placement_id = ?
      `).all(b.id);
      return { ...b, classes };
    });
    res.json(result);
  });

  app.post("/api/placement/blocks", (req, res) => {
    const { name, hours, class_ids } = req.body;
    const stmt = db.prepare("INSERT INTO placement_blocks (name, hours) VALUES (?, ?)");
    const info = stmt.run(name, hours);
    const blockId = info.lastInsertRowid;

    const insertClass = db.prepare("INSERT INTO placement_classes (placement_id, class_id) VALUES (?, ?)");
    for (const classId of class_ids) {
      insertClass.run(blockId, classId);
    }
    res.json({ id: blockId });
  });

  app.post("/api/timetable/generate", (req, res) => {
    // Placeholder for generation logic
    res.json({ success: true, message: "Generation logic triggered" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Add unique constraint to timetable_slots
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_timetable_unique ON timetable_slots (class_id, day_order, period)");
} catch (e) {}

startServer();
