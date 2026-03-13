# ClassDetails Page - Complete Feature Documentation

## Overview
The ClassDetails page has been completely enhanced with a modern, feature-rich interface for managing class subjects and timetables. All data is automatically persisted to the database.

---

## 🎯 Core Features

### 1. Editable Class Strength
**Location:** Top-right corner of the header

**Features:**
- Click the **Edit** button (pencil icon) to enter edit mode
- Change the student count with a text input
- Click **Save** to persist changes to database
- Displays the current strength prominently

**Database:** Saved via `PATCH /api/classes/:id` endpoint

---

### 2. Subject Management Table
**Location:** Main right panel

**Features:**
- Displays all subjects assigned to the class
- **Columns:**
  - Subject name
  - Subject code (with color-coded badge)
  - Staff assigned (editable select dropdown)
  - Hours per week (editable number input)
  - Lab required (editable checkbox with YES/NO indicator)
  - Actions (Edit/Delete buttons)

**Inline Editing:**
- Hover over any row to reveal Edit and Delete buttons
- Click Edit icon to enable inline editing
- Modify staff, hours, or lab status
- Changes auto-save immediately
- Click Delete to remove the subject (with confirmation)

**Database:** Updates saved via `PATCH /api/classes/:classId/subjects/:classSubjectId`

---

### 3. Add Subject - Two Methods

#### Method A: Select from Existing Subjects (Tab 1)
**Location:** Left sidebar, "Add Subject" tab

**Steps:**
1. Select a subject from the dropdown
2. (Optional) Assign a staff member
3. Enter hours per week
4. Check "Lab?" if it's a lab subject
5. Click "ADD SUBJECT" button

**Database:** Saved via `POST /api/classes/:id/subjects`

---

#### Method B: Create New Subject On-the-Fly (Tab 1)
**Location:** Left sidebar, below "OR" divider in "Add Subject" tab

**Features:**
- **Subject Name:** Enter the full name
- **Code:** Enter subject code (e.g., "CS101", "MATH201")
- **Type:** Select from Core, Common, or Lab
- **Staff:** Optionally assign staff member
- **Hours:** Set hours per week
- **Lab:** Check if this is a lab subject

**One-Click Creation:**
- Click "CREATE & ASSIGN" button
- Subject is created and automatically assigned to the class
- Perfect for new subjects not yet in the system

**Database:** Saved via `POST /api/subjects-and-assign` endpoint

---

### 4. Bulk Add Subjects (Tab 2)
**Location:** Left sidebar, "Bulk Add" tab

**Features:**
- **Search:** Filter subjects by name or code
- **Add to Cart:** Click any subject to add it
- **Manage Selection:** 
  - View all selected subjects
  - Edit staff and hours for each
  - Remove individual subjects with delete button
  - Shows total count of selected subjects
- **Bulk Insert:** Click "ADD ALL SUBJECTS" to add all at once

**Use Cases:**
- Quickly assign multiple standard subjects to a class
- Efficiently configure common course structures
- Much faster than adding one by one

**Database:** Saved via `POST /api/classes/:id/subjects/bulk` (single transaction)

---

### 5. Weekly Timetable Grid
**Location:** Bottom right panel

**Features:**
- 6 days × 6 periods grid
- Shows break and lunch periods
- Visual indicators for:
  - **Cyan:** Editable slots
  - **Orange:** Locked slots
  - **Green:** Placement blocks
- Click "+" to assign a subject to a slot
- Select subject from dropdown
- Automatically populates staff assignments

---

## 📊 Data Fields Reference

### Class Subject Fields
| Field | Type | Description | Editable |
|-------|------|-------------|----------|
| Subject | String | Subject name | ❌ No |
| Code | String | Subject code | ❌ No |
| Staff | Integer (FK) | Staff member ID | ✅ Yes |
| Hours/Week | Integer | Contact hours per week | ✅ Yes |
| Lab Required | Boolean | Is this a lab subject? | ✅ Yes |

### Subject Creation Fields
| Field | Type | Required | Options |
|-------|------|----------|---------|
| Name | String | ✅ Yes | Any text |
| Code | String | ✅ Yes | Unique identifier |
| Type | Enum | ✅ Yes | Core, Common, Lab |
| Staff | Integer | ❌ No | Drop-down select |
| Hours/Week | Integer | ❌ No | Default: 3 |
| Lab Required | Boolean | ❌ No | Default: false |

---

## 🔌 API Endpoints

### New Endpoints Added

#### 1. Bulk Add Subjects
```
POST /api/classes/:id/subjects/bulk
Body: {
  subjects: [
    {
      subject_id: number,
      staff_id?: number,
      hours_per_week?: number (default: 3),
      is_lab_required?: boolean (default: false)
    }
  ]
}
Response: { success: true }
```

