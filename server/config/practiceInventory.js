/**
 * Deterministic isolation of known project-created practice/fixture listings.
 *
 * NOT a provenance model. NOT a price heuristic. NOT "missing UPRN ⇒ demo".
 * NOT an address/title similarity classifier.
 *
 * Only explicitly named Email Test fixtures created for product email-flow
 * checks. Those titles are project-authored fixture names, not a guess from
 * price or missing identity.
 *
 * The Data/Demo Truth Gate's APPROVED practice inventory (Hospital Street
 * clones, id 35 Bull Street title, B1 2UJ rows including 166/167) has:
 *   - no is_demo / is_synthetic / provenance column
 *   - no seed/fixture INSERT that names those rows
 *   - the same owner as real validation listing 153 (88 Colmore Row)
 * Those approved rows are intentionally NOT classified here.
 * Email Test isolation does not close P1_DEMO_ISOLATION_DEFECT.
 */

const KNOWN_PRACTICE_FIXTURE_TITLES = Object.freeze([
  'Email Test Property',
  'Email Test Property 3',
]);

function isKnownPracticeInventoryListing(row) {
  if (!row || typeof row !== 'object') return false;
  const title = String(row.title || '').trim().toLowerCase();
  if (!title) return false;
  return KNOWN_PRACTICE_FIXTURE_TITLES.some((known) => known.toLowerCase() === title);
}

function excludeKnownPracticeInventory(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => !isKnownPracticeInventoryListing(row));
}

module.exports = {
  KNOWN_PRACTICE_FIXTURE_TITLES,
  isKnownPracticeInventoryListing,
  excludeKnownPracticeInventory,
};
