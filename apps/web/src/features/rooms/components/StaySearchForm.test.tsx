import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StaySearchForm } from "./StaySearchForm";

const value = { checkIn: "2030-06-10", checkOut: "2030-06-12", adults: 2, children: 0 };

function renderForm(onSubmit = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <StaySearchForm value={value} today="2030-06-01" onSubmit={onSubmit} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

describe("StaySearchForm", () => {
  beforeEach(() => {
    // The embedded branch picker loads branches; a single branch renders no picker.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ success: true, data: [], meta: {} }))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the length of stay and submits the chosen search", async () => {
    const onSubmit = renderForm();
    expect(screen.getByText("2 nights")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More adults" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSubmit).toHaveBeenCalledWith({ ...value, adults: 3 });
  });

  it("cannot go below one adult or above the guest limit", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Fewer adults" }));
    expect(screen.getByRole("button", { name: "Fewer adults" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fewer children" })).toBeDisabled();
  });

  it("blocks searching when check-out is not after check-in", async () => {
    const onSubmit = renderForm();
    const checkOut = screen.getByLabelText("Check-out");
    fireEvent.change(checkOut, { target: { value: "2030-06-10" } });
    expect(screen.getByText("Check-out must be after check-in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
