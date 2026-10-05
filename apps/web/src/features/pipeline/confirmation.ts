export function bulkDecisionConfirmationMessage(
  status: "hired" | "rejected",
  count: number,
) {
  const verb = status === "hired" ? "hire" : "reject";
  const noun = count === 1 ? "application" : "applications";
  return `Confirm ${verb} ${count} ${noun}? This changes every selected application.`;
}

/** Dialog copy for a hire; a single hire is confirmed just like a bulk one. */
export function hireConfirmationCopy(count: number) {
  const single = count === 1;
  return {
    title: single ? "Hire this candidate?" : `Hire ${count} candidates?`,
    description: single
      ? "The application is marked as hired and moves to the Hired stage. If the candidate portal shows application status, the candidate sees the update."
      : `All ${count} selected applications are marked as hired and move to the Hired stage. If the candidate portal shows application status, the candidates see the update.`,
    action: single ? "Hire candidate" : `Hire ${count} candidates`,
  };
}
