package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/PrPlanIT/DisplayWizard/src/backend/windows"
	"github.com/PrPlanIT/DisplayWizard/src/core"
)

var elevatedResultFile string

// elevatedCmd is the internal entry point relaunched under UAC by the backend's
// Elevate(). It runs exactly ONE privileged driver operation and exits with a
// status code the parent process reads back:
//
//	dwiz __elevated-op ensure_driver_installed
//
// Because this process is elevated, requireAdmin() sees an elevated token and
// returns nil, so the real work runs here inline — no further recursion.
var elevatedCmd = &cobra.Command{
	Use:    "__elevated-op <operationType>",
	Short:  "Internal: run a single privileged operation (invoked elevated via UAC)",
	Hidden: true,
	Args:   cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		opType := core.OperationType(args[0])

		// Only the driver-lifecycle operations are elevation-eligible. Reject
		// anything else so this entry point can't be coaxed into running
		// non-privileged (or unknown) work with a full admin token.
		switch opType {
		case core.OpEnsureDriverInstalled, core.OpEnsureDriverAbsent, core.OpEnsureDriverReloaded:
		default:
			return fmt.Errorf("operation %q is not eligible for elevation", args[0])
		}

		backend := windows.New()
		op := core.Operation{
			ID:     "elevated:" + string(opType),
			Type:   opType,
			Reason: "elevated single-operation execution",
		}

		result := backend.Execute(cmd.Context(), op)

		// Hand the real result back to the unprivileged parent across the UAC
		// boundary. The parent runs us hidden and can otherwise only read our exit
		// code, so without this it cannot tell what actually happened.
		if elevatedResultFile != "" {
			er := windows.ElevatedResult{
				OperationID: result.OperationID,
				Type:        string(result.Type),
				Success:     result.Success,
				Message:     result.Message,
			}
			if result.Error != nil {
				er.Error = result.Error.Error()
			}
			if data, mErr := json.Marshal(er); mErr == nil {
				_ = os.WriteFile(elevatedResultFile, data, 0o600)
			}
		}

		printResult(result)
		if !result.Success {
			// Non-zero exit signals failure back to the parent's
			// GetExitCodeProcess; the parent maps it to an operation error.
			os.Exit(1)
		}
		return nil
	},
}

func init() {
	elevatedCmd.Flags().StringVar(&elevatedResultFile, "result-file", "", "internal: path to write the operation result JSON for the parent process")
	rootCmd.AddCommand(elevatedCmd)
}
