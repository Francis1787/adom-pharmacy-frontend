// QA: session lifecycle and role gating.
// This provider decides who is logged in and what they may do, so it is the
// security boundary the whole UI leans on. Session state is split across two
// localStorage keys (adom_token, adom_user) plus React state — the interesting
// failures are the cases where those three disagree.
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// The API module keeps its unauthorized handler private. Capture the callback the
// provider registers so we can fire it the way a real 401 would.
const captured = vi.hoisted(() => ({ onUnauthorized: () => {} }));

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    setUnauthorizedHandler: (h: () => void) => {
      captured.onUnauthorized = h;
      actual.setUnauthorizedHandler(h);
    },
  };
});

import { AuthProvider, useAuth } from "@/lib/auth";
import { ApiError, authApi, tokenStore } from "@/api";

const TOKEN_KEY = "adom_token";
const USER_KEY = "adom_user";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const loginResponse = (o: Record<string, unknown> = {}) =>
  ({
    token: "jwt-abc",
    staffId: "staff-1",
    fullName: "Ama Mensah",
    role: "Pharmacist",
    mustResetPassword: false,
    ...o,
  }) as Awaited<ReturnType<typeof authApi.login>>;

/** Render the hook and wait past the initial localStorage-restore effect. */
async function renderAuth() {
  const view = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  return view;
}

/** Seed a fully-consistent stored session. */
function seedSession(user: Record<string, unknown> = {}) {
  localStorage.setItem(TOKEN_KEY, "stored-jwt");
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      staffId: "staff-1",
      fullName: "Ama Mensah",
      role: "Pharmacist",
      mustResetPassword: false,
      ...user,
    }),
  );
}

beforeEach(() => {
  captured.onUnauthorized = () => {};
});

describe("useAuth outside a provider", () => {
  it("throws rather than silently reporting a logged-out user", () => {
    // Rendering a protected screen outside AuthProvider must fail loudly —
    // a null session there would read as "not logged in" and hide the bug.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/must be used within AuthProvider/i);
    quiet.mockRestore();
  });
});

describe("session restore on mount", () => {
  it("becomes ready even with nothing stored", async () => {
    const { result } = await renderAuth();

    expect(result.current.ready).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it("restores both user and token when the pair is intact", async () => {
    seedSession();

    const { result } = await renderAuth();

    expect(result.current.token).toBe("stored-jwt");
    expect(result.current.user).toEqual({
      staffId: "staff-1",
      fullName: "Ama Mensah",
      role: "Pharmacist",
      mustResetPassword: false,
    });
  });

  it("stays logged out — and still becomes ready — when the stored user is corrupt", async () => {
    localStorage.setItem(TOKEN_KEY, "stored-jwt");
    localStorage.setItem(USER_KEY, "{not valid json");

    const { result } = await renderAuth();

    expect(result.current.user).toBeNull();
    expect(result.current.ready).toBe(true);
  });

  it("stays logged out when only the token is present", async () => {
    localStorage.setItem(TOKEN_KEY, "stored-jwt");

    const { result } = await renderAuth();

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it("stays logged out when only the user record is present", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify({ staffId: "s1", role: "Admin" }));

    const { result } = await renderAuth();

    expect(result.current.user).toBeNull();
  });
});

describe("login", () => {
  it("persists token and user, and reports no reset required", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(loginResponse());
    const { result } = await renderAuth();

    let outcome!: Awaited<ReturnType<typeof result.current.login>>;
    await act(async () => {
      outcome = await result.current.login("ama@adom.test", "pw");
    });

    expect(outcome).toEqual({ ok: true, mustReset: false });
    expect(tokenStore.get()).toBe("jwt-abc");
    expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toEqual({
      staffId: "staff-1",
      fullName: "Ama Mensah",
      role: "Pharmacist",
      mustResetPassword: false,
    });
    expect(result.current.user?.role).toBe("Pharmacist");
  });

  it("passes mustReset through so the caller can route to /reset-password", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(loginResponse({ mustResetPassword: true }));
    const { result } = await renderAuth();

    let outcome!: Awaited<ReturnType<typeof result.current.login>>;
    await act(async () => {
      outcome = await result.current.login("new@adom.test", "temp");
    });

    expect(outcome.mustReset).toBe(true);
    expect(result.current.user?.mustResetPassword).toBe(true);
  });

  it("stores only the two session keys it owns, and never the password", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(loginResponse());
    const { result } = await renderAuth();

    await act(async () => {
      await result.current.login("ama@adom.test", "sup3r-s3cret");
    });

    expect(Object.keys(localStorage).sort()).toEqual([TOKEN_KEY, USER_KEY].sort());
    expect(JSON.stringify(localStorage)).not.toContain("sup3r-s3cret");
  });

  it("surfaces the server message on bad credentials and writes nothing", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new ApiError("Invalid email or password", 401));
    const { result } = await renderAuth();

    let outcome!: Awaited<ReturnType<typeof result.current.login>>;
    await act(async () => {
      outcome = await result.current.login("ama@adom.test", "wrong");
    });

    expect(outcome).toEqual({ ok: false, error: "Invalid email or password" });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });

  it("falls back to a generic message for a non-ApiError failure", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new TypeError("boom"));
    const { result } = await renderAuth();

    let outcome!: Awaited<ReturnType<typeof result.current.login>>;
    await act(async () => {
      outcome = await result.current.login("ama@adom.test", "pw");
    });

    expect(outcome).toEqual({ ok: false, error: "Login failed" });
  });
});

