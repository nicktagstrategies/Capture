/**
 * Pure helpers for the review flow. Kept out of `routes/reviews.ts` so they
 * can be unit-tested without spinning up Prisma.
 */

export interface RatingAggregate {
  avgRating: number;
  ratingCount: number;
}

/**
 * Folds a new rating into an existing aggregate. Equivalent to
 * `sum(ratings) / count(ratings)` but avoids scanning every review on every
 * write — we just keep the running total via `oldAvg * oldCount`.
 *
 * Loses precision over very long lifetimes (millions of reviews) due to
 * floating-point drift; periodic recompute jobs would correct that. Out of
 * scope for V1.
 */
export function foldRating(oldAggregate: RatingAggregate, newRating: number): RatingAggregate {
  if (newRating < 1 || newRating > 5 || !Number.isFinite(newRating)) {
    throw new RangeError('rating must be in [1, 5]');
  }
  const newCount = oldAggregate.ratingCount + 1;
  const newAvg = (oldAggregate.avgRating * oldAggregate.ratingCount + newRating) / newCount;
  return { avgRating: newAvg, ratingCount: newCount };
}
