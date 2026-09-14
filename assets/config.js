// Study configuration. Everything a non-programmer needs to change lives here.
window.STUDY_CONFIG = {
  // URL of the Cloudflare Worker that commits responses to this repo.
  // Leave empty to run the site in offline mode: participants get a JSON file
  // to download and send you, and nothing is transmitted.
  submitEndpoint: "",

  // How many clips each participant is shown. 0 means all of them.
  // Clips are drawn at random per participant, so coverage evens out across
  // participants even when this is small.
  clipsPerParticipant: 0,

  // Shown on the intro screen. Rough minutes; purely informational.
  estimatedMinutes: 15,

  // Allow a participant who closes the tab to resume where they left off.
  allowResume: true,

  // When false, every participant sees the methods in the same fixed order,
  // taken from the `methods` order in assets/clips.json (edit the RANKED dict
  // in scripts/build_manifest.py to change it). Methods are still shown as
  // A-F rather than by name, so participants cannot tell which is which, but
  // a consistent position means any position bias applies to the same method
  // throughout rather than averaging out.
  // Set to true to reshuffle per clip per participant.
  randomizeMethodOrder: false,

  // Order in which clips are presented. Independent of the above, and safe to
  // leave on: it spreads fatigue effects evenly over clips.
  randomizeClipOrder: true,

  // Fall back to a file download if the endpoint is unreachable, so a network
  // failure at the last step never costs you a completed session.
  downloadOnFailure: true,
};
