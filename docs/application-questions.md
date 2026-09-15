# Application questions

The job question editor supports short text, long text, URL, single select, and multi-select.

Use **Multi-select** for questions such as “Which equipment have you operated? Select all that apply.” Enter one option per line. Candidates see a checkbox list and can select several choices. A required multi-select needs at least one choice; an optional one may be left empty. Character minimums do not apply to multi-select questions.

To convert an existing dropdown, change its type from **Single select** to **Multi-select**, keep its options, and save the job. Existing submitted answers are preserved. Changing the question text alone does not change its input type. Options such as “None of the above” are ordinary choices; no automatic exclusivity is inferred from their wording.

Hosted forms, the candidate portal and the embedded widget accept multiple choices. Server validation rejects unknown options, malformed selections, duplicate choices and empty required answers. Saved selections appear one per line in candidate details, exports and AI evaluation evidence, using the existing answer text column. No database migration is needed.

## Public API

Job configuration uses `type: "multiselect"` and an `options` array. The application API keeps its existing string-valued `questionAnswers` contract. Encode multiple choices as a JSON array inside the answer string:

```json
{
  "questionAnswers": {
    "equipment": "[\"RC car\",\"Drone\",\"VR controller\"]"
  }
}
```

Use `"[]"` or an empty string for an unanswered optional question. Submit option labels exactly as returned by the job configuration. The hosted form and embedded widget handle encoding automatically.
