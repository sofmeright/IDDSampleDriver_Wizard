// apps/server/main.go
package main

import (
	"flag"
	"log"
	"net/http"
)

func main(){
	addr := flag.String("addr", ":5757", "http listen addr")
	web := flag.String("web", "", "serve static ui from this dir (ui build)")
	flag.Parse()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/logout", func(w http.ResponseWriter, r *http.Request){ w.WriteHeader(http.StatusNoContent) })
	if *web != "" { mux.Handle("/", http.FileServer(http.Dir(*web))) } else { mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request){ w.WriteHeader(200); _,_ = w.Write([]byte("OK")) }) }
	log.Printf("api listening on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}