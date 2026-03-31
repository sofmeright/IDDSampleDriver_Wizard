package core

// DesiredState represents the operator's declared intent.
// Consumers (CLI, API, UI) construct this. Engine diffs against CurrentState.
// nil fields mean "don't touch" — only non-nil fields trigger operations.
// ALL execution flows through DesiredState → Plan → Execute. No exceptions.
type DesiredState struct {
	Driver   *DriverSpec    // nil = don't touch driver
	Displays []DisplaySpec  // desired display configuration
	Config   *DisplayConfig // nil = don't touch config
	Backup   *BackupSpec    // nil = no backup operation
}

// DriverSpec declares the desired driver state.
type DriverSpec struct {
	Installed bool           // true = ensure installed, false = ensure removed
	Reload    bool           // true = reload driver (must already be installed)
	Package   *DriverPackage // source for installation (nil if removing)
}

// DisplaySpec declares the desired state of a single display.
type DisplaySpec struct {
	MonitorCount int
	Resolutions  []Resolution
}

// BackupSpec declares a backup intent.
// Exactly one of Create or Restore should be set.
type BackupSpec struct {
	Create  string // non-empty = create backup with this name
	Restore string // non-empty = restore backup with this name
}
