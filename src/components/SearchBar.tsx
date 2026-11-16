import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CLASS_LABEL, type Location } from "../lib/data";
import { count } from "../lib/format";
import { cityOf, type SearchResult } from "../lib/search";

export interface QuickAction {
  id: string;
  label: string;
  /** Single key that runs the action anywhere outside a text field. */
  key: string;
  run: () => void;
}

interface Props {
  search: ((q: string) => SearchResult[]) | null;
  onPick: (r: SearchResult) => void;
  actions: QuickAction[];
  recents: Location[];
}

type Item =
  | { kind: "result"; r: SearchResult }
  | { kind: "action"; a: QuickAction }
  | { kind: "recent"; l: Location };

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Search doubles as the command palette: Cmd/Ctrl+K or "/" focuses it; empty, it lists quick actions and recents. */
export function SearchBar({ search, onPick, actions, recents }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => (search && q.trim().length >= 2 ? search(q) : []), [search, q]);

  const items: Item[] = useMemo(() => {
    if (q.trim()) return results.map((r) => ({ kind: "result", r }));
    return [
      ...actions.map((a): Item => ({ kind: "action", a })),
      ...recents.map((l): Item => ({ kind: "recent", l })),
    ];
  }, [q, results, actions, recents]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (it: Item) => {
    setOpen(false);
    if (it.kind === "action") {
      setQ("");
      it.a.run();
    } else {
      const r: SearchResult =
        it.kind === "result" ? it.r : { kind: "location", location: it.l, city: cityOf(it.l.properties.a) };
      onPick(r);
      setQ(r.kind === "city" ? r.city : r.location.properties.n);
    }
    input.current?.blur();
  };

  const show = open && items.length > 0;
  const firstRecent = items.findIndex((it) => it.kind === "recent");
  const status = q.trim().length >= 2 ? `${results.length} ${results.length === 1 ? "result" : "results"}` : "";

  return (
    <div className="search">
      <input
        ref={input}
        type="search"
        className="search-input"
        placeholder="Search a business, city or license"
        aria-label="Search a business, city or license"
        aria-keyshortcuts={isMac ? "Meta+K /" : "Control+K /"}
        role="combobox"
        aria-expanded={show}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={show ? `sr-${active}` : undefined}
        value={q}
        disabled={!search}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && show && items[active]) run(items[active]);
          else if (e.key === "Escape") {
            if (show) setOpen(false);
            else input.current?.blur();
          } else return;
          e.preventDefault();
        }}
      />
      <kbd className="search-hint small" aria-hidden="true">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
      {show && (
        <ul id="search-results" className="search-results" role="listbox" aria-label="Search results and quick actions">
          {items.map((it, i) => (
            <Fragment key={keyOf(it)}>
              {i === 0 && it.kind === "action" && (
                <li role="presentation" className="group-label small muted">
                  Quick actions
                </li>
              )}
              {i === firstRecent && (
                <li role="presentation" className="group-label small muted">
                  Recent
                </li>
              )}
            <li
              id={`sr-${i}`}
              role="option"
              aria-selected={i === active}
              className={it.kind}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(it)}
            >
              {it.kind === "action" ? (
                <span className="action-row">
                  <span className="sr-name">{it.a.label}</span>
                  <kbd className="small muted">{it.a.key.toUpperCase()}</kbd>
                </span>
              ) : it.kind === "recent" ? (
                <>
                  <span className="sr-name">{it.l.properties.n}</span>
                  <span className="small muted">{cityOf(it.l.properties.a)}</span>
                </>
              ) : it.r.kind === "city" ? (
                <>
                  <span className="sr-name">{it.r.city}</span>
                  <span className="small muted">City, {count(it.r.count)} locations</span>
                </>
              ) : (
                <>
                  <span className="sr-name">{it.r.location.properties.n}</span>
                  <span className="small muted">
                    {it.r.city}, {CLASS_LABEL[it.r.location.properties.c].split(",")[0]}
                  </span>
                </>
              )}
            </li>
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}

function keyOf(it: Item): string {
  if (it.kind === "action") return `a-${it.a.id}`;
  if (it.kind === "recent") return `r-${it.l.properties.id}`;
  return it.r.kind === "city" ? `c-${it.r.city}` : it.r.location.properties.id;
}

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}
