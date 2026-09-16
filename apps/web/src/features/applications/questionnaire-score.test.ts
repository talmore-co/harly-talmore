import { describe, expect, it } from "vitest";
import {
  defaultJobApplicationConfig,
  questionSchema,
  type JobApplicationQuestion,
} from "@/features/jobs/config";
import { scoreQuestionnaire } from "./questionnaire-score";
const question: JobApplicationQuestion = {
  id: "shift",
  label: "Shift",
  type: "select",
  required: true,
  options: ["Yes", "No"],
  scoring: {
    weight: 10,
    answers: [
      { option: "Yes", score: 10 },
      { option: "No", score: 0 },
    ],
  },
};
const config = (
  questions = [question],
  threshold: number | undefined = 70,
) => ({
  ...defaultJobApplicationConfig,
  questions,
  qualifiedScoreThreshold: threshold,
});
describe("weighted questionnaire scoring", () => {
  it("normalizes weighted points to 0–100", () => {
    const experience = {
      ...question,
      id: "experience",
      scoring: {
        weight: 5,
        answers: [
          { option: "Yes", score: 6 },
          { option: "No", score: 10 },
        ],
      },
    };
    const start = {
      ...question,
      id: "start",
      scoring: {
        weight: 5,
        answers: [
          { option: "Yes", score: 2 },
          { option: "No", score: 10 },
        ],
      },
    };
    expect(
      scoreQuestionnaire(config([question, experience, start]), {
        shift: "Yes",
        experience: "Yes",
        start: "Yes",
      }),
    ).toMatchObject({ score: 70, earned: 140, maximum: 200, qualified: true });
  });
  it("uses the maximum available answer, not an assumed ten points", () => {
    const custom = {
      ...question,
      scoring: {
        weight: 3,
        answers: [
          { option: "Yes", score: 6 },
          { option: "No", score: 0 },
        ],
      },
    };
    expect(scoreQuestionnaire(config([custom]), { shift: "Yes" })?.score).toBe(
      100,
    );
  });
  it("supports a genuine zero", () =>
    expect(scoreQuestionnaire(config(), { shift: "No" })?.score).toBe(0));
  it("averages multiple selections without adding points for checking everything", () => {
    expect(
      scoreQuestionnaire(config([{ ...question, type: "multiselect" }]), {
        shift: JSON.stringify(["Yes", "No"]),
      })?.score,
    ).toBe(50);
  });
  it.each(['["Yes","Yes"]', '["Unknown"]', "not json"])(
    "rejects malformed or unknown multi-select answers: %s",
    (value) => {
      expect(() =>
        scoreQuestionnaire(config([{ ...question, type: "multiselect" }]), {
          shift: value,
        }),
      ).toThrow();
    },
  );
  it("rejects missing required answers", () =>
    expect(() => scoreQuestionnaire(config(), {})).toThrow());
  it("gives unanswered optional questions zero while retaining the denominator", () =>
    expect(
      scoreQuestionnaire(config([{ ...question, required: false }]), {})?.score,
    ).toBe(0));
  it("does not score informational questionnaires", () =>
    expect(
      scoreQuestionnaire(config([{ ...question, scoring: undefined }]), {}),
    ).toBeNull());
  it("does not qualify an application when its threshold is disabled", () =>
    expect(
      scoreQuestionnaire(
        { ...config(), qualifiedScoreThreshold: undefined },
        { shift: "Yes" },
      )?.qualified,
    ).toBe(false));
  it("snapshots the original answer scores independently of later edits", () => {
    const copy = structuredClone(question);
    const result = scoreQuestionnaire(config([copy]), { shift: "Yes" });
    copy.scoring!.answers[0]!.score = 1;
    expect(result?.questions[0]?.answers[0]?.score).toBe(10);
  });
  it("rejects incomplete scoring configurations and zero maximums", () => {
    expect(
      questionSchema.safeParse({
        ...question,
        scoring: { weight: 1, answers: [{ option: "Yes", score: 10 }] },
      }).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        ...question,
        scoring: {
          weight: 1,
          answers: [
            { option: "Yes", score: 0 },
            { option: "No", score: 0 },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
