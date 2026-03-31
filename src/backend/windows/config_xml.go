package windows

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/PrPlanIT/DisplayWizard/src/core"
)

const (
	sysDir     = `C:\VirtualDisplayDriver`
	defaultXML = sysDir + `\vdd_settings.xml`
	driverINF  = sysDir + `\MttVDD.inf`
)

// LoadConfigXML reads and parses the VDD settings XML file.
func LoadConfigXML() (*core.DisplayConfig, error) {
	data, err := os.ReadFile(defaultXML)
	if err != nil {
		if os.IsNotExist(err) {
			return &core.DisplayConfig{MonitorCount: 1}, nil
		}
		return nil, fmt.Errorf("reading config: %w", err)
	}
	return parseConfigXML(string(data))
}

// SaveConfigXML writes the display configuration as VDD settings XML.
func SaveConfigXML(cfg *core.DisplayConfig) error {
	if err := os.MkdirAll(sysDir, 0o755); err != nil {
		return fmt.Errorf("creating driver dir: %w", err)
	}
	xml := renderConfigXML(cfg)
	return os.WriteFile(defaultXML, []byte(xml), 0o644)
}

var (
	reCount  = regexp.MustCompile(`(?i)<count>\s*(\d+)\s*</count>`)
	reGPU    = regexp.MustCompile(`(?i)<friendlyname>([^<]+)</friendlyname>`)
	reResBl  = regexp.MustCompile(`(?is)<resolution>(.*?)</resolution>`)
	reWidth  = regexp.MustCompile(`(?i)<width>\s*(\d+)\s*</width>`)
	reHeight = regexp.MustCompile(`(?i)<height>\s*(\d+)\s*</height>`)
	reHz     = regexp.MustCompile(`(?i)<refresh_rate>\s*(\d+)\s*</refresh_rate>`)
)

func parseConfigXML(xml string) (*core.DisplayConfig, error) {
	cfg := &core.DisplayConfig{MonitorCount: 1}

	if m := reCount.FindStringSubmatch(xml); len(m) > 1 {
		if v, err := strconv.Atoi(m[1]); err == nil {
			cfg.MonitorCount = v
		}
	}
	if m := reGPU.FindStringSubmatch(xml); len(m) > 1 {
		cfg.GPU = m[1]
	}

	for _, block := range reResBl.FindAllStringSubmatch(xml, -1) {
		if len(block) < 2 {
			continue
		}
		content := block[1]

		w, h := 0, 0
		if m := reWidth.FindStringSubmatch(content); len(m) > 1 {
			w, _ = strconv.Atoi(m[1])
		}
		if m := reHeight.FindStringSubmatch(content); len(m) > 1 {
			h, _ = strconv.Atoi(m[1])
		}
		if w == 0 || h == 0 {
			continue
		}

		var rates []int
		for _, rm := range reHz.FindAllStringSubmatch(content, -1) {
			if len(rm) > 1 {
				if hz, err := strconv.Atoi(rm[1]); err == nil && hz > 0 {
					rates = append(rates, hz)
				}
			}
		}

		cfg.Resolutions = append(cfg.Resolutions, core.Resolution{
			Width:        w,
			Height:       h,
			RefreshRates: rates,
		})
	}

	return cfg, nil
}

func renderConfigXML(cfg *core.DisplayConfig) string {
	var b strings.Builder
	b.WriteString("<?xml version='1.0' encoding='utf-8'?>\n")
	b.WriteString("<vdd_settings>\n")
	b.WriteString(fmt.Sprintf("  <monitors>\n    <count>%d</count>\n  </monitors>\n", cfg.MonitorCount))

	gpu := cfg.GPU
	if gpu == "" {
		gpu = "default"
	}
	gpu = strings.ReplaceAll(gpu, "&", "&amp;")
	gpu = strings.ReplaceAll(gpu, "<", "&lt;")
	gpu = strings.ReplaceAll(gpu, ">", "&gt;")
	b.WriteString(fmt.Sprintf("  <gpu>\n    <friendlyname>%s</friendlyname>\n  </gpu>\n", gpu))

	// Global refresh rates
	rateSet := map[int]bool{}
	for _, r := range cfg.Resolutions {
		for _, hz := range r.RefreshRates {
			rateSet[hz] = true
		}
	}
	if len(rateSet) > 0 {
		b.WriteString("  <global>\n")
		for hz := range rateSet {
			b.WriteString(fmt.Sprintf("    <g_refresh_rate>%d</g_refresh_rate>\n", hz))
		}
		b.WriteString("  </global>\n")
	}

	b.WriteString("  <resolutions>\n")
	for _, r := range cfg.Resolutions {
		b.WriteString(fmt.Sprintf("    <resolution>\n      <width>%d</width>\n      <height>%d</height>\n", r.Width, r.Height))
		for _, hz := range r.RefreshRates {
			b.WriteString(fmt.Sprintf("      <refresh_rate>%d</refresh_rate>\n", hz))
		}
		b.WriteString("    </resolution>\n")
	}
	b.WriteString("  </resolutions>\n")
	b.WriteString("  <options>\n    <CustomEdid>false</CustomEdid>\n    <PreventSpoof>false</PreventSpoof>\n    <EdidCeaOverride>false</EdidCeaOverride>\n    <HardwareCursor>true</HardwareCursor>\n    <SDR10bit>false</SDR10bit>\n    <HDRPlus>false</HDRPlus>\n    <logging>false</logging>\n    <debuglogging>false</debuglogging>\n  </options>\n")
	b.WriteString("</vdd_settings>")
	return b.String()
}

// BackupDir returns the path to the backup directory.
func BackupDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, "AppData", "Roaming", "DisplayWizard", "Backups")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}
