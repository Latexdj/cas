require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const schoolRoutes = require('./routes/schools');
const teacherRoutes = require('./routes/teachers');
const academicYearRoutes = require('./routes/academicYears');
const locationRoutes = require('./routes/locations');
const timetableRoutes = require('./routes/timetable');
const subjectRoutes   = require('./routes/subjects');
const classRoutes     = require('./routes/classes');
const attendanceRoutes = require('./routes/attendance');
const absenceRoutes = require('./routes/absences');
const remedialRoutes = require('./routes/remedial');
const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/students');
const studentAttendanceRoutes = require('./routes/student-attendance');
const { startAbsenceCheckJob } = require('./jobs/absenceCheck');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
// 10 mb limit to handle base64 classroom photos
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/academic-years', academicYearRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/timetable',  timetableRoutes);
app.use('/api/subjects',   subjectRoutes);
app.use('/api/classes',    classRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/absences', absenceRoutes);
app.use('/api/remedial', remedialRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/student-attendance', studentAttendanceRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CAS backend running on port ${PORT}`);
  startAbsenceCheckJob();
});
