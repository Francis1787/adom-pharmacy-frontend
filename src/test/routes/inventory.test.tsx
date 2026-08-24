// QA: drug inventory and the Admin-only pricing controls.
// Unit price and controlled-substance status are Admin-only fields, enforced in
// the UI by disabling the inputs. Low stock is a strict `stock < reorderThreshold`.
// Note this screen's stock figure is NOT filtered for expiry — see QA-02.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useDrugs: vi.fn(),
  useBatches: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/queries", () => ({
  useDrugs: mocks.useDrugs,
  useBatches: mocks.useBatches,
  useApiMutation: () => ({ mutate: mocks.mutate, isPending: false, variables: undefined }),
  qk: { drugs: ["drugs"] },
}));

import { Route } from "@/routes/_authenticated/inventory";
import type { Batch, Drug, Role } from "@/api";
import { makeBatch, makeDrug } from "@/test/factories";

const InventoryPage = Route.options.component as ComponentType;

function renderPage({
  role = "Admin",
  drugs = [],
  batches = [],
  isLoading = false,
}: { role?: Role; drugs?: Drug[]; batches?: Batch[]; isLoading?: boolean } = {}) {
  mocks.useAuth.mockReturnValue({
    user: { staffId: "staff-1", fullName: "Admin User", role, mustResetPassword: false },
  });
  mocks.useDrugs.mockReturnValue({ data: drugs, isLoading });
  mocks.useBatches.mockReturnValue({ data: batches });
  return render(<InventoryPage />);
}

/** Open "Add drug" and return the dialog. */
async function openAddDialog(role: Role) {
  renderPage({ role });
  await userEvent.click(screen.getByRole("button", { name: "Add drug" }));
  return screen.getByRole("dialog");
}

/**
 * Find the control under a field label.
 *
 * KNOWN DEFECT (QA-06): the dialog `Field` helper renders <Label> and the input
 * as unlinked siblings — no htmlFor, no id — so neither a screen reader nor
 * getByLabelText can associate them. Until that is fixed, tests have to walk the
 * DOM. Replace this helper with getByLabelText once the labels are wired up.
 */
function fieldControl(scope: HTMLElement, labelText: string | RegExp): HTMLElement {
  const label = within(scope).getByText(labelText);
  const control = label.parentElement?.querySelector("input, textarea");
  if (!control) throw new Error(`No input found under label ${labelText}`);
  return control as HTMLElement;
}

describe("who may add a drug", () => {
  it.each(["Technician", "Admin"] as const)("offers %s the Add drug action", (role) => {
    renderPage({ role });

    expect(screen.getByRole("button", { name: "Add drug" })).toBeInTheDocument();
  });

  it("does not offer a Pharmacist the Add drug action", () => {
    // Documents current behaviour — see QA-08, which questions whether this is
    // the intended split given pharmacists may log deliveries.
    renderPage({ role: "Pharmacist" });

    expect(screen.queryByRole("button", { name: "Add drug" })).not.toBeInTheDocument();
  });
});

describe("Admin-only pricing and scheduling fields", () => {
  it("lets an Admin set the unit price and controlled flag", async () => {
    const dialog = await openAddDialog("Admin");

    expect(fieldControl(dialog, /Unit price/)).toBeEnabled();
    expect(within(dialog).getByRole("switch")).toBeEnabled();
    expect(within(dialog).getByText("Unit price (GHS)")).toBeInTheDocument();
  });

  it("locks both fields for a Technician and labels them Admin only", async () => {
    const dialog = await openAddDialog("Technician");

    expect(fieldControl(dialog, /Unit price/)).toBeDisabled();
    expect(within(dialog).getByRole("switch")).toBeDisabled();
    expect(within(dialog).getByText("Unit price (GHS) · Admin only")).toBeInTheDocument();
    expect(within(dialog).getByText(/Controlled substance \(Admin only\)/)).toBeInTheDocument();
  });

  it("leaves the reorder threshold editable for a Technician", async () => {
    // Stock-keeping is the technician's job; only money and scheduling are locked.
    const dialog = await openAddDialog("Technician");

    expect(fieldControl(dialog, "Reorder threshold")).toBeEnabled();
  });

  it("blocks a Technician from flipping the controlled switch", async () => {
    const dialog = await openAddDialog("Technician");
    const toggle = within(dialog).getByRole("switch");

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("data-state", "unchecked");
  });
});

