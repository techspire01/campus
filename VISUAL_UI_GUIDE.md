# 🎨 ClassDetails Page - Visual UI Architecture

## Page Layout Diagram

```
╔═══════════════════════════════════════════════════════════════════════╗
║                         PAGE HEADER                                   ║
║  CAMPUS GRID | 1 B.COM                    [Class Strength] ✏️ 45 💾  ║
║  Configure subjects and manage the weekly timetable grid.            ║
╚═══════════════════════════════════════════════════════════════════════╝

╔════════════════════════════╦══════════════════════════════════════════╗
║                            ║                                          ║
║   LEFT SIDEBAR (25%)       ║   RIGHT CONTENT AREA (75%)               ║
║   [Subject Controls]       ║   [Management Table + Timetable]         ║
║                            ║                                          ║
║ ╔══════════════════════╗   ║ ╔════════════════════════════════════╗ ║
║ ║ [Add Subject] [Bulk] ║   ║ │ SUBJECTS MANAGEMENT (5 subjects) │ ║
║ ║ ─────────────────── ║   ║ │────────────────────────────────┤ ║
║ │ TAB 1: ADD SUBJECT  │   ║ │ SubjCode│Staff│Hrs│Lab│Actions │ ║
║ │ ◆ Select Dropdown   │   ║ │─────────────────────────────────│ ║
║ │ ◆ Assign Staff      │   ║ │ DB  DB01│Dr. X│ 3 │ No│ ✏️ ❌  │ ║
║ │ ◆ Hours/Week        │   ║ │ Py  PY10│Dr. Y│ 4 │ No│ ✏️ ❌  │ ║
║ │ ◆ Lab Checkbox      │   ║ │ Jav JV20│Dr. Z│ 2 │Yes│ ✏️ ❌  │ ║
║ │ [ADD SUBJECT]       │   ║ │ ...     │...  │...│..│ ...  │ ║
║ │                     │   ║ └────────────────────────────────┘ ║
║ │         OR          │   ║                                      ║
║ │ ◆ CREATE & ASSIGN   │   ║ ╔════════════════════════════════════╗ ║
║ │   - Name            │   ║ │ WEEKLY SCHEDULE                   │ ║
║ │   - Code            │   ║ │────────────────────────────────────│ ║
║ │   - Type            │   ║ │ Day │P1│P2│P3│P4│P5│P6           │ ║
║ │   - Staff  │ Hours  │   ║ │─────────────────────────────────│ ║
║ │   - Lab    │        │   ║ │ 1   │DB│PY│  │JV│  │  │        │ ║
║ │ [CREATE&ASSIGN]     │   ║ │ 2   │  │  │DB│  │  │PY│        │ ║
║ │                     │   ║ │ 3   │JV│  │  │  │DB│  │        │ ║
║ ║ ─────────────────── ║   ║ │ 4   │  │JV│  │  │  │  │        │ ║
║ │ TAB 2: BULK ADD     │   ║ │ 5   │  │  │PY│  │  │  │        │ ║
║ │ 🔍 [Search...    ] │   ║ │ 6   │  │  │  │  │JV│DB│        │ ║
║ │                     │   ║ └────────────────────────────────┘ ║
║ │ Results:            │   ║                                      ║
║ │ □ Subject 1         │   ║                                      ║
║ │ □ Subject 2         │   ║                                      ║
║ │ □ Subject 3         │   ║                                      ║
║ │                     │   ║                                      ║
║ │ Selected: 3         │   ║                                      ║
║ │ [ADD ALL SUBJECTS]  │   ║                                      ║
║ │                     │   ║                                      ║
║ ║                     ║   ║                                      ║
╚═════════════════════════════╩══════════════════════════════════════════╝
```

---

## Feature Location Map

