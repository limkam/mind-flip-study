/** Client-side age helpers (mirrors services/api/age_utils.py). */

export function calculateAge(dateOfBirth, onDate = new Date()) {
  if (!dateOfBirth) return null;
  const dob = typeof dateOfBirth === 'string' ? new Date(`${dateOfBirth}T00:00:00`) : dateOfBirth;
  const today = onDate instanceof Date ? onDate : new Date(onDate);
  let years = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    years -= 1;
  }
  return years;
}

export function ageGroupLabel(age) {
  if (age == null) return null;
  if (age <= 9) return '0-9';
  if (age <= 17) return '10-17';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  if (age <= 64) return '55-64';
  return '65+';
}

export const AGE_GROUP_OPTIONS = [
  '0-9',
  '10-17',
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55-64',
  '65+',
];