describe("add-drug validation", () => {
  it("requires both a name and a generic name before submitting", async () => {
    const dialog = await openAddDialog("Admin");
    const submit = within(dialog).getByRole("button", { name: "Add drug" });
    expect(submit).toBeDisabled();

    await userEvent.type(fieldControl(dialog, "Name"), "Amoxicillin");
    expect(submit).toBeDisabled();

    await userEvent.type(fieldControl(dialog, "Generic name"), "Amoxicillin trihydrate");
    expect(submit).toBeEnabled();
  });

  it("defaults a new drug to Tablet form and a reorder threshold of 20", async () => {
    const dialog = await openAddDialog("Admin");

    expect(within(dialog).getByText("Tablet")).toBeInTheDocument();
    expect(fieldControl(dialog, "Reorder threshold")).toHaveValue(20);
  });

  it("submits the assembled payload once both names are filled", async () => {
    const dialog = await openAddDialog("Admin");

    await userEvent.type(fieldControl(dialog, "Name"), "Amoxicillin");
    await userEvent.type(fieldControl(dialog, "Generic name"), "Amoxicillin trihydrate");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add drug" }));

    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Amoxicillin",
        genericName: "Amoxicillin trihydrate",
        dosageForm: "Tablet",
        isControlledSubstance: false,
        reorderThreshold: 20,
      }),
    );
  });
});

describe("stock column", () => {
  it("prefers the server figure over summing batches", () => {
    renderPage({
      drugs: [makeDrug({ id: "d1", quantityInStock: 12, reorderThreshold: 5 })],
      batches: [makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 999 })],
    });

    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("sums batches when the server omits a figure", () => {
    renderPage({
      drugs: [makeDrug({ id: "d1", reorderThreshold: 5 })],
      batches: [
        makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 30 }),
        makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 12 }),
      ],
    });

    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("flags stock strictly below the reorder threshold", () => {
    renderPage({ drugs: [makeDrug({ quantityInStock: 4, reorderThreshold: 5 })] });

    expect(screen.getByText("4 low")).toBeInTheDocument();
  });

  it("does not flag stock sitting exactly at the threshold", () => {
    renderPage({ drugs: [makeDrug({ quantityInStock: 5, reorderThreshold: 5 })] });

    expect(screen.queryByText(/low/)).not.toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  // KNOWN DEFECT (QA-02). The dashboard subtracts expired and unverified-controlled
  // batches from stock; this screen sums every batch. The two screens therefore
  // disagree. Remove `.fails` once both use one shared rule.
  it.fails("excludes expired batches from the stock figure, as the dashboard does", () => {
    renderPage({
      drugs: [makeDrug({ id: "d1", reorderThreshold: 5 })],
      batches: [
        makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 10, isExpired: false }),
        makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 90, isExpired: true }),
      ],
    });

    expect(screen.getByText("10")).toBeInTheDocument();
  });
});

describe("table presentation", () => {
  it("formats the unit price to two decimals", () => {
    renderPage({ drugs: [makeDrug({ unitPrice: 2.5 })] });

    expect(screen.getByText("2.50")).toBeInTheDocument();
  });

  it("badges a controlled substance", () => {
    renderPage({ drugs: [makeDrug({ isControlledSubstance: true })] });

    expect(screen.getByText("Controlled")).toBeInTheDocument();
  });

  it("leaves the flags cell clear for an ordinary drug", () => {
    renderPage({ drugs: [makeDrug({ isControlledSubstance: false })] });

    expect(screen.queryByText("Controlled")).not.toBeInTheDocument();
  });

  it("shows an explicit empty state", () => {
    renderPage();

    expect(screen.getByText("No drugs in inventory.")).toBeInTheDocument();
  });

  it("shows skeletons rather than the empty state while loading", () => {
    renderPage({ isLoading: true });

    expect(screen.queryByText("No drugs in inventory.")).not.toBeInTheDocument();
  });

  it("offers Edit on every row, for every role", () => {
    renderPage({ role: "Pharmacist", drugs: [makeDrug(), makeDrug()] });

    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
  });
});
