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
	// Loopback by default: the API is unauthenticated and can install drivers, so
	// it must not be network-reachable. Binding a routable address requires
	// explicitly passing --addr (e.g. --addr 0.0.0.0:5757), and must not be done
	// until the API is behind authentication.
	serveCmd.Flags().StringVar(&serveAddr, "addr", "127.0.0.1:5757", "API listen address (loopback only unless explicitly overridden)")
	rootCmd.AddCommand(serveCmd)
}
