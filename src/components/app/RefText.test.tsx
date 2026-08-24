// QA: reference rendering.
// The backend returns relation fields inconsistently — sometimes a plain string,
// sometimes a { id, label } summary. Git history shows a "Fixed reference object
// crashes" commit, so these helpers are a proven regression area. The cardinal
// rule under test: never let a raw object reach the DOM as "[object Object]".
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RefText, refId, refLabel, truncate, type RefLike } from "@/components/app/RefText";

describe("refLabel", () => {
  it.each([
    ["plain string", "Ernest Chemists", "Ernest Chemists"],
    ["number", 42, "42"],
    ["zero (falsy but valid)", 0, "0"],
    ["summary object", { id: "d-1", label: "Paracetamol" }, "Paracetamol"],
    ["staff-shaped object", { id: "s-1", fullName: "Ama Mensah" }, "Ama Mensah"],
    ["name-shaped object", { id: "x-1", name: "Ring Road Branch" }, "Ring Road Branch"],
    ["id-only object", { id: "abc-123" }, "abc-123"],
    ["empty object", {}, ""],
    ["null", null, ""],
    ["undefined", undefined, ""],
  ] as [string, RefLike, string][])("resolves %s", (_case, input, expected) => {
    expect(refLabel(input)).toBe(expected);
  });

  it("prefers label over fullName over name over id", () => {
    expect(refLabel({ id: "i", name: "n", fullName: "f", label: "l" })).toBe("l");
    expect(refLabel({ id: "i", name: "n", fullName: "f" })).toBe("f");
    expect(refLabel({ id: "i", name: "n" })).toBe("n");
  });

  it("never produces the object-stringification that caused the original crash", () => {
    expect(refLabel({ id: "d-1", label: "Paracetamol" })).not.toContain("[object");
  });
});

describe("refId", () => {
  it.each([
    ["summary object", { id: "d-1", label: "Paracetamol" }, "d-1"],
    ["plain string (id is the value itself)", "d-1", "d-1"],
    ["number", 7, "7"],
    ["object with no id", { label: "Paracetamol" }, ""],
    ["null", null, ""],
    ["undefined", undefined, ""],
  ] as [string, RefLike, string][])("resolves %s", (_case, input, expected) => {
    expect(refId(input)).toBe(expected);
  });

  it("does not fall back to the label when id is missing", () => {
    // Callers use refId to build API payloads; returning a human label there
    // would send a name where the server expects a UUID.
    expect(refId({ label: "Paracetamol" })).toBe("");
  });
});

describe("truncate", () => {
  it("leaves text at or under the limit untouched", () => {
    expect(truncate("Paracetamol", 24)).toBe("Paracetamol");
    expect(truncate("x".repeat(24), 24)).toBe("x".repeat(24));
  });

  it("cuts to exactly max characters plus an ellipsis once over the limit", () => {
    const result = truncate("x".repeat(25), 24);
    expect(result).toBe(`${"x".repeat(24)}…`);
  });

  it("defaults to a 24-character limit", () => {
    expect(truncate("y".repeat(30))).toBe(`${"y".repeat(24)}…`);
  });

  it("handles an empty string", () => {
    expect(truncate("", 24)).toBe("");
  });
});

describe("<RefText />", () => {
  it("renders the resolved label", () => {
    render(<RefText value={{ id: "d-1", label: "Amoxicillin" }} />);
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
  });

  it("renders the em-dash fallback for a missing reference", () => {
    render(<RefText value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the em-dash fallback for an unresolvable object", () => {
    // An unapproved prescription has approvingPharmacist: null; a malformed one
    // may arrive as {}. Both must degrade to the placeholder, not to a crash.
    render(<RefText value={{}} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("accepts a custom fallback", () => {
    render(<RefText value={undefined} fallback="Not assigned" />);
    expect(screen.getByText("Not assigned")).toBeInTheDocument();
  });

  it("keeps the full label in the title attribute when truncating", () => {
    const long = "Co-amoxiclav 625mg film-coated tablets";
    render(<RefText value={long} max={12} />);

    const el = screen.getByTitle(long);
    expect(el).toHaveTextContent(`${long.slice(0, 12)}…`);
  });

  it("does not set a title on the fallback, which has nothing to reveal", () => {
    const { container } = render(<RefText value={null} />);
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("forwards className in both the resolved and fallback branches", () => {
    const { container: resolved } = render(
      <RefText value="Ernest Chemists" className="font-mono" />,
    );
    expect(resolved.querySelector("span")).toHaveClass("font-mono");

    const { container: fallback } = render(<RefText value={null} className="font-mono" />);
    expect(fallback.querySelector("span")).toHaveClass("font-mono");
  });

  it("renders a supplier that arrives as a bare string, not just as a summary", () => {
    // Batch.supplier and PurchaseOrder.supplier are typed `string | RefSummary`,
    // so both shapes must render identically.
    const { rerender } = render(<RefText value="Ernest Chemists" />);
    expect(screen.getByText("Ernest Chemists")).toBeInTheDocument();

    rerender(<RefText value={{ id: "sup-1", label: "Ernest Chemists" }} />);
    expect(screen.getByText("Ernest Chemists")).toBeInTheDocument();
  });
});
