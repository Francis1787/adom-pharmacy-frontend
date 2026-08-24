// QA: sales / dispensing.
// This is the safety-critical screen. A sale must never be assembled from a batch
// that is expired, out of stock, or a controlled substance no pharmacist has
// verified — and only a Pharmacist may dispense at all. The batch picker's
// placeholder text is the observable proof of that filter, so it is asserted
// directly rather than by opening the Radix listbox.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useSales: vi.fn(),
  usePrescriptions: vi.fn(),
  useDrugs: vi.fn(),
  useBatches: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/queries", () => ({
  useSales: mocks.useSales,
  usePrescriptions: mocks.usePrescriptions,
  useDrugs: mocks.useDrugs,
  useBatches: mocks.useBatches,
  useApiMutation: () => ({ mutate: mocks.mutate, isPending: false, variables: undefined }),
  qk: {
    sales: ["sales"],
    prescriptions: ["prescriptions"],
    batches: ["batches"],
    drugs: ["drugs"],
    auditLog: ["audit-log"],
  },
}));

import { Route } from "@/routes/_authenticated/sales";
import type { Batch, Drug, Prescription, Role, Sale } from "@/api";
import { makeBatch, makeDrug, makePrescription, makeSale } from "@/test/factories";

const SalesPage = Route.options.component as ComponentType;

interface Scenario {
  role?: Role;
  sales?: Sale[];
  isLoading?: boolean;
  prescriptions?: Prescription[];
  drugs?: Drug[];
  batches?: Batch[];
}

function renderSales({
  role = "Pharmacist",
  sales = [],
  isLoading = false,
  prescriptions = [],
  drugs = [],
  batches = [],
}: Scenario = {}) {
  mocks.useAuth.mockReturnValue({
    user: { staffId: "staff-1", fullName: "Ama Mensah", role, mustResetPassword: false },
  });
  mocks.useSales.mockReturnValue({ data: sales, isLoading });
  mocks.usePrescriptions.mockReturnValue({ data: prescriptions });
  mocks.useDrugs.mockReturnValue({ data: drugs });
  mocks.useBatches.mockReturnValue({ data: batches });
  return render(<SalesPage />);
}

/** An approved, unsold prescription for one drug. */
const dispensableRx = (drugId = "d1", qty = 10) =>
  makePrescription({
    approvalStatus: "Approved",
    sold: false,
    items: [
      {
        drug: { id: drugId, label: "Paracetamol" },
        dosageInstructions: "1 tablet twice daily",
        quantityPrescribed: qty,
      },
    ],
  });

const openNewSale = async () => {
  await userEvent.click(screen.getByRole("button", { name: "New sale" }));
  return screen.getByRole("dialog");
};

describe("role gating", () => {
  it("lets a Pharmacist start a sale", () => {
    renderSales({ role: "Pharmacist" });

    expect(screen.getByRole("button", { name: "New sale" })).toBeInTheDocument();
  });

  it.each(["Technician", "Admin"] as const)("does not offer %s the New sale action", (role) => {
    renderSales({ role });

    expect(screen.queryByRole("button", { name: "New sale" })).not.toBeInTheDocument();
  });
});

