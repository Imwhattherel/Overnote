'use strict';
// Explicitly allowed timeouts. Old configurations default to Off.
const ALLOWED = Object.freeze([0, 1, 5, 15, 30, 60]);
function normalizeMinutes(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && ALLOWED.includes(parsed) ? parsed : 0;
}
function shouldLock(minutes, idleMilliseconds, unlockedNoteCount) {
  const timeout = normalizeMinutes(minutes);
  return timeout > 0 && unlockedNoteCount > 0 && Number.isFinite(idleMilliseconds) && idleMilliseconds >= timeout * 60000;
}
module.exports = { normalizeMinutes, shouldLock, ALLOWED };