### 1️⃣ Class Strength Editor
```
┌─ PAGE HEADER (Top-Right) ──────────────────────────────┐
│                                                         │
│           Class Strength                               │
│           [45] ✏️  ← Click to edit                    │
│                                                         │
│   Edit Mode:                                            │
│   [50] [💾Save] ← Changes saved to database            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2️⃣ Add Subject Tab
```
┌─ LEFT SIDEBAR, TAB 1 ──────────────────────────────┐
│                                                    │
│ SELECT SECTION:                                   │
│ Subject:  [Select Subject ▼]                     │
│ Staff:    [Select Staff   ▼]                     │
│ Hours:    [3            ]                         │
│ ☐ Lab                                            │
│ [ADD SUBJECT] ← Single add                       │
│                                                   │
│ ─────────────────────────────────────────        │
│             OR                                    │
│ ─────────────────────────────────────────        │
│                                                   │
│ CREATE NEW SECTION:                              │
│ Name:     [Database Mgmt ]                       │
│ Code:     [DB201       ]                         │
│ Type:     [Core    ▼]                           │
│ Staff:    [Select  ▼]                           │
│ Hours:    [3          ]                          │
│ ☑ Lab                                            │
│ [CREATE & ASSIGN] ← Create + Assign in one       │
│                                                   │
└────────────────────────────────────────────────────┘
```

### 3️⃣ Bulk Add Tab
```
┌─ LEFT SIDEBAR, TAB 2 ──────────────────────────────┐
│                                                    │
│ SEARCH & SELECT:                                  │
│ 🔍 [Filter by name... ]                          │
│                                                   │
│ Results:                                          │
│ ○ C++ Programming           [Click to add]       │
│ ○ Web Development           [Click to add]       │
│ ○ Database Design           [Click to add]       │
│ ○ Advanced Algorithms       [Click to add]       │
│                                                   │
│ ─────────────────────────────────────────        │
│                                                   │
│ SELECTED SUBJECTS (3):                           │
│                                                   │
│ Subject 1:                                        │
│ Staff: [Select ▼]  Hrs: [3 ]                    │
│ [❌ Remove]                                      │
│                                                   │
│ Subject 2:                                        │
│ Staff: [Select ▼]  Hrs: [4 ]                    │
│ [❌ Remove]                                      │
│                                                   │
│ Subject 3:                                        │
│ Staff: [Select ▼]  Hrs: [2 ]                    │
│ [❌ Remove]                                      │
│                                                   │
│ [ADD ALL SUBJECTS] ← All at once                │
│                                                   │
└────────────────────────────────────────────────────┘
```

### 4️⃣ Subject Management Table
```
┌─ RIGHT CONTENT AREA, TOP ──────────────────────────────────────────┐
│                                                                    │
│ SUBJECTS MANAGEMENT (5 subjects)                                  │
│                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Subject │ Code  │ Staff   │Hours│Lab │ Actions              │ │
│ │──────────────────────────────────────────────────────────────│ │
│ │ Database│ DB101 │ Dr. X   │ 3   │ No │ [←Hover to reveal] │ │
│ │ Python  │ PY101 │ Dr. Y   │ 4   │ No │ [✏️  Edit] [❌ Del] │ │
│ │ Java Lab│ JV201 │ Dr. Z   │ 2   │Yes │ [✏️  Edit] [❌ Del] │ │
│ │ ...     │ ...   │ ...     │...  │... │ ...                 │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ Edit Mode (when ✏️ clicked):                                     │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Subject │ Code  │ Staff    │Hours│Lab │ Actions             │ │
│ │         │       │ [Select ▼]│[3 ]│[☐ ]│ [💾 Save] [❌ Del]│ │
│ │         │       │ Options:  │    │    │                    │ │
│ │         │       │ - Dr. X   │    │    │                    │ │
│ │         │       │ - Dr. Y   │    │    │                    │ │
│ │         │       │ - Dr. Z   │    │    │                    │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 5️⃣ Weekly Timetable Grid
```
┌─ RIGHT CONTENT AREA, BOTTOM ──────────────────────────────┐
│                                                           │
│ WEEKLY SCHEDULE                                          │
│                                                           │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Day│ P1  │ P2  │ P3  │ P4  │ P5  │ P6  │          │  │
│ │────────────────────────────────────────────────────│  │
│ │ 1  │ DB  │ PY  │  +  │ JV  │  +  │  +  │          │  │
│ │    │Dr.X │Dr.Y │ [▼] │Dr.Z │ [▼] │ [▼] │          │  │
│ │────────────────────────────────────────────────────│  │
│ │ 2  │  +  │  +  │ DB  │  +  │  +  │ PY  │          │  │
│ │    │ [▼] │ [▼] │Dr.X │ [▼] │ [▼] │Dr.Y │          │  │
│ │────────────────────────────────────────────────────│  │
│ │ 3  │ JV  │  +  │  +  │  +  │ DB  │  +  │          │  │
│ │    │Dr.Z │ [▼] │ [▼] │ [▼] │Dr.X │ [▼] │          │  │
│ │────────────────────────────────────────────────────│  │
│ │ ...|  .. │ ..  │  .. │ ..  │  .. │ ..  │          │  │
│ └────────────────────────────────────────────────────┘  │
│                                                           │
│  + = Click to assign subject                            │
│  [▼] = Dropdown to select subject                       │
│  [Locked] = Cannot edit (placement cells)               │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## User Interaction Flow Diagram

```
USER WANTS TO: Add Database Subject with Staff

