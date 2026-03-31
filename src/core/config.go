package core

// DisplayConfig represents the virtual display driver configuration.
type DisplayConfig struct {
	MonitorCount int
	GPU          string
	Resolutions  []Resolution
}

// Resolution defines a display resolution with refresh rates.
type Resolution struct {
	Width        int
	Height       int
	RefreshRates []int
}

// Backup represents a saved configuration snapshot.
type Backup struct {
	Name string
	Path string
}
