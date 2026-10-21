/**
 * Acceptance tests for the six POC features, one describe per row of the
 * spec's MVP table, each asserting that row's "Done when". Expected values are
 * computed here from locations.geojson, independently of the app's code.
 *
 * Geolocation is Royal Oak, MI unless a test turns it off.
 */
import { expect, test, type Page } from "@playwright/test";

type Cls = "S" | "C" | "H";
interface Props {
  id: string;
  n: string;
  o: string;
  c: Cls;
  a: string;
  co: string;
  d: number;
  y: (number | null)[];
  q: number;
}
interface Feature {
  geometry: { coordinates: [number, number] };
  properties: Props;
}
interface Meta {
  purchaseYear: number;
  years: number[];
  licenseListDate: string;
  tiers: Record<"bars" | "stores", { cutoffs: number[]; max: number; count: number }>;
}

const ROYAL_OAK: [number, number] = [-83.1446, 42.4895];
let features: Feature[] = [];
let meta: Meta;

test.use({ geolocation: { latitude: ROYAL_OAK[1], longitude: ROYAL_OAK[0] }, permissions: ["geolocation"] });

test.beforeAll(async ({ request, baseURL }) => {
  features = (await (await request.get(new URL("data/locations.geojson", baseURL).href)).json()).features;
  meta = await (await request.get(new URL("data/meta.json", baseURL).href)).json();
  expect(features.length).toBeGreaterThan(10_000);
});

// Same great-circle formula the spec's radius means; computed independently of src/lib/geo.ts.
function miles(a: [number, number], b: [number, number]): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}
const isBar = (f: Feature) => f.properties.c !== "S";
const isStore = (f: Feature) => f.properties.c === "S";
const within = (f: Feature, r: number) => miles(ROYAL_OAK, f.geometry.coordinates) <= r;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const byDollars = (a: Feature, b: Feature) => b.properties.d - a.properties.d;

async function mapIdle(page: Page) {
  await page.waitForFunction(
    () => {
      const m = (window as any).__map;
      return m && m.isStyleLoaded() && m.areTilesLoaded() && !m.isMoving();
    },
    null,
    { timeout: 60_000 },
  );
}

async function open(page: Page, hash = "") {
  await page.goto(`./?e2e${hash}`);
  await page.waitForFunction(() => !!(window as any).__map && !!document.querySelector(".count"));
  await mapIdle(page);
}

async function located(page: Page) {
  await open(page);
  await expect(page.locator(".count")).toContainText("within 10 mi");
  await mapIdle(page);
}

async function showList(page: Page) {
  const toggle = page.locator("button.text-button", { hasText: "List" });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.locator(".ranked .row").first()).toBeVisible();
}

/** Ids currently in the map's GeoJSON source (what the map draws). */
async function sourceIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const data = (window as any).__map.getSource("locations").serialize().data;
    return data.features.map((f: any) => f.properties.id);
  });
}

/** Screen point of the biggest rendered pin clear of the floating controls. */
async function biggestPinOnScreen(page: Page) {
  return page.evaluate(() => {
    const m = (window as any).__map;
    const canvas = m.getCanvas().getBoundingClientRect();
    const controls = document.querySelector(".controls")!.getBoundingClientRect();
    const pins = m
      .queryRenderedFeatures({ layers: ["pins"] })
      .map((f: any) => {
        const p = m.project(f.geometry.coordinates);
        return { id: f.properties.id, d: f.properties.d, x: canvas.left + p.x, y: canvas.top + p.y };
      })
      .filter((p: any) => p.x > canvas.left + 30 && p.x < canvas.right - 30 && p.y > canvas.top + 30 && p.y < controls.top - 30);
    pins.sort((a: any, b: any) => b.d - a.d);
    return pins[0];
  });
}

/** True when a license's pin sits inside the visible map canvas. */
async function pinVisible(page: Page, id: string) {
  const f = features.find((x) => x.properties.id === id)!;
  return page.evaluate((c) => {
    const m = (window as any).__map;
    const p = m.project(c);
    const { clientWidth: w, clientHeight: h } = m.getContainer();
    return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
  }, f.geometry.coordinates);
}

