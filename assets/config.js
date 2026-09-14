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

  // Fall back to a file download if the endpoint is unreachable, so a network
  // failure at the last step never costs you a completed session.
  downloadOnFailure: true,
};
