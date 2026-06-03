import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

import { notFound } from "next/navigation";
import DestinationDetailPage from "@/app/(marketing)/destinations/[id]/page";

const notFoundMock = vi.mocked(notFound);

describe("/destinations/[id]", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it("renders the country page for a valid id", async () => {
    const ui = await DestinationDetailPage({ params: Promise.resolve({ id: "au" }) });
    render(ui);
    expect(screen.getByText("Australia")).toBeInTheDocument();
  });

  it("calls notFound() for an unknown id", async () => {
    await expect(
      DestinationDetailPage({ params: Promise.resolve({ id: "xx" }) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
