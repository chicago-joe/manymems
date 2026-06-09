// useCheckpoints — thin alias over useCommits for the CheckpointFeed component.
// useCommits already fetches /api/provenance/commits and returns CommitRecord[].
import { useCommits } from './useCommits';

export function useCheckpoints() {
  const { commits, isLoading, error, refresh } = useCommits();
  return { checkpoints: commits, isLoading, error, refresh };
}
