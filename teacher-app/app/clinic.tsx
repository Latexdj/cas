import React, { useState } from 'react';
import { api } from '@/lib/api';
import { StudentSearch, type FoundStudent } from '@/components/StudentSearch';
import { Body, Button, Card, Field, Notice, Screen, errText } from '@/components/ui/kit';

export default function ClinicScreen() {
  const [student, setStudent] = useState<FoundStudent | null>(null);
  const [complaint, setComplaint] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  async function send() {
    if (!student) { setMsg({ text: 'Choose the student you are sending.', tone: 'bad' }); return; }
    if (!complaint.trim()) { setMsg({ text: 'Say why you are sending them.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post<{ patient_name: string }>('/api/clinic/referral', { student_id: student.id, complaint: complaint.trim() });
      setMsg({ text: `${data.patient_name ?? student.name} has been referred to the clinic. Clinic staff complete the visit when the student arrives.`, tone: 'ok' });
      setStudent(null); setComplaint('');
    } catch (e) { setMsg({ text: errText(e, 'Could not send the referral. Try again.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <Body soft>Send a student to the school clinic. Clinic staff complete the visit when the student arrives.</Body>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      <Card>
        <StudentSearch endpoint="/api/clinic/referral/students/search" selected={student} onSelect={setStudent} />
        <Field label="Reason" value={complaint} onChangeText={setComplaint} multiline placeholder="For example: headache, fell during PE" />
        <Button label="Send to clinic" icon="medkit-outline" busy={busy} onPress={send} />
      </Card>
    </Screen>
  );
}
