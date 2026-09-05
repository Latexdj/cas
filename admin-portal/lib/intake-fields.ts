export type FieldKind = 'short' | 'textarea';

export interface IntakeField {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  placeholder: string;
}

export const INTAKE_FIELDS: Record<'student_letter' | 'teacher_query' | 'general_letter', IntakeField[]> = {
  student_letter: [
    {
      key: 'incident',
      label: 'What happened',
      kind: 'textarea', required: true,
      placeholder: 'Describe the specific incident or behaviour',
    },
    {
      key: 'date_period',
      label: 'When it occurred',
      kind: 'short', required: true,
      placeholder: 'e.g. Monday 3 September, or "last week"',
    },
    {
      key: 'prior_history',
      label: 'Prior warnings or history',
      kind: 'textarea', required: false,
      placeholder: 'Leave blank if none',
    },
    {
      key: 'intended_outcome',
      label: 'What this letter should achieve',
      kind: 'textarea', required: true,
      placeholder: 'What outcome or action do you want to communicate?',
    },
  ],
  teacher_query: [
    {
      key: 'incident',
      label: 'What happened',
      kind: 'textarea', required: true,
      placeholder: 'Describe the specific concern or incident',
    },
    {
      key: 'date_period',
      label: 'When it occurred',
      kind: 'short', required: true,
      placeholder: 'e.g. Monday 3 September',
    },
    {
      key: 'prior_context',
      label: 'Relevant context or prior discussions',
      kind: 'textarea', required: false,
      placeholder: 'Leave blank if none',
    },
    {
      key: 'expected_response',
      label: 'Expected response and deadline',
      kind: 'short', required: true,
      placeholder: 'e.g. Written explanation by Friday 6 September',
    },
  ],
  general_letter: [
    {
      key: 'purpose',
      label: 'Main purpose and key facts',
      kind: 'textarea', required: true,
      placeholder: 'What does this letter need to communicate?',
    },
    {
      key: 'expected_action',
      label: 'Expected action or response',
      kind: 'short', required: false,
      placeholder: 'Leave blank if none',
    },
    {
      key: 'extra_details',
      label: 'Specific details or references',
      kind: 'textarea', required: false,
      placeholder: 'Dates, references, or other details (leave blank if none)',
    },
  ],
};

export function assembleIntakeMessage(
  fields: IntakeField[],
  values: Record<string, string>,
): string {
  const lines = fields
    .filter(f => values[f.key]?.trim())
    .map(f => `${f.label}: ${values[f.key].trim()}`);
  return `Here are the details for this letter:\n\n${lines.join('\n\n')}`;
}
