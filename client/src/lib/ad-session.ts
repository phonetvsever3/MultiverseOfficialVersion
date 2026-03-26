// Module-level Set shared across all pages.
// When any page shows a fullscreen ad before navigating to a movie,
// it marks that movie's ID here so MovieView skips its own ad.
export const fullscreenAdShownFor = new Set<number>();