describe("logout", () => {
  it("clears both storage keys and both pieces of state", async () => {
    seedSession();
    const { result } = await renderAuth();
    expect(result.current.user).not.toBeNull();

    act(() => result.current.logout());

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });
});

describe("completeReset", () => {
  it("clears mustResetPassword in state and in storage", async () => {
    seedSession({ mustResetPassword: true });
    vi.spyOn(authApi, "changePassword").mockResolvedValue(null);
    const { result } = await renderAuth();

    let outcome!: Awaited<ReturnType<typeof result.current.completeReset>>;
    await act(async () => {
      outcome = await result.current.completeReset("temp-pw", "a-strong-new-password");
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.user?.mustResetPassword).toBe(false);
    expect(JSON.parse(localStorage.getItem(USER_KEY)!).mustResetPassword).toBe(false);
  });

  it("forwards the current and new password to the API in that order", async () => {
    seedSession({ mustResetPassword: true });
    const spy = vi.spyOn(authApi, "changePassword").mockResolvedValue(null);
    const { result } = await renderAuth();

    await act(async () => {
      await result.current.completeReset("old-pw", "new-pw");
    });

    expect(spy).toHaveBeenCalledWith("old-pw", "new-pw");
  });

  it("leaves the user still flagged for reset when the change fails", async () => {
    seedSession({ mustResetPassword: true });
    vi.spyOn(authApi, "changePassword").mockRejectedValue(
      new ApiError("Current password is incorrect", 400),
    );
    const { result } = await renderAuth();

    let outcome!: Awaited<ReturnType<typeof result.current.completeReset>>;
    await act(async () => {
      outcome = await result.current.completeReset("wrong", "new-pw");
    });

    expect(outcome).toEqual({ ok: false, error: "Current password is incorrect" });
    // Critical: a failed reset must not let the user escape the reset screen.
    expect(result.current.user?.mustResetPassword).toBe(true);
    expect(JSON.parse(localStorage.getItem(USER_KEY)!).mustResetPassword).toBe(true);
  });
});

describe("can() role gating", () => {
  it.each([
    ["Pharmacist", ["Pharmacist"], true],
    ["Pharmacist", ["Admin"], false],
    ["Pharmacist", ["Pharmacist", "Admin"], true],
    ["Technician", ["Pharmacist"], false],
    ["Technician", ["Technician", "Pharmacist"], true],
    ["Admin", ["Admin"], true],
    ["Admin", [], false],
  ] as const)("role %s against %j -> %s", async (role, allowed, expected) => {
    seedSession({ role });
    const { result } = await renderAuth();

    expect(result.current.can([...allowed])).toBe(expected);
  });

  it("denies every role when nobody is logged in", async () => {
    const { result } = await renderAuth();

    expect(result.current.can(["Pharmacist", "Technician", "Admin"])).toBe(false);
  });
});

describe("expired-token handling", () => {
  it("drops the in-memory session when the API layer reports a 401", async () => {
    seedSession();
    const { result } = await renderAuth();
    expect(result.current.user).not.toBeNull();

    // request() clears the token, then invokes the registered handler.
    await act(async () => {
      tokenStore.clear();
      captured.onUnauthorized();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("AuthProvider integration with a consumer", () => {
  it("renders the signed-in staff name once the session is restored", async () => {
    seedSession();

    function Who() {
      const { ready, user } = useAuth();
      if (!ready) return <p>loading</p>;
      return <p>{user ? `${user.fullName} (${user.role})` : "signed out"}</p>;
    }

    render(
      <AuthProvider>
        <Who />
      </AuthProvider>,
    );

    expect(await screen.findByText("Ama Mensah (Pharmacist)")).toBeInTheDocument();
  });
});
