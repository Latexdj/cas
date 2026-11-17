// The teacher app's More menu: the same sections, names and gating as the
// web teacher portal (admin-portal/app/teacher/TeacherShell.tsx).
import type { Ionicons } from '@expo/vector-icons';
import { hasModule, type Access } from './access';

type IconName = keyof typeof Ionicons.glyphMap;

export interface MenuItem {
  route: string; label: string; sub: string; icon: IconName;
  module?: string;
  only?: 'formTeacher' | 'hod' | 'budget' | 'housemaster' | 'seniorHousemaster' | 'library' | 'clearance';
}

export const MENU: { label: string; items: MenuItem[] }[] = [
  {
    label: 'Responsibilities',
    items: [
      { route: '/form-class', label: 'Form Class', sub: 'Your form class: students, attendance and remarks', icon: 'people-circle-outline', only: 'formTeacher' },
      { route: '/hod', label: 'My Department', sub: 'Classes, teachers and results to approve', icon: 'business-outline', only: 'hod' },
      { route: '/hod/inventory', label: 'Department Inventory', sub: 'Items, issues, returns and loans', icon: 'cube-outline', only: 'hod', module: 'inventory' },
      { route: '/hod/observations', label: 'Department Observations', sub: 'Observe lessons in your department', icon: 'eye-outline', only: 'hod', module: 'lesson_observation' },
      { route: '/budgets', label: 'Budgets', sub: 'Draft and submit your budget', icon: 'wallet-outline', only: 'budget', module: 'department_budgets' },
      { route: '/house-students', label: 'My House', sub: 'House students, exeats and records', icon: 'home-outline', only: 'housemaster', module: 'houses' },
      { route: '/resumption', label: 'Resumption Register', sub: 'Who has reported back after a break', icon: 'log-in-outline', only: 'seniorHousemaster' },
      { route: '/roll-call', label: 'Roll Call', sub: 'Dormitory and house roll calls', icon: 'list-outline', only: 'seniorHousemaster' },
      { route: '/library', label: 'Library', sub: 'Issue and return books', icon: 'library-outline', only: 'library', module: 'library' },
      { route: '/clearance', label: 'Clearance', sub: 'Students waiting for your office', icon: 'checkmark-done-outline', only: 'clearance', module: 'clearance' },
    ],
  },
  {
    label: 'Attendance',
    items: [
      { route: '/(tabs)/submit', label: 'Submit attendance', sub: 'Clock in for a lesson and take the register', icon: 'checkmark-circle-outline' },
      { route: '/(tabs)/history', label: 'History', sub: 'Your attendance, sessions and meetings', icon: 'time-outline' },
      { route: '/(tabs)/meetings', label: 'Meetings', sub: 'Staff meetings and attendance', icon: 'people-outline' },
      { route: '/invigilation', label: 'Invigilation', sub: 'Your exam duties', icon: 'document-lock-outline' },
      { route: '/reminders', label: 'Lesson reminders', sub: 'A bell before each lesson and remedial', icon: 'alarm-outline' },
    ],
  },
  {
    label: 'Students',
    items: [
      { route: '/student-attendance', label: 'Student Attendance', sub: 'Class registers and absences', icon: 'clipboard-outline' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { route: '/(tabs)/results', label: 'Results', sub: 'Class results and report cards', icon: 'bar-chart-outline', module: 'assessments' },
      { route: '/lms', label: 'My Courses', sub: 'Lessons, assignments and quizzes', icon: 'school-outline', module: 'lms' },
      { route: '/offline-assessment', label: 'Offline Assessment', sub: 'Tests and exams on the school Wi-Fi, no internet', icon: 'wifi-outline', module: 'lms' },
      { route: '/resources', label: 'Resources', sub: 'Subject apps and teaching websites', icon: 'apps-outline', module: 'teacher_resources' },
    ],
  },
  {
    label: 'Administrative',
    items: [
      { route: '/absences/leaves', label: 'Leave', sub: 'Request leave and track it', icon: 'airplane-outline' },
      { route: '/conduct', label: 'Conduct', sub: 'Queries from management and your responses', icon: 'shield-outline', module: 'discipline' },
      { route: '/memos', label: 'Memos', sub: 'Memos from the school', icon: 'mail-outline', module: 'discipline' },
      { route: '/letters', label: 'My Letters', sub: 'Letters and queries addressed to you', icon: 'document-text-outline', module: 'discipline' },
      { route: '/clinic', label: 'Clinic', sub: 'Refer a student to the clinic', icon: 'medkit-outline', module: 'clinic' },
      { route: '/id-scan', label: 'Scan ID Card', sub: 'Look up a student from their card', icon: 'qr-code-outline' },
      { route: '/(tabs)/observations', label: 'My Observations', sub: 'Feedback on your lessons', icon: 'eye-outline', module: 'lesson_observation' },
    ],
  },
  {
    label: 'Account',
    items: [
      { route: '/(tabs)/notifications', label: 'Alerts', sub: 'Messages about your results and requests', icon: 'notifications-outline' },
      { route: '/(tabs)/profile', label: 'Profile', sub: 'Your details, password and appearance', icon: 'person-circle-outline' },
    ],
  },
];

export function visible(item: MenuItem, a: Access): boolean {
  if (!hasModule(a, item.module)) return false;
  switch (item.only) {
    case 'formTeacher': return a.formTeacher;
    case 'hod': return a.hod;
    case 'budget': return a.hod || a.headsBudget;
    case 'housemaster': return a.housemaster;
    case 'seniorHousemaster': return a.seniorHousemaster;
    case 'library': return a.library;
    case 'clearance': return a.clearance;
    default: return true;
  }
}
