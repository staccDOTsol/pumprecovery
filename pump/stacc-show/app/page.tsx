import { statusAll, REGISTRY_BRAND } from "@/lib/mirrors";
import { getSolPrice, earningsByReferrer } from "@/lib/earnings";
import { MIRROR_WARNING } from "@/lib/warning";

// Always reflect live mirror status + earnings.
export const dynamic = "force-dynamic";

const host = (o: string) => o.replace(/^https?:\/\//, "");
const shortRef = (r: string) => `${r.slice(0, 4)}…${r.slice(-4)}`;
const usd = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function Page() {
  const statuses = await statusAll();
  const best = statuses.find((s) => s.ok)?.origin ?? null;
  const solPrice = await getSolPrice();
  const earnings = await earningsByReferrer(
    statuses.map((s) => s.defaultReferrer).filter(Boolean) as string[],
    solPrice
  );
  const totalEarnings = Object.values(earnings).reduce((a, b) => a + b, 0);

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 28, margin: 0 }}>{REGISTRY_BRAND}</h1>
      <p style={{ color: "#9aa", marginTop: 4 }}>
        you&rsquo;re here for the stacc/jare show — it plays across a few mirrors.
        grab a live one below.
      </p>
      <p
        style={{
          marginTop: 12,
          fontSize: 15,
          color: "#cfe9d6",
          borderLeft: "3px solid #7cfc9b",
          paddingLeft: 12,
          fontStyle: "italic",
        }}
      >
        you managed to get google to b&amp; stacc.art: I raise you a game of
        whack-a-mole.
      </p>

      <section
        style={{
          border: "2px solid #ff5252",
          background: "#2a0d0d",
          color: "#ffd7d7",
          borderRadius: 10,
          padding: 16,
          margin: "20px 0",
          lineHeight: 1.55,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: "#ff7676",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          ⚠ Read this before you click anything
        </div>
        {MIRROR_WARNING}
      </section>

      {best && (
        <a
          href={best}
          style={{
            display: "inline-block",
            background: "#7cfc9b",
            color: "#06210f",
            fontWeight: 700,
            padding: "12px 18px",
            borderRadius: 8,
            textDecoration: "none",
            marginBottom: 18,
          }}
        >
          Take me to the show → {host(best)}
        </a>
      )}

      <h2 style={{ fontSize: 16, color: "#cfd", marginTop: 8 }}>
        now playing <span style={{ color: "#667", fontWeight: 400 }}>(mirrors)</span>
      </h2>

      {statuses.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {statuses.map((s) => {
            const earned = s.defaultReferrer ? earnings[s.defaultReferrer] ?? 0 : 0;
            return (
              <li
                key={s.origin}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px solid #1e2a22",
                  borderRadius: 8,
                  marginBottom: 8,
                  background: "#0e1410",
                  flexWrap: "wrap",
                }}
              >
                <span
                  title={s.ok ? "online" : "offline / unreachable"}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: s.ok ? "#3ddc84" : "#ff5252",
                    flex: "0 0 auto",
                  }}
                />
                <a href={s.origin} style={{ flex: 1, minWidth: 140 }}>
                  {host(s.origin)}
                </a>
                {s.defaultReferrer ? (
                  <span style={{ fontSize: 12, color: "#8ab", display: "flex", gap: 8, alignItems: "center" }}>
                    <a
                      href={`https://solscan.io/account/${s.defaultReferrer}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`top-level referrer ${s.defaultReferrer}`}
                      style={{ color: "#8ab" }}
                    >
                      ref {shortRef(s.defaultReferrer)}
                    </a>
                    <span style={{ color: solPrice ? "#7cfc9b" : "#667" }}>
                      {solPrice ? `≈ ${usd(earned)}` : "—"}
                    </span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "#667" }}>no top-level ref set</span>
                )}
                <span
                  style={{
                    color: s.ok ? "#3ddc84" : "#ff7676",
                    fontSize: 12,
                    minWidth: 54,
                    textAlign: "right",
                  }}
                >
                  {s.ok ? "online" : "offline"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ color: "#778" }}>
          No mirrors yet. They self-register the first time their users hit the
          shared backend.
        </p>
      )}

      <p style={{ color: "#8ab", fontSize: 13, marginTop: 14 }}>
        Total est. referral earnings across mirrors:{" "}
        <strong style={{ color: "#7cfc9b" }}>
          {solPrice ? usd(totalEarnings) : "—"}
        </strong>{" "}
        <span style={{ color: "#667" }}>
          (recent on-chain inflow to each mirror&rsquo;s top-level referrer; estimate)
        </span>
      </p>

      <p style={{ color: "#778", fontSize: 12, marginTop: 18 }}>
        Deep links pass through: <code>{REGISTRY_BRAND}/&lt;path&gt;?ref=…</code>{" "}
        forwards to a working mirror, preserving the path and your referral.{" "}
        Want your own stage?{" "}
        <a
          href="https://github.com/staccDOTsol/pumprecovery/blob/main/pump/pump-v2-frontend/README.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          deploy your own mirror ↗
        </a>
      </p>
      <footer
        style={{
          color: "#566",
          fontSize: 12,
          marginTop: 16,
          borderTop: "1px solid #1e2a22",
          paddingTop: 12,
        }}
      >
        open-source ·{" "}
        <a href="https://github.com/staccDOTsol/pumprecovery">github</a> · not
        affiliated with or endorsed by pump.fun
      </footer>
    </main>
  );
}
