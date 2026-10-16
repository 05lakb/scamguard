import { useState } from "react";
import { Icon } from "../components/Icon";
import { DistRow, EmptyState, PageHead, PanelHead, StatCard } from "../components/ui";
import type { CaseItem } from "../lib/cases";
import { groupBy, levelOf } from "../lib/insights";

interface Props {
  cases: CaseItem[];
  goAnalyze: () => void;
}

export function Geography({ cases, goAnalyze }: Props) {
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<"all" | "high" | "medium" | "low">("all");
  const located = cases.filter((item) => item.source !== "recorded" && item.location?.trim());
  const places = groupBy(located, (item) => item.location);
  const highPlaces = places.filter((p) => levelOf(p.worst) === "high").length;
  const medPlaces = places.filter((p) => levelOf(p.worst) === "medium").length;
  const lowPlaces = places.filter((p) => levelOf(p.worst) === "low").length;
  const changed = located.filter((item) => item.audit?.behaviour_signals.some((s) => s.name === "location_change")).length;
  const visible = places.filter((p) => (band === "all" || levelOf(p.worst) === band) && p.key.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <PageHead kicker="Geographic fraud intelligence" title="Geographic" accent="Intelligence" text="Where assessed payments came from, and which locations carry the most risk. Locations are captured by the Transaction Analyzer.">
        <button className="btn small primary" onClick={goAnalyze}><Icon name="activity" size={14} /> Add a transaction</button>
      </PageHead>

      <section className="stats-grid four" aria-label="Location metrics">
        <StatCard icon="map" tone="teal" label="Locations" value={places.length} hint="Distinct places observed" />
        <StatCard icon="warn" tone="red" label="High-risk places" value={highPlaces} hint="Worst score 70 or more" />
        <StatCard icon="trend" tone="amber" label="Location changes" value={changed} hint="Unusual-location signal fired" />
        <StatCard icon="activity" tone="blue" label="Located payments" value={located.length} />
      </section>

      <div className="grid-2">
        <section className="panel">
          <PanelHead kicker="Risk overview" title="Geographic risk distribution" icon="map" />
          <DistRow label="High-risk locations" value={highPlaces} total={places.length} tone="red" />
          <DistRow label="Medium-risk locations" value={medPlaces} total={places.length} tone="amber" />
          <DistRow label="Low-risk locations" value={lowPlaces} total={places.length} tone="green" />
        </section>
        <section className="panel">
          <PanelHead kicker="Network telemetry" title="Intelligence coverage" icon="network" />
          <div className="context-grid">
            <div><small>Payments</small><strong>{located.length}</strong></div>
            <div><small>Locations</small><strong>{places.length}</strong></div>
            <div><small>Devices</small><strong>{groupBy(located, (i) => i.device).length}</strong></div>
            <div><small>Beneficiaries</small><strong>{groupBy(located, (i) => i.payee).length}</strong></div>
          </div>
          <p className="muted small" style={{ margin: "12px 0 0" }}>The engine scores the "location changed" flag. The place name itself is context for the analyst and is not scored.</p>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <PanelHead kicker="Investigation tools" title="Search geographic entities" icon="search" />
        <div className="toolbar">
          <div className="search-box"><Icon name="search" size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a city or region" aria-label="Search locations" /></div>
          <select className="f-select" style={{ width: "auto" }} value={band} onChange={(e) => setBand(e.target.value as typeof band)} aria-label="Risk level">
            <option value="all">All risk levels</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </div>
        {visible.length ? (
          <div className="geo-map">
            {visible.map((place) => (
              <article className={`geo-tile ${levelOf(place.worst)}`} key={place.key}>
                <strong><Icon name="map" size={14} /> {place.key}</strong>
                <span className="muted small">{place.total} payment{place.total === 1 ? "" : "s"} · worst {place.worst}/100</span>
                <div className="meter" aria-label={`${place.high} high, ${place.medium} medium, ${place.low} low`}>
                  <i style={{ width: `${(place.high / place.total) * 100}%` }} />
                  <i style={{ width: `${(place.medium / place.total) * 100}%` }} />
                  <i style={{ width: `${(place.low / place.total) * 100}%` }} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon="map" title={places.length ? "No matching locations" : "No locations observed yet"} text={places.length ? "Try another search or risk level." : "Run a transaction with a location in the Transaction Analyzer."} />
        )}
      </section>
    </div>
  );
}
