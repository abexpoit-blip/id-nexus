import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UploadStatusBadge, UploadStatusProgress } from "@/components/seller/SellerWalletCard";

/**
 * Balance + status regression: pure rendering of wallet status helpers.
 * Guards the Submitted → Collected → Completed/Rejected pipeline labels
 * which both seller and admin dashboards depend on.
 */
describe("UploadStatusBadge", () => {
  it("shows 'Uploaded' when no status and not collected", () => {
    render(<UploadStatusBadge audit={{}} />);
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
  });

  it("shows 'Collected' when collected_at present but not approved", () => {
    render(<UploadStatusBadge audit={{ collected_at: "2026-01-01" }} />);
    expect(screen.getByText("Collected")).toBeInTheDocument();
  });

  it("shows 'Completed' when review_status is approved", () => {
    render(<UploadStatusBadge audit={{ review_status: "approved" }} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows 'Rejected' when review_status is rejected", () => {
    render(<UploadStatusBadge audit={{ review_status: "rejected" }} />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });
});

describe("UploadStatusProgress pipeline", () => {
  it("renders 3 steps: Submitted, Collected, Completed by default", () => {
    render(<UploadStatusProgress audit={{}} />);
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Collected")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("flips final step to 'Rejected' when audit is rejected", () => {
    render(<UploadStatusProgress audit={{ review_status: "rejected" }} />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });
});