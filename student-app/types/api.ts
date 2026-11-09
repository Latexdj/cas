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
  id:                 string;
  subject_name:       string;
  class_name:         string;
  description:        string | null;
  teacher_name:       string | null;
  academic_year_name?:string | null;
  semester?:          number | null;
  status?:            string;
  created_at?:        string;
  lesson_count?:      number;
  assignment_count?:  number;
  pending_assignments?: number;
  quiz_count?:        number;
  announcement_count?:number;
}

export type LmsAssignmentStatus = 'not_submitted' | 'submitted' | 'graded';

export interface LmsAssignment {
  id:             string;
  course_id:      string;
  subject_name:   string;
  title:          string;
  instructions:   string | null;
  due_date:       string | null;
  allow_late?:    boolean;
  max_score:      number | null;
  submission_id:  string | null;
  submitted_at:   string | null;
  score:          number | null;
  feedback:       string | null;
  is_late:        boolean | null;
  status:         LmsAssignmentStatus;
  body_text:      string | null;
  file_url:       string | null;
}

export interface LmsLesson {
  id:            string;
  course_id:     string;
  title:         string;
  content_type: 'text' | 'youtube' | 'link' | 'file';
  body:          string | null;
  external_url:  string | null;
  file_url:      string | null;
  sort_order:    number;
}

export interface LmsQuiz {
  id:                    string;
  course_id:             string;
  title:                 string;
  instructions:          string | null;
  time_limit_mins:       number | null;
  max_attempts:          number | null;
  show_answers_after:    boolean;
  randomise_questions?:  boolean;
  question_count:        number;
  total_marks:           number;
  attempt_count:         number;
  best_score:            number | null;
}

export interface LmsQuizQuestion {
  id:             string;
  question_text:  string;
  question_type: 'mcq' | 'short';
  marks:          number;
  sort_order:     number;
  option_a?:      string;
  option_b?:      string;
  option_c?:      string;
  option_d?:      string;
}

export interface LmsQuizAttemptResponse {
  attempt:   { id: string };
  questions: LmsQuizQuestion[];
  quiz:      { id: string; title: string; time_limit_mins: number | null; show_answers_after: boolean };
}

export interface LmsQuizResultQuestion {
  id:             string;
  question_text:  string;
  your_answer:    string | null;
  correct_answer?:string | null;
  explanation?:   string | null;
  marks_awarded:  number;
  marks:          number;
}

export interface LmsQuizResult {
  score:              number;
  total_marks:        number;
  percentage:         number;
  show_answers_after: boolean;
  questions:          LmsQuizResultQuestion[];
}

export interface LmsAnnouncement {
  id:         string;
  title:      string;
  body:       string;
  is_pinned:  boolean;
  created_at: string;
}

export interface PascoQuestion {
  id:             string;
  question_text:  string;
  option_a:       string;
  option_b:       string;
  option_c:       string;
  option_d:       string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation?:   string | null;
  difficulty?:    string | null;
  year?:          number | null;
  subject_name?:  string | null;
}

export interface ClinicVisit {
  id:                string;
  complaint:         string;
  severity:          string;
  outcome:           string | null;
  visit_date:        string;
  diagnosis_notes:   string | null;
  treatment_given:   string | null;
  closed_at:         string | null;
}

export interface ClinicHealthProfile {
  blood_group:         string | null;
  genotype:            string | null;
  known_allergies:     string | null;
  known_conditions:    string | null;
  current_medications: string | null;
}

export interface DisciplinaryLetter {
  id:               string;
  letter_type:      string;
  offense_category: string;
  offense_other?:   string;
  subject:          string;
  body:             string;
  issued_date:      string;
  status:          'issued' | 'acknowledged' | 'resolved';
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolution_notes?:string;
  resolved_at?:     string;
  issued_by_name:   string;
  created_at:       string;
  academic_year_name?: string;
  semester?:        number;
}
