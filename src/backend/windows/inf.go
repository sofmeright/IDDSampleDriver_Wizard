package windows

import (
	"os"
	"regexp"
	"strings"
)

// INFMeta holds parsed metadata from a driver INF file.
type INFMeta struct {
	HWID        string // e.g. "Root\\MTTVDD"
	ClassName   string // e.g. "Display"
	ClassGuid   string // e.g. "{4d36e968-e325-11ce-bfc1-08002be10318}"
	ServiceName string // e.g. "MttVDD"
}

// DefaultINFMeta returns fallback values used when the INF can't be parsed.
func DefaultINFMeta() INFMeta {
	return INFMeta{
		HWID:        `Root\MTTVDD`,
		ClassName:   "Display",
		ClassGuid:   "{4d36e968-e325-11ce-bfc1-08002be10318}",
		ServiceName: "MttVDD",
	}
}

var (
	reClass   = regexp.MustCompile(`(?im)^\s*Class\s*=\s*([^\r\n#;]+)`)
	reGuid    = regexp.MustCompile(`(?im)^\s*ClassGuid\s*=\s*(\{[^}]+\})`)
	reHWID    = regexp.MustCompile(`(?i),\s*(Root\\[A-Za-z0-9_\\\-.]+)`)
	reService = regexp.MustCompile(`(?im)^\s*AddService\s*=\s*([^\s,;#]+)`)
)

// ParseINF reads and extracts metadata from a driver INF file.
// Returns defaults for any fields that can't be parsed.
func ParseINF(infPath string) (INFMeta, error) {
	meta := DefaultINFMeta()

	data, err := os.ReadFile(infPath)
	if err != nil {
		return meta, err
	}
	txt := string(data)

	if m := reClass.FindStringSubmatch(txt); len(m) > 1 {
		meta.ClassName = strings.TrimSpace(m[1])
	}
	if m := reGuid.FindStringSubmatch(txt); len(m) > 1 {
		meta.ClassGuid = strings.TrimSpace(m[1])
	}
	if m := reService.FindStringSubmatch(txt); len(m) > 1 {
		meta.ServiceName = strings.TrimSpace(m[1])
	}

	// Find first Root\ hardware ID
	for _, line := range strings.Split(txt, "\n") {
		if m := reHWID.FindStringSubmatch(line); len(m) > 1 {
			meta.HWID = canonHWID(m[1])
			break
		}
	}

	return meta, nil
}

// canonHWID normalizes a hardware ID to have canonical "Root\" prefix.
func canonHWID(hwid string) string {
	if strings.HasPrefix(strings.ToLower(hwid), "root\\") {
		return "Root\\" + hwid[5:]
	}
	return hwid
}
