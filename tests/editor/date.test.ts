import { todayLabel } from "../../src/editor/date";

test("today's date label is dd/mm/yyyy with ASCII digits", () => {
  expect(todayLabel(new Date(2026, 10, 7))).toBe("07/11/2026");
});
