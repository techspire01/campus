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
    student_strength INTEGER DEFAULT 0,
    tutor_staff_id INTEGER,
    FOREIGN KEY (dept_id) REFERENCES departments(id),
    FOREIGN KEY (tutor_staff_id) REFERENCES staff(id)
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

const classColumns = db.prepare("PRAGMA table_info(classes)").all() as { name: string }[];
if (!classColumns.some((column) => column.name === "tutor_staff_id")) {
  db.exec("ALTER TABLE classes ADD COLUMN tutor_staff_id INTEGER REFERENCES staff(id)");
}

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
      SELECT s.*, d.name as dept_name,
             COALESCE((SELECT SUM(hours_per_week) FROM class_subjects WHERE staff_id = s.id), 0) as current_workload
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
    try {
      const { name, code, type, dept_id, is_addon } = req.body;
      const normalizedDeptId = dept_id ? Number(dept_id) : null;
      const stmt = db.prepare("INSERT INTO subjects (name, code, type, dept_id, is_addon) VALUES (?, ?, ?, ?, ?)");
      const info = stmt.run(name?.trim(), code?.trim(), type, normalizedDeptId, is_addon ? 1 : 0);
      const subject = db.prepare("SELECT * FROM subjects WHERE id = ?").get(info.lastInsertRowid);
      res.json(subject);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/classes", (req, res) => {
    const classes = db.prepare(`
      SELECT c.*, d.name as dept_name, tutor.name as tutor_name
      FROM classes c 
      JOIN departments d ON c.dept_id = d.id
      LEFT JOIN staff tutor ON c.tutor_staff_id = tutor.id
    `).all();
    res.json(classes);
  });

  app.post("/api/classes", (req, res) => {
    try {
      const { name, dept_id, year, semester, student_strength, tutor_staff_id } = req.body;
      const stmt = db.prepare(`
        INSERT INTO classes (name, dept_id, year, semester, student_strength, tutor_staff_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        name?.trim(),
        Number(dept_id),
        Number(year),
        Number(semester),
        Number(student_strength) || 0,
        tutor_staff_id ? Number(tutor_staff_id) : null
      );
      const createdClass = db.prepare(`
        SELECT c.*, d.name as dept_name, tutor.name as tutor_name
        FROM classes c
        JOIN departments d ON c.dept_id = d.id
        LEFT JOIN staff tutor ON c.tutor_staff_id = tutor.id
        WHERE c.id = ?
      `).get(info.lastInsertRowid);
      res.json(createdClass);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/classes/:id", (req, res) => {
    try {
      const classId = Number(req.params.id);
      const existing = db.prepare("SELECT * FROM classes WHERE id = ?").get(classId) as any;
      if (!existing) {
        return res.status(404).json({ error: "Class not found" });
      }

      const studentStrength = req.body.student_strength ?? existing.student_strength;
      const tutorStaffId = req.body.tutor_staff_id === undefined
        ? existing.tutor_staff_id
        : (req.body.tutor_staff_id ? Number(req.body.tutor_staff_id) : null);

      db.prepare(`
        UPDATE classes
        SET student_strength = ?, tutor_staff_id = ?
        WHERE id = ?
      `).run(Number(studentStrength) || 0, tutorStaffId, classId);

      const updatedClass = db.prepare(`
        SELECT c.*, d.name as dept_name, tutor.name as tutor_name
        FROM classes c
        JOIN departments d ON c.dept_id = d.id
        LEFT JOIN staff tutor ON c.tutor_staff_id = tutor.id
        WHERE c.id = ?
      `).get(classId);
      res.json(updatedClass);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
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

  // Bulk add subjects to a class
  app.post("/api/classes/:id/subjects/bulk", (req, res) => {
    try {
      const { subjects } = req.body;
      const classId = req.params.id;
      
      const transaction = db.transaction(() => {
        const stmt = db.prepare("INSERT INTO class_subjects (class_id, subject_id, staff_id, hours_per_week, is_lab_required) VALUES (?, ?, ?, ?, ?)");
        
        for (const subject of subjects) {
          stmt.run(
            classId,
            subject.subject_id,
            subject.staff_id || null,
            subject.hours_per_week || 3,
            subject.is_lab_required ? 1 : 0
          );
        }
      });
      
      transaction();
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Create subject and assign to class
  app.post("/api/subjects-and-assign", (req, res) => {
    try {
      const { name, code, type, dept_id, class_id, staff_id, hours_per_week, is_lab_required } = req.body;
      
      const transaction = db.transaction(() => {
        // Create the subject
        const subjectStmt = db.prepare("INSERT INTO subjects (name, code, type, dept_id, is_addon) VALUES (?, ?, ?, ?, ?)");
        const subjectInfo = subjectStmt.run(
          name?.trim(),
          code?.trim(),
          type,
          dept_id ? Number(dept_id) : null,
          0
        );
        const subjectId = subjectInfo.lastInsertRowid;
        
        // Assign to class
        const assignStmt = db.prepare("INSERT INTO class_subjects (class_id, subject_id, staff_id, hours_per_week, is_lab_required) VALUES (?, ?, ?, ?, ?)");
        assignStmt.run(
          class_id,
          subjectId,
          staff_id || null,
          hours_per_week || 3,
          is_lab_required ? 1 : 0
        );
        
        return subjectId;
      });
      
      const subjectId = transaction();
      const subject = db.prepare("SELECT * FROM subjects WHERE id = ?").get(subjectId);
      res.json(subject);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Update class subject
  app.patch("/api/classes/:classId/subjects/:classSubjectId", (req, res) => {
    try {
      const { staff_id, hours_per_week, is_lab_required } = req.body;
      const { classId, classSubjectId } = req.params;
      
      // Verify the class subject exists
      const existing = db.prepare("SELECT * FROM class_subjects WHERE id = ? AND class_id = ?").get(classSubjectId, classId) as any;
      if (!existing) {
        return res.status(404).json({ error: "Class subject not found" });
      }
      
      const updatedHours = hours_per_week !== undefined ? hours_per_week : existing.hours_per_week;
      const updatedStaff = staff_id !== undefined ? (staff_id || null) : existing.staff_id;
      const updatedLab = is_lab_required !== undefined ? (is_lab_required ? 1 : 0) : existing.is_lab_required;
      
      db.prepare(`
        UPDATE class_subjects
        SET staff_id = ?, hours_per_week = ?, is_lab_required = ?
        WHERE id = ?
      `).run(updatedStaff, updatedHours, updatedLab, classSubjectId);
      
      const updated = db.prepare(`
        SELECT cs.*, s.name as subject_name, s.code as subject_code, st.name as staff_name
        FROM class_subjects cs
        JOIN subjects s ON cs.subject_id = s.id
        LEFT JOIN staff st ON cs.staff_id = st.id
        WHERE cs.id = ?
      `).get(classSubjectId);
      
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Delete class subject
  app.delete("/api/classes/:classId/subjects/:classSubjectId", (req, res) => {
    try {
      const { classId, classSubjectId } = req.params;
      
      // Verify the class subject exists
      const existing = db.prepare("SELECT * FROM class_subjects WHERE id = ? AND class_id = ?").get(classSubjectId, classId);
      if (!existing) {
        return res.status(404).json({ error: "Class subject not found" });
      }
      
      // Delete the class subject
      db.prepare("DELETE FROM class_subjects WHERE id = ?").run(classSubjectId);
      
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
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

  app.delete("/api/labs/:id", (req, res) => {
    try {
      const labId = Number(req.params.id);
      const existing = db.prepare("SELECT * FROM labs WHERE id = ?").get(labId);

      if (!existing) {
        return res.status(404).json({ error: "Lab not found" });
      }

      const usage = db.prepare("SELECT COUNT(*) as count FROM timetable_slots WHERE lab_id = ?").get(labId) as { count: number };
      if (usage.count > 0) {
        return res.status(400).json({ error: "This lab is already used in the timetable and cannot be deleted." });
      }

      db.prepare("DELETE FROM labs WHERE id = ?").run(labId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
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
    
    const transaction = db.transaction(() => {
      const stmt = db.prepare("INSERT INTO placement_blocks (name, hours) VALUES (?, ?)");
      const info = stmt.run(name, hours);
      const blockId = info.lastInsertRowid;

      const insertClass = db.prepare("INSERT INTO placement_classes (placement_id, class_id) VALUES (?, ?)");
      for (const classId of class_ids) {
        insertClass.run(blockId, classId);
      }

      // Algorithm to find slots:
      // We look for 'hours' consecutive free periods on any day for ALL classes in the block.
      const periodsPerDay = parseInt((db.prepare("SELECT value FROM settings WHERE key = 'periods_per_day'").get() as any).value);
      let assigned = false;

      for (let day = 1; day <= 6; day++) {
        for (let startP = 1; startP <= periodsPerDay - hours + 1; startP++) {
          // Check if ALL classes are free for ALL periods in this block
          let allFree = true;
          for (const classId of class_ids) {
            const occupied = db.prepare(`
              SELECT 1 FROM timetable_slots 
              WHERE class_id = ? AND day_order = ? AND period >= ? AND period < ?
            `).get(classId, day, startP, startP + hours);
            
            if (occupied) {
              allFree = false;
              break;
            }
          }

          if (allFree) {
            // Assign!
            const assignStmt = db.prepare(`
              INSERT INTO timetable_slots (class_id, day_order, period, type, is_locked)
              VALUES (?, ?, ?, 'placement', 1)
            `);
            for (const classId of class_ids) {
              for (let p = startP; p < startP + hours; p++) {
                assignStmt.run(classId, day, p);
              }
            }
            assigned = true;
            break;
          }
        }
        if (assigned) break;
      }

      if (!assigned) {
        throw new Error("Could not find a suitable time slot for this placement block across all selected classes.");
      }

      return blockId;
    });

    try {
      const id = transaction();
      res.json({ id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/placement/blocks/:id", (req, res) => {
    const blockId = req.params.id;
    
    const transaction = db.transaction(() => {
      // Get classes associated with this block
      const classes = db.prepare("SELECT class_id FROM placement_classes WHERE placement_id = ?").all(blockId) as { class_id: number }[];
      
      // Remove from timetable_slots (only 'placement' type for these classes)
      const deleteSlots = db.prepare(`
        DELETE FROM timetable_slots 
        WHERE class_id = ? AND type = 'placement'
      `);
      
      for (const c of classes) {
        deleteSlots.run(c.class_id);
      }

      db.prepare("DELETE FROM placement_classes WHERE placement_id = ?").run(blockId);
      db.prepare("DELETE FROM placement_blocks WHERE id = ?").run(blockId);
    });

    transaction();
    res.json({ success: true });
  });

  app.delete("/api/placement/blocks/:id/classes/:classId", (req, res) => {
    const { id: blockId, classId } = req.params;
    
    try {
      const transaction = db.transaction(() => {
        // Remove from timetable_slots for this class
        db.prepare(`
          DELETE FROM timetable_slots 
          WHERE class_id = ? AND type = 'placement'
        `).run(classId);

        // Remove from placement_classes
        db.prepare(`
          DELETE FROM placement_classes 
          WHERE placement_id = ? AND class_id = ?
        `).run(blockId, classId);

        // If no classes left in block, delete the block
        const remaining = db.prepare("SELECT COUNT(*) as count FROM placement_classes WHERE placement_id = ?").get(blockId) as { count: number };
        if (remaining.count === 0) {
          db.prepare("DELETE FROM placement_blocks WHERE id = ?").run(blockId);
        }
      });

      transaction();
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/timetable/move-slot", (req, res) => {
    const { class_id, from_day, from_period, to_day, to_period } = req.body;
    
    try {
      const transaction = db.transaction(() => {
        // Get the slot at the source
        const slot = db.prepare(`
          SELECT * FROM timetable_slots 
          WHERE class_id = ? AND day_order = ? AND period = ?
        `).get(class_id, from_day, from_period) as any;

        if (!slot) throw new Error("Source slot not found");

        // Check if destination is occupied
        const occupied = db.prepare(`
          SELECT 1 FROM timetable_slots 
          WHERE class_id = ? AND day_order = ? AND period = ?
        `).get(class_id, to_day, to_period);

        if (occupied) throw new Error("Destination slot is already occupied");

        // If it's a placement slot, we might want to move the whole block, 
        // but for now let's allow moving individual slots or handle them as individual units.
        // The user asked to "adjust the slots".
        
        db.prepare(`
          UPDATE timetable_slots 
          SET day_order = ?, period = ?
          WHERE id = ?
        `).run(to_day, to_period, slot.id);
      });

      transaction();
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/timetable/generate", (req, res) => {
    try {
      const transaction = db.transaction(() => {
        // Rebuild the generated timetable from the class-subject mappings stored in the database.
        db.prepare("DELETE FROM timetable_slots WHERE type IS NULL OR type != 'placement'").run();

        const classes = db.prepare("SELECT * FROM classes").all() as any[];
        const settings = db.prepare("SELECT * FROM settings").all() as any[];
        const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as any);
        const periodsPerDay = parseInt(settingsMap.periods_per_day || "6");
        const days = [1, 2, 3, 4, 5, 6];

        for (const cls of classes) {
          const classSubjects = db.prepare(`
            SELECT cs.*, s.type as subject_type 
            FROM class_subjects cs
            JOIN subjects s ON cs.subject_id = s.id
            WHERE cs.class_id = ?
          `).all(cls.id) as any[];

          // Create a pool of hours to be scheduled
          let pool: any[] = [];
          for (const cs of classSubjects) {
            for (let i = 0; i < cs.hours_per_week; i++) {
              pool.push({
                subject_id: cs.subject_id,
                staff_id: cs.staff_id,
                type: cs.subject_type
              });
            }
          }

          // Shuffle pool for some randomness
          pool = pool.sort(() => Math.random() - 0.5);

          // Fill slots
          let poolIndex = 0;
          for (const day of days) {
            for (let period = 1; period <= periodsPerDay; period++) {
              if (poolIndex >= pool.length) break;

              const item = pool[poolIndex];
              
              // Check if staff is available (not teaching another class at this time)
              const staffBusy = item.staff_id ? db.prepare(`
                SELECT 1 FROM timetable_slots 
                WHERE staff_id = ? AND day_order = ? AND period = ?
              `).get(item.staff_id, day, period) : null;

              if (!staffBusy) {
                db.prepare(`
                  INSERT INTO timetable_slots (class_id, day_order, period, subject_id, staff_id, type)
                  VALUES (?, ?, ?, ?, ?, ?)
                `).run(cls.id, day, period, item.subject_id, item.staff_id, item.type);
                poolIndex++;
              }
            }
            if (poolIndex >= pool.length) break;
          }
        }
      });

      transaction();
      res.json({ success: true, message: "Timetable generated successfully" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/timetable/clear", (req, res) => {
    try {
      const transaction = db.transaction(() => {
        db.prepare("DELETE FROM timetable_slots").run();
        db.prepare("DELETE FROM placement_classes").run();
        db.prepare("DELETE FROM placement_blocks").run();
      });
      transaction();
      res.json({ success: true, message: "All timetables cleared" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
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
