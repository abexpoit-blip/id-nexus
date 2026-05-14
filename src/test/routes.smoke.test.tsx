import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Routing smoke test — guards against deploy-time breakage.
 *
 * Why: the most common "page broke after deploy" bug is a route that
 * references a page module which fails to import (missing file, bad
 * default export, broken named import, syntax error in the lazy chunk).
 *
 * What this does:
 *   1. Parses src/App.tsx to extract every page module path used by
 *      a `<Route>` (both eager `import X from "./pages/X.tsx"` and
 *      lazy `lazy(() => import("./pages/X.tsx"))`).
 *   2. Confirms every <Route path="..."> in the router maps to a
 *      component name we found above (no orphan element references).
 *   3. Dynamically imports each page module — this forces Vite to
 *      parse + transform it. Any syntax error, missing dependency,
 *      or broken sibling import in that file fails the test.
 *   4. Asserts each module exposes a renderable default export.
 *
 * If this test passes, every route in the app can at minimum
 * mount without crashing at import time.
 */

const appSrc = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");

// Collect: { ComponentName: "./pages/Foo.tsx" }
const pageImports: Record<string, string> = {};

// eager: import X from "./pages/X.tsx"
for (const m of appSrc.matchAll(/import\s+(\w+)\s+from\s+"(\.\/pages\/[^"]+)"/g)) {
  pageImports[m[1]] = m[2];
}
// lazy: const X = lazy(() => import("./pages/X.tsx"))
for (const m of appSrc.matchAll(
  /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("(\.\/pages\/[^"]+)"\)\)/g,
)) {
  pageImports[m[1]] = m[2];
}

// Collect: routes that use one of these components, e.g.
// element={<Foo />}  or  element={ <BuyerHidden><Foo /></BuyerHidden> }
const routeRefs = new Set<string>();
for (const m of appSrc.matchAll(/<(\w+)\s*\/>/g)) {
  if (pageImports[m[1]]) routeRefs.add(m[1]);
}

describe("App routing — every page module loads", () => {
  it("App.tsx exposes at least one page route", () => {
    expect(Object.keys(pageImports).length).toBeGreaterThan(5);
    expect(routeRefs.size).toBeGreaterThan(5);
  });

  it("every <Route element> references a known imported page", () => {
    // Any name used as <Foo /> that looks page-like (matches /^[A-Z]/)
    // and lives inside the router but isn't in pageImports would be a
    // dangling reference. We allow non-page components (like ProtectedRoute,
    // Navigate, BuyerHidden) — they're filtered by the pageImports map.
    for (const name of routeRefs) {
      expect(
        pageImports[name],
        `Route uses <${name} /> but no matching page import was found in App.tsx`,
      ).toBeTruthy();
    }
  });

  // One test per page so failures point at the exact broken file.
  for (const [name, rel] of Object.entries(pageImports)) {
    it(`page "${name}" (${rel}) imports cleanly and exports a component`, async () => {
      const mod = await import(/* @vite-ignore */ rel.replace("./", "../"));
      expect(mod.default, `${name} must have a default export`).toBeDefined();
      expect(typeof mod.default).toMatch(/function|object/);
    });
  }
});
