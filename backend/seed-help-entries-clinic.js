'use strict';
/**
 * Clinic seed: help entries for the Clinic module.
 *   admin   — overview, visits, visit record, health profiles, stock, reports, settings, nurse accounts
 *   teacher — sending a student to the clinic
 *   student — my clinic history and health profile
 * (The school nurse's own entries are in seed-help-entries-staff-portal.js.)
 * Run: node backend/seed-help-entries-clinic.js  (or node backend/seed-help-all.js)
 * Safe to re-run: inserts new entries and updates existing ones by title.
 */
const { runSeed } = require('./help-seed-runner');

const A = ['admin'];

const ENTRIES = [
  {
    feature_area: 'clinic', applicable_roles: A,
    title: 'Clinic Module Overview',
    body: `The Clinic module records every visit to the school clinic, the medicine given, the clinic's stock and each student's health profile. Find it in the left sidebar under Clinic: Overview, Visits, Health Profiles, Inventory, Reports and Settings.

Overview shows today's visits and who is currently in the clinic. The school nurse works in the staff portal (Menu → Clinic), with the same visit record, health profiles, stock and reports.

To give someone clinic access: create a staff-portal account with the Clinic role (People → Support Staff), or give a teacher the clinic responsibility. The Clinic module must be enabled for your school.`,
  },
  {
    feature_area: 'clinic', applicable_roles: A,
    title: 'Clinic Visits',
    body: `Open Clinic → Visits. Search by name or student code and filter by status (Open or Closed).

To record a visit, click "Log a visit": choose Student or Staff, find the person, type the reason for the visit, choose the severity (Minor, Moderate or Serious), and save.

Click a visit to open its record: complaint; temperature, blood pressure and pulse; diagnosis notes; treatment given; notes; and the items dispensed. Click Save after editing. To give medicine, choose the item and quantity under Dispensed items and click Add; it comes off the clinic stock.

To close a visit, choose the outcome (Returned to class, Sent home, Referred to hospital, Admitted in clinic, or Other) and click Close visit. Print slip prints a visit slip for the student. Administrators can Reopen a closed visit; the nurse cannot.`,
  },
  {
    feature_area: 'clinic', applicable_roles: A,
    title: 'Clinic SMS to Parents and Clinic Settings',
    body: `When a visit is closed, CAS can send the parent or guardian an SMS (to the guardian mobile number on the student's record). Open Clinic → Settings:

- Notify on serious visits: send an SMS when the visit was marked Serious, or the student was referred to hospital or admitted in the clinic. This is on by default.
- Notify on every visit: send an SMS for every closed visit, including minor ones.

Click Save. A closed visit's record shows "A parent/guardian notification was sent." when an SMS went out. Only administrators can change these settings.`,
  },
  {
    feature_area: 'clinic', applicable_roles: A,
    title: 'Student Health Profiles (Admin)',
    body: `Open Clinic → Health Profiles and search for a student. The profile holds blood group, genotype, known allergies, known conditions and current medications. Fill in what is known and click Save. The nurse sees and edits the same profiles, and students see their own in the student portal under Clinic.`,
  },
  {
    feature_area: 'clinic', applicable_roles: A,
    title: 'Clinic Stock, Restocking and Write-offs',
    body: `Open Clinic → Inventory. The table lists each medicine or supply with the quantity on hand, batch number, expiry date and a Low stock flag when it falls below its reorder level.

- Add item: name, category (Medication or Consumable), unit (tablet, ml, piece…) and reorder level.
- Restock: quantity received, batch number and expiry date.
- Write off: quantity and reason (for example expired or broken).

Clinic → Inventory → Report (Dispensing report) shows what was restocked, dispensed and written off between two dates, by item, and can be exported to CSV showing who used what and on whom.`,
  },
  {
    feature_area: 'clinic', applicable_roles: A,
    title: 'Clinic Reports (Admin)',
    body: `Open Clinic → Reports and choose a date range. You will see the total visits, how many were minor, moderate and serious, and breakdowns by outcome and by patient type. Click Export CSV to download the visits. The nurse can see the same report in the staff portal.`,
  },
  {
    feature_area: 'clinic', applicable_roles: ['teacher'],
    title: 'Sending a Student to the Clinic',
    body: `If a student is unwell in your lesson, open Administrative → Clinic in the teacher portal (the Send to clinic page). Find the student by name or student code, type the reason for referral (for example "complained of a headache" or "fell during PE"), and tap Send to clinic.

The visit appears straight away in the nurse's Open visits, with your name as the teacher who sent them. The student's lesson attendance is not affected; the nurse records what happens and when they return to class.`,
  },
  {
    feature_area: 'clinic', applicable_roles: ['student'],
    title: 'My Clinic Visits and Health Profile',
    body: `Open Clinic in the student portal to see your clinic visit history (each visit's date, reason, severity and outcome) and the health profile the clinic has on file for you (blood group, genotype, allergies, conditions and medicines). If something in your profile is wrong, tell the school nurse.`,
  },
];

runSeed('clinic', ENTRIES).catch(err => { console.error(err); process.exit(1); });
