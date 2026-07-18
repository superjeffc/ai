-- SQL schema to initialize the D1 database tables for ticker mapping and earnings cache.

CREATE TABLE IF NOT EXISTS ticker_cik_mapping (
    ticker TEXT PRIMARY KEY,
    cik TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS earnings_cache (
    ticker TEXT NOT NULL,
    accession_number TEXT NOT NULL,
    filing_date TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticker, accession_number)
);

CREATE TABLE IF NOT EXISTS latest_filings (
    ticker TEXT PRIMARY KEY,
    cik TEXT NOT NULL,
    accession_number TEXT NOT NULL,
    filing_date TEXT NOT NULL,
    form TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
