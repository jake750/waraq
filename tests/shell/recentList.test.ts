import { matchesName } from "../../src/shell/RecentList";

test("recent filter ignores case and Arabic marks", () => {
  expect(matchesName("تَقْرِير السنة.pdf", "تقرير")).toBe(true);
  expect(matchesName("Report.PDF", "report")).toBe(true);
  expect(matchesName("كتاب.pdf", "تقرير")).toBe(false);
});