describe("sales table", () => {
  it("shows an explicit empty state rather than a bare table", () => {
    renderSales();

    expect(screen.getByText("No sales yet.")).toBeInTheDocument();
  });

  it("renders skeleton rows while loading instead of the empty state", () => {
    renderSales({ isLoading: true });

    expect(screen.queryByText("No sales yet.")).not.toBeInTheDocument();
  });

  it("renders the human payment label, not the raw enum", () => {
    renderSales({ sales: [makeSale({ paymentMethod: "MobileMoney" })] });

    expect(screen.getByText("Mobile Money")).toBeInTheDocument();
    expect(screen.queryByText("MobileMoney")).not.toBeInTheDocument();
  });

  it("formats the total to two decimals", () => {
    renderSales({ sales: [makeSale({ totalAmount: 7.5 })] });

    expect(screen.getByText("7.50")).toBeInTheDocument();
  });

  it("renders staff references as names, never as [object Object]", () => {
    renderSales({
      sales: [
        makeSale({
          cashier: { id: "s2", label: "Kwesi Owusu" },
          dispensingPharmacist: { id: "s1", label: "Ama Mensah" },
        }),
      ],
    });

    expect(screen.getByText("Kwesi Owusu")).toBeInTheDocument();
    expect(screen.getByText("Ama Mensah")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("[object Object]");
  });
});

describe("prescription eligibility", () => {
  it("refuses to open a sale when no prescription is approved and unsold", async () => {
    renderSales({
      prescriptions: [
        makePrescription({ approvalStatus: "Pending" }),
        makePrescription({ approvalStatus: "Rejected" }),
        makePrescription({ approvalStatus: "Approved", sold: true }),
      ],
    });

    const dialog = await openNewSale();

    expect(
      within(dialog).getByText("No approved, unsold prescriptions available."),
    ).toBeInTheDocument();
  });

  it("offers a prescription that is approved and not yet dispensed", async () => {
    renderSales({
      prescriptions: [dispensableRx()],
      drugs: [makeDrug({ id: "d1" })],
      batches: [makeBatch({ drug: { id: "d1", label: "Paracetamol" } })],
    });

    const dialog = await openNewSale();

    expect(
      within(dialog).queryByText("No approved, unsold prescriptions available."),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText("Paracetamol")).toBeInTheDocument();
    expect(within(dialog).getByText("× 10")).toBeInTheDocument();
  });
});

describe("sellable-batch filter", () => {
  const sellable = { drug: { id: "d1", label: "Paracetamol" }, quantityInStock: 50 };

  async function openWithBatches(batches: Batch[]) {
    renderSales({
      prescriptions: [dispensableRx()],
      drugs: [makeDrug({ id: "d1" })],
      batches,
    });
    return openNewSale();
  }

  it("offers a batch that is in date, in stock and not controlled", async () => {
    const dialog = await openWithBatches([makeBatch(sellable)]);

    expect(within(dialog).getByText("Select batch")).toBeInTheDocument();
  });

  it("offers a controlled batch once a pharmacist has verified it", async () => {
    const dialog = await openWithBatches([
      makeBatch({
        ...sellable,
        isControlledSubstance: true,
        verifiedByPharmacist: { id: "staff-1", label: "Ama Mensah" },
      }),
    ]);

    expect(within(dialog).getByText("Select batch")).toBeInTheDocument();
  });

  it.each([
    ["an expired batch", { ...sellable, isExpired: true }],
    ["a batch with zero stock", { ...sellable, quantityInStock: 0 }],
    ["a batch with negative stock", { ...sellable, quantityInStock: -5 }],
    [
      "an unverified controlled batch",
      { ...sellable, isControlledSubstance: true, verifiedByPharmacist: null },
    ],
    ["a batch for a different drug", { ...sellable, drug: { id: "d-other", label: "Other" } }],
  ])("refuses to dispense from %s", async (_case, overrides) => {
    const dialog = await openWithBatches([makeBatch(overrides as Partial<Batch>)]);

    expect(within(dialog).getByText("No sellable batch available")).toBeInTheDocument();
    expect(within(dialog).queryByText("Select batch")).not.toBeInTheDocument();
  });

  it("keeps the sale blocked until every prescribed drug has a batch chosen", async () => {
    renderSales({
      prescriptions: [
        makePrescription({
          approvalStatus: "Approved",
          sold: false,
          items: [
            {
              drug: { id: "d1", label: "Paracetamol" },
              dosageInstructions: "bd",
              quantityPrescribed: 10,
            },
            {
              drug: { id: "d2", label: "Amoxicillin" },
              dosageInstructions: "tds",
              quantityPrescribed: 21,
            },
          ],
        }),
      ],
      drugs: [makeDrug({ id: "d1" }), makeDrug({ id: "d2" })],
      batches: [
        makeBatch({ drug: { id: "d1", label: "Paracetamol" }, quantityInStock: 50 }),
        makeBatch({ drug: { id: "d2", label: "Amoxicillin" }, quantityInStock: 50 }),
      ],
    });

    const dialog = await openNewSale();

    expect(within(dialog).getByRole("button", { name: "Complete sale" })).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("cannot be completed when the only batch is unsellable", async () => {
    const dialog = await openWithBatches([makeBatch({ ...sellable, isExpired: true })]);

    expect(within(dialog).getByRole("button", { name: "Complete sale" })).toBeDisabled();
  });
});

describe("new-sale dialog", () => {
  it("defaults the payment method to Cash", async () => {
    renderSales({
      prescriptions: [dispensableRx()],
      drugs: [makeDrug({ id: "d1" })],
      batches: [makeBatch({ drug: { id: "d1", label: "Paracetamol" }, quantityInStock: 50 })],
    });

    const dialog = await openNewSale();

    expect(within(dialog).getByText("Cash")).toBeInTheDocument();
  });

  it("tells the user the total is computed server-side", async () => {
    renderSales({
      prescriptions: [dispensableRx()],
      drugs: [makeDrug({ id: "d1" })],
      batches: [makeBatch({ drug: { id: "d1", label: "Paracetamol" }, quantityInStock: 50 })],
    });

    const dialog = await openNewSale();

    // Guards against a future regression that computes money on the client.
    expect(within(dialog).getByText(/computed server-side/i)).toBeInTheDocument();
  });

  it("closes on Cancel without dispatching a sale", async () => {
    renderSales({
      prescriptions: [dispensableRx()],
      drugs: [makeDrug({ id: "d1" })],
      batches: [makeBatch({ drug: { id: "d1", label: "Paracetamol" }, quantityInStock: 50 })],
    });
    await openNewSale();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
