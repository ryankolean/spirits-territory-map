import { useMemo, useState } from "react";
import { CLASS_LABEL } from "../lib/data";
import type { SearchResult } from "../lib/search";

interface Props {
  search: ((q: string) => SearchResult[]) | null;
  onPick: (r: SearchResult) => void;
}

export function SearchBar({ search, onPick }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => (search && q.trim().length >= 2 ? search(q) : []), [search, q]);

  const pick = (r: SearchResult) => {
    onPick(r);
    setOpen(false);
    setQ(r.kind === "city" ? r.city : r.location.properties.n);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="search">
      <input
        type="search"
        className="search-input"
        placeholder="Search a business or city"
        aria-label="Search a business or city"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={open && results.length ? `sr-${active}` : undefined}
        value={q}
        disabled={!search}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && results[active]) pick(results[active]);
          else if (e.key === "Escape") setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {open && results.length > 0 && (
        <ul id="search-results" className="search-results" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.kind === "city" ? `c-${r.city}` : r.location.properties.id}
              id={`sr-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
            >
              {r.kind === "city" ? (
                <>
                  <span className="sr-name">{r.city}</span>
                  <span className="small muted">City · {r.count.toLocaleString("en-US")} locations</span>
                </>
              ) : (
                <>
                  <span className="sr-name">{r.location.properties.n}</span>
                  <span className="small muted">
                    {r.city} · {CLASS_LABEL[r.location.properties.c].split(" · ")[0]}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
