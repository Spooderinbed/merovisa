import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GuideChat } from "@/components/guide/guide-chat";

describe("GuideChat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a question input and a send control", () => {
    render(<GuideChat />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
  });

  it("sends the typed question to /api/guide/chat and shows the grounded reply", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ reply: "You're a Strong match because your grades clear the bar." }), { status: 200 }));

    render(<GuideChat />);
    await userEvent.type(screen.getByRole("textbox"), "why am I a strong match?");
    await userEvent.click(screen.getByRole("button", { name: /ask/i }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/guide/chat");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.message).toBe("why am I a strong match?");
    expect(Array.isArray(body.history)).toBe(true); // prior turns travel as grounding

    // both the student's question and the grounded answer appear in the transcript
    expect(await screen.findByText(/You're a Strong match because/)).toBeInTheDocument();
    expect(screen.getByText("why am I a strong match?")).toBeInTheDocument();
  });

  it("surfaces a visible error and adds no answer when the request fails (MV-62)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));

    render(<GuideChat />);
    await userEvent.type(screen.getByRole("textbox"), "help");
    await userEvent.click(screen.getByRole("button", { name: /ask/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/try again|couldn’t|could not/i);
  });

  it("does not post an empty question", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<GuideChat />);
    await userEvent.click(screen.getByRole("button", { name: /ask/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
