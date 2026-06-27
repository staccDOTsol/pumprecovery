import { statusAll, getMirrors, REGISTRY_BRAND } from "@/lib/mirrors";
import { MIRROR_WARNING } from "@/lib/warning";

// Always reflect live mirror status.
export const dynamic = "force-dynamic";

const host = (o: string) => o.replace(/^https?:\/\//, "");

export default async function Page() {
  const statuses = await statusAll();
  const best = statuses.find((s) => s.ok)?.origin ?? null;
  const anyMirrors = getMirrors().length > 0;

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 28, margin: 0 }}>{REGISTRY_BRAND}</h1>
      <p style={{ color: "#9aa", marginTop: 4 }}>
        you&rsquo;re here for the stacc/jare show — it plays across a few mirrors.
        grab a live one below.
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
      {anyMirrors ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {statuses.map((s) => (
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
              <a href={s.origin} style={{ flex: 1 }}>
                {host(s.origin)}
              </a>
              <span
                style={{
                  color: s.ok ? "#3ddc84" : "#ff7676",
                  fontSize: 12,
                }}
              >
                {s.ok ? "online" : "offline"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: "#778" }}>
          No mirrors configured yet. Set <code>NEXT_PUBLIC_MIRRORS</code> (comma-separated origins).
        </p>
      )}

      <p style={{ color: "#778", fontSize: 12, marginTop: 24 }}>
        Deep links pass through: <code>{REGISTRY_BRAND}/&lt;path&gt;?ref=…</code>{" "}
        forwards to a working mirror, preserving the path and your referral.
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
