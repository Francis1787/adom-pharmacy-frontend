// QA: batch receiving and controlled-substance verification.
// Verification is a regulatory control: only a Pharmacist signs off a controlled
// batch, and an expired batch must never be signable. The status badge is the
// visible record of that state, so each state gets pinned.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useBatches: vi.fn(),
  useDrugs: vi.fn(),
  usePurchaseOrders: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/queries", () => ({
  useBatches: mocks.useBatches,
  useDrugs: mocks.useDrugs,
  usePurchaseOrders: mocks.usePurchaseOrders,
  useApiMutation: () => ({ mutate: mocks.mutate, isPending: false, variables: undefined }),
  qk: { batches: ["batches"], drugs: ["drugs"], auditLog: ["audit-log"] },
}));

import { Route } from "@/routes/_authenticated/batches";
import type { Batch, Drug, Role } from "@/api";
import { makeBatch, makeDrug } from "@/test/factories";

const BatchesPage = Route.options.component as ComponentType;

function renderPage({
  role = "Pharmacist",
  batches = [],
  drugs = [],
  isLoading = false,
}: { role?: Role; batches?: Batch[]; drugs?: Drug[]; isLoading?: boolean } = {}) {
  mocks.useAuth.mockReturnValue({
    user: { staffId: "staff-1", fullName: "Ama Mensah", role, mustResetPassword: false },
  });
  mocks.useBatches.mockReturnValue({ data: batches, isLoading });
  mocks.useDrugs.mockReturnValue({ data: drugs });
  mocks.usePurchaseOrders.mockReturnValue({ data: [] });
  return render(<BatchesPage />);
}

const controlledUnverified = (o: Partial<Batch> = {}) =>
  makeBatch({ isControlledSubstance: true, verifiedByPharmacist: null, ...o });

describe("who may log a delivery", () => {
  it.each(["Technician", "Pharmacist"] as const)(
    "offers %s the Log new delivery action",
    (role) => {
      renderPage({ role });

      expect(screen.getByRole("button", { name: "Log new delivery" })).toBeInTheDocument();
    },
  );

  it("does not offer an Admin the Log new delivery action", () => {
    renderPage({ role: "Admin" });

    expect(screen.queryByRole("button", { name: "Log new delivery" })).not.toBeInTheDocument();
  });
});

describe("who may verify a controlled batch", () => {
  it("offers a Pharmacist the Verify action", () => {
    renderPage({ role: "Pharmacist", batches: [controlledUnverified()] });

    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
  });

  it.each(["Technician", "Admin"] as const)("withholds Verify from a %s", (role) => {
    renderPage({ role, batches: [controlledUnverified()] });

    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("does not offer Verify on an expired batch", () => {
    // An expired batch is unsellable; signing it off would create a misleading
    // regulatory record.
    renderPage({ role: "Pharmacist", batches: [controlledUnverified({ isExpired: true })] });

    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("does not offer Verify on an already-verified batch", () => {
    renderPage({
      role: "Pharmacist",
      batches: [
        makeBatch({
          isControlledSubstance: true,
          verifiedByPharmacist: { id: "staff-1", label: "Ama Mensah" },
        }),
      ],
    });

    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("does not offer Verify on a non-controlled batch, which needs none", () => {
    renderPage({
      role: "Pharmacist",
      batches: [makeBatch({ isControlledSubstance: false, verifiedByPharmacist: null })],
    });

    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("verifies the batch that was clicked", async () => {
    const target = controlledUnverified();
    renderPage({ role: "Pharmacist", batches: [target] });

    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(mocks.mutate).toHaveBeenCalledWith(target.id);
  });
});

describe("status badge", () => {
  it("shows Expired, which outranks every other state", () => {
    renderPage({ batches: [controlledUnverified({ isExpired: true })] });

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Pending Verification")).not.toBeInTheDocument();
  });

  it("shows Pending Verification for an unverified controlled batch", () => {
    renderPage({ batches: [controlledUnverified()] });

    expect(screen.getByText("Pending Verification")).toBeInTheDocument();
  });

  it("shows Verified once a pharmacist has signed off", () => {
    renderPage({
      batches: [
        makeBatch({
          isControlledSubstance: true,
          verifiedByPharmacist: { id: "staff-1", label: "Ama Mensah" },
        }),
      ],
    });

    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("shows Active for an ordinary in-date batch", () => {
    renderPage({ batches: [makeBatch()] });

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("annotates the expiry date itself when the batch has expired", () => {
    renderPage({ batches: [makeBatch({ expiryDate: "2024-01-01", isExpired: true })] });

    expect(screen.getByText(/2024-01-01 \(expired\)/)).toBeInTheDocument();
  });
});

describe("supplier rendering", () => {
  it.each([
    ["a bare string", "Ernest Chemists"],
    ["a summary object", { id: "sup-1", label: "Ernest Chemists" }],
  ])("renders a supplier given as %s", (_case, supplier) => {
    renderPage({ batches: [makeBatch({ supplier: supplier as Batch["supplier"] })] });

    expect(screen.getByText("Ernest Chemists")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("[object Object]");
  });
});

describe("log-delivery form validation", () => {
  async function openForm(drugs: Drug[] = [makeDrug({ id: "d1", name: "Paracetamol" })]) {
    renderPage({ role: "Technician", drugs });
    await userEvent.click(screen.getByRole("button", { name: "Log new delivery" }));
    return screen.getByRole("dialog");
  }

  it("blocks submission until batch number, expiry and a positive quantity are given", async () => {
    const dialog = await openForm();

    expect(within(dialog).getByRole("button", { name: "Log delivery" })).toBeDisabled();
  });

  it("still blocks submission with a batch number but no expiry date", async () => {
    const dialog = await openForm();

    const [batchNumber] = within(dialog).getAllByRole("textbox");
    await userEvent.type(batchNumber, "BN-2026-001");

    expect(within(dialog).getByRole("button", { name: "Log delivery" })).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("closes on Cancel without logging anything", async () => {
    const dialog = await openForm();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

describe("table states", () => {
  it("shows an explicit empty state", () => {
    renderPage();

    expect(screen.getByText("No batches recorded yet.")).toBeInTheDocument();
  });

  it("shows skeletons rather than the empty state while loading", () => {
    renderPage({ isLoading: true });

    expect(screen.queryByText("No batches recorded yet.")).not.toBeInTheDocument();
  });
});
