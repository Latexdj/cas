export interface Teacher {
  id: string;
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

export interface TimetableEntry {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string;
  class_name: string;
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

export interface AdminStats {
  today_attendance: number;
  today_absences: number;
  total_teachers: number;
  week_attendance: number;
  outstanding_absences: number;
  pending_remedials: number;
}

export interface ClassroomStatus {
  slot_id: string;
  class_name: string;
  subject: string;
  start_time: string;
  end_time: string;
  teacher_name: string;
  teacher_id: string;
  status: 'present' | 'absent' | 'in_session' | 'upcoming';
  submitted_at: string | null;
  location_verified: boolean | null;
}
