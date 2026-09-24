import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  artifactMentionKeys,
  fileMentionIds,
} from "../shared/mentions.js";

describe("chat mentions", () => {
  it("matches complete reference tokens without numeric prefixes or suffixes", () => {
    expect([...artifactMentionKeys("Use @BRD#10, not @BRD#1suffix")]).toEqual([
      "BRD#10",
    ]);
    expect(
      fileMentionIds("Read @file#12suffix, @file#12 and @file#123."),
    ).toEqual([12, 123]);
  });
  it("searches multi-word titles and stops suggesting after selection", () => {
    expect(activeMentionQuery("Please read @project plan")).toBe(
      "project plan",
    );
    expect(activeMentionQuery("Please read @file#12 ")).toBe(null);
    expect(activeMentionQuery("Please read @BRD#10")).toBe(null);
  });
});
