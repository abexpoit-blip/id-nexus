import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

const renderSidebar = (active: any = "overview", onSelect = vi.fn()) => {
  render(
    <SidebarProvider defaultOpen>
      <AdminSidebar active={active} onSelect={onSelect} pendingCounts={{ replacements: 3, messages: 1 }} />
    </SidebarProvider>,
  );
  return { onSelect };
};

describe("AdminSidebar — routing regression", () => {
  it("renders all primary navigation items", () => {
    renderSidebar();
    for (const label of [
      "Overview", "Orders", "Replacements", "Messaging", "Payments",
      "Users & money", "Stock", "Categories", "Payment accounts",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("calls onSelect with the correct section id when a nav item is clicked", () => {
    const { onSelect } = renderSidebar();
    fireEvent.click(screen.getByText("Orders"));
    expect(onSelect).toHaveBeenCalledWith("orders");
    fireEvent.click(screen.getByText("Replacements"));
    expect(onSelect).toHaveBeenCalledWith("replacements");
    fireEvent.click(screen.getByText("Stock"));
    expect(onSelect).toHaveBeenCalledWith("stock");
  });

  it("marks the active item with aria-current=page", () => {
    renderSidebar("orders");
    const ordersBtn = screen.getByText("Orders").closest("button")!;
    expect(ordersBtn.getAttribute("aria-current")).toBe("page");
    const overviewBtn = screen.getByText("Overview").closest("button")!;
    expect(overviewBtn.getAttribute("aria-current")).toBeNull();
  });

  it("renders pending badge counts", () => {
    renderSidebar();
    // Replacements badge = 3, Messaging badge = 1
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});