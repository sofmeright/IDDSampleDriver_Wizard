package core

// CurrentState represents the observed system state from the OS.
// Populated by Backend.Discover(). Engine diffs this against DesiredState.
type CurrentState struct {
	Driver   DriverState
	Displays []Display
	GPUs     []GPU
	Config   *DisplayConfig
	Backups  []Backup
}
