// three.js is loaded as a UMD global from jsdelivr (artifact CSP allowlist).
// Every module imports it from here so there is exactly one seam to swap.
export const THREE = window.THREE;
