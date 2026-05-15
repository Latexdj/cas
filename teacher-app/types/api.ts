export interface User {
  id: string;
  name: string;
  role: 'teacher' | 'admin' | 'super_admin';
  schoolId: string;
}

export interface AuthResponse {
  token: string;
  role: string;
  id: string;
  name: string;
  schoolId: string;
}

export interface TimetableSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string;
  class_names: string;
  periods?: number;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  submitted_at: string;
  subject: string;
  class_names: string;
  periods: number;
  topic: string | null;
  location_name: string | null;
  location_verified: boolean;
  teacher_name?: string;
  academic_year?: string;
}

export interface AbsenceRecord {
  id: string;
  date: string;
  subject: string;
  class_name: string;
  scheduled_period: string | null;
  status: string;
  reason: string | null;
  created_at: string;
}

export interface RemedialLesson {
  id: string;
  original_absence_date: string;
  subject: string;
  class_name: string;
  remedial_date: string;
  remedial_time: string;
  duration_periods: number | null;
  topic: string | null;
  location_name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  type: string;
  has_coordinates: boolean;
}

export interface Student {
  id: string;
  student_code: string;
  name: string;
  class_name: string;
  status: 'Active' | 'Graduated' | 'Inactive';
}

export interface StudentSession {
  id: string;
  subject: string;
  class_name: string;
  total: number;
  present: number;
  absent: number;
}

export interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
  current_semester: 1 | 2 | null;
}

export interface AttendanceSummary {
  present_periods: number;
  absent_periods: number;
  excused_periods: number;
  total_scheduled: number;
  attendance_pct: number | null;
}

export interface SchoolCalendarEntry {
  id: string;
  date: string;
  name: string;
  type: 'Holiday' | 'School Event' | 'Closed Day';
  notes: string | null;
}

export interface TeacherExcuse {
  id: string;
  teacher_id: string;
  teacher_name: string;
  date_from: string;
  date_to: string;
  type: 'Official Duty' | 'Permission' | 'Sick Leave' | 'Other';
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
}