test.describe("1. Map: one pin per location, sized and colored by dollars", () => {
  test("every location is drawn, as a pin or inside a cluster", async ({ page }) => {
    await located(page);
    await page.locator("button.chip", { hasText: "10 mi" }).click(); // radius off: whole state
    const bars = features.filter(isBar);
    expect((await sourceIds(page)).length).toBe(bars.length);

    const xs = bars.map((f) => f.geometry.coordinates[0]);
    const ys = bars.map((f) => f.geometry.coordinates[1]);
    const box = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
    await page.evaluate((b) => (window as any).__map.fitBounds(b, { duration: 0, padding: 20 }), box);
    await mapIdle(page);
    const drawn = await page.evaluate(() => {
      const m = (window as any).__map;
      const clusters = new Map<number, any>();
      for (const f of m.queryRenderedFeatures({ layers: ["clusters"] })) clusters.set(f.properties.cluster_id, f.properties);
      const pins = new Map<string, number>();
      for (const f of m.queryRenderedFeatures({ layers: ["pins"] })) pins.set(f.properties.id, f.properties.d);
      let count = pins.size;
      let dollars = [...pins.values()].reduce((s, d) => s + d, 0);
      for (const c of clusters.values()) {
        count += c.point_count;
        dollars += c.sum;
      }
      return { count, dollars, clusters: clusters.size };
    });
    expect(drawn.clusters).toBeGreaterThan(0);
    expect(drawn.count).toBe(bars.length);
    expect(drawn.dollars).toBe(bars.reduce((s, f) => s + f.properties.d, 0));
  });

  test("pin color steps at the view's tier cutoffs and size grows with dollars", async ({ page }) => {
    await located(page);
    const paint = await page.evaluate(() => {
      const m = (window as any).__map;
      return { color: m.getPaintProperty("pins", "circle-color"), radius: m.getPaintProperty("pins", "circle-radius") };
    });
    expect(paint.color[0]).toBe("step");
    expect([paint.color[3], paint.color[5], paint.color[7]]).toEqual(meta.tiers.bars.cutoffs);
    // Radius: interpolated by zoom; at every zoom stop, a square-root ramp on
    // dollars that grows up to the view's cap.
    expect(paint.radius.slice(0, 3)).toEqual(["interpolate", ["linear"], ["zoom"]]);
    const stops = paint.radius.slice(3).filter((_: unknown, i: number) => i % 2 === 1);
    expect(stops.length).toBeGreaterThanOrEqual(2);
    for (const s of stops) {
      expect(s[2]).toEqual(["sqrt", ["max", 0, ["get", "d"]]]); // net-negative dollars draw as $0
      expect(s[4]).toBeLessThan(s[6]); // smaller pin at $0 than at the cap
      expect(s[5]).toBeCloseTo(Math.sqrt(meta.tiers.bars.max));
    }
  });

  test("legend names the cutoffs and the data vintage", async ({ page }) => {
    await located(page);
    const legend = page.locator(".legend");
    await expect(legend).toContainText(`${meta.purchaseYear} purchases`);
    await expect(legend).toContainText(meta.licenseListDate);
    await expect(legend.locator(".swatch")).toHaveCount(4);
  });

  test("pans smoothly with every bar unclustered on a CPU-throttled phone @perf", async ({ page }, info) => {
    await page.goto("about:blank");
    const gpu = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl")!;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
    });
    test.skip(/SwiftShader|llvmpipe/i.test(gpu), `no GPU here (${gpu}); software WebGL says nothing about a phone`);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const t0 = Date.now();
    await located(page);
    const loadMs = Date.now() - t0;
    await page.locator("button.chip", { hasText: "10 mi" }).click(); // radius off: every bar
    await page.evaluate(() => (window as any).__map.jumpTo({ zoom: 9 })); // metro zoom: all pins unclustered
    await mapIdle(page);
    const pan = (dir: number) =>
      page.evaluate(
        (d) =>
          new Promise<number>((resolve) => {
            const m = (window as any).__map;
            let frames = 0;
            m.on("render", () => frames++);
            m.once("moveend", () => resolve(frames / 2));
            m.panBy([150 * d, 100 * d], { duration: 2000 });
          }),
        dir,
      );
    const setPins = (on: boolean) =>
      page.evaluate((v) => {
        const m = (window as any).__map;
        for (const id of ["pins", "pin-shadow", "clusters", "cluster-count"]) m.setLayoutProperty(id, "visibility", v ? "visible" : "none");
      }, on);
    const pinsDrawn = await page.evaluate(() => (window as any).__map.queryRenderedFeatures({ layers: ["pins"] }).length);
    const withPins = await pan(1);
    await setPins(false);
    const basemapOnly = await pan(-1);
    await setPins(true);
    info.annotations.push({
      type: "perf",
      description:
        `${gpu}, CPU throttled 4x: ready in ${loadMs} ms; ` +
        `pan ${withPins.toFixed(1)} fps with ${pinsDrawn} pins drawn vs ${basemapOnly.toFixed(1)} fps basemap only`,
    });
    expect(loadMs).toBeLessThan(20_000);
    expect(pinsDrawn).toBeGreaterThan(1000);
    expect(withPins).toBeGreaterThanOrEqual(45);
    // The pins cost at most a fifth of the frame rate the basemap alone gets.
    expect(withPins).toBeGreaterThanOrEqual(basemapOnly * 0.8);
  });
});

