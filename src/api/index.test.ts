// QA: HTTP transport layer.
// Every backend response is wrapped in { success, data, message, timestamp }, so
// unwrapping, error classification and 401 handling all live here. A regression in
// this file silently breaks every screen, which makes it the highest-value target.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  PAYMENT_LABEL,
  apiErrorMessage,
  authApi,
  batchesApi,
  customersApi,
  drugsApi,
  prescriptionsApi,
  purchaseOrdersApi,
  salesApi,
  setUnauthorizedHandler,
  staffApi,
  tokenStore,
} from "@/api";
import { envelope, makeCustomer, makeDrug } from "@/test/factories";

const BASE = "http://localhost:8080/api/v1";

/** Sentinel telling the stub to reject inside .json(), like a non-JSON body would. */
const NON_JSON = Symbol("non-json");

function httpResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (body === NON_JSON) throw new SyntaxError("Unexpected token < in JSON");
      return body;
    },
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Queue one response for the next fetch call. */
const respondWith = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(httpResponse(status, body));

/** The (url, init) pair the code under test passed to fetch. */
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // The unauthorized handler is a module-level singleton that survives between
  // tests; neutralise it so an earlier spy cannot fire in a later test.
  setUnauthorizedHandler(() => {});
});

describe("tokenStore", () => {
  it("round-trips the token through localStorage under a stable key", () => {
    expect(tokenStore.get()).toBeNull();

    tokenStore.set("jwt-abc");
    expect(localStorage.getItem("adom_token")).toBe("jwt-abc");
    expect(tokenStore.get()).toBe("jwt-abc");

    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
  });
});

describe("request — success path", () => {
  it("unwraps envelope.data rather than returning the envelope", async () => {
    const drug = makeDrug({ name: "Amoxicillin" });
    respondWith(200, envelope([drug]));

    await expect(drugsApi.list()).resolves.toEqual([drug]);
  });

  it("targets the configured base URL and defaults to GET with no body", async () => {
    respondWith(200, envelope([]));

    await customersApi.list();

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE}/customers`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("serialises the body and sets the JSON content type on writes", async () => {
    const payload = { fullName: "Kofi", phoneNumber: "0201111111", address: "Accra" };
    respondWith(201, envelope(makeCustomer(payload)));

    await customersApi.create(payload);

    const { url, init, headers } = lastCall();
    expect(url).toBe(`${BASE}/customers`);
    expect(init.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("sends PATCH with no body for action endpoints that take none", async () => {
    respondWith(200, envelope(null));

    await batchesApi.verify("batch-9");

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE}/batches/batch-9/verify`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBeUndefined();
  });
});

describe("request — authorization header", () => {
  it("attaches the bearer token when one is stored", async () => {
    tokenStore.set("jwt-abc");
    respondWith(200, envelope([]));

    await salesApi.list();

    expect(lastCall().headers.Authorization).toBe("Bearer jwt-abc");
  });

  it("omits the header entirely when no token is stored", async () => {
    respondWith(200, envelope([]));

    await salesApi.list();

    expect(lastCall().headers).not.toHaveProperty("Authorization");
  });

  it("never sends a token on login, even if a stale one is present", async () => {
    tokenStore.set("stale-token");
    respondWith(
      200,
      envelope({
        token: "new",
        staffId: "s1",
        fullName: "Ama",
        role: "Pharmacist",
        mustResetPassword: false,
      }),
    );

    await authApi.login("ama@adom.test", "pw");

    expect(lastCall().headers).not.toHaveProperty("Authorization");
  });
});

describe("request — error classification", () => {
  it("surfaces the server message for a failed envelope", async () => {
    respondWith(422, envelope(null, { success: false, message: "Batch has expired" }));

    await expect(batchesApi.verify("b1")).rejects.toMatchObject({
      message: "Batch has expired",
      status: 422,
    });
  });

  it("maps a 400 object payload to per-field errors", async () => {
    respondWith(
      400,
      envelope(
        { name: "must not be blank", unitPrice: "must be positive" },
        { success: false, message: "Validation failed" },
      ),
    );

    const err = (await drugsApi.create({} as never).catch((e) => e)) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.isFieldError).toBe(true);
    expect(err.fieldErrors).toEqual({
      name: "must not be blank",
      unitPrice: "must be positive",
    });
  });

  it("does not treat a 400 array payload as field errors", async () => {
    respondWith(400, envelope(["bad request"], { success: false, message: "Bad request" }));

    const err = (await drugsApi.create({} as never).catch((e) => e)) as ApiError;

    expect(err.fieldErrors).toBeUndefined();
    expect(err.isFieldError).toBe(false);
  });

  it("only reports field errors for status 400, not for other 4xx", async () => {
    respondWith(
      409,
      envelope({ batchNumber: "already exists" }, { success: false, message: "Duplicate batch" }),
    );

    const err = (await batchesApi.create({} as never).catch((e) => e)) as ApiError;

    expect(err.isConflict).toBe(true);
    expect(err.isFieldError).toBe(false);
    expect(err.fieldErrors).toBeUndefined();
  });

  it("falls back to a status-based message when the body is not JSON", async () => {
    respondWith(500, NON_JSON);

    await expect(salesApi.list()).rejects.toMatchObject({
      message: "Request failed (500)",
      status: 500,
    });
  });

  it("reports an unreachable server as status 0 with an actionable message", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const err = (await salesApi.list().catch((e) => e)) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/cannot reach the server/i);
  });

  it.each([
    [401, "isUnauthorized"],
    [403, "isForbidden"],
    [404, "isNotFound"],
    [409, "isConflict"],
    [422, "isBusinessRule"],
  ] as const)("exposes %i as %s", (status, flag) => {
    expect(new ApiError("boom", status)[flag]).toBe(true);
  });
});

