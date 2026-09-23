export interface NerdReleaseSection {
  readonly items: ReadonlyArray<string>;
  readonly changeCount: number;
  readonly sourceUrl: string;
}

export interface NerdReleaseNotes {
  readonly buildId: string;
  readonly version: string;
  readonly commit: string;
  readonly comparedToPreviousRelease: boolean;
  readonly changelogUrl: string;
  readonly nerd: NerdReleaseSection;
  readonly upstream: NerdReleaseSection | null;
}
