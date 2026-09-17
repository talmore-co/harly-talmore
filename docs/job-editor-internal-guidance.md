# Job editor and internal evaluation guidance

The Advanced section's Experience and Education fields are internal guidance for
candidate evaluation. Existing values remain saved and available to AI scoring
and matching. They are excluded from public job payloads and public job metadata,
including the live editor preview. Candidate-facing requirements belong in the
public job description and its content sections.

The fullscreen editor keeps the document fixed to the viewport. The form and
preview have independent scroll regions, with overscroll containment so scrolling
at the end of either pane does not move the outer page.

No database migration or environment variable changes are required.
