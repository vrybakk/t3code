interface EvidenceExcerpt {
  contents: string;
  startLine: number;
  endLine: number;
}

interface EvidenceFile {
  repository: number;
  path: string;
  excerpts: EvidenceExcerpt[];
}

const mergeExcerpts = (excerpts: ReadonlyArray<EvidenceExcerpt>) => {
  const complete = new Map<number, string>();
  const partial = new Map<number, string>();
  for (const excerpt of excerpts) {
    const lines = excerpt.contents.split("\n");
    const count = excerpt.endLine - excerpt.startLine + 1;
    for (let index = 0; index < count; index++) {
      const line = excerpt.startLine + index;
      if (!complete.has(line)) complete.set(line, lines[index]!);
    }
    const prefix = lines[count];
    const line = excerpt.endLine + 1;
    if (prefix && prefix.length > (partial.get(line)?.length ?? 0)) partial.set(line, prefix);
  }

  const merged: EvidenceExcerpt[] = [];
  for (const [line, contents] of [...complete].sort(([a], [b]) => a - b)) {
    const last = merged.at(-1);
    if (last && last.endLine === line - 1) {
      last.contents += `\n${contents}`;
      last.endLine = line;
    } else {
      merged.push({ contents, startLine: line, endLine: line });
    }
  }
  // Trailing prefixes stay incomplete so later reads can finish the line.
  for (const [line, contents] of partial) {
    if (!complete.has(line)) merged.push({ contents, startLine: line, endLine: line - 1 });
  }
  return merged.sort((a, b) => a.startLine - b.startLine);
};

const charactersIn = (excerpts: ReadonlyArray<EvidenceExcerpt>) =>
  excerpts.reduce((total, excerpt) => total + excerpt.contents.length, 0);

export const createEstimationEvidence = () => {
  const files = new Map<string, EvidenceFile>();
  let revision = 0;
  let characters = 0;
  const touch = (key: string) => {
    const file = files.get(key);
    if (file) {
      files.delete(key);
      files.set(key, file);
    }
  };
  return {
    files: files as ReadonlyMap<string, EvidenceFile>,
    get revision() {
      return revision;
    },
    get characters() {
      return characters;
    },
    touch,
    add: (
      repository: number,
      path: string,
      contents: string,
      startLine: number,
      endLine: number,
    ) => {
      const key = `${repository}:${path}`;
      const previous = files.get(key);
      const incoming = { contents, startLine, endLine };
      let excerpts = mergeExcerpts([...(previous?.excerpts ?? []), incoming]);
      const unchanged =
        previous?.excerpts.length === excerpts.length &&
        excerpts.every((excerpt, index) => {
          const old = previous.excerpts[index]!;
          return (
            old.startLine === excerpt.startLine &&
            old.endLine === excerpt.endLine &&
            old.contents === excerpt.contents
          );
        });
      if (unchanged) {
        touch(key);
        return { changed: false, evicted: [] as string[] };
      }
      const evicted: string[] = [];
      if (charactersIn(excerpts) > 120_000) {
        excerpts = mergeExcerpts([incoming]);
        evicted.push(key);
      }
      characters += charactersIn(excerpts) - charactersIn(previous?.excerpts ?? []);
      files.delete(key);
      files.set(key, { repository, path, excerpts });
      while (files.size > 24 || characters > 120_000) {
        const oldest = files.keys().next().value!;
        characters -= charactersIn(files.get(oldest)!.excerpts);
        files.delete(oldest);
        evicted.push(oldest);
      }
      revision++;
      return { changed: true, evicted };
    },
  };
};
