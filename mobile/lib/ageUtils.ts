/** Client-side age helpers (mirrors services/api/age_utils.py). */

export function calculateAge(dateOfBirth: string, onDate = new Date()): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  const today = onDate;
  let years = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    years -= 1;
  }
  return years;
}

export function ageGroupLabel(age: number | null): string | null {
  if (age == null) return null;
  if (age <= 9) return "0-9";
  if (age <= 17) return "10-17";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  if (age <= 64) return "55-64";
  return "65+";
}

export function formatDateOfBirth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
