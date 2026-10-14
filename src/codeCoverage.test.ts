import { expect, test } from "bun:test";
import { lineCoverage, originalLine } from "./codeCoverage";

test("code coverage distinguishes test execution, missing lines, imports and non-executable lines", () => {
  const data = { executed_lines: [1, 3, 4, 5], missing_lines: [7], contexts: {
    "1": [""], "3": ["test_a[1]|run", "test_a[1]|run", "test_b|run"],
    "4": ["test_a[1]|setup"], "5": ["test_b|run"],
  } };
  expect(lineCoverage(data, 3)).toEqual({ status: "covered", tests: ["test_a[1]", "test_b"] });
  expect(lineCoverage(data, 7)).toEqual({ status: "uncovered", tests: [] });
  expect(lineCoverage(data, 1)?.status).toBe("outside");
  expect(lineCoverage(data, 1, "test_a[1]")?.status).toBe("outside");
  expect(lineCoverage(data, 4)?.status).toBe("outside");
  expect(lineCoverage(data, 2)).toBeNull();
  expect(lineCoverage(data, 3, "test_a[1]")?.status).toBe("covered");
  expect(lineCoverage(data, 5, "test_a[1]")).toEqual({ status: "uncovered", tests: ["test_b"] });
});

test("source slices and generated interfaces map coverage to original head lines", () => {
  expect(originalLine(2, 15)).toBe(16);
  expect(originalLine(2, 1, [10, null, 25])).toBeNull();
  expect(originalLine(3, 1, [10, null, 25])).toBe(25);
  expect(originalLine(4, 1, [10, null, 25])).toBeNull();
});
