"use client";

import { useId, useState } from "react";
import { parseSongLink } from "@/lib/music/song-link";
import styles from "./song-player.module.css";

export type SongPlayerProps = { title: string; artist: string; url: string };

export function SongPlayer(props: SongPlayerProps) {
  // Replacing an entry's link must also stop and close the previous player.
  return <SongCard key={props.url} {...props} />;
}

function SongCard({ title, artist, url }: SongPlayerProps) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const link = parseSongLink(url);

  return (
    <article className={styles.card} aria-labelledby={`${id}-title`}>
      <div className={styles.metadata}>
        <p className={styles.eyebrow}>Shared song</p>
        <h3 className={styles.title} id={`${id}-title`}>{title}</h3>
        <p className={styles.artist}>{artist}</p>
      </div>

      {link.kind === "spotify" && (
        <>
          <button
            className={styles.toggle}
            type="button"
            aria-expanded={expanded}
            aria-controls={`${id}-player`}
            aria-label={`${expanded ? "Close" : "Load"} Spotify player for ${title}`}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Close player" : "Load player"}
          </button>
          <div id={`${id}-player`} hidden={!expanded}>
            {expanded && (
              <>
                <p className={styles.help} id={`${id}-help`}>
                  Press play in Spotify below. A preview may be all that’s available.
                  If the player doesn’t load or play, use the original song link.
                </p>
                <iframe
                  className={styles.frame}
                  src={link.embedUrl}
                  title={`Spotify player: ${title} — ${artist}`}
                  aria-describedby={`${id}-help`}
                  width="100%"
                  height="352"
                  loading="lazy"
                  allow="encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                />
              </>
            )}
          </div>
        </>
      )}

      {link.kind === "invalid" ? (
        <p className={styles.help}>The saved song link is unavailable.</p>
      ) : (
        <a className={styles.link} href={link.originalUrl} target="_blank" rel="noopener noreferrer">
          Open original song link <span className={styles.newTab}>(new tab)</span>
        </a>
      )}
    </article>
  );
}
