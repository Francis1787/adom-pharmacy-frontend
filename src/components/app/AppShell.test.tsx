// QA: navigation as an access-control surface.
// The sidebar is the only discovery path to each module, so its role filter is
// the first line of least-privilege. These tests pin the whole role -> menu
// matrix: a widened role list shows up as a failing assertion, not as a quiet
// permissions change nobody reviewed.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  navigate: vi.fn(),
  logout: vi.fn(),
  pathname: "/",
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: mocks.pathname } }),
}));

import { AppShell, PageHeader } from "@/components/app/AppShell";
import type { Role } from "@/api";

function renderShell(role: Role | null, fullName = "Ama Mensah") {
  mocks.useAuth.mockReturnValue({
    user: role ? { staffId: "s1", fullName, role, mustResetPassword: false } : null,
    logout: mocks.logout,
  });
  return render(
    <AppShell>
      <p>page content</p>
    </AppShell>,
  );
}

const menuLabels = () =>
  screen
    .getAllByRole("link")
    .map((a) => a.textContent?.trim())
    .filter(Boolean);

// The full expected matrix, transcribed from the NAV table. Kept explicit rather
// than derived so a change to NAV must be consciously mirrored here.
const EXPECTED: Record<Role, string[]> = {
  Pharmacist: [
    "Dashboard",
    "Drug Inventory",
    "Batches",
    "Prescriptions",
    "Customers",
    "Doctors",
    "Sales",
  ],
  Technician: [
    "Dashboard",
    "Drug Inventory",
    "Batches",
    "Prescriptions",
    "Customers",
    "Doctors",
    "Sales",
    "Purchase Orders",
  ],
  Admin: [
    "Dashboard",
    "Drug Inventory",
    "Batches",
    "Prescriptions",
    "Sales",
    "Purchase Orders",
    "Staff",
    "Audit Log",
  ],
};

describe("sidebar role matrix", () => {
  it.each(Object.keys(EXPECTED) as Role[])("shows a %s exactly their modules", (role) => {
    renderShell(role);

    expect(menuLabels()).toEqual(EXPECTED[role]);
  });

  it("keeps Staff and Audit Log out of non-Admin menus", () => {
    for (const role of ["Pharmacist", "Technician"] as const) {
      const { unmount } = renderShell(role);
      expect(screen.queryByText("Staff")).not.toBeInTheDocument();
      expect(screen.queryByText("Audit Log")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("keeps Purchase Orders out of the Pharmacist menu", () => {
    renderShell("Pharmacist");

    expect(screen.queryByText("Purchase Orders")).not.toBeInTheDocument();
  });

  it("keeps patient-facing records out of the Admin menu", () => {
    // Admins administer the system; they have no clinical reason to browse
    // customer or prescriber records.
    renderShell("Admin");

    expect(screen.queryByText("Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Doctors")).not.toBeInTheDocument();
  });
});

describe("shell chrome", () => {
  it("renders nothing at all when there is no session", () => {
    const { container } = renderShell(null);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders page content inside the shell for a signed-in user", () => {
    renderShell("Pharmacist");

    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("identifies the signed-in user and their role in the header", () => {
    renderShell("Technician", "Kwesi Owusu");

    expect(screen.getByText("Kwesi Owusu")).toBeInTheDocument();
    expect(screen.getByText("Technician")).toBeInTheDocument();
  });

  it("logs out and returns to the login screen", async () => {
    renderShell("Admin");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/login" });
  });

  it("marks the current route as active and leaves the others inactive", () => {
    mocks.pathname = "/batches";
    renderShell("Technician");

    const active = screen.getByRole("link", { name: /Batches/ });
    const other = screen.getByRole("link", { name: /Dashboard/ });

    expect(active.className).toContain("bg-primary");
    expect(other.className).not.toContain("bg-primary");
    mocks.pathname = "/";
  });
});

describe("<PageHeader />", () => {
  it("renders the title as the page heading", () => {
    render(<PageHeader title="Drug Inventory" />);

    expect(screen.getByRole("heading", { name: "Drug Inventory" })).toBeInTheDocument();
  });

  it("renders the optional description and actions when supplied", () => {
    render(
      <PageHeader
        title="Sales"
        description="Every dispensed prescription is recorded here"
        actions={<button>New sale</button>}
      />,
    );

    expect(screen.getByText("Every dispensed prescription is recorded here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New sale" })).toBeInTheDocument();
  });

  it("omits the description and action slots when not supplied", () => {
    render(<PageHeader title="Audit Log" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders no action slot when the caller passes a falsy gate result", () => {
    // Callers write `actions={canCreate && <Button/>}`, so `false` reaches this
    // prop for unauthorised roles and must render nothing.
    render(<PageHeader title="Sales" actions={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
