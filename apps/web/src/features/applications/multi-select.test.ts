import { describe, expect, it } from "vitest";
import { parseJobApplicationQuestions } from "@/features/jobs/config";
import { validateApplicationQuestionAnswers } from "@/lib/validations/applications";
import { validatePortalApplication } from "@/features/portal/application-validation";
import { buildQuestionAnswerRows } from "./questions";
import {
  parseMultiSelectAnswer,
  validateMultiSelectAnswer,
} from "./multi-select";

const question = {
  id: "equipment",
  label: "What have you operated?",
  type: "multiselect" as const,
  required: true,
  options: ["RC car", "Drone", "Racing wheel, joystick", 'A "quoted" option'],
};
describe("multi-select application questions", () => {
  it("round-trips question configuration and preserves choices when changing type", () => {
    const [parsed] = parseJobApplicationQuestions(
      JSON.stringify([{ ...question, minLength: 20 }]),
    );
    expect(parsed).toEqual(question);
    expect(parsed.minLength).toBeUndefined();
    expect(
      parseJobApplicationQuestions(
        JSON.stringify([{ ...question, type: "select" }]),
      )[0].options,
    ).toEqual(question.options);
  });
  it("rejects configurations with no choices", () => {
    expect(
      parseJobApplicationQuestions(
        JSON.stringify([{ ...question, options: [] }]),
      ),
    ).toEqual([]);
  });
  it("accepts several configured choices and stores readable text without breaking punctuation", () => {
    const value = JSON.stringify([
      "Drone",
      "Racing wheel, joystick",
      'A "quoted" option',
    ]);
    expect(
      validateApplicationQuestionAnswers({ equipment: value }, [question]),
    ).toEqual({});
    const [row] = buildQuestionAnswerRows({
      workspaceId: "workspace",
      applicationId: "application",
      questions: [{ ...question, dbId: "question" }],
      answers: { equipment: value },
    });
    expect(row.answer).toBe('Drone\nRacing wheel, joystick\nA "quoted" option');
  });
  it.each(["", "[]"])("rejects an empty required answer: %s", (value) => {
    expect(
      validateApplicationQuestionAnswers({ equipment: value }, [question])
        .equipment,
    ).toEqual(["Select at least one option."]);
    expect(
      validateMultiSelectAnswer(value, question.options, false),
    ).toBeNull();
  });
  it.each([
    '["Unknown"]',
    '["Drone","Drone"]',
    '"Drone"',
    "[1]",
    '{"0":"Drone"}',
    '["Drone",null]',
    "Drone,RC car",
  ])("rejects forged or malformed selections: %s", (value) => {
    expect(
      validateApplicationQuestionAnswers({ equipment: value }, [question])
        .equipment,
    ).toEqual(["Select valid options."]);
  });
  it("applies the same validation and readable persistence in the candidate portal", () => {
    const input = {
      workspaceId: "workspace",
      resumeRequired: false,
      questions: [{ ...question, key: question.id, minLength: null }],
      answers: { equipment: '["RC car","Drone"]' },
    };
    expect(validatePortalApplication(input)).toEqual({
      ok: true,
      answers: { equipment: "RC car\nDrone" },
    });
    expect(
      validatePortalApplication({ ...input, answers: { equipment: "[]" } }).ok,
    ).toBe(false);
    expect(
      validatePortalApplication({
        ...input,
        answers: { equipment: '["forged"]' },
      }).ok,
    ).toBe(false);
  });
  it("bounds malformed input and keeps single-select answers compatible", () => {
    expect(parseMultiSelectAnswer(" ".repeat(10_001) + "[]")).toBeNull();
    expect(
      validateApplicationQuestionAnswers({ equipment: "Drone" }, [
        { ...question, type: "select" },
      ]),
    ).toEqual({});
  });
});
