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
  rank: string | null;
  photo_url: string | null;
}

export interface TeacherProfile extends Teacher {
  gov_staff_id: string | null;
  gender: string | null;
  date_of_birth: string | null;
  registered_number: string | null;
  ntc_number: string | null;
  ssf_number: string | null;
  academic_qualification: string | null;
  professional_qualification: string | null;
  additional_responsibility: string | null;
  bank: string | null;
  bank_branch: string | null;
  account_number: string | null;
  religion: string | null;
  religious_denomination: string | null;
  hometown: string | null;
  residential_address: string | null;
  association: string | null;
  ghana_card_number: string | null;
  certificate_url: string | null;
  certificate_filename: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  schedule?: { id: string; day_of_week: number; start_time: string; end_time: string; subject: string; class_names: string }[];
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

export interface Program {
  id: string;
  name: string;
  notes: string | null;
  exam_body: string;
  student_count: number;
}

export interface AssessmentMode {
  id: string;
  name: string;
  ca_contribution: number;
  sort_order: number;
}

export interface Assessment {
  id: string;
  mode_id: string;
  mode_name: string;
  ca_contribution: number;
  title: string | null;
  date: string | null;
  max_score: number;
  subject: string;
  class_name: string;
  teacher_name: string | null;
  score_count: number;
}

export interface AssessmentScore {
  student_id: string;
  student_code: string;
  name: string;
  score_id: string | null;
  score: number | null;
  absent: boolean;
}

export interface GradeBoundary {
  id: string;
  exam_body: string;
  grade: string;
  min_pct: number;
  max_pct: number;
  remark: string | null;
  sort_order: number;
}

export interface SubjectResult {
  subject: string;
  ca_score: number | null;
  exam_score: number | null;
  total: number | null;
  grade: string;
  remark: string;
  subject_position: number | null;
  class_size: number;
  is_imported?: boolean;
}

export interface StudentResult {
  student_id: string;
  student_code: string;
  name: string;
  exam_body: string | null;
  picture_url: string | null;
  gender: string | null;
  subjects: SubjectResult[];
  average: number | null;
  overall_grade: string;
  class_position?: number;
  class_total?: number;
  ca_percentage: number;
  exam_percentage: number;
}

export interface ReportRemark {
  student_id: string;
  attitude: string | null;
  conduct: string | null;
  general_remarks: string | null;
}

export interface House {
  id: string;
  name: string;
  notes: string | null;
  student_count: number;
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
  program_id: string | null;
  program_name: string | null;
  picture_url: string | null;
  house: string | null;
  residential_status: string | null;
}

export interface StudentProfile extends Student {
  jhs_index_number: string | null;
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  hometown: string | null;
  residential_address: string | null;
  ghana_card_number: string | null;
  nhia_number: string | null;
  mobile_number: string | null;
  aggregate: number | null;
  religion: string | null;
  religious_denomination: string | null;
  guardian_name: string | null;
  guardian_occupation: string | null;
  guardian_mobile: string | null;
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
  document_url: string | null;
  document_filename: string | null;
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
  excused_periods: number;
  total_scheduled: number;
  attendance_pct: number | null;
}

export interface PlcAttendanceSummary {
  id: string;
  name: string;
  department: string;
  present_count: number;
  absent_count: number;
  total_scheduled: number;
  attendance_pct: number | null;
}

export interface ClassroomStatus {
  class_name: string;
  status: 'occupied' | 'vacant';
  in_current_period: boolean;
  subject: string | null;
  start_time: string | null;
  end_time: string | null;
  teacher_name: string | null;
  teacher_phone: string | null;
  submitted_at: string | null;
}