Option A:
─────────
1. Select "Database" from dropdown
   └──> [SELECT]
2. Select "Dr. Kumar" from staff dropdown  
   └──> [SELECT]
3. Set hours to "3"
   └──> [INPUT]
4. Click "ADD SUBJECT"
   └──> API Call → Database Update → Table Refresh
5. Subject appears in table ✓

Option B:
─────────
1. Click "Bulk Add" tab
2. Search "Database" in filter
3. Click "Database Management" result
4. Edit staff to "Dr. Kumar"
5. Edit hours to "3"  
6. Click "ADD ALL SUBJECTS"
   └──> Bulk API → Database Update → Table Refresh
7. Subject appears in table ✓

Option C:
─────────
1. Scroll to "CREATE & ASSIGN NEW"
2. Enter Name: "Data Science"
3. Enter Code: "DS301"
4. Select Type: "Core"
5. Select Staff: "Dr. Kumar"
6. Set Hours: "3"
7. Click "CREATE & ASSIGN"
   └──> Create → Assign → Refresh Table
8. New subject appears in table ✓
```

---

## State Management Flow

```
┌─────────────────────────────────────────────────────────┐
│                  PAGE LOADS                             │
│ Check existing data in database                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │ Fetch from API │
        │ - Classes      │
        │ - Subjects     │
        │ - Class Subs   │
        │ - Staff        │
        │ - Timetable    │
        └────────┬───────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Populate React State   │
    │ - cls                  │
    │ - classSubjects        │
    │ - allSubjects          │
    │ - allStaff             │
    │ - timetable            │
    └────────┬───────────────┘
             │
             ├─────────────────────────────────────────┐
             │                                         │
             ▼                                         ▼
    ┌──────────────────┐                   ┌──────────────────┐
    │ User Makes Edit  │                   │ User Views Data  │
    │ - Add Subject    │                   │ - Read table     │
    │ - Update staff   │                   │ - View timetable │
    │ - Change hours   │                   │                  │
    │ - Delete subject │                   └──────────────────┘
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Submit to API        │
    │ POST/PATCH/DELETE    │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Server Updates DB    │
    │ Returns updated data │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Update React State   │
    │ Auto-refresh list    │
    └────────┬─────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ UI Re-renders        │
    │ Table updated ✓      │
    │ Timetable updated ✓  │
    └──────────────────────┘
