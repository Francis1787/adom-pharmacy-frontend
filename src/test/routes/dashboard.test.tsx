// QA: dashboard operational snapshot.
// The four stat tiles and the two alert panels are what staff act on first thing
// each morning, and every number is computed client-side. The rules under test:
//   - stock prefers the server's quantityInStock, else sums *sellable* batches
//   - a batch is not sellable if expired, or controlled-but-unverified
//   - low stock is a strict `stock < reorderThreshold`
//   - today's takings only count sales dated today
//   - the verification panel is Pharmacist-only
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useDrugs: vi.fn(),
  useBatches: vi.fn(),
  usePrescriptions: vi.fn(),
  useSales: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/queries", () => ({
  useDrugs: mocks.useDrugs,
  useBatches: mocks.useBatches,
  usePrescriptions: mocks.usePrescriptions,
  useSales: mocks.useSales,
}));

import { Route } from "@/routes/_authenticated/index";
import type { Batch, Drug, Prescription, Role, Sale } from "@/api";
import { makeBatch, makeDrug, makePrescription, makeSale } from "@/test/factories";

const Dashboard = Route.options.component as ComponentType;

const TODAY = "2026-08-24";

interface Scenario {
  role?: Role;
  fullName?: string;
  drugs?: Drug[];
  batches?: Batch[];
  prescriptions?: Prescription[];
  sales?: Sale[];
}

function renderDashboard({
  role = "Pharmacist",
  fullName = "Ama Mensah",
  drugs = [],
  batches = [],
  prescriptions = [],
  sales = [],
}: Scenario = {}) {
  mocks.useAuth.mockReturnValue({
    user: { staffId: "staff-1", fullName, role, mustResetPassword: false },
  });
  mocks.useDrugs.mockReturnValue({ data: drugs });
  mocks.useBatches.mockReturnValue({ data: batches });
  mocks.usePrescriptions.mockReturnValue({ data: prescriptions });
  mocks.useSales.mockReturnValue({ data: sales });
  return render(<Dashboard />);
}

/** Read the value rendered under a stat tile's label. */
function statValue(label: string) {
  const tile = screen.getByText(label).closest("div")!.parentElement!;
  return within(tile).getAllByText(/^[\d.]+$/)[0].textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("greeting", () => {
  it("greets the user by first name only", () => {
    renderDashboard({ fullName: "Ama Serwaa Mensah" });

    expect(screen.getByText("Welcome back, Ama")).toBeInTheDocument();
  });

  it("handles a single-word name without crashing", () => {
    renderDashboard({ fullName: "Ama" });

    expect(screen.getByText("Welcome back, Ama")).toBeInTheDocument();
  });
});

describe("stat tiles", () => {
  it("renders zeroes for an empty pharmacy rather than blanks or NaN", () => {
    renderDashboard();

    expect(statValue("Total drugs")).toBe("0");
    expect(statValue("Low-stock alerts")).toBe("0");
    expect(statValue("Pending prescriptions")).toBe("0");
    expect(statValue("Today's sales (GHS)")).toBe("0.00");
  });

  it("counts only prescriptions still awaiting approval", () => {
    renderDashboard({
      prescriptions: [
        makePrescription({ approvalStatus: "Pending" }),
        makePrescription({ approvalStatus: "Pending" }),
        makePrescription({ approvalStatus: "Approved" }),
        makePrescription({ approvalStatus: "Rejected" }),
      ],
    });

    expect(statValue("Pending prescriptions")).toBe("2");
  });

  it("totals only sales dated today, formatted to two decimals", () => {
    renderDashboard({
      sales: [
        makeSale({ saleDate: `${TODAY}T08:00:00Z`, totalAmount: 25.5 }),
        makeSale({ saleDate: `${TODAY}T18:45:00Z`, totalAmount: 74.25 }),
        makeSale({ saleDate: "2026-08-23T23:59:00Z", totalAmount: 1000 }),
        makeSale({ saleDate: "2026-08-25T00:01:00Z", totalAmount: 2000 }),
      ],
    });

    expect(statValue("Today's sales (GHS)")).toBe("99.75");
  });

  it("pads a whole-cedi total to two decimals", () => {
    renderDashboard({ sales: [makeSale({ saleDate: `${TODAY}T09:00:00Z`, totalAmount: 40 })] });

    expect(statValue("Today's sales (GHS)")).toBe("40.00");
  });
});

describe("stock calculation", () => {
  it("trusts the server's quantityInStock when it is present", () => {
    renderDashboard({
      drugs: [makeDrug({ id: "d1", quantityInStock: 5, reorderThreshold: 20 })],
      // These batches must be ignored entirely — the server figure wins.
      batches: [makeBatch({ drug: { id: "d1", label: "Paracetamol" }, quantityInStock: 999 })],
    });

    expect(screen.getByText(/5 in stock · reorder at 20/)).toBeInTheDocument();
  });

  it("treats a server-reported zero as authoritative, not as missing", () => {
    // `typeof 0 === "number"` must win over the falsy check — otherwise a
    // genuinely out-of-stock drug silently falls back to summing batches.
    renderDashboard({
      drugs: [makeDrug({ id: "d1", quantityInStock: 0, reorderThreshold: 10 })],
      batches: [makeBatch({ drug: { id: "d1", label: "Paracetamol" }, quantityInStock: 500 })],
    });

    expect(screen.getByText(/0 in stock · reorder at 10/)).toBeInTheDocument();
  });

  it("sums batch quantities when the server omits quantityInStock", () => {
    renderDashboard({
      drugs: [makeDrug({ id: "d1", reorderThreshold: 100 })],
      batches: [
        makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 30 }),
        makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 25 }),
        makeBatch({ drug: { id: "other", label: "X" }, quantityInStock: 900 }),
      ],
    });

    expect(screen.getByText(/55 in stock · reorder at 100/)).toBeInTheDocument();
  });

  it("excludes expired batches from sellable stock", () => {
    renderDashboard({
      drugs: [makeDrug({ id: "d1", reorderThreshold: 100 })],
      batches: [
        makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 40, isExpired: false }),
        makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 60, isExpired: true }),
      ],
    });

    expect(screen.getByText(/40 in stock · reorder at 100/)).toBeInTheDocument();
  });

  it("excludes controlled batches that no pharmacist has verified", () => {
    renderDashboard({
      drugs: [makeDrug({ id: "d1", reorderThreshold: 100 })],
      batches: [
        makeBatch({
          drug: { id: "d1", label: "P" },
          quantityInStock: 70,
          isControlledSubstance: true,
          verifiedByPharmacist: null,
        }),
        makeBatch({
          drug: { id: "d1", label: "P" },
          quantityInStock: 30,
          isControlledSubstance: true,
          verifiedByPharmacist: { id: "staff-1", label: "Ama Mensah" },
        }),
      ],
    });

    expect(screen.getByText(/30 in stock · reorder at 100/)).toBeInTheDocument();
  });

  it("tolerates a batch whose drug reference is missing", () => {
    // Defensive: the API has shipped null relations before (see RefText history).
    renderDashboard({
      drugs: [makeDrug({ id: "d1", reorderThreshold: 100 })],
      batches: [
        { ...makeBatch({ quantityInStock: 10 }), drug: undefined as never },
        makeBatch({ drug: { id: "d1", label: "P" }, quantityInStock: 15 }),
      ],
    });

    expect(screen.getByText(/15 in stock · reorder at 100/)).toBeInTheDocument();
  });
});

