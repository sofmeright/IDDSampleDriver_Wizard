package cmd

import (
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "dwiz",
	Short: "DisplayWizard — display system state reconciler",
	Long:  "A reconciliation engine for display driver lifecycle, configuration, and topology.",
}

// Execute runs the root command.
func Execute() error {
	return rootCmd.Execute()
}
