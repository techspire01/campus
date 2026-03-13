export type Role = 'Admin' | 'HOD' | 'Staff' | 'Student';

export interface Department {
  id: number;
  name: string;
  type: 'core' | 'common';
}

export interface Staff {
  id: number;
  name: string;
  role: 'HOD' | 'Staff';
  dept_id: number | null;
  dept_name?: string;
  max_workload: number;
  current_workload?: number;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  type: 'core' | 'common' | 'lab';
  dept_id: number | null;
  is_addon: boolean;
}

export interface Class {
  id: number;
  name: string;
  dept_id: number;
  dept_name?: string;
  year: number;
  semester: number;
  student_strength: number;
  tutor_staff_id?: number | null;
  tutor_name?: string | null;
}

export interface ClassSubject {
  id: number;
  class_id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  staff_id: number | null;
  staff_name?: string;
  hours_per_week: number;
  is_lab_required: boolean;
}

export interface TimetableSlot {
  id: number;
  class_id: number;
  day_order: number;
  period: number;
  subject_id: number | null;
  subject_name?: string;
  subject_code?: string;
  staff_id: number | null;
  staff_name?: string;
  lab_id: number | null;
  lab_name?: string;
  is_locked: boolean;
  type: string;
}

export interface Settings {
  college_start_time: string;
  college_end_time: string;
  periods_per_day: string;
  break_duration: string;
  break_after_period: string;
  lunch_duration: string;
  lunch_after_period: string;
}