#### 2. Create Subject and Assign
```
POST /api/subjects-and-assign
Body: {
  name: string,
  code: string,
  type: 'core' | 'common' | 'lab',
  dept_id?: number,
  class_id: number,
  staff_id?: number,
  hours_per_week?: number (default: 3),
  is_lab_required?: boolean (default: false)
}
Response: { id, name, code, type, ... }
```

#### 3. Update Class Subject
```
PATCH /api/classes/:classId/subjects/:classSubjectId
Body: {
  staff_id?: number (null for unassigned),
  hours_per_week?: number,
  is_lab_required?: boolean
}
Response: { id, class_id, subject_id, staff_name, hours_per_week, ... }
```

#### 4. Delete Class Subject
```
DELETE /api/classes/:classId/subjects/:classSubjectId
Response: { success: true }
```

### Existing Endpoints Used
- `GET /api/classes` - Fetch all classes
- `GET /api/classes/:id/subjects` - Fetch subjects for a class
- `GET /api/subjects` - Fetch all subjects
- `GET /api/staff` - Fetch all staff
- `PATCH /api/classes/:id` - Update class details
- `POST /api/timetable/assign` - Assign subject to timetable slot

---

## 💾 Database Operations

### Automatic Saving
All operations automatically persist to the database:

- ✅ Class strength changes
- ✅ Subject assignments
- ✅ Staff assignments
- ✅ Work hours modifications
- ✅ Lab requirement toggles
- ✅ Subject creation and assignment
- ✅ Subject deletions

### Data Integrity
- Uses transactions for bulk operations
- Validates relationships (class, subject, staff)
- Returns 404 errors for non-existent records
- Maintains referential integrity

---

## 🎨 UI/UX Features

### Visual Design
- **Dark theme** with cyan accents
- **Color-coded elements:**
  - Emerald: Create new subject section
  - Cyan: Search and bulk operations
  - Violet: Primary action buttons
  - Red: Delete actions
  
### Responsive Layout
- Left sidebar (1/4 width): Subject addition controls
- Right panel (3/4 width): Subject table + Timetable
- Horizontal scroll support for timetable on small screens

### User Feedback
- Form validation with alerts
- Confirmation dialogs for deletions
- Hover states on action buttons
- Visual feedback during editing

### Accessibility
- Clear labels and placeholders
- Tab navigation support
- Keyboard shortcuts ready
- High contrast text

---

## 🚀 Usage Examples

### Example 1: Add Single Subject with Staff
1. Stay in "Add Subject" tab
2. Select "Database Management" from dropdown
3. Select "Prof. John Doe" as staff
4. Enter "4" for hours
5. Uncheck Lab
6. Click "ADD SUBJECT"

**Result:** Subject added and saved to database

### Example 2: Create and Assign Lab Subject
1. Scroll to "CREATE & ASSIGN NEW" section
2. Enter Name: "Database Lab"
3. Enter Code: "DB201L"
4. Select Type: "Lab"
5. Select Staff: "Dr. Lab Instructor"
6. Enter Hours: "2"
7. Check "Is Lab?"
8. Click "CREATE & ASSIGN"

**Result:** New subject created and automatically assigned to class

### Example 3: Bulk Add with Custom Configuration
1. Click "Bulk Add" tab
2. Search for "Programming"
3. Click "C++ Programming" to add
4. Click "Advanced Algorithms" to add
5. In the selected list, edit:
   - Assign staff to each
   - Set different hours (3, 4)
   - Mark one as lab
6. Click "ADD ALL SUBJECTS"

**Result:** Multiple subjects added in single transaction

### Example 4: Manage Existing Assignments
1. Find subject in the table
2. Hover to reveal Edit button
3. Click Edit
4. Change staff from dropdown
5. Change hours value
6. Toggle lab checkbox
7. Click Save (or auto-saves)

**Result:** Subject configuration updated in database

---

## ⚠️ Important Notes

1. **Unique Constraints:** Subject codes must be unique
2. **Staff Assignment:** Optional field - subjects can exist without staff assignment
3. **Bulk Operations:** All subjects in bulk add are inserted in a single transaction
4. **Subject Types:** Automatically set Lab type defaults lab checkbox to checked
5. **Deletion:** Deleting a class subject doesn't delete the subject itself, just the assignment

---

## 📋 Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| Subject (select) | Required | "Please select a subject" |
| Subject (create) | Required, non-empty | "Please enter subject name and code" |
| Code | Unique | Database constraint |
| Hours/Week | Optional, numeric | Auto-corrected to 0 |
| Staff | Optional | Can be null |
| Lab | Optional | Default: false |

---

## 🔄 Refresh Behavior

- Data auto-refreshes after every operation
- All API responses trigger immediate UI updates
- Timetable refreshes when subjects are added/removed
- No manual refresh needed

---

## 🐛 Error Handling

- **404 Errors:** Class or subject not found (deleted externally)
- **400 Errors:** Validation failures, constraint violations
- **500 Errors:** Server-side issues
- **User alerts:** Clear error messages displayed to user

---

For questions or issues, refer to the backend API documentation or database schema.
