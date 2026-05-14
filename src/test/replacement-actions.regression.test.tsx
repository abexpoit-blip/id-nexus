import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminReplacementsView, type RpItem } from "@/components/admin/AdminReplacementsView";

const mkItem = (over: Partial<RpItem> = {}): RpItem => ({
  id: "rp-1",
  request_id: "req-1",
  reported_uid: "61000111222",
  outcome: "pending",
  outcome_reason: null,
  in_window: true,
  window_hours: 24,
  created_at: new Date().toISOString(),
  buyer_id: "b-1",
  seller_id: "s-1",
  account_id: "a-1",
  ...over,
});

const renderView = (items: RpItem[], onAction = vi.fn()) => {
  render(
    <AdminReplacementsView
      items={items}
      loading={false}
      categories={[{ id: "cat-1", name: "FB Cat A" }]}
      onAction={onAction}
    />,
  );
  return { onAction };
};

describe("AdminReplacementsView — action regression", () => {
  it("shows empty state when no items", () => {
    renderView([]);
    expect(screen.getByText(/nothing matches these filters/i)).toBeInTheDocument();
  });

  it("renders the reported UID for a pending item", () => {
    renderView([mkItem()]);
    expect(screen.getByText("61000111222")).toBeInTheDocument();
  });

  it("fires onAction('refund') when Refund is clicked", () => {
    const { onAction } = renderView([mkItem()]);
    fireEvent.click(screen.getByRole("button", { name: /refund/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
    const [item, act] = onAction.mock.calls[0];
    expect(item.id).toBe("rp-1");
    expect(act).toBe("refund");
  });

  it("fires onAction('reject') when Reject is clicked", () => {
    const { onAction } = renderView([mkItem()]);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onAction.mock.calls[0][1]).toBe("reject");
  });

  it("fires onAction('replace') with same-category for the row", () => {
    const { onAction } = renderView([mkItem()]);
    fireEvent.click(screen.getByRole("button", { name: /same cat/i }));
    expect(onAction.mock.calls[0][1]).toBe("replace");
  });

  it("disables Refund + Same-cat when account_id is missing", () => {
    renderView([mkItem({ account_id: null })]);
    expect(screen.getByRole("button", { name: /refund/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /same cat/i })).toBeDisabled();
  });

  it("hides action buttons for non-pending outcomes", () => {
    renderView([mkItem({ outcome: "replaced" })]);
    expect(screen.queryByRole("button", { name: /refund/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
  });
});