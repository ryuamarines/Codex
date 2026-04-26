import { decodeShareSnapshot } from "@/lib/live-log-share-snapshot";

type ShareSnapshotPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ShareSnapshotPage({ searchParams }: ShareSnapshotPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawData = resolvedSearchParams.data;
  const payload = Array.isArray(rawData) ? rawData[0] : rawData;
  const snapshot = payload ? decodeShareSnapshot(payload) : null;

  if (!snapshot) {
    return (
      <main className="shareSnapshotPage">
        <section className="shareSnapshotCard">
          <p className="shareSnapshotEyebrow">Live Log Share</p>
          <h1>共有スナップショットを開けませんでした。</h1>
          <p>URL が不完全か、共有データの形式が古い可能性があります。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shareSnapshotPage">
      <section className="shareSnapshotCard">
        <div className="shareSnapshotHeader">
          <div>
            <p className="shareSnapshotEyebrow">Live Log Share</p>
            <h1>{snapshot.title}</h1>
            {snapshot.subtitle ? <p>{snapshot.subtitle}</p> : null}
          </div>
          <span className="shareSnapshotGeneratedAt">
            {new Date(snapshot.generatedAt).toLocaleString("ja-JP")}
          </span>
        </div>

        {snapshot.kind === "summary" ? (
          <section className="shareSnapshotMetricGrid">
            {snapshot.metrics.map((metric) => (
              <article key={metric.label} className="shareSnapshotMetricCard">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </section>
        ) : null}

        {snapshot.kind === "aggregate" ? (
          <section className="shareSnapshotList">
            {snapshot.items.map((item, index) => (
              <div key={`${item.label}-${index}`} className="shareSnapshotListItem">
                <span>{index + 1}</span>
                <strong>{item.label}</strong>
                <small>{item.count}回</small>
              </div>
            ))}
          </section>
        ) : null}

        {snapshot.kind === "trend" ? (
          <section className="shareSnapshotTrend">
            {snapshot.items.map((item) => (
              <div key={item.label} className="shareSnapshotTrendRow">
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </section>
        ) : null}

        {snapshot.kind === "artistYears" ? (
          <>
            <div className="shareSnapshotArtistYearHeader">
              {snapshot.years.map((year) => (
                <span key={year}>{year}</span>
              ))}
            </div>
            <section className="shareSnapshotArtistYearList">
              {snapshot.items.map((item) => (
                <div key={item.artist} className="shareSnapshotArtistYearRow">
                  <div className="shareSnapshotArtistYearMeta">
                    <strong>{item.artist}</strong>
                    <span>{item.total}回</span>
                  </div>
                  <div className="shareSnapshotArtistYearValues">
                    {snapshot.years.map((year) => (
                      <span key={`${item.artist}-${year}`}>{item.countsByYear[year] ?? 0}</span>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </>
        ) : null}

        {snapshot.kind === "artistStacked" ? (
          <>
            <div className="shareSnapshotArtistYearHeader">
              {snapshot.years.map((year) => (
                <span key={year}>{year}</span>
              ))}
            </div>
            <section className="shareSnapshotArtistYearList">
              {snapshot.items.map((item) => (
                <div key={item.artist} className="shareSnapshotArtistYearRow">
                  <div className="shareSnapshotArtistYearMeta">
                    <strong>{item.artist}</strong>
                    <span>{item.total}回</span>
                  </div>
                  <div className="shareSnapshotArtistYearValues">
                    {snapshot.years.map((year) => (
                      <span key={`${item.artist}-${year}`}>{item.countsByYear[year] ?? 0}</span>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </>
        ) : null}

        {snapshot.kind === "yearly" ? (
          <>
            <section className="shareSnapshotMetricGrid">
              {snapshot.metrics.map((metric) => (
                <article key={metric.label} className="shareSnapshotMetricCard">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </article>
              ))}
            </section>
            <section className="shareSnapshotSectionStack">
              {snapshot.sections.map((section) => (
                <article key={section.label} className="shareSnapshotSectionCard">
                  <h2>{section.label}</h2>
                  <div className="shareSnapshotList">
                    {section.items.map((item, index) => (
                      <div key={`${section.label}-${item.label}`} className="shareSnapshotListItem">
                        <span>{index + 1}</span>
                        <strong>{item.label}</strong>
                        <small>{item.count}回</small>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
