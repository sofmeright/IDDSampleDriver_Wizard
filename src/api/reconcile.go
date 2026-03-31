package api

import (
	"encoding/json"
	"net/http"

	"github.com/PrPlanIT/DisplayWizard/src/core"
)

// reconcileRequest is the JSON body for POST /api/reconcile.
type reconcileRequest struct {
	Driver  *driverRequest  `json:"driver,omitempty"`
	Config  *configRequest  `json:"config,omitempty"`
}

type driverRequest struct {
	Installed bool `json:"installed"`
}

type configRequest struct {
	MonitorCount int               `json:"monitor_count"`
	GPU          string            `json:"gpu"`
	Resolutions  []resolutionReq   `json:"resolutions"`
}

type resolutionReq struct {
	Width        int   `json:"width"`
	Height       int   `json:"height"`
	RefreshRates []int `json:"refresh_rates"`
}

// reconcileResponse is the JSON response for POST /api/reconcile.
type reconcileResponse struct {
	Results []resultEntry `json:"results"`
}

type resultEntry struct {
	OperationID string `json:"operation_id"`
	Type        string `json:"type"`
	Success     bool   `json:"success"`
	Message     string `json:"message,omitempty"`
	Error       string `json:"error,omitempty"`
}

func (s *Server) handleReconcile(w http.ResponseWriter, r *http.Request) {
	var req reconcileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	desired := toDesiredState(req)

	results, err := s.engine.Reconcile(r.Context(), desired)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := reconcileResponse{}
	for _, res := range results {
		entry := resultEntry{
			OperationID: res.OperationID,
			Type:        string(res.Type),
			Success:     res.Success,
			Message:     res.Message,
		}
		if res.Error != nil {
			entry.Error = res.Error.Error()
		}
		resp.Results = append(resp.Results, entry)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func toDesiredState(req reconcileRequest) core.DesiredState {
	var desired core.DesiredState

	if req.Driver != nil {
		desired.Driver = &core.DriverSpec{
			Installed: req.Driver.Installed,
		}
	}

	if req.Config != nil {
		cfg := &core.DisplayConfig{
			MonitorCount: req.Config.MonitorCount,
			GPU:          req.Config.GPU,
		}
		for _, r := range req.Config.Resolutions {
			cfg.Resolutions = append(cfg.Resolutions, core.Resolution{
				Width:        r.Width,
				Height:       r.Height,
				RefreshRates: r.RefreshRates,
			})
		}
		desired.Config = cfg
	}

	return desired
}
