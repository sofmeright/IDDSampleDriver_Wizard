package cmd

import (
	"github.com/spf13/cobra"

	"github.com/PrPlanIT/DisplayWizard/src/api"
	"github.com/PrPlanIT/DisplayWizard/src/backend/windows"
	"github.com/PrPlanIT/DisplayWizard/src/engine"
)

var serveAddr string

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the DisplayWizard HTTP API server",
	RunE: func(cmd *cobra.Command, args []string) error {
		backend := windows.New()
		eng := engine.New(backend)
		srv := api.New(eng, serveAddr)
		return srv.ListenAndServe()
	},
}

func init() {
	serveCmd.Flags().StringVar(&serveAddr, "addr", ":5757", "API listen address")
	rootCmd.AddCommand(serveCmd)
}
