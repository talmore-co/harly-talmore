export const mergeFields = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "address",
  "location",
  "linkedinUrl",
  "githubUrl",
  "websiteUrl",
  "headline",
  "summary",
  "avatarUrl",
  "experienceYears",
] as const;
export type MergeField = (typeof mergeFields)[number];
