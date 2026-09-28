// @vitest-environment jsdom

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CodeInput } from "@/components/shared/CodeInput";

afterEach(cleanup);

function ControlledCodeInput({
  initialValue = "",
  length = 4,
  normalize = (val: string) => val.replace(/\D/g, ""),
  onEnter,
}: {
  initialValue?: string;
  length?: number;
  normalize?: (val: string) => string;
  onEnter?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <CodeInput
      value={value}
      length={length}
      label="Four digit campaign code"
      testId="test-code-input"
      onChange={setValue}
      normalize={normalize}
      onEnter={onEnter}
    />
  );
}

describe("CodeInput", () => {
  it("renders the requested number of cells with placeholders for missing characters", () => {
    const { container } = render(
      <CodeInput
        value="42"
        length={4}
        label="Test code"
        onChange={vi.fn()}
        normalize={(val) => val}
      />,
    );

    const cells = container.querySelectorAll("[class*='cell']");
    expect(cells).toHaveLength(4);
    expect(cells[0]?.textContent).toBe("4");
    expect(cells[1]?.textContent).toBe("2");
    expect(cells[2]?.textContent).toBe("·");
    expect(cells[3]?.textContent).toBe("·");
  });

  it("renders 6-character room codes with correct cell length attribute", () => {
    const { container } = render(
      <CodeInput
        value="ABC"
        length={6}
        label="Six-letter host code"
        testId="lobby-code"
        inputMode="text"
        autoCapitalize="characters"
        onChange={vi.fn()}
        normalize={(val) => val.toUpperCase()}
      />,
    );

    const digitsContainer = container.querySelector("[data-length='6']");
    expect(digitsContainer).not.toBeNull();
    const cells = container.querySelectorAll("[class*='cell']");
    expect(cells).toHaveLength(6);
    expect(cells[0]?.textContent).toBe("A");
    expect(cells[1]?.textContent).toBe("B");
    expect(cells[2]?.textContent).toBe("C");
    expect(cells[3]?.textContent).toBe("·");
  });

  it("selects all characters when focused or clicked at full length", async () => {
    const user = userEvent.setup();
    render(<ControlledCodeInput initialValue="0421" length={4} />);
    const input = screen.getByTestId<HTMLInputElement>("test-code-input");

    await user.click(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);

    await user.keyboard("9876");
    expect(input).toHaveValue("9876");
  });

  it("positions cursor at the end when focused or clicked at partial length", async () => {
    const user = userEvent.setup();
    render(<ControlledCodeInput initialValue="12" length={4} />);
    const input = screen.getByTestId<HTMLInputElement>("test-code-input");

    await user.click(input);
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);

    await user.keyboard("34");
    expect(input).toHaveValue("1234");
  });

  it("sanitizes input and does not consume maxLength on invalid characters", async () => {
    const user = userEvent.setup();
    render(<ControlledCodeInput initialValue="" length={4} />);
    const input = screen.getByTestId<HTMLInputElement>("test-code-input");

    await user.click(input);
    // Type numbers mixed with letters. Invalid characters should not eat into the 4-char maxLength limit.
    await user.keyboard("12ab34");
    expect(input).toHaveValue("1234");
  });

  it("invokes onEnter callback when Enter is pressed", () => {
    const onEnter = vi.fn();
    render(<ControlledCodeInput initialValue="1234" length={4} onEnter={onEnter} />);
    const input = screen.getByTestId("test-code-input");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it("does not prevent default on Enter when onEnter is not provided", () => {
    render(<ControlledCodeInput initialValue="1234" length={4} />);
    const input = screen.getByTestId("test-code-input");

    const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("normalizes pasted strings and caps at specified length", () => {
    const onChange = vi.fn();
    render(
      <CodeInput
        value=""
        length={6}
        label="Host code"
        testId="paste-input"
        onChange={onChange}
        normalize={(val) => val.toUpperCase().replace(/[^A-HJ-NP-Z]/g, "")}
      />,
    );

    const input = screen.getByTestId("paste-input");
    fireEvent.change(input, { target: { value: "abc-def-ghi" } });
    expect(onChange).toHaveBeenCalledWith("ABCDEF");
  });
});
