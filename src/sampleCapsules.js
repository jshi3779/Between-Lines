// Example time capsules for the built-in notebooks, so the shelf's time tab has something to show
// before the user seals pages of their own. Open dates are relative to today; a notebook keeps
// whatever it has once it's been opened and saved. Spreads start on page 3 (except the one already
// open), so page 1 with the usage guide stays writable.

const inDays = (days) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const SAMPLE_CAPSULES = {
  green: [{ id: "sample-green", spreads: [3], openAt: inDays(4) }],
  bpink: [{ id: "sample-bpink", spreads: [3, 5], openAt: inDays(23) }],
  bnavy: [{ id: "sample-bnavy", spreads: [3], openAt: inDays(75) }],
  dnavy: [{ id: "sample-dnavy", spreads: [3], openAt: inDays(200) }],
  gray: [{ id: "sample-gray", spreads: [3], openAt: inDays(365) }],
  bred: [{ id: "sample-bred", spreads: [1], openAt: inDays(-20) }],
};

// Enough pages for every sealed spread to exist.
export const pagesForCapsules = (capsules) => Math.max(1, ...capsules.flatMap((capsule) => capsule.spreads.map((page) => page + 1)));
