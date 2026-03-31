package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/PrPlanIT/DisplayWizard/src/backend/windows"
	"github.com/PrPlanIT/DisplayWizard/src/engine"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show current display system state",
	RunE: func(cmd *cobra.Command, args []string) error {
		backend := windows.New()
		eng := engine.New(backend)

		state, err := eng.Status(cmd.Context())
		if err != nil {
			return err
		}

		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(state)
	},
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

var gpuCmd = &cobra.Command{
	Use:   "gpu",
	Short: "List detected GPUs",
	RunE: func(cmd *cobra.Command, args []string) error {
		backend := windows.New()
		eng := engine.New(backend)

		state, err := eng.Status(cmd.Context())
		if err != nil {
			return err
		}

		if len(state.GPUs) == 0 {
			fmt.Println("No GPUs detected")
			return nil
		}

		for _, g := range state.GPUs {
			fmt.Printf("  %s (%s)\n", g.Name, g.Vendor)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(gpuCmd)
}