```

---

## Data Flow for Subject Management

```
┌─── ADD SUBJECT ───┐         ┌─── BULK ADD ───┐         ┌─── CREATE & ASSIGN ───┐
│                   │         │                │         │                       │
│ Select from       │         │ Search &       │         │ Fill form with:       │
│ existing dropdown │         │ multi-select   │         │ - Name                │
│      │            │         │      │         │         │ - Code                │
│      ▼            │         │      ▼         │         │ - Type                │
│   Set Staff       │         │   Edit each    │         │ - Staff               │
│   Set Hours       │         │   with hours   │         │ - Hours               │
│   Check Lab       │         │      │         │         │ - Lab                 │
│      │            │         │      ▼         │         │      │                │
│      ▼            │         │  [ADD ALL]     │         │      ▼                │
│  [ADD SUBJECT]    │         │      │         │         │ [CREATE & ASSIGN]     │
│      │            │         │      ▼         │         │      │                │
└──────┼────────────┘         └──────┼─────────┘         └──────┼────────────────┘
       │                             │                          │
       │ POST                        │ POST /bulk              │ POST              
       │ /classes/:id/subjects       │ /classes/:id/subjects   │ /subjects-and-assign
       │                             │ /bulk                   │
       ▼                             ▼                         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │              DATABASE                                       │
    │  ┌──────────────────────────────────────┐                 │
    │  │ subjects table                       │                 │
    │  │ id | name | code | type | dept_id   │                 │
    │  │────────────────────────────────────  │                 │
    │  │ .. | .. | .. | .. | .. │ [NEW]     │ ← Created here   │
    │  └──────────────────────────────────────┘                 │
    │                                                            │
    │  ┌──────────────────────────────────────────────────────┐ │
    │  │ class_subjects table                                 │ │
    │  │ id | class_id | subject_id | staff_id | hours | lab │ │
    │  │──────────────────────────────────────────────────────│ │
    │  │ 15 | 1 | 5 | 2 | 3 | 0 │                           │ │
    │  │ 16 | 1 | 6 | 3 | 4 | 1 │                           │ │
    │  │ 17 | 1 | 7 | null | 2 | 0 │ [NEW ENTRIES]         │ │
    │  │ .. | .. | .. | .. | .. | .. │                     │ │
    │  └──────────────────────────────────────────────────────┘ │
    │                                                            │
    └─────────────────────────────────────────────────────────────┘
       │
       │ SELECT (refresh)
       │
       ▼
    ┌────────────────────────────────────────┐
    │ Return updated class_subjects list     │
    │ with joined subject & staff names      │
    └────────────────────────────────────────┘
       │
       │ setClassSubjects(data)
       │
       ▼
    ┌─────────────────────────────────────────────┐
    │ React State Updates                         │
    │ classSubjects array refreshed              │
    └────────────────────────────────────────────┘
       │
       │
       ▼
    ┌──────────────────────────────┐
    │ Component Re-renders          │
    │ Table shows all new subjects  │
    │ Timetable refreshes           │
    └──────────────────────────────┘
```

---

## Color Scheme Reference

```
Component Colors:
┌─────────────────────────────────────┐
│ Header Background:  #141c2e        │
│ Border Color:       #1e2d47        │
│ Text (Primary):     White          │
│ Text (Secondary):   #94a3b8        │
│ Button (Action):    #7c3aed (Violet)
│ Button (Create):    #10b981 (Green/Emerald)
│ Button (Delete):    #ef4444 (Red)  │
│ Accent (Primary):   Cyan (#06b6d4) │
│                                     │
│ Status Indicators:                  │
│ Editable:     Cyan border/bg       │
│ Locked:       Orange border/bg     │
│ Placement:    Green border/bg      │
│ Lab Yes:      Emerald text/bg      │
│ Lab No:       Slate text/bg        │
└─────────────────────────────────────┘
```

---

This visual documentation should help you understand exactly where each feature is located and how the UI flows together!
