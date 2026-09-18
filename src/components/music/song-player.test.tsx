import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SongPlayer } from "./song-player";

const song = {
  title: "A shared song",
  artist: "Example artist",
  url: "https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ?si=shared&autoplay=1#saved",
};

describe("song player", () => {
  it("shows safe text and the original fallback without mounting an iframe", () => {
    const { container } = render(<SongPlayer {...song} title={'<img src=x onerror="alert(1)">'} artist="<script>bad()</script>" />);
    expect(screen.getByRole("heading")).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(screen.getByText("<script>bad()</script>")).toBeInTheDocument();
    expect(container.querySelector("img, script, iframe")).toBeNull();
    const link = screen.getByRole("link", { name: /Open original song link.*new tab/ });
    expect(link).toHaveAttribute("href", song.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("button", { name: /Load Spotify player/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("loads on keyboard activation, labels the player, and removes it when closed", async () => {
    const user = userEvent.setup();
    const { container } = render(<SongPlayer {...song} />);
    const trigger = screen.getByRole("button", { name: /Load Spotify player.*A shared song/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    const frame = screen.getByTitle("Spotify player: A shared song — Example artist");
    expect(frame).toHaveAttribute("src", "https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ");
    expect(frame).toHaveAttribute("loading", "lazy");
    expect(frame).toHaveAttribute("allow", "encrypted-media; fullscreen; picture-in-picture");
    expect(frame).toHaveAttribute("width", "100%");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(trigger.getAttribute("aria-controls")!)).toContainElement(frame);
    expect(trigger).toHaveFocus();
    expect(screen.getByText(/preview/)).toBeVisible();
    expect(screen.getByRole("link")).toHaveAttribute("href", song.url);
    await user.keyboard(" ");
    expect(container.querySelector("iframe")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(screen.getByTitle("Spotify player: A shared song — Example artist")).not.toBe(frame);
  });

  it("retains metadata and fallback when provider loading or playback fails", async () => {
    const user = userEvent.setup();
    render(<SongPlayer {...song} />);
    await user.click(screen.getByRole("button"));
    fireEvent.error(screen.getByTitle("Spotify player: A shared song — Example artist"));
    expect(screen.getByRole("heading", { name: song.title })).toBeVisible();
    expect(screen.getByText(song.artist)).toBeVisible();
    expect(screen.getByRole("link")).toHaveAttribute("href", song.url);
    expect(screen.getByText(/doesn’t load|doesn't load/)).toBeVisible();
  });

  it("offers only fallback for safe unsupported URLs", () => {
    const url = "https://music.example.com/saved?version=live#chorus";
    const { container } = render(<SongPlayer {...song} url={url} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", url);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("keeps metadata but creates no link or player for unsafe URLs", () => {
    const { container } = render(<SongPlayer {...song} url="javascript:alert(1)" />);
    expect(screen.getByRole("heading", { name: song.title })).toBeVisible();
    expect(screen.getByText(song.artist)).toBeVisible();
    expect(screen.getByText(/link is unavailable/)).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("mounts only requested history cards with independent accessible controls", async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<>{Array.from({ length: 50 }, (_, index) => <SongPlayer key={index} {...song} title={`Song ${index}`} />)}</>);
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    const first = screen.getByRole("article", { name: "Song 0" });
    const second = screen.getByRole("article", { name: "Song 1" });
    await user.click(within(first).getByRole("button"));
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(within(first).getByRole("button").getAttribute("aria-controls")).not.toBe(within(second).getByRole("button").getAttribute("aria-controls"));
    expect(within(second).getByRole("button")).toHaveAttribute("aria-expanded", "false");
    unmount();
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
  });

  it("closes an old player when the supplied song link changes", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<SongPlayer {...song} />);
    await user.click(screen.getByRole("button"));
    expect(container.querySelector("iframe")).not.toBeNull();
    rerender(<SongPlayer {...song} url="https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });
});
