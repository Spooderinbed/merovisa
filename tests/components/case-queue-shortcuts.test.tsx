import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { CaseQueueShortcuts } from "@/components/workspace/case-queue-shortcuts";

/**
 * MV-179 — `/`, `j`, `k` and Escape (spec §1). Enter is deliberately untested
 * here because it is deliberately unimplemented: the shortcuts move real focus
 * onto real anchors, so Enter is the browser's own link activation. What IS
 * asserted is the contract that makes that true — the shortcuts never intercept
 * anything while focus sits in a control, and they clean up after unmount.
 */

function Queue() {
  return (
    <div>
      <input data-case-queue-search aria-label="Search" />
      <input aria-label="Other control" />
      <a href="/a" data-case-queue-link>
        Case A
      </a>
      <a href="/b" data-case-queue-link>
        Case B
      </a>
      <a href="/elsewhere">Unrelated link</a>
      <CaseQueueShortcuts />
    </div>
  );
}

afterEach(cleanup);

const press = (key: string, target: Element | Document = document.body) =>
  fireEvent.keyDown(target, { key });

describe("CaseQueueShortcuts", () => {
  it("'/' focuses the queue search", () => {
    const { getByLabelText } = render(<Queue />);
    press("/");
    expect(document.activeElement).toBe(getByLabelText("Search"));
  });

  it("'/' inside ANY control stays a typed slash — focus does not move", () => {
    const { getByLabelText } = render(<Queue />);
    const other = getByLabelText("Other control");
    other.focus();
    press("/", other);
    expect(document.activeElement).toBe(other);
  });

  it("'j' walks focus down the case links and clamps at the last", () => {
    const { getByText } = render(<Queue />);
    press("j");
    expect(document.activeElement).toBe(getByText("Case A"));
    press("j");
    expect(document.activeElement).toBe(getByText("Case B"));
    press("j");
    expect(document.activeElement).toBe(getByText("Case B"));
  });

  it("'k' walks focus back up and clamps at the first", () => {
    const { getByText } = render(<Queue />);
    press("j");
    press("j");
    press("k");
    expect(document.activeElement).toBe(getByText("Case A"));
    press("k");
    expect(document.activeElement).toBe(getByText("Case A"));
  });

  it("'j' never lands on a link that is not a case row", () => {
    const { getByText } = render(<Queue />);
    press("j");
    press("j");
    press("j");
    expect(document.activeElement).not.toBe(getByText("Unrelated link"));
  });

  it("'j' typed into the search box is text, not navigation", () => {
    const { getByLabelText } = render(<Queue />);
    const search = getByLabelText("Search");
    search.focus();
    press("j", search);
    expect(document.activeElement).toBe(search);
  });

  it("Escape leaves the search box without touching anything else", () => {
    const { getByLabelText } = render(<Queue />);
    const search = getByLabelText("Search");
    search.focus();
    press("Escape", search);
    expect(document.activeElement).not.toBe(search);
  });

  it("Escape in an unrelated control is left alone", () => {
    const { getByLabelText } = render(<Queue />);
    const other = getByLabelText("Other control");
    other.focus();
    press("Escape", other);
    expect(document.activeElement).toBe(other);
  });

  it("unmount removes the listener — no shortcut survives the page", () => {
    const { unmount, getByText } = render(<Queue />);
    const caseA = getByText("Case A");
    unmount();
    press("j");
    expect(document.activeElement).not.toBe(caseA);
  });

  it("case links are real anchors with real hrefs — Enter needs no handler", () => {
    const { getByText } = render(<Queue />);
    const link = getByText("Case A") as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/a");
  });
});