test.describe("2. Near me: locate, radius ring, radius applies to map and list", () => {
  for (const r of [5, 10, 25]) {
    test(`${r} mi radius filters map and list to exactly the bars within ${r} mi`, async ({ page }) => {
      await located(page);
      if (r !== 10) await page.locator("button.chip", { hasText: new RegExp(`^${r} mi$`) }).click();
      await mapIdle(page);
      const expected = features.filter((f) => isBar(f) && within(f, r));
      await expect(page.locator(".count")).toHaveText(`${expected.length.toLocaleString("en-US")} bars within ${r} mi`);
      expect(new Set(await sourceIds(page))).toEqual(new Set(expected.map((f) => f.properties.id)));
      const ring = await page.evaluate(() => (window as any).__map.getSource("ring").serialize().data.features.length);
      expect(ring).toBe(1);
      await showList(page);
      const listed = await page.locator(".ranked .row").evaluateAll((rows) => rows.map((x) => (x as HTMLElement).dataset.id));
      const ids = new Set(expected.map((f) => f.properties.id));
      for (const id of listed) expect(ids.has(id!)).toBe(true);
    });
  }

  test("the map frames the ring around the rep", async ({ page }) => {
    await located(page);
    const inside = await page.evaluate(([lng, lat]) => {
      const b = (window as any).__map.getBounds();
      return b.contains([lng, lat]) && b.getNorth() - b.getSouth() < 1;
    }, ROYAL_OAK);
    expect(inside).toBe(true);
  });

  test.describe("without location", () => {
    test.use({ permissions: [] });
    test("opens on Detroit, statewide counts, and says so when location is refused", async ({ page }) => {
      await open(page);
      await expect(page.locator(".count")).toContainText("bars in view");
      const center = await page.evaluate(() => (window as any).__map.getCenter());
      expect(Math.abs(center.lng - -83.0458)).toBeLessThan(0.2);
      await page.locator("button.locate").click();
      await expect(page.locator(".notice")).toContainText("Showing Detroit");
    });
  });
});

test.describe("3. Filters: license class and minimum dollars", () => {
  test("two taps from all locations to off-premise over $250k", async ({ page }) => {
    await located(page);
    await page.locator("button.chip", { hasText: "Stores · Off-premise" }).click(); // tap 1
    await page.locator(".min-chips button.chip", { hasText: "$250k+" }).click(); // tap 2
    const expected = features.filter((f) => isStore(f) && f.properties.d >= 250_000 && within(f, 10));
    await expect(page.locator(".count")).toHaveText(`${expected.length.toLocaleString("en-US")} stores within 10 mi`);
    expect(new Set(await sourceIds(page))).toEqual(new Set(expected.map((f) => f.properties.id)));
    await showList(page);
    const first = await page.locator(".ranked .row").first().getAttribute("data-id");
    expect(first).toBe(expected.sort(byDollars)[0].properties.id);
  });

  test("bars view holds Class C and B-Hotel; stores view holds SDD; switching resets the minimum", async ({ page }) => {
    await located(page);
    await page.locator(".min-chips button.chip", { hasText: "$100k+" }).click();
    const bars = new Set(await sourceIds(page));
    for (const f of features.filter((x) => bars.has(x.properties.id))) {
      expect(isBar(f)).toBe(true);
      expect(f.properties.d).toBeGreaterThanOrEqual(100_000);
    }
    await page.locator("button.chip", { hasText: "Stores · Off-premise" }).click();
    await expect(page.locator(".min-chips button[aria-pressed=true]")).toHaveText("Any");
    for (const id of await sourceIds(page)) expect(features.find((f) => f.properties.id === id)!.properties.c).toBe("S");
  });
});

