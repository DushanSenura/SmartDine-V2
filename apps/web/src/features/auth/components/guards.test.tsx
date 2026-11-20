import type { AuthUser, Role } from "@smartdine/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/stores/authStore";

import { RequireRole } from "./guards";

const userWith = (role: Role): AuthUser => ({
  id: "1",
  email: "a@b.c",
  firstName: "A",
  lastName: "B",
  phone: null,
  role,
  permissions: [],
  branchId: null,
});

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <p>login page</p> },
      { path: "/forbidden", element: <p>forbidden page</p> },
      {
        element: <RequireRole roles={["MANAGER"]} />,
        children: [{ path: "/app/manager", element: <p>manager area</p> }],
      },
    ],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => useAuthStore.getState().clear());

describe("RequireRole", () => {
  it("shows a loading state while the session is being restored", () => {
    useAuthStore.setState({ status: "loading", user: null });
    renderAt("/app/manager");
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("redirects anonymous visitors to login", async () => {
    useAuthStore.getState().clear();
    renderAt("/app/manager");
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("redirects users with the wrong role to the forbidden page", async () => {
    useAuthStore.setState({ status: "authenticated", user: userWith("WAITER") });
    renderAt("/app/manager");
    expect(await screen.findByText("forbidden page")).toBeInTheDocument();
  });

  it("renders the area for an allowed role", async () => {
    useAuthStore.setState({ status: "authenticated", user: userWith("MANAGER") });
    renderAt("/app/manager");
    expect(await screen.findByText("manager area")).toBeInTheDocument();
  });
});
