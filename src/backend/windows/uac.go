package windows

// UAC elevation strategy:
//
// The Go backend DETECTS elevation status but does NOT self-relaunch.
// Self-relaunch is a GUI/transport concern:
//   - Electron: Start-Process -Verb RunAs (already implemented in ui/desktop)
//   - CLI: user runs "dwiz apply" from an elevated terminal
//   - API server: must be started elevated (systemd/service/scheduled task)
//
// The backend returns a clear error when elevation is required.
// Consumers decide how to handle it (prompt user, relaunch, fail).
//
// isAdmin() in powershell.go provides the detection.
// requireAdmin() in executor.go gates operations that need elevation.
