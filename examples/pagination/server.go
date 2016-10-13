package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
)

var (
	pageSize        = 20
	database []item = []item{}
)

type item struct {
	ID            int     `json:"id"`
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	SubCategory   string  `json:"sub_category"`
	ContainerType string  `json:"container_type"`
	PricePerUnit  float64 `json:"price_per_unit"`
	Margin        float64 `json:"margin"`
}

type result struct {
	Query      string `json:"query"`
	Results    []item `json:"results"`
	Prev       int    `json:"prev"`
	Next       int    `json:"next"`
	RangeLeft  int    `json:"rangeLeft"`
	RangeRight int    `json:"rangeRight"`
	Count      int    `json:"count"`
}

//
// Query Interface

func fetchResults(q string, page int) result {
	results := []item{}
	for _, record := range database {
		if strings.Contains(strings.ToLower(record.Name), strings.ToLower(q)) {
			results = append(results, record)
		}
	}

	m := min(len(results), (page-1)*pageSize)
	n := min(len(results), (page-0)*pageSize)

	left := m + 1
	if len(results) == 0 {
		left = 0
	}

	return result{
		Query:      q,
		Results:    results[m:n],
		Prev:       page - 1,
		Next:       page + 1,
		RangeLeft:  left,
		RangeRight: n,
		Count:      len(results),
	}
}

func min(a, b int) int {
	if a < b {
		return a
	} else {
		return b
	}
}

//
// In-Memory Database

func loadDB() {
	r, err := os.Open("db.csv")
	if err != nil {
		panic(err)
	}

	records, err := csv.NewReader(r).ReadAll()
	if err != nil {
		panic(err)
	}

	n := 0
	for _, record := range records {
		n++
		id, _ := strconv.Atoi(record[0])
		pricePerUnit, _ := strconv.ParseFloat(record[2], 64)
		margin, _ := strconv.ParseFloat(record[6], 64)

		database = append(database, item{
			ID:            id,
			Name:          record[1],
			Category:      record[3],
			SubCategory:   record[4],
			ContainerType: record[5],
			PricePerUnit:  pricePerUnit,
			Margin:        margin,
		})
	}

	fmt.Printf("Loaded %d records from disk.\n", n)
}

func handler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")

	page, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil || page <= 0 {
		page = 1
	}

	body, err := json.Marshal(fetchResults(query, page))
	if err != nil {
		panic(err)
	}

	w.Header().Add("Access-Control-Allow-Origin", "*")
	w.Header().Add("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(body)
}

func main() {
	loadDB()

	fmt.Printf("Listening on port 8080.\n")

	http.HandleFunc("/", handler)
	http.ListenAndServe(":8080", nil)
}