describe("low-stock panel", () => {
  it("flags a drug strictly below its reorder threshold", () => {
    renderDashboard({
      drugs: [
        makeDrug({ id: "d1", name: "Amoxicillin", quantityInStock: 19, reorderThreshold: 20 }),
      ],
    });

    expect(statValue("Low-stock alerts")).toBe("1");
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
  });

  it("does not flag a drug sitting exactly at its threshold", () => {
    renderDashboard({
      drugs: [makeDrug({ id: "d1", quantityInStock: 20, reorderThreshold: 20 })],
    });

    expect(statValue("Low-stock alerts")).toBe("0");
    expect(screen.queryByText("Low stock")).not.toBeInTheDocument();
  });

  it("hides the panel entirely when nothing is low", () => {
    renderDashboard({ drugs: [makeDrug({ quantityInStock: 500, reorderThreshold: 20 })] });

    expect(screen.queryByText("Low stock")).not.toBeInTheDocument();
  });

  it("lists the strength alongside the name to disambiguate same-named drugs", () => {
    renderDashboard({
      drugs: [
        makeDrug({
          id: "d1",
          name: "Paracetamol",
          strength: "500mg",
          quantityInStock: 1,
          reorderThreshold: 20,
        }),
        makeDrug({
          id: "d2",
          name: "Paracetamol",
          strength: "125mg",
          quantityInStock: 2,
          reorderThreshold: 20,
        }),
      ],
    });

    expect(statValue("Low-stock alerts")).toBe("2");
    expect(screen.getByText("(500mg)")).toBeInTheDocument();
    expect(screen.getByText("(125mg)")).toBeInTheDocument();
  });
});

describe("controlled-substance verification panel", () => {
  const unverifiedControlled = makeBatch({
    drug: { id: "d1", label: "Pethidine" },
    batchNumber: "BN-777",
    quantityInStock: 40,
    isControlledSubstance: true,
    verifiedByPharmacist: null,
  });

  it("shows a pharmacist the batches waiting on them", () => {
    renderDashboard({ role: "Pharmacist", batches: [unverifiedControlled] });

    expect(screen.getByText("Batches awaiting your verification")).toBeInTheDocument();
    expect(screen.getByText("Pethidine")).toBeInTheDocument();
    expect(screen.getByText(/batch BN-777 · qty 40/)).toBeInTheDocument();
    expect(screen.getByText("Pending Verification")).toBeInTheDocument();
  });

  it.each(["Technician", "Admin"] as const)("hides the panel from a %s", (role) => {
    renderDashboard({ role, batches: [unverifiedControlled] });

    expect(screen.queryByText("Batches awaiting your verification")).not.toBeInTheDocument();
  });

  it("reassures the pharmacist when everything is verified", () => {
    renderDashboard({
      role: "Pharmacist",
      batches: [
        makeBatch({
          isControlledSubstance: true,
          verifiedByPharmacist: { id: "staff-1", label: "Ama Mensah" },
        }),
      ],
    });

    expect(screen.getByText("All controlled-substance batches are verified.")).toBeInTheDocument();
  });

  it("ignores non-controlled batches, which need no verification", () => {
    renderDashboard({
      role: "Pharmacist",
      batches: [makeBatch({ isControlledSubstance: false, verifiedByPharmacist: null })],
    });

    expect(screen.getByText("All controlled-substance batches are verified.")).toBeInTheDocument();
  });

  it("ignores expired controlled batches — they can never be sold anyway", () => {
    renderDashboard({
      role: "Pharmacist",
      batches: [{ ...unverifiedControlled, isExpired: true }],
    });

    expect(screen.getByText("All controlled-substance batches are verified.")).toBeInTheDocument();
  });
});