test.describe("4. Location card", () => {
  test("tapping a pin opens its card in under 300 ms with the spec's fields", async ({ page }) => {
    await located(page);
    await page.evaluate(() => {
      const t: any = ((window as any).__t = {});
      document.addEventListener("pointerdown", () => (t.down = performance.now()), true);
      new MutationObserver(() => {
        if (!t.card && document.querySelector(".card")) t.card = performance.now();
      }).observe(document.body, { childList: true, subtree: true });
    });
    const pin = await biggestPinOnScreen(page);
    expect(pin).toBeTruthy();
    await page.mouse.click(pin.x, pin.y);
    const card = page.locator(".card");
    await expect(card).toBeVisible();
    const ms = await page.evaluate(() => (window as any).__t.card - (window as any).__t.down);
    test.info().annotations.push({ type: "perf", description: `card opened in ${ms.toFixed(0)} ms` });
    expect(ms).toBeLessThan(300);

    const f = features.find((x) => x.properties.id === pin.id)!;
    const p = f.properties;
    await expect(card.locator(".name")).toHaveText(p.n);
    await expect(card.locator("address")).toHaveText(p.a);
    await expect(card.locator(".eyebrow")).toContainText(p.id);
    await expect(card.locator(".eyebrow")).toContainText(p.c === "S" ? "SDD" : p.c === "C" ? "Class C" : "B-Hotel");
    await expect(card.locator(".number")).toHaveText(money(p.d));
    const prior = p.y[p.y.length - 2];
    if (prior && prior > 0) {
      await expect(card.locator(".delta")).toContainText(`${Math.abs(((p.d - prior) / prior) * 100).toFixed(1)}%`);
    }
    await expect(card.locator("svg[aria-label='Five-year purchase trend'] polyline").first()).toBeVisible();
    const pool = features.filter((x) => isBar(x) && within(x, 10)).sort(byDollars);
    const rank = pool.findIndex((x) => x.properties.id === p.id) + 1;
    await expect(card.locator(".rank")).toHaveText(`#${rank} of ${pool.length} within 10 mi`);
    const href = await card.locator("a", { hasText: "Directions" }).getAttribute("href");
    expect(href).toContain(encodeURIComponent(p.a));
    expect(await page.evaluate(() => location.hash)).toBe(`#l=${p.id}`);

    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
  });

  test("a shared link opens that location's card", async ({ page }) => {
    const target = features.filter(isStore).sort(byDollars)[3];
    await open(page, `#l=${target.properties.id}`);
    await expect(page.locator(".card .name")).toHaveText(target.properties.n);
    await mapIdle(page);
    expect(await pinVisible(page, target.properties.id)).toBe(true);
    // Zoomed in on the store, even though the rep's location (and its
    // radius) loads at the same time.
    expect(await page.evaluate(() => (window as any).__map.getZoom())).toBeGreaterThanOrEqual(13.5);
    await page.locator(".card .close").click();
    await expect(page.locator(".card")).toBeHidden();
  });
});

