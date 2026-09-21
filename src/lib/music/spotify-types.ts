export type SpotifyTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  url: string;
  image: string | null;
  selectable: boolean;
};
export type SpotifyPage = { tracks: SpotifyTrack[]; more: boolean };
