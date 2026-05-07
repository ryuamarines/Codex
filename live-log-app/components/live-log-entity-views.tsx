"use client";

import { useEffect, useMemo, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import type { PositionedDashboardTile, AnalyticsTileId, TileHeight } from "@/lib/analytics-dashboard";
import type { TrendBucket } from "@/lib/live-analytics";
import type { LiveEntry } from "@/lib/types";

type EntityArchive = {
  label: string;
  count: number;
  firstDate: string;
  lastDate: string;
  place?: string;
  aliases?: string[];
  years?: TrendBucket[];
  entries: LiveEntry[];
};

type ArtistsViewProps = {
  artists: EntityArchive[];
  selectedArtistLabel: string;
  onSelectArtist(artist: string): void;
  onSelectEntry(entryId: string): void;
  onBrowseArtistHistory(artist: string, year?: string): void;
  onAddAlias(alias: string, canonicalName: string): void;
  onSeparateAlias(alias: string): void;
  getLeadArtist(entry: LiveEntry): string;
  analyticsTileRefs: MutableRefObject<Partial<Record<AnalyticsTileId, HTMLDivElement | null>>>;
  resolvedAnalyticsTileHeights: Record<AnalyticsTileId, TileHeight>;
  renderArtistTrendTile(focusedArtistLabel?: string): ReactNode;
};

export function LiveLogArtistsView({
  artists,
  selectedArtistLabel,
  onSelectArtist,
  onSelectEntry,
  onBrowseArtistHistory,
  onAddAlias,
  onSeparateAlias,
  getLeadArtist,
  analyticsTileRefs,
  resolvedAnalyticsTileHeights,
  renderArtistTrendTile
}: ArtistsViewProps) {
  const [artistQuery, setArtistQuery] = useState("");
  const [artistAliasInput, setArtistAliasInput] = useState("");
  const [selectedArtistYear, setSelectedArtistYear] = useState<string>("");
  const normalizedArtistQuery = artistQuery.trim().toLowerCase();
  const filteredArtists = useMemo(() => {
    if (!normalizedArtistQuery) {
      return artists;
    }

    return artists.filter((artist) => artist.label.toLowerCase().includes(normalizedArtistQuery));
  }, [artists, normalizedArtistQuery]);
  const selectedArtist = artists.find((item) => item.label === selectedArtistLabel) ?? artists[0] ?? null;
  const selectedArtistYears = useMemo(
    () => [...(selectedArtist?.years ?? [])].sort((left, right) => right.label.localeCompare(left.label, "ja")),
    [selectedArtist]
  );
  const selectedArtistYearEntries = useMemo(() => {
    if (!selectedArtist) {
      return [];
    }

    const sortedEntries = [...selectedArtist.entries].sort((left, right) => right.date.localeCompare(left.date, "ja"));

    if (!selectedArtistYear) {
      return sortedEntries;
    }

    return sortedEntries.filter((entry) => entry.date.startsWith(selectedArtistYear));
  }, [selectedArtist, selectedArtistYear]);
  const visibleArtists = useMemo(() => {
    if (!selectedArtist) {
      return filteredArtists;
    }

    if (filteredArtists.some((artist) => artist.label === selectedArtist.label)) {
      return filteredArtists;
    }

    return [selectedArtist, ...filteredArtists];
  }, [filteredArtists, selectedArtist]);

  useEffect(() => {
    if (!selectedArtistYear) {
      return;
    }

    const selectedYearMatches = (selectedArtist?.years ?? []).some(
      (item) => item.label === selectedArtistYear && item.count > 0
    );

    if (!selectedYearMatches) {
      setSelectedArtistYear("");
    }
  }, [selectedArtist, selectedArtistYear]);

  return (
    <section className="archiveEntityLayout">
      <section className="panel archiveEntityListPanel">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Artists</p>
            <h2>アーティスト</h2>
            <p>{normalizedArtistQuery ? "検索結果" : "記録済みのアーティストを参加回数順に表示しています。"}</p>
          </div>
        </div>
        <div className="searchBox archiveEntitySearchBox">
          <span>検索</span>
          <input
            value={artistQuery}
            onChange={(event) => setArtistQuery(event.target.value)}
            placeholder="アーティスト名で絞り込む"
          />
        </div>
        <div className="archiveEntityList">
          {visibleArtists.map((artist) => (
            <button
              key={artist.label}
              className={selectedArtist?.label === artist.label ? "archiveEntityItem archiveEntityItemActive" : "archiveEntityItem"}
              type="button"
              onClick={() => onSelectArtist(artist.label)}
            >
              <strong>{artist.label}</strong>
              <span>{artist.count}回</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel archiveEntityDetailPanel">
        {selectedArtist ? (
          <>
            <div className="archiveSectionHeader">
              <div>
                <p className="eyebrow">Artist Detail</p>
                <h2>{selectedArtist.label}</h2>
                {selectedArtist.aliases && selectedArtist.aliases.length > 0 ? (
                  <div className="archiveEntityAliasList">
                    <span>まとめた表記</span>
                    {selectedArtist.aliases.map((alias) => (
                      <button key={alias} type="button" onClick={() => onSeparateAlias(alias)}>
                        {alias} を別に扱う
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <form
              className="archiveEntityAliasForm"
              onSubmit={(event) => {
                event.preventDefault();
                onAddAlias(artistAliasInput, selectedArtist.label);
                setArtistAliasInput("");
              }}
            >
              <input
                value={artistAliasInput}
                onChange={(event) => setArtistAliasInput(event.target.value)}
                placeholder="同じ扱いにする別表記"
              />
              <button className="toolButton compactToolButton" type="submit" disabled={!artistAliasInput.trim()}>
                同じ扱いにする
              </button>
            </form>
            <div className="archiveEntityStats">
              <article className="archiveStat">
                <span>総ライブ回数</span>
                <strong>{selectedArtist.count}</strong>
              </article>
              <article className="archiveStat">
                <span>初めて見た日</span>
                <strong>{selectedArtist.firstDate || "-"}</strong>
              </article>
              <article className="archiveStat">
                <span>最後に見た日</span>
                <strong>{selectedArtist.lastDate || "-"}</strong>
              </article>
            </div>
            <div className="archiveMiniTrend">
              {selectedArtistYears.map((item) => (
                <button
                  key={item.label}
                  className={
                    selectedArtistYear === item.label
                      ? "archiveMiniTrendBar archiveMiniTrendBarActive"
                      : "archiveMiniTrendBar"
                  }
                  type="button"
                  onClick={() => setSelectedArtistYear((current) => (current === item.label ? "" : item.label))}
                >
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
            </div>
            {selectedArtistYear ? (
              <button
                className="archiveEntityFilterBadge"
                type="button"
                onClick={() => setSelectedArtistYear("")}
              >
                {selectedArtistYear}年で絞り込み中
              </button>
            ) : null}
            <div className="archiveLinkedList">
              {selectedArtistYearEntries.map((entry) => (
                <button
                  key={entry.id}
                  className="archiveLinkedItem"
                  type="button"
                  onClick={() => onSelectEntry(entry.id)}
                >
                  <strong>{getLeadArtist(entry)}</strong>
                  <span>{entry.title}</span>
                  <small>
                    {entry.date} / {entry.venue}
                  </small>
                </button>
              ))}
            </div>
            <button
              className="archiveEntityListHintButton"
              type="button"
              onClick={() => onBrowseArtistHistory(selectedArtist.label, selectedArtistYear || undefined)}
            >
              タイムラインでこのアーティストを辿る
            </button>
          </>
        ) : null}
      </section>
      <div
        ref={(element) => {
          analyticsTileRefs.current.artistYearStackedChart = element;
        }}
        className={`analyticsBoardTile analyticsBoardTile-${resolvedAnalyticsTileHeights.artistYearStackedChart} archiveEntityAnalyticsPanel`}
      >
        {renderArtistTrendTile(selectedArtist?.label ?? "")}
      </div>
    </section>
  );
}

type VenuesViewProps = {
  venues: EntityArchive[];
  selectedVenueLabel: string;
  onSelectVenue(venue: string): void;
  onSelectEntry(entryId: string): void;
  onAddAlias(alias: string, canonicalName: string): void;
  onSeparateAlias(alias: string): void;
  getLeadArtist(entry: LiveEntry): string;
  venueTiles: PositionedDashboardTile[];
  analyticsTileRefs: MutableRefObject<Partial<Record<AnalyticsTileId, HTMLDivElement | null>>>;
  resolvedAnalyticsTileHeights: Record<AnalyticsTileId, TileHeight>;
  tileMap: Record<AnalyticsTileId, ReactNode>;
  dashboardRowCount: number;
};

export function LiveLogVenuesView({
  venues,
  selectedVenueLabel,
  onSelectVenue,
  onSelectEntry,
  onAddAlias,
  onSeparateAlias,
  getLeadArtist,
  venueTiles,
  analyticsTileRefs,
  resolvedAnalyticsTileHeights,
  tileMap,
  dashboardRowCount
}: VenuesViewProps) {
  const [venueAliasInput, setVenueAliasInput] = useState("");
  const selectedVenue = venues.find((item) => item.label === selectedVenueLabel) ?? venues[0] ?? null;

  return (
    <section className="archiveEntityLayout">
      <section className="panel archiveEntityListPanel">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Venues</p>
            <h2>会場</h2>
          </div>
        </div>
        <div className="archiveEntityList">
          {venues.map((venue) => (
            <button
              key={venue.label}
              className={selectedVenue?.label === venue.label ? "archiveEntityItem archiveEntityItemActive" : "archiveEntityItem"}
              type="button"
              onClick={() => onSelectVenue(venue.label)}
            >
              <strong>{venue.label}</strong>
              <span>{venue.count}回</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel archiveEntityDetailPanel">
        {selectedVenue ? (
          <>
            <div className="archiveSectionHeader">
              <div>
                <p className="eyebrow">Venue Detail</p>
                <h2>{selectedVenue.label}</h2>
                {selectedVenue.aliases && selectedVenue.aliases.length > 0 ? (
                  <div className="archiveEntityAliasList">
                    <span>まとめた表記</span>
                    {selectedVenue.aliases.map((alias) => (
                      <button key={alias} type="button" onClick={() => onSeparateAlias(alias)}>
                        {alias} を別に扱う
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <form
              className="archiveEntityAliasForm"
              onSubmit={(event) => {
                event.preventDefault();
                onAddAlias(venueAliasInput, selectedVenue.label);
                setVenueAliasInput("");
              }}
            >
              <input
                value={venueAliasInput}
                onChange={(event) => setVenueAliasInput(event.target.value)}
                placeholder="同じ扱いにする別表記"
              />
              <button className="toolButton compactToolButton" type="submit" disabled={!venueAliasInput.trim()}>
                同じ扱いにする
              </button>
            </form>
            <div className="archiveEntityStats">
              <article className="archiveStat">
                <span>訪問回数</span>
                <strong>{selectedVenue.count}</strong>
              </article>
              <article className="archiveStat">
                <span>エリア</span>
                <strong>{selectedVenue.place || "-"}</strong>
              </article>
              <article className="archiveStat">
                <span>最後に行った日</span>
                <strong>{selectedVenue.lastDate || "-"}</strong>
              </article>
            </div>
            <div className="archiveLinkedList">
              {selectedVenue.entries.map((entry) => (
                <button
                  key={entry.id}
                  className="archiveLinkedItem"
                  type="button"
                  onClick={() => onSelectEntry(entry.id)}
                >
                  <strong>{getLeadArtist(entry)}</strong>
                  <span>{entry.title}</span>
                  <small>
                    {entry.date} / {entry.venue}
                  </small>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </section>
      <section className="archiveEntityAnalyticsPanel">
        <div
          className="analyticsBoardGrid"
          style={{ gridTemplateRows: `repeat(${dashboardRowCount}, minmax(0, 1fr))` }}
        >
          {venueTiles.map((tile) => (
            <div
              key={tile.id}
              ref={(element) => {
                analyticsTileRefs.current[tile.id] = element;
              }}
              className={`analyticsBoardTile analyticsBoardTile-${resolvedAnalyticsTileHeights[tile.id]}`}
              style={{
                gridColumn: `${tile.colStart} / span ${tile.colSpan}`,
                gridRow: `${tile.rowStart} / span ${tile.rowSpan}`
              }}
            >
              {tileMap[tile.id]}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
