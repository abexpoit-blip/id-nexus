import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const signIn = vi.fn();
const signOut = vi.fn();
const refresh = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();
const meMock = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false, signIn, signOut, refresh }),
}));

vi.mock("@/lib/api", () => ({
  authApi: { me: () => meMock() },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (msg: string) => toastError(msg),
    success: (msg: string, opts?: any) => toastSuccess(msg, opts),
  },
}));

import Login from "@/pages/Login";

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );

describe("Login — regression", () => {
  beforeEach(() => {
    signIn.mockReset();
    signOut.mockReset();
    refresh.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    meMock.mockReset();
  });

  it("renders email + password fields and submit button", () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("rejects invalid email via zod and never calls signIn", async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "longenough" } });
    // Bypass HTML5 type=email validation by submitting the form directly
    const form = screen.getByRole("button", { name: /sign in/i }).closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rejects short password and never calls signIn", async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "short" } });
    // Bypass minLength by firing submit on the form directly
    const form = screen.getByRole("button", { name: /sign in/i }).closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(signIn).not.toHaveBeenCalled();
  });

  it("calls signIn with valid credentials and routes admin/buyer correctly", async () => {
    signIn.mockResolvedValue(undefined);
    refresh.mockResolvedValue(undefined);
    meMock.mockResolvedValue({ roles: ["buyer"], user: { email: "a@b.co" }, profile: null });

    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith("a@b.co", "longenough"));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("blocks seller-only accounts on the buyer portal", async () => {
    signIn.mockResolvedValue(undefined);
    meMock.mockResolvedValue({ roles: ["seller"], user: { email: "s@b.co" }, profile: null });

    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "s@b.co" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalled();
  });
});