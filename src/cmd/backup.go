package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/PrPlanIT/DisplayWizard/src/backend/windows"
	"github.com/PrPlanIT/DisplayWizard/src/core"
	"github.com/PrPlanIT/DisplayWizard/src/engine"
)

var backupCmd = &cobra.Command{
	Use:   "backup",
	Short: "Manage configuration backups",
}

var backupListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available backups",
	RunE: func(cmd *cobra.Command, args []string) error {
		backend := windows.New()
		eng := engine.New(backend)

		state, err := eng.Status(cmd.Context())
		if err != nil {
			return err
		}

		if len(state.Backups) == 0 {
			fmt.Println("No backups found")
			return nil
		}

		for _, b := range state.Backups {
			fmt.Printf("  %s\n", b.Name)
		}
		return nil
	},
}

var backupCreateCmd = &cobra.Command{
	Use:   "create [name]",
	Short: "Create a configuration backup",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		backend := windows.New()
		eng := engine.New(backend)

		desired := core.DesiredState{
			Backup: &core.BackupSpec{Create: args[0]},
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

var backupRestoreCmd = &cobra.Command{
	Use:   "restore [name]",
	Short: "Restore a configuration backup",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		backend := windows.New()
		eng := engine.New(backend)

		desired := core.DesiredState{
			Backup: &core.BackupSpec{Restore: args[0]},
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

func init() {
	backupCmd.AddCommand(backupListCmd)
	backupCmd.AddCommand(backupCreateCmd)
	backupCmd.AddCommand(backupRestoreCmd)
	rootCmd.AddCommand(backupCmd)
}
