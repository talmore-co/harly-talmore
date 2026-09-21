export type AssessmentCounts = { strong: number; mixed: number; weak: number };

export function countAssessments(assessments: Array<{ rating: "strong" | "mixed" | "weak" }>): AssessmentCounts {
  const counts = { strong: 0, mixed: 0, weak: 0 };
  for (const assessment of assessments) counts[assessment.rating]++;
  return counts;
}
