package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/PrPlanIT/DisplayWizard/src/backend/windows"
	"github.com/PrPlanIT/DisplayWizard/src/core"
	"github.com/PrPlanIT/DisplayWizard/src/engine"
)

var (
	applyInstall   bool
	applyUninstall bool
	applyReload    bool
)

var applyCmd = &cobra.Command{
	Use:   "apply",
	Short: "Reconcile display system to desired state",
	Long: `Apply a desired state to the display system.

Examples:
  dwiz apply --install        Ensure driver is installed
  dwiz apply --uninstall      Ensure driver is removed
  dwiz apply --reload         Reload the driver`,
	RunE: func(cmd *cobra.Command, args []string) error {
		backend := windows.New()
		eng := engine.New(backend)

		desired := core.DesiredState{}

		switch {
		case applyInstall:
			desired.Driver = &core.DriverSpec{Installed: true}
		case applyUninstall:
			desired.Driver = &core.DriverSpec{Installed: false}
		case applyReload:
			desired.Driver = &core.DriverSpec{Installed: true, Reload: true}
		default:
			return fmt.Errorf("specify --install, --uninstall, or --reload")
		}

		results, err := eng.Reconcile(cmd.Context(), desired)
		if err != nil {
			return err
		}

		for _, r := range results {
			printResult(r)
		}
		return nil
	},
}

func printResult(r core.Result) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	type jsonResult struct {
		OperationID string `json:"operation_id,omitempty"`
		Type        string `json:"type"`
		Success     bool   `json:"success"`
		Message     string `json:"message,omitempty"`
		Error       string `json:"error,omitempty"`
	}
	jr := jsonResult{
		OperationID: r.OperationID,
		Type:        string(r.Type),
		Success:     r.Success,
		Message:     r.Message,
	}
	if r.Error != nil {
		jr.Error = r.Error.Error()
	}
	enc.Encode(jr)
}

func init() {
	applyCmd.Flags().BoolVar(&applyInstall, "install", false, "Ensure driver is installed")
	applyCmd.Flags().BoolVar(&applyUninstall, "uninstall", false, "Ensure driver is removed")
	applyCmd.Flags().BoolVar(&applyReload, "reload", false, "Reload the driver")
	rootCmd.AddCommand(applyCmd)
}
