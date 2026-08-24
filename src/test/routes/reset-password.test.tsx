// QA: forced first-login password reset.
// Every new staff account is created with mustResetPassword, so this screen is
// the gate between a shared temporary password and a private one. Client-side
// validation must reject short and mismatched passwords before they are sent,
// and a failed change must leave the user on this screen.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  navigate: vi.fn(),
  completeReset: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mocks.navigate,
}));

import { Route } from "@/routes/reset-password";

const ResetPasswordPage = Route.options.component as ComponentType;

function renderPage({
  ready = true,
  mustResetPassword = true,
  signedIn = true,
}: { ready?: boolean; mustResetPassword?: boolean; signedIn?: boolean } = {}) {
  mocks.useAuth.mockReturnValue({
    ready,
    user: signedIn
      ? { staffId: "staff-1", fullName: "Kwesi Owusu", role: "Technician", mustResetPassword }
      : null,
    completeReset: mocks.completeReset,
  });
  return render(<ResetPasswordPage />);
}

/** The three password boxes, in DOM order: current, new, confirm. */
function passwordFields() {
  const [current, next, confirm] = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
  );
  return { current, next, confirm };
}

async function submit(values: { current: string; next: string; confirm: string }) {
  const fields = passwordFields();
  await userEvent.type(fields.current, values.current);
  await userEvent.type(fields.next, values.next);
  await userEvent.type(fields.confirm, values.confirm);
  await userEvent.click(screen.getByRole("button", { name: "Set password" }));
}

beforeEach(() => {
  mocks.completeReset.mockResolvedValue({ ok: true });
});

describe("access control", () => {
  it("renders nothing when there is no session", () => {
    const { container } = renderPage({ signedIn: false });

    expect(container).toBeEmptyDOMElement();
  });

  it("sends a signed-out visitor to the login screen", () => {
    renderPage({ signedIn: false });

    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/login", replace: true });
  });

  it("bounces a user who does not need a reset back to the dashboard", () => {
    renderPage({ mustResetPassword: false });

    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("waits for the session to load before redirecting anywhere", () => {
    renderPage({ ready: false, mustResetPassword: false });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("shows the form to a user who must reset", () => {
    renderPage();

    expect(screen.getByText("Set a new password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set password" })).toBeInTheDocument();
  });
});

describe("client-side validation", () => {
  it("rejects a new password under 8 characters without calling the API", async () => {
    renderPage();

    await submit({ current: "temp-pw", next: "short7", confirm: "short7" });

    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(mocks.completeReset).not.toHaveBeenCalled();
  });

  it("accepts a password of exactly 8 characters", async () => {
    renderPage();

    await submit({ current: "temp-pw", next: "eight8ch", confirm: "eight8ch" });

    expect(screen.queryByText("Password must be at least 8 characters")).not.toBeInTheDocument();
    expect(mocks.completeReset).toHaveBeenCalledWith("temp-pw", "eight8ch");
  });

  it("rejects mismatched confirmation without calling the API", async () => {
    renderPage();

    await submit({ current: "temp-pw", next: "correct-horse", confirm: "correct-house" });

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(mocks.completeReset).not.toHaveBeenCalled();
  });

  it("reports the length problem first when both rules are broken", async () => {
    renderPage();

    await submit({ current: "temp-pw", next: "abc", confirm: "xyz" });

    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(screen.queryByText("Passwords do not match")).not.toBeInTheDocument();
  });

  it("clears a stale error once a valid attempt is made", async () => {
    renderPage();
    await submit({ current: "temp-pw", next: "short", confirm: "short" });
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();

    const fields = passwordFields();
    await userEvent.clear(fields.next);
    await userEvent.clear(fields.confirm);
    await userEvent.type(fields.next, "a-long-enough-password");
    await userEvent.type(fields.confirm, "a-long-enough-password");
    await userEvent.click(screen.getByRole("button", { name: "Set password" }));

    expect(screen.queryByText("Password must be at least 8 characters")).not.toBeInTheDocument();
  });
});

describe("submission", () => {
  it("sends the current and new password, then routes to the dashboard", async () => {
    renderPage();

    await submit({
      current: "temp-pw",
      next: "a-long-enough-password",
      confirm: "a-long-enough-password",
    });

    expect(mocks.completeReset).toHaveBeenCalledWith("temp-pw", "a-long-enough-password");
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("keeps the user on the screen and shows the server error when the change fails", async () => {
    mocks.completeReset.mockResolvedValue({ ok: false, error: "Current password is incorrect" });
    renderPage();

    await submit({
      current: "wrong-pw",
      next: "a-long-enough-password",
      confirm: "a-long-enough-password",
    });

    expect(screen.getByText("Current password is incorrect")).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("falls back to a generic message when the failure carries none", async () => {
    mocks.completeReset.mockResolvedValue({ ok: false });
    renderPage();

    await submit({
      current: "temp-pw",
      next: "a-long-enough-password",
      confirm: "a-long-enough-password",
    });

    expect(screen.getByText("Password change failed")).toBeInTheDocument();
  });

  it("masks all three password inputs", () => {
    renderPage();

    const fields = passwordFields();
    expect(fields.current).toHaveAttribute("type", "password");
    expect(fields.next).toHaveAttribute("type", "password");
    expect(fields.confirm).toHaveAttribute("type", "password");
  });

  it("marks every field required and enforces minLength natively as a second line", () => {
    renderPage();

    const fields = passwordFields();
    expect(fields.current).toBeRequired();
    expect(fields.next).toBeRequired();
    expect(fields.next).toHaveAttribute("minLength", "8");
    expect(fields.confirm).toHaveAttribute("minLength", "8");
  });
});