describe("request — 401 session expiry", () => {
  it("clears the stored token and notifies the app once", async () => {
    tokenStore.set("expired-jwt");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    respondWith(401, envelope(null, { success: false, message: "Token expired" }));

    await expect(prescriptionsApi.list()).rejects.toBeInstanceOf(ApiError);

    expect(tokenStore.get()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not fire the handler for other error statuses", async () => {
    tokenStore.set("good-jwt");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    respondWith(403, envelope(null, { success: false, message: "Forbidden" }));

    await expect(prescriptionsApi.list()).rejects.toBeInstanceOf(ApiError);

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(tokenStore.get()).toBe("good-jwt");
  });
});

describe("endpoint contracts", () => {
  it.each([
    [
      "prescriptions.approve",
      () => prescriptionsApi.approve("rx-1"),
      "PATCH",
      `${BASE}/prescriptions/rx-1/approve`,
    ],
    [
      "prescriptions.reject",
      () => prescriptionsApi.reject("rx-1", "no stock"),
      "PATCH",
      `${BASE}/prescriptions/rx-1/reject`,
    ],
    [
      "purchaseOrders.overdue",
      () => purchaseOrdersApi.overdue(),
      "GET",
      `${BASE}/purchase-orders/overdue`,
    ],
    [
      "purchaseOrders.markDelivered",
      () => purchaseOrdersApi.markDelivered("po-1"),
      "PATCH",
      `${BASE}/purchase-orders/po-1/mark-delivered`,
    ],
    [
      "drugs.updatePrice",
      () => drugsApi.updatePrice("d-1", 9.5),
      "PATCH",
      `${BASE}/drugs/d-1/price`,
    ],
    [
      "drugs.updateControlled",
      () => drugsApi.updateControlled("d-1", true),
      "PATCH",
      `${BASE}/drugs/d-1/controlled-status`,
    ],
    [
      "staff.update",
      () => staffApi.update("s-1", { fullName: "New" }),
      "PATCH",
      `${BASE}/staff/s-1`,
    ],
  ])("%s hits %s %s", async (_name, call, method, url) => {
    respondWith(200, envelope(null));

    await call();

    expect(lastCall().url).toBe(url);
    expect(lastCall().init.method).toBe(method);
  });

  it("sends the rejection reason in the body", async () => {
    respondWith(200, envelope(null));

    await prescriptionsApi.reject("rx-1", "Controlled substance, no verified batch");

    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      reason: "Controlled substance, no verified batch",
    });
  });
});

describe("staffApi.generatePassword", () => {
  it("produces a value that satisfies the reset-password complexity floor", () => {
    for (let i = 0; i < 50; i++) {
      const pw = staffApi.generatePassword();
      // reset-password.tsx rejects anything under 8 characters, so a generated
      // temp password must clear that bar or forced first-login reset is unusable.
      expect(pw.length).toBeGreaterThanOrEqual(8);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it("does not repeat within a small sample", () => {
    const seen = new Set(Array.from({ length: 200 }, () => staffApi.generatePassword()));
    expect(seen.size).toBe(200);
  });

  // KNOWN DEFECT (QA-07). `Math.random().toString(36).slice(-10)` is only ~13 chars
  // for a typical double, but a value with a short exact base-36 form yields far
  // fewer, dropping the password below the 8-char floor that reset-password.tsx
  // enforces — the new hire then cannot complete their forced reset.
  // `it.fails` keeps this red-flagged without breaking the suite; delete the
  // `.fails` once generatePassword is switched to crypto.getRandomValues.
  it.fails("stays above the 8-character floor even for a short random draw", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // -> "0.5" -> "0.5!A1"

    expect(staffApi.generatePassword().length).toBeGreaterThanOrEqual(8);
  });
});

describe("UI helpers", () => {
  it("labels every payment method, spacing out MobileMoney for display", () => {
    expect(PAYMENT_LABEL).toEqual({ Cash: "Cash", MobileMoney: "Mobile Money", Card: "Card" });
  });

  it.each([
    [new ApiError("Insufficient stock", 422), "Insufficient stock"],
    [new Error("boom"), "boom"],
    ["a bare string", "Something went wrong."],
    [null, "Something went wrong."],
    [undefined, "Something went wrong."],
    [{ message: "not an Error" }, "Something went wrong."],
  ])("apiErrorMessage(%o) -> %s", (input, expected) => {
    expect(apiErrorMessage(input)).toBe(expected);
  });
});
