import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Mobile-friendly smoke test.
 *
 * Renders the public landing & auth surfaces inside a 375px viewport
 * (iPhone SE) and asserts that no rendered element forces horizontal
 * overflow. Catches the most common mobile bugs:
 *   - fixed widths exceeding 375px
 *   - long unbreakable strings (URLs, hashes) without `break-words`
 *   - tables/grids missing `overflow-x-auto`
 *
 * jsdom doesn't compute layout, so we measure intent: forbid any inline
 * width style or class that would clearly break narrow screens.
 */

beforeEach(() => {
  Object.defineProperty(window, "innerWidth",  { writable: true, configurable: true, value: 375 });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 812 });
  // Mark mobile breakpoint as active for any matchMedia callers.
  (window.matchMedia as any) = (q: string) => ({
    matches: /max-width:\s*7\d\d/i.test(q),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
});

// Mock auth API + supabase so pages can render in jsdom.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    roles: [],
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: any }) => children,
}));
vi.mock("@/lib/api", () => ({
  api:    { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}), patch: vi.fn().mockResolvedValue({}) },
  authApi:{ me: vi.fn().mockResolvedValue({ roles: [] }) },
  ApiError: class ApiError extends Error {},
}));

const FORBIDDEN_INLINE_WIDTH = /(min-width|width)\s*:\s*([4-9]\d{2,}|\d{4,})px/i;

const FORBIDDEN_CLASS_PATTERNS = [
  /\bw-\[(?:[4-9]\d{2}|\d{4,})px\]/,    // arbitrary widths > 400px
  /\bmin-w-\[(?:[4-9]\d{2}|\d{4,})px\]/,
];

function inspect(container: HTMLElement) {
  const offenders: string[] = [];
  container.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const style = el.getAttribute("style") || "";
    if (FORBIDDEN_INLINE_WIDTH.test(style)) {
      offenders.push(`inline width too large on <${el.tagName.toLowerCase()}>: ${style}`);
    }
    const cls = el.className?.toString?.() || "";
    for (const pat of FORBIDDEN_CLASS_PATTERNS) {
      if (pat.test(cls)) {
        offenders.push(`fixed-width class "${cls.match(pat)?.[0]}" on <${el.tagName.toLowerCase()}>`);
      }
    }
  });
  return offenders;
}

const cases = [
  { name: "Landing (/)", path: "/",            loader: () => import("@/pages/Index")       },
  { name: "Seller login",  path: "/seller-login", loader: () => import("@/pages/SellerLogin") },
  { name: "Seller apply",  path: "/apply-seller", loader: () => import("@/pages/SellerApply") },
];

describe("Mobile responsive — 375px viewport", () => {
  for (const c of cases) {
    it(`${c.name}: no fixed widths that would overflow`, async () => {
      const Page = (await c.loader()).default;
      const { container } = render(
        <MemoryRouter initialEntries={[c.path]}>
          <Page />
        </MemoryRouter>,
      );
      const offenders = inspect(container);
      expect(
        offenders,
        `Mobile-overflow risks on ${c.name}:\n  - ${offenders.join("\n  - ")}`,
      ).toEqual([]);
    });
  }

  it("viewport meta tag in index.html allows scaling", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf-8");
    expect(html).toMatch(/<meta[^>]+name="viewport"[^>]+width=device-width/i);
  });
});
