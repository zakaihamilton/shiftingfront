// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAnnouncement } from "../../components/ui/useAnnouncement";

describe("useAnnouncement", () => {
  it("changes the live-region string when the same message is repeated", () => {
    const { result } = renderHook(() => useAnnouncement());
    act(() => result.current[1]("Unit under attack"));
    expect(result.current[0]).toBe("Unit under attack");
    act(() => result.current[1]("Unit under attack"));
    expect(result.current[0]).toBe("Unit under attack\u200b");
    act(() => result.current[1]("Unit under attack"));
    expect(result.current[0]).toBe("Unit under attack");
  });
});
