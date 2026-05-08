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
  class_name: string;
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
