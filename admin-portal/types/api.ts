export interface Teacher {
  id: string;
  teacher_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  status: 'Active' | 'Inactive';
  is_admin: boolean;
  notes: string | null;
  total_periods: number;
}

export interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
  current_semester: 1 | 2 | null;
}

export interface Location {
  id: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  has_coordinates: boolean;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
}

export interface ClassItem {
  id: string;
  name: string;
}

export interface TimetableEntry {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string;
  class_names: string;
  teacher_id: string;
  teacher_name: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  submitted_at: string;
  semester: number;
  subject: string;
  class_names: string;
  periods: number;
  topic: string | null;
  photo_url: string | null;
  week_number: number;
  location_name: string | null;
  location_verified: boolean;
  gps_coordinates: string | null;
  photo_size_kb: number | null;
  teacher_id: string;
  teacher_name: string;
  academic_year: string;
}

export interface AbsenceRecord {
  id: string;
  date: string;
  detected_at: string | null;
  subject: string;
  class_name: string;
  scheduled_period: string | null;
  status: string;
  is_auto_generated: boolean;
  reason: string | null;
  created_at: string;
  teacher_id: string;
  teacher_name: string;
}

export interface RemedialLesson {
  id: string;
  teacher_id: string;
  teacher_name: string;
  original_absence_date: string;
  subject: string;
  class_name: string;
  remedial_date: string;
  remedial_time: string;
  duration_periods: number | null;
  topic: string | null;
  location_name: string | null;
  status: string;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  student_code: string;
  name: string;
  class_name: string;
  status: 'Active' | 'Graduated' | 'Inactive';
  notes: string | null;
}

export interface StudentAttendanceSession {
  id: string;
  date: string;
  subject: string;
  class_name: string;
  teacher_name: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  created_at: string;
}

export interface StudentAttendanceRecord {
  id: string;
  status: 'Present' | 'Absent' | 'Late';
  updated_at: string;
  student_id: string;
  student_code: string;
  name: string;
  class_name: string;
}

export interface SchoolCalendarEntry {
  id: string;
  date: string;
  name: string;
  type: 'Holiday' | 'School Event' | 'Closed Day';
  notes: string | null;
  created_at: string;
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

export interface AdminStats {
  today_attendance: number;
  today_absences: number;
  total_teachers: number;
  week_attendance: number;
  outstanding_absences: number;
  pending_remedials: number;
}

export interface TeacherAttendanceSummary {
  id: string;
  name: string;
  department: string;
  present_periods: number;
  absent_periods: number;
  total_scheduled: number;
  attendance_pct: number | null;
}

export interface ClassroomStatus {
  slot_id: string;
  class_names: string;
  subject: string;
  start_time: string;
  end_time: string;
  teacher_name: string;
  teacher_id: string;
  status: 'present' | 'absent' | 'in_session' | 'upcoming';
  submitted_at: string | null;
  location_verified: boolean | null;
}
