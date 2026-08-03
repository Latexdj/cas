export interface User {
  id:       string;
  name:     string;
  role:     'student';
  schoolId: string;
  mustChangePassword?: boolean;
}

export interface AcademicYear {
  id:               string;
  name:             string;
  is_current:       boolean;
  current_semester: number;
}

export interface StudentProfile {
  id:              string;
  name:            string;
  student_code:    string;
  class_name:      string;
  program:         string | null;
  gender:          string | null;
  date_of_birth:   string | null;
  guardian_name:   string | null;
  guardian_phone:  string | null;
  form_teacher:    { teacher_name: string; teacher_phone: string | null } | string | null;
  house:           string | null;
}

export interface SubjectResult {
  subject:    string;
  ca_score:   number | null;
  exam_score: number | null;
  total:      number | null;
  grade:      string | null;
  remark:     string | null;
}

export interface SemesterResults {
  subjects:       SubjectResult[];
  average:        number | null;
  class_position: number | null;
  total_students: number | null;
  form_teacher_remarks: {
    attitude:         string | null;
    conduct:          string | null;
    general_remarks:  string | null;
    form_teacher_name:string | null;
  } | null;
  attendance: {
    present: number;
    absent:  number;
    late:    number;
    rate:    number;
  } | null;
}

export interface AttendanceSession {
  id:         string;
  date:       string;
  period:     string | null;
  subject:    string | null;
  status:     'Present' | 'Absent' | 'Late';
  teacher:    string | null;
}

export interface AttendanceSummary {
  summary: {
    present: number;
    absent:  number;
    late:    number;
    total:   number;
    rate:    number | null;
  };
  sessions: AttendanceSession[];
}

export interface TimetableRow {
  day_of_week: string;
  start_time:  string;
  end_time:    string;
  subject:     string;
  teacher_name:string | null;
  room:        string | null;
}

export interface CalendarEvent {
  id:    string;
  date:  string;
  name:  string;
  type:  string;
  notes: string | null;
}

export interface FeeBill {
  id:          string;
  label:       string;
  amount:      number;
  paid:        number;
  balance:     number;
  due_date:    string | null;
  status:      string;
}

export interface FeePayment {
  id:             string;
  amount:         number;
  paid_at:        string;
  method:         string | null;
  receipt_number: string | null;
}

export interface FeeSummary {
  total_billed:  number;
  total_paid:    number;
  outstanding:   number;
  bills:         FeeBill[];
  payments:      FeePayment[];
}

export interface ClearanceItem {
  office:  string;
  status:  'cleared' | 'not_cleared' | 'action_required';
  notes:   string | null;
}

export interface ClearanceStatus {
  overall:  'not_initiated' | 'in_progress' | 'action_required' | 'fully_cleared';
  items:    ClearanceItem[];
}

export interface LibraryBook {
  id:           string;
  title:        string;
  author:       string | null;
  subject:      string | null;
  category:     string | null;
  isbn:         string | null;
  available:    number;
  total:        number;
}

export interface LibraryLoan {
  id:            string;
  book_title:    string;
  borrowed_at:   string;
  due_date:      string | null;
  returned_at:   string | null;
  is_overdue:    boolean;
  fine_amount:   number | null;
  status:        'active' | 'returned';
}

export interface LibraryResource {
  id:            string;
  title:         string;
  resource_type: string;
  subject:       string | null;
  description:   string | null;
  file_url:      string | null;
  uploaded_at:   string;
}

export interface ExeatRequest {
  id:              string;
  type:            'internal' | 'external';
  destination:     string;
  reason:          string;
  departure_at:    string;
  return_at:       string;
  status:          'pending' | 'approved' | 'rejected' | 'returned';
  approved_by:     string | null;
  approved_at:     string | null;
  rejection_reason:string | null;
}

export interface ExeatData {
  quota: {
    internal_used:      number;
    internal_remaining: number;
    external_used:      number;
    external_remaining: number;
  };
  requests: ExeatRequest[];
  house:    string | null;
  guardian_mobile: string | null;
}

export interface LmsCourse {
  id:             string;
  title:          string;
  subject:        string;
  description:    string | null;
  teacher_name:   string | null;
  published_at:   string;
}

export interface LmsAssignment {
  id:             string;
  course_id:      string;
  course_title:   string;
  title:          string;
  instructions:   string | null;
  due_date:       string | null;
  submitted_at:   string | null;
  status:         'pending' | 'submitted' | 'graded';
  grade:          number | null;
  max_marks:      number | null;
}
