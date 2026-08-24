// QA: prescription approval workflow.
// Only a Pharmacist may approve or reject, only a Pending prescription is
// actionable, and a rejection must carry a reason — that reason is what the
// audit log and the customer conversation both rely on.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  usePrescriptions: vi.fn(),
  useCustomers: vi.fn(),
  useDoctors: vi.fn(),
  useDrugs: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/queries", () => ({
  usePrescriptions: mocks.usePrescriptions,
  useCustomers: mocks.useCustomers,
  useDoctors: mocks.useDoctors,
  useDrugs: mocks.useDrugs,
  useApiMutation: () => ({ mutate: mocks.mutate, isPending: false, variables: undefined }),
  qk: { prescriptions: ["prescriptions"], auditLog: ["audit-log"] },
}));

import { Route } from "@/routes/_authenticated/prescriptions";
import type { Prescription, Role } from "@/api";
import { makePrescription } from "@/test/factories";

const PrescriptionsPage = Route.options.component as ComponentType;

function renderPage({
  role = "Pharmacist",
  prescriptions = [],
  isLoading = false,
}: { role?: Role; prescriptions?: Prescription[]; isLoading?: boolean } = {}) {
  mocks.useAuth.mockReturnValue({
    user: { staffId: "staff-1", fullName: "Ama Mensah", role, mustResetPassword: false },
  });
  mocks.usePrescriptions.mockReturnValue({ data: prescriptions, isLoading });
  mocks.useCustomers.mockReturnValue({ data: [] });
  mocks.useDoctors.mockReturnValue({ data: [] });
  mocks.useDrugs.mockReturnValue({ data: [] });
  return render(<PrescriptionsPage />);
}

describe("who may create a prescription", () => {
  it.each(["Pharmacist", "Technician"] as const)(
    "offers %s the New prescription action",
    (role) => {
      renderPage({ role });

      expect(screen.getByRole("button", { name: "New prescription" })).toBeInTheDocument();
    },
  );

  it("does not offer an Admin the New prescription action", () => {
    // Admins run the system; intake is clinical work.
    renderPage({ role: "Admin" });

    expect(screen.queryByRole("button", { name: "New prescription" })).not.toBeInTheDocument();
  });
});

describe("who may approve or reject", () => {
  const pending = makePrescription({ approvalStatus: "Pending" });

  it("offers a Pharmacist both Approve and Reject on a pending prescription", () => {
    renderPage({ role: "Pharmacist", prescriptions: [pending] });

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it.each(["Technician", "Admin"] as const)("gives a %s no approval controls", (role) => {
    renderPage({ role, prescriptions: [pending] });

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it.each(["Approved", "Rejected"] as const)(
    "offers no further action on an already-%s prescription",
    (approvalStatus) => {
      renderPage({
        role: "Pharmacist",
        prescriptions: [makePrescription({ approvalStatus })],
      });

      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    },
  );

  it("dispatches the approval for the row that was clicked", async () => {
    const target = makePrescription({ approvalStatus: "Pending" });
    renderPage({ role: "Pharmacist", prescriptions: [target] });

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(mocks.mutate).toHaveBeenCalledWith(target.id);
  });
});

describe("rejection requires a reason", () => {
  async function openReject() {
    renderPage({
      role: "Pharmacist",
      prescriptions: [makePrescription({ approvalStatus: "Pending" })],
    });
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    return screen.getByRole("dialog");
  }

  it("opens with the confirm button disabled", async () => {
    const dialog = await openReject();

    expect(within(dialog).getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("stays disabled for whitespace-only input", async () => {
    const dialog = await openReject();

    await userEvent.type(within(dialog).getByRole("textbox"), "   ");

    expect(within(dialog).getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("enables and submits once a real reason is typed", async () => {
    const dialog = await openReject();

    await userEvent.type(within(dialog).getByRole("textbox"), "Dosage exceeds safe daily maximum");
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });

  it("closes on Cancel without rejecting", async () => {
    const dialog = await openReject();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

describe("status presentation", () => {
  it("marks an approved prescription that has been dispensed", () => {
    renderPage({
      prescriptions: [makePrescription({ approvalStatus: "Approved", sold: true })],
    });

    expect(screen.getByText("Approved · dispensed")).toBeInTheDocument();
  });

  it("marks an approved prescription that is still awaiting collection", () => {
    renderPage({
      prescriptions: [makePrescription({ approvalStatus: "Approved", sold: false })],
    });

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByText("Approved · dispensed")).not.toBeInTheDocument();
  });

  it("renders the customer and doctor as names, never as raw objects", () => {
    renderPage({
      prescriptions: [
        makePrescription({
          customer: { id: "c1", label: "Kofi Boateng" },
          doctor: { id: "dr1", label: "Dr. Yaa Asantewaa" },
        }),
      ],
    });

    expect(screen.getByText("Kofi Boateng")).toBeInTheDocument();
    expect(screen.getByText("Dr. Yaa Asantewaa")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("[object Object]");
  });

  it("shows a placeholder rather than a blank cell for an unapproved prescription", () => {
    renderPage({
      prescriptions: [makePrescription({ approvalStatus: "Pending", approvingPharmacist: null })],
    });

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an explicit empty state", () => {
    renderPage();

    expect(screen.getByText("No prescriptions yet.")).toBeInTheDocument();
  });

  it("shows skeletons rather than the empty state while loading", () => {
    renderPage({ isLoading: true });

    expect(screen.queryByText("No prescriptions yet.")).not.toBeInTheDocument();
  });
});