test.describe("5. Ranked list", () => {
  test("lists the radius by dollars and a row tap pans to and opens its pin", async ({ page }) => {
    await located(page);
    await showList(page);
    const expected = features.filter((f) => isBar(f) && within(f, 10)).sort(byDollars);
    const rows = page.locator(".ranked .row");
    await expect(rows).toHaveCount(50);
    const ids = await rows.evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.id));
    const dollars = ids.map((id) => features.find((f) => f.properties.id === id)!.properties.d);
    for (let i = 1; i < dollars.length; i++) expect(dollars[i]).toBeLessThanOrEqual(dollars[i - 1]);
    expect(dollars[0]).toBe(expected[0].properties.d);

    await page.locator("button.more").click();
    await expect(rows).toHaveCount(Math.min(100, expected.length));

    const pick = expected[6];
    await page.locator(`.ranked .row[data-id="${pick.properties.id}"]`).click();
    await expect(page.locator(".card .name")).toHaveText(pick.properties.n);
    await mapIdle(page);
    expect(await pinVisible(page, pick.properties.id)).toBe(true);
    const ring = await page.evaluate(() => JSON.stringify((window as any).__map.getFilter("selected")));
    expect(ring).toContain(pick.properties.id);
  });

  test("without a radius the list follows the map view", async ({ page }) => {
    await located(page);
    await page.locator("button.chip", { hasText: "10 mi" }).click();
    await mapIdle(page);
    await expect(page.locator(".count")).toContainText("bars in view");
    await showList(page);
    const bounds = await page.evaluate(() => (window as any).__map.getBounds().toArray());
    const ids = await page.locator(".ranked .row").evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.id));
    for (const id of ids) {
      const [x, y] = features.find((f) => f.properties.id === id)!.geometry.coordinates;
      expect(x >= bounds[0][0] && x <= bounds[1][0] && y >= bounds[0][1] && y <= bounds[1][1]).toBe(true);
    }
  });
});

test.describe("6. Search: business or city, fuzzy, jumps the map", () => {
  test("finds a store by DBA, switches to its view and opens it", async ({ page }) => {
    await located(page);
    const target = features.find((f) => f.properties.id === "L-000435184")!; // Total Wine, Novi
    expect(target.properties.n).toBe("TOTAL WINE");
    await page.locator(".search-input").fill("total wine novi");
    await expect(page.locator(".search-results li").first()).toContainText("TOTAL WINE");
    await page.keyboard.press("Enter");
    await expect(page.locator(".card .name")).toHaveText("TOTAL WINE");
    await expect(page.locator(".card .eyebrow")).toContainText("L-000435184");
    await expect(page.locator(".count")).toContainText("in view"); // outside the radius, so the radius clears
    // On phones the card hides the controls, so check the toggle state, not its visibility.
    await expect(page.locator(".controls button.chip", { hasText: "Stores" })).toHaveAttribute("aria-pressed", "true");
    await mapIdle(page);
    expect(await pinVisible(page, "L-000435184")).toBe(true);
    expect(await page.evaluate(() => (window as any).__map.getZoom())).toBeGreaterThanOrEqual(13.5);
  });

  test("finds a location by licensee name when its DBA differs", async ({ page }) => {
    await located(page);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
    const target = features
      .filter(isBar)
      .sort(byDollars)
      .find((f) => {
        const word = norm(f.properties.o).split(" ").find((w) => w.length >= 6);
        return word && !norm(f.properties.n).includes(word);
      })!;
    const word = norm(target.properties.o).split(" ").find((w) => w.length >= 6)!;
    await page.locator(".search-input").fill(word);
    await expect(page.locator(".search-results li", { hasText: target.properties.n }).first()).toBeVisible();
  });

  test("matches word prefixes in any case, and a city result fits the map to it", async ({ page }) => {
    await located(page);
    await page.locator(".search-input").fill("TOT win");
    await expect(page.locator(".search-results li", { hasText: "TOTAL WINE" }).first()).toBeVisible();
    await page.locator(".search-input").fill("traverse ci");
    const city = page.locator(".search-results li", { hasText: "City ·" }).first();
    await expect(city).toContainText("Traverse City");
    await city.click();
    await mapIdle(page);
    await expect(page.locator(".count")).toContainText("bars in view");
    const tc = features.filter((f) => isBar(f) && /, traverse city,/i.test(f.properties.a));
    const bounds = await page.evaluate(() => (window as any).__map.getBounds().toArray());
    for (const f of tc) {
      const [x, y] = f.geometry.coordinates;
      expect(x >= bounds[0][0] && x <= bounds[1][0] && y >= bounds[0][1] && y <= bounds[1][1]).toBe(true);
    }
  });
});

test.describe("Page health", () => {
  test("no console errors, no horizontal scroll, about panel opens and closes", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await located(page);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBe(cw);
    await page.locator("button.header-about").click();
    await expect(page.locator("dialog.about")).toBeVisible();
    await expect(page.locator("dialog.about")).toContainText("Wholesale, not retail");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.about")).toBeHidden();
    expect(errors).toEqual([]);
  });
});
