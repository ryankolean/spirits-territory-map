import { useEffect, useRef } from "react";
import type { Meta } from "../lib/data";
import { CloseIcon } from "./Icons";

interface Props {
  open: boolean;
  meta: Meta | null;
  onClose: () => void;
}

/** What the numbers are and are not; the spec's data caveats, in plain words. */
export function About({ open, meta, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="about" aria-labelledby="about-title" onClose={onClose}>
      <button className="close" onClick={onClose} aria-label="Close">
        <CloseIcon />
      </button>
      <h2 id="about-title" className="display-lg">
        About the numbers
      </h2>
      <p>
        Each pin is one licensed location, sized and colored by the dollars of spirits it bought from the Michigan
        Liquor Control Commission in {meta?.purchaseYear ?? 2025}. Bigger and darker means a bigger buyer.
      </p>
      <ul>
        <li>
          <strong>Wholesale, not retail.</strong> The figure is what the location paid the state. Shelf value runs
          roughly 1.15 to 1.2 times higher.
        </li>
        <li>
          <strong>Spirits only.</strong> Beer and wine go through private wholesalers and are not reported, so a bar
          that sells mostly beer looks small.
        </li>
        <li>
          <strong>Annual, with a lag.</strong> {meta?.purchaseYear ?? 2025} is the newest year MLCC has published.
          The trend line covers {meta ? `${meta.years[0]} to ${meta.years[meta.years.length - 1]}` : "five years"}.
        </li>
        <li>
          <strong>One pin per license.</strong> Chains show every store separately. Names come from the current
          license list, so a recent sale or rebrand shows the new name.
        </li>
        <li>
          <strong>Active licenses only.</strong> Escrowed, terminated and cancelled licenses are left off; a new
          owner's card notes what the previous license at that address bought.
        </li>
        <li>
          <strong>Locations are geocoded.</strong> A few hundred pins sit at their ZIP code's center; their cards
          say so.
        </li>
      </ul>
      <p className="small muted">
        Sources:{" "}
        <a href="https://www.michigan.gov/lara/bureau-list/lcc/financial-management-division-reports" target="_blank" rel="noreferrer">
          MLCC licensee spirit purchase data
        </a>
        ,{" "}
        <a href="https://www.michigan.gov/lara/bureau-list/lcc/licensing-list" target="_blank" rel="noreferrer">
          MLCC license list
        </a>{" "}
        (as of {meta?.licenseListDate ?? "the latest update"}), US Census geocoder, OpenStreetMap. Map tiles by
        OpenFreeMap. How the data was joined and checked:{" "}
        <a href="https://github.com/ryankolean/spirits-territory-map/blob/main/docs/VALIDATION.md" target="_blank" rel="noreferrer">
          validation report
        </a>
        .
      </p>
      <p className="small muted">
        Compiled from public MLCC records. Not affiliated with or endorsed by MLCC or LARA. No warranty of accuracy. A
        Summit Software Solutions prototype.
      </p>
    </dialog>
  );
}
