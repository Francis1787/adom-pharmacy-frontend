// QA: shared mutation + error-toast layer.
// Every write in the app funnels through useApiMutation, so cache invalidation
// and error messaging are tested once here rather than per screen. The rule that
// matters most: a 403 must read as a permissions problem, never as a raw server
// string the user cannot act on.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

import { ApiError } from "@/api";
import { qk, toastApiError, useApiMutation } from "@/lib/queries";

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  toastMock.error.mockClear();
  toastMock.success.mockClear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe("query keys", () => {
  it("gives every resource a distinct, stable key", () => {
    const keys = Object.values(qk).map((k) => JSON.stringify(k));

    expect(new Set(keys).size).toBe(keys.length);
    expect(qk.purchaseOrders).toEqual(["purchase-orders"]);
    expect(qk.auditLog).toEqual(["audit-log"]);
  });
});

describe("toastApiError", () => {
  it("translates 403 into a permissions message, hiding the server wording", () => {
    toastApiError(new ApiError("Access denied for role TECHNICIAN", 403));

    expect(toastMock.error).toHaveBeenCalledWith("You don't have permission to do that.");
  });

  it("surfaces a business-rule violation verbatim — the wording is the guidance", () => {
    toastApiError(new ApiError("Cannot dispense from an expired batch", 422));

    expect(toastMock.error).toHaveBeenCalledWith("Cannot dispense from an expired batch");
  });

  it("still shows a note for field errors, which forms render inline", () => {
    toastApiError(new ApiError("Validation failed", 400, { name: "required" }));

    expect(toastMock.error).toHaveBeenCalledWith("Validation failed");
  });

  it("falls back to a prompt when a field error carries no message", () => {
    toastApiError(new ApiError("", 400, { name: "required" }));

    expect(toastMock.error).toHaveBeenCalledWith("Please correct the highlighted fields.");
  });

  it("uses the caller's fallback for an ApiError with an empty message", () => {
    toastApiError(new ApiError("", 500), "Could not save the batch");

    expect(toastMock.error).toHaveBeenCalledWith("Could not save the batch");
  });

  it("reports a plain Error by its message", () => {
    toastApiError(new Error("Network down"));

    expect(toastMock.error).toHaveBeenCalledWith("Network down");
  });

  it("degrades gracefully for a thrown non-Error", () => {
    toastApiError("just a string");

    expect(toastMock.error).toHaveBeenCalledWith("Something went wrong");
  });

  it("shows exactly one toast per failure", () => {
    toastApiError(new ApiError("Forbidden", 403));

    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });
});

describe("useApiMutation", () => {
  it("invalidates every listed query key on success", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => useApiMutation(async () => "done", { invalidate: [qk.sales, qk.batches, qk.drugs] }),
      { wrapper },
    );

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["sales"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["batches"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["drugs"] });
  });

  it("shows the success toast and forwards data plus variables to onSuccess", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useApiMutation(async (v: string) => `saved:${v}`, {
          successMessage: "Sale completed",
          onSuccess,
        }),
      { wrapper },
    );

    result.current.mutate("rx-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toastMock.success).toHaveBeenCalledWith("Sale completed");
    expect(onSuccess).toHaveBeenCalledWith("saved:rx-1", "rx-1");
  });

  it("stays silent on success when no message is configured", async () => {
    const { result } = renderHook(() => useApiMutation(async () => "done"), { wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("toasts the API error by default when the mutation fails", async () => {
    const { result } = renderHook(
      () =>
        useApiMutation(async () => {
          throw new ApiError("Insufficient stock", 422);
        }),
      { wrapper },
    );

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastMock.error).toHaveBeenCalledWith("Insufficient stock");
  });

  it("hands the error to a custom onError instead of toasting it", async () => {
    // Forms use this to route 400 field errors to inline messages; a toast here
    // as well would double-report the same problem.
    const onError = vi.fn();
    const failure = new ApiError("Validation failed", 400, { name: "required" });
    const { result } = renderHook(
      () =>
        useApiMutation(
          async () => {
            throw failure;
          },
          { onError },
        ),
      { wrapper },
    );

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(onError).toHaveBeenCalledWith(failure);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("does not invalidate or announce success when the mutation fails", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () =>
        useApiMutation(
          async () => {
            throw new ApiError("Forbidden", 403);
          },
          { invalidate: [qk.sales], successMessage: "Sale completed" },
        ),
      { wrapper },
    );

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidate).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("reports pending state while the request is in flight", async () => {
    let release!: (v: string) => void;
    const { result } = renderHook(
      () => useApiMutation(() => new Promise<string>((res) => (release = res))),
      { wrapper },
    );

    result.current.mutate();
    await waitFor(() => expect(result.current.isPending).toBe(true));

    release("done");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
