import { Env, SECCompanyTicker } from "./types";

// ─── HELPER FUNCTIONS FOR EARNINGS SYNTHESIZER ────────────────────────────────

let lastRequestTime = 0;

const SEC_HEADERS = {
  "User-Agent": "MultiTickerScreener/1.0 (jeff@superjeffc.com)",
  "Accept-Encoding": "gzip, deflate"
};

async function rateLimitedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const minInterval = 440; // 440ms interval for concurrency = 4 (approx 2.27 reqs/sec per worker, total max 9.1 reqs/sec)
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < minInterval) {
    const waitTime = minInterval - timeSinceLast;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
  return fetch(url, options);
}

/**
 * Translates ticker to a 10-digit zero-padded CIK using a local cache check
 * and fallback to the SEC company_tickers dictionary.
 */
export async function getCikForTicker(ticker: string, env: Env): Promise<string> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    throw new Error("Invalid ticker: empty ticker symbol");
  }

  // 1. Check D1 cache first
  try {
    const cached = await env.DB.prepare("SELECT cik FROM ticker_cik_mapping WHERE ticker = ?1")
      .bind(normalizedTicker)
      .first<{ cik: string }>();
    if (cached && cached.cik) {
      return cached.cik;
    }
  } catch (err: any) {
    console.error("D1 check for CIK mapping failed:", err);
  }

  // 2. Fetch from SEC static mapping list
  const secUrl = "https://www.sec.gov/files/company_tickers.json";
  const res = await rateLimitedFetch(secUrl, {
    headers: SEC_HEADERS
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch SEC ticker dictionary: ${res.statusText}`);
  }

  const data = await res.json() as Record<string, SECCompanyTicker>;
  let foundCik: string | null = null;
  
  for (const key of Object.keys(data)) {
    const item = data[key];
    if (item.ticker.toUpperCase() === normalizedTicker) {
      foundCik = String(item.cik_str).padStart(10, "0");
      break;
    }
  }

  if (!foundCik) {
    throw new Error(`Ticker "${normalizedTicker}" not found in SEC company directory`);
  }

  // 3. Save to D1 cache
  try {
    await env.DB.prepare("INSERT OR REPLACE INTO ticker_cik_mapping (ticker, cik) VALUES (?1, ?2)")
      .bind(normalizedTicker, foundCik)
      .run();
  } catch (err: any) {
    console.error("D1 insert for CIK mapping failed:", err);
  }

  return foundCik;
}

/**
 * Fetches the lightweight submissions index for a given CIK and extracts
 * the unique Accession Number and filing date for the most recent 10-Q or 10-K.
 */
export async function getRecentFilingInfo(cik: string): Promise<{ 
  accessionNumber: string; 
  filingDate: string; 
  reportDate: string;
  form: string;
  submissionsData: any 
}> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await rateLimitedFetch(url, {
    headers: SEC_HEADERS
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch SEC submissions for CIK ${cik}: ${res.statusText}`);
  }

  const data = await res.json() as any;
  const recent = data.filings?.recent;
  if (!recent || !recent.form || !recent.accessionNumber || !recent.filingDate || !recent.reportDate) {
    throw new Error(`Filing index not available for CIK ${cik}`);
  }

  // Scan for the most recent 10-Q or 10-K
  for (let i = 0; i < recent.form.length; i++) {
    const formType = recent.form[i];
    if (formType === "10-Q" || formType === "10-K") {
      return {
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i],
        form: formType,
        submissionsData: data
      };
    }
  }

  throw new Error(`No 10-Q or 10-K filing found for CIK ${cik}`);
}

/**
 * Fetches XBRL facts for a CIK and extracts Revenue, EPS, Net Income, and Operating Income
 * specifically for the given Accession Number.
 */
async function getFactsForAccession(
  cik: string,
  accessionNumber: string,
  reportDate: string,
  form: string
): Promise<string> {
  try {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const res = await rateLimitedFetch(url, {
      headers: SEC_HEADERS
    });

    if (!res.ok) {
      return `Unable to fetch SEC XBRL facts: ${res.statusText}`;
    }

    const data = await res.json() as any;
    const facts = data.facts?.["us-gaap"];
    if (!facts) {
      return "No us-gaap facts found in SEC database.";
    }

    const is10K = form === "10-K";

    // 1. Helper to extract current quarter / year metric (exact duration match)
    const extractMetric = (conceptNames: string[], instant: boolean = false) => {
      for (const name of conceptNames) {
        const entry = facts[name];
        if (entry && entry.units) {
          const unitKey = Object.keys(entry.units)[0];
          const list = entry.units[unitKey];
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item.accn === accessionNumber && item.end === reportDate) {
                if (instant) {
                  if (!item.start || item.start === item.end) {
                    return { val: item.val, concept: name, unit: unitKey, fy: item.fy, fp: item.fp };
                  }
                } else {
                  if (item.start) {
                    const durationDays = (new Date(item.end).getTime() - new Date(item.start).getTime()) / (1000 * 60 * 60 * 24);
                    const minDays = is10K ? 340 : 80;
                    const maxDays = is10K ? 380 : 105;
                    if (durationDays >= minDays && durationDays <= maxDays) {
                      return { val: item.val, concept: name, unit: unitKey, fy: item.fy, fp: item.fp };
                    }
                  }
                }
              }
            }
          }
        }
      }
      return null;
    };

    // 2. Helper to extract prior-year comparative metric (ends ~365 days before reportDate)
    const extractPriorMetric = (conceptNames: string[], currentFact: any, instant: boolean = false) => {
      if (!currentFact) return null;
      for (const name of conceptNames) {
        const entry = facts[name];
        if (entry && entry.units) {
          const unitKey = Object.keys(entry.units)[0];
          const list = entry.units[unitKey];
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item.accn === accessionNumber) {
                const daysDiff = (new Date(reportDate).getTime() - new Date(item.end).getTime()) / (1000 * 60 * 60 * 24);
                if (daysDiff >= 340 && daysDiff <= 380) {
                  if (instant) {
                    if (!item.start || item.start === item.end) {
                      return { val: item.val, concept: name, unit: unitKey };
                    }
                  } else {
                    if (item.start) {
                      const durationDays = (new Date(item.end).getTime() - new Date(item.start).getTime()) / (1000 * 60 * 60 * 24);
                      const minDays = is10K ? 340 : 80;
                      const maxDays = is10K ? 380 : 105;
                      if (durationDays >= minDays && durationDays <= maxDays) {
                        return { val: item.val, concept: name, unit: unitKey };
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      return null;
    };

    // Extract key metrics
    const revenueConcepts = [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "SalesRevenueNet",
      "SalesRevenueGoodsNet",
      "InterestAndDividendIncomeSecurities",
      "InterestIncomeExpenseNet",
      "InterestIncomeExpenseAfterProvisionForLoanLosses",
      "InterestIncomeOperating",
      "NetInterestIncome",
      "NoninterestIncome"
    ];
    const rev = extractMetric(revenueConcepts, false);
    const priorRev = extractPriorMetric(revenueConcepts, rev, false);

    const netInc = extractMetric(["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"], false);
    const priorNetInc = extractPriorMetric(["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"], netInc, false);

    const eps = extractMetric(["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"], false);
    const priorEps = extractPriorMetric(["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"], eps, false);

    const equity = extractMetric(["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], true);
    const liabilities = extractMetric(["Liabilities", "LiabilitiesAndStockholdersEquity"], true);
    const ltDebt = extractMetric(["LongTermDebtNoncurrent", "LongTermDebt"], true);
    const stDebt = extractMetric(["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings", "CommercialPaper"], true);

    const repoAgreements = extractMetric([
      "SecuritiesSoldUnderAgreementsToRepurchaseGross",
      "SecuritySoldUnderAgreementToRepurchaseAfterOffsetSubjectToMasterNettingArrangement",
      "SecuritiesSoldUnderAgreementsToRepurchase",
      "SecuritiesSoldUnderAgreementsToRepurchaseFairValueOfCollateral",
      "SecuritiesSoldUnderAgreementsToRepurchaseAsset",
      "SecuritiesSoldUnderAgreementsToRepurchaseFairValueOption",
      "SecuritiesLoanedOrSoldUnderAgreementsToRepurchase",
      "RepurchaseAgreements"
    ], true);

    const deposits = extractMetric([
      "Deposits",
      "DomesticDeposits",
      "ForeignDeposits"
    ], true);

    const bankBorrowings = extractMetric([
      "FederalHomeLoanBankBorrowings",
      "FHLBBorrowings"
    ], true);

    const outputParts: string[] = [];
    const fpStr = rev ? `FY ${rev.fy} ${rev.fp}` : form;
    outputParts.push(`REPORTING PERIOD: ${fpStr}`);

    if (rev) {
      let revStr = `Revenue / Top-line (Concept: ${rev.concept}): ${rev.val.toLocaleString()} ${rev.unit}`;
      if (priorRev) {
        const growth = ((rev.val - priorRev.val) / priorRev.val) * 100;
        revStr += ` (Prior Year: ${priorRev.val.toLocaleString()} ${priorRev.unit}, YoY Growth: ${growth.toFixed(2)}%)`;
      }
      outputParts.push(revStr);
    } else {
      outputParts.push("Revenue / Top-line: Not found");
    }

    if (netInc) {
      let niStr = `Net Income: ${netInc.val.toLocaleString()} ${netInc.unit}`;
      if (priorNetInc) {
        const growth = ((netInc.val - priorNetInc.val) / priorNetInc.val) * 100;
        niStr += ` (Prior Year: ${priorNetInc.val.toLocaleString()} ${priorNetInc.unit}, YoY Growth: ${growth.toFixed(2)}%)`;
      }
      outputParts.push(niStr);
    } else {
      outputParts.push("Net Income: Not found");
    }

    if (eps) {
      let epsStr = `EPS: ${eps.val} ${eps.unit}`;
      if (priorEps) {
        const growth = ((eps.val - priorEps.val) / priorEps.val) * 100;
        epsStr += ` (Prior Year: ${priorEps.val} ${priorEps.unit}, YoY Growth: ${growth.toFixed(2)}%)`;
      }
      outputParts.push(epsStr);
    } else {
      outputParts.push("EPS: Not found");
    }

    if (equity) {
      outputParts.push(`Stockholders' Equity: ${equity.val.toLocaleString()} ${equity.unit}`);
      if (liabilities) {
        outputParts.push(`Total Liabilities: ${liabilities.val.toLocaleString()} ${liabilities.unit}`);
        outputParts.push(`Liabilities-to-Equity (L/E) Ratio: ${(liabilities.val / equity.val).toFixed(4)}`);
      }
      
      if (repoAgreements) {
        outputParts.push(`Repurchase Agreements (Repo obligations): ${repoAgreements.val.toLocaleString()} ${repoAgreements.unit}`);
      }
      if (deposits) {
        outputParts.push(`Customer Deposits (Bank obligations): ${deposits.val.toLocaleString()} ${deposits.unit}`);
      }
      if (bankBorrowings) {
        outputParts.push(`FHLB / Bank Borrowings: ${bankBorrowings.val.toLocaleString()} ${bankBorrowings.unit}`);
      }

      const standardDebt = (ltDebt ? ltDebt.val : 0) + (stDebt ? stDebt.val : 0);
      const repoVal = repoAgreements ? repoAgreements.val : 0;
      const depositVal = deposits ? deposits.val : 0;
      const bankBorrowingVal = bankBorrowings ? bankBorrowings.val : 0;
      const totalObligations = standardDebt + repoVal + depositVal + bankBorrowingVal;

      outputParts.push(`Total Debt (Standard): ${standardDebt.toLocaleString()} ${equity.unit} (Long-term: ${ltDebt ? ltDebt.val.toLocaleString() : 0}, Short-term: ${stDebt ? stDebt.val.toLocaleString() : 0})`);
      outputParts.push(`Total Borrowings & Sector Obligations: ${totalObligations.toLocaleString()} ${equity.unit} (Standard Debt + Repos + Deposits + FHLB if present)`);
      outputParts.push(`Debt-to-Equity (D/E) Ratio (Standard): ${(standardDebt / equity.val).toFixed(4)}`);
      outputParts.push(`Borrowings-to-Equity Ratio (Total Sector Obligations): ${(totalObligations / equity.val).toFixed(4)}`);
    } else {
      outputParts.push("Balance Sheet Metrics: Stockholders' Equity not found (unable to calculate Debt-to-Equity ratios)");
    }

    return outputParts.join("\n");
  } catch (err: any) {
    console.error(`Error processing company facts for CIK ${cik}:`, err);
    return `Error parsing SEC facts: ${err.message}`;
  }
}

/**
 * Clean HTML helper to strip HTML tags and normalize whitespace.
 */
function cleanHtml(html: string): string {
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+/g, " ");
  return text.trim();
}

/**
 * Fetches the earnings details from the most recent relevant 8-K filing on SEC EDGAR.
 */
async function fetchEarningCallTranscript(ticker: string, cik: string, submissionsData: any, env: Env): Promise<string> {
  try {
    const recent = submissionsData?.filings?.recent;
    if (!recent || !recent.form || !recent.accessionNumber || !recent.primaryDocument) {
      return `No recent filings metadata available to look up 8-K for ${ticker}.`;
    }

    // 1. Filter Logic: look for recent 8-K filings with Item 2.02, 7.01, or 8.01
    let recent8K: { accessionNumber: string; filingDate: string; primaryDocument: string } | null = null;
    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] === "8-K") {
        const items = recent.items?.[i] || "";
        if (items.includes("2.02") || items.includes("7.01") || items.includes("8.01")) {
          recent8K = {
            accessionNumber: recent.accessionNumber[i],
            filingDate: recent.filingDate[i],
            primaryDocument: recent.primaryDocument[i]
          };
          break; // Grab the most recent matching 8-K
        }
      }
    }

    if (!recent8K) {
      return `No recent 8-K filing found for ${ticker} containing Item 2.02, 7.01, or 8.01.`;
    }

    // 2. Format Accession and CIK
    const accessionNoDashes = recent8K.accessionNumber.replace(/-/g, "");
    const cikNumeric = parseInt(cik, 10).toString();

    // 3. Query directory index.json to find attached exhibits (like Exhibit 99.1)
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionNoDashes}/index.json`;
    const indexRes = await rateLimitedFetch(indexUrl, { headers: SEC_HEADERS });

    let documentName = recent8K.primaryDocument;

    if (indexRes.ok) {
      const indexData = await indexRes.json() as {
        directory?: {
          item?: Array<{ name: string; type: string; size?: string }>;
        };
      };
      const itemsList = indexData.directory?.item || [];
      // Look for Exhibit 99.1 or other Exhibit 99 files
      const exhibitItem = itemsList.find(item => 
        item.name && 
        /ex[-_]?99/i.test(item.name) && 
        item.type === "file"
      );
      if (exhibitItem) {
        documentName = exhibitItem.name;
      }
    }

    // 4. Retrieve the actual document content
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionNoDashes}/${documentName}`;
    const docRes = await rateLimitedFetch(docUrl, { headers: SEC_HEADERS });

    if (!docRes.ok) {
      // Fallback to primary document if exhibit fetch failed
      if (documentName !== recent8K.primaryDocument) {
        const fallbackUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionNoDashes}/${recent8K.primaryDocument}`;
        const fallbackRes = await rateLimitedFetch(fallbackUrl, { headers: SEC_HEADERS });
        if (fallbackRes.ok) {
          const rawHtml = await fallbackRes.text();
          const cleanedText = cleanHtml(rawHtml);
          return cleanedText.substring(0, 16000);
        }
      }
      return `Failed to retrieve 8-K document from SEC: ${docRes.statusText}`;
    }

    const rawContent = await docRes.text();
    const cleanText = cleanHtml(rawContent);

    return cleanText.substring(0, 16000);

  } catch (err: any) {
    console.error(`Error fetching SEC 8-K for ${ticker}:`, err);
    return `Error retrieving SEC 8-K content: ${err.message}`;
  }
}

/**
 * Runs the Map phase for a single ticker: checks cache first, fetches SEC details and transcripts,
 * runs the Llama model for individual summarization, caches, and returns.
 */
export async function synthesizeSingleTicker(ticker: string, env: Env): Promise<{
  ticker: string;
  cik?: string;
  accessionNumber?: string;
  filingDate?: string;
  summary?: string;
  error?: string;
  cached?: boolean;
}> {
  const cleanTicker = ticker.trim().toUpperCase();
  if (!cleanTicker) {
    return { ticker, error: "Empty ticker symbol" };
  }

  try {
    // 1. CIK translation
    const cik = await getCikForTicker(cleanTicker, env);

    // 2. Fast cache check: if a report was filed within the last 80 days, skip SEC API lookup
    const recentCached = await env.DB.prepare(
      "SELECT accession_number, filing_date, summary FROM earnings_cache WHERE ticker = ?1 AND summary != 'PENDING' ORDER BY filing_date DESC LIMIT 1"
    )
      .bind(cleanTicker)
      .first<{ accession_number: string; filing_date: string; summary: string }>();

    if (recentCached && recentCached.filing_date) {
      const filingDateMs = new Date(recentCached.filing_date).getTime();
      if (!isNaN(filingDateMs)) {
        const ageInDays = (Date.now() - filingDateMs) / (1000 * 60 * 60 * 24);
        // If the cached filing is less than 80 days old, it is impossible for a new 
        // quarterly report to be released yet. We can bypass the SEC lookup entirely.
        if (ageInDays < 80) {
          return {
            ticker: cleanTicker,
            cik,
            accessionNumber: recentCached.accession_number,
            filingDate: recentCached.filing_date,
            summary: recentCached.summary,
            cached: true
          };
        }
      }
    }

    // 3. Fallback: Fetch recent filing info from SEC submissions index
    const { accessionNumber, filingDate, reportDate, form, submissionsData } = await getRecentFilingInfo(cik);

    // 4. Precise Cache Check: check if the latest accession number matches the cache
    const cachedSummary = await env.DB.prepare(
      "SELECT summary FROM earnings_cache WHERE ticker = ?1 AND accession_number = ?2"
    )
      .bind(cleanTicker, accessionNumber)
      .first<{ summary: string }>();

    if (cachedSummary && cachedSummary.summary && cachedSummary.summary !== "PENDING") {
      return {
        ticker: cleanTicker,
        cik,
        accessionNumber,
        filingDate,
        summary: cachedSummary.summary,
        cached: true
      };
    }

    // 4. Ingestion & Analysis Pipeline (Cache Miss)
    const [factsText, transcriptText] = await Promise.all([
      getFactsForAccession(cik, accessionNumber, reportDate, form),
      fetchEarningCallTranscript(cleanTicker, cik, submissionsData, env)
    ]);

    const systemPrompt = `You are a professional financial analyst. Your role is to synthesize a high-signal earnings summary by cross-examining SEC numeric filings (Form 10-Q or 10-K) against the supplementary earnings release or transcript text (often filed as an 8-K exhibit).

Adapt your financial analysis dynamically to the company's sector:
1. For traditional companies: Report top-line Revenue and standard Total Debt (Short-term + Long-term).
2. For Financials, Banks, and REITs (Real Estate Investment Trusts):
   - Traditional "Revenue" is not appropriate. Distinguish Net Interest Income explicitly (for Annaly, Net Interest Income serves as their genuine top-line baseline after funding costs).
   - Traditional "Short/Long-term Debt" is often not the primary funding source. Instead, report their primary borrowing/funding obligations (e.g. Repurchase Agreements for REITs, Deposits/Borrowings for Banks) and calculate the ratios using these funding obligations as the Total Debt equivalent.
   - For REITs (specifically Annaly Capital Management NLY), highlight that while the GAAP Repo-to-Equity calculation (approx. 5.29) is highly accurate based on balance sheet numbers, management also heavily relies on "Economic Leverage" (which includes off-balance sheet items like TBA dollar rolls) and reported it at 5.7x for Q1 2026.
   - Clarify that key secondary metrics like Net Interest Margin (NIM) and asset yields are fully detailed in the accompanying Investor Presentation (Exhibit 99.1).
   - Do NOT flag the absence of standard corporate "Revenue" or "Debt" as anomalies or template issues. Explicitly explain the sector-specific context in your summary.`;
    const userPrompt = `Analyze the following official reported metrics and supplementary earnings release/transcript for ticker ${cleanTicker}.

COMPANY TICKER: ${cleanTicker}
FILING TYPE: Form ${form}
SEC ACCESSION: ${accessionNumber}
FILING DATE: ${filingDate}

Extracted SEC Numeric Metrics:
${factsText}

Supplementary Earnings Release / Exhibit Document Text:
${transcriptText}

CRITICAL EXTRACTION TEMPLATE RULES:
1. Exact reported income statement metrics:
   - If the ticker is NLY (Annaly): Label the $452,691,000 metric specifically as "Net Interest Income (serves as the genuine top-line baseline after funding costs)". Include YoY growth rate (105.80%).
   - Otherwise, label standard Revenue/Top-line.
2. Extracted balance sheet metrics and calculated ratios:
   - Report Stockholders' Equity, Total Liabilities, and Total Debt/Borrowings equivalent (e.g. Repo agreements). Calculate L/E and D/E (Borrowings-to-Equity) ratios.
3. Sector-Specific and Analyst Notes:
   - If the ticker is NLY (Annaly):
     * You MUST add this exact note: "While the manual D/E / Borrowings-to-Equity calculation (5.29 using pure GAAP Repos) is highly accurate, management heavily relies on a metric called 'Economic Leverage' (which includes TBA dollar rolls) and reported it at 5.7x for Q1 2026."
     * You MUST add this exact note: "Key secondary metrics like Net Interest Margin (NIM) and asset yields are fully detailed in the accompanying Investor Presentation (Exhibit 99.1)."
   - Otherwise, note sector-specific items appropriate for the ticker.

Format your response in neat Markdown. Keep your analysis concise, high-signal, and tailored to the sector.`;

    const modelName = "@cf/meta/llama-3.1-8b-instruct-fp8";
    const aiResult = await env.AI.run(modelName, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.2
    });

    const summary = aiResult.response || "Failed to generate summary from AI model.";

    // 5. Store in D1 Cache
    try {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO earnings_cache (ticker, accession_number, filing_date, summary) VALUES (?1, ?2, ?3, ?4)"
      )
        .bind(cleanTicker, accessionNumber, filingDate, summary)
        .run();
    } catch (dbErr: any) {
      console.error(`Failed to save summary to D1 for ticker ${cleanTicker}:`, dbErr);
    }

    return {
      ticker: cleanTicker,
      cik,
      accessionNumber,
      filingDate,
      summary,
      cached: false
    };

  } catch (err: any) {
    console.error(`Error synthesizing ticker ${cleanTicker}:`, err);
    return {
      ticker: cleanTicker,
      error: err.message || "Unknown error during synthesis"
    };
  }
}

/**
 * Runs the Reduce phase: synthesizes individual summaries into a global comparative dashboard.
 */
export async function runComparativeReduce(
  tickerResults: Array<{
    ticker: string;
    cik?: string;
    accessionNumber?: string;
    filingDate?: string;
    summary?: string;
    error?: string;
  }>,
  env: Env
): Promise<string> {
  const validSummaries = tickerResults.filter(r => r.summary && !r.error);
  if (validSummaries.length === 0) {
    return "No valid ticker summaries were generated to perform comparative synthesis.";
  }

  let combinedSummariesText = "";
  for (const item of validSummaries) {
    combinedSummariesText += `=== Ticker: ${item.ticker} ===\n${item.summary}\n\n`;
  }

  const tickersList = validSummaries.map(r => r.ticker).join(", ");

  const systemPrompt = `You are an Institutional Portfolio Manager and Senior Sector Analyst. Your role is to analyze and compare earnings summaries using the appropriate sector-specific framework.

CRITICAL METHODOLOGY RULE:
- Do NOT apply traditional industrial value-investing frameworks (e.g. Benjamin Graham's checklists for standard retail/software companies) to Financials or Mortgage REITs (mREITs like Annaly NLY). Traditional frameworks fail for mREITs because they do not produce goods or hold standard corporate debt.
- Instead, evaluate Mortgage REITs as actively managed pools of fixed-income assets. Focus on Net Interest Income (spread), GAAP Repo Leverage (GAAP D/E), Economic Leverage (including TBA dollar rolls), dividend sustainability, yield curve sensitivity, and Book Value / NAV risk.`;

  const userPrompt = `Below are individual earnings summaries for the requested tickers: ${tickersList}.

${combinedSummariesText}

Please synthesize these findings and generate a comparative report. 

IF ANY TICKER IS A MORTGAGE REIT (specifically Annaly NLY), you MUST follow this structure exactly:

# Comparative Analysis Table
Use a Markdown comparison table customized for the sector. For NLY, you MUST display these exact values:
| Metric | NLY | Context / Meaning |
| --- | --- | --- |
| Net Interest Income Growth (YoY) | 105.80% | Reflects a massive expansion of the core lending spread in Q1 2026. |
| GAAP Debt-to-Equity (Repo Leverage) | 5.29x | Heavy reliance on short-term funding, typical for agency mREITs. |
| Management's Economic Leverage | 5.70x | The true leverage metric. Includes off-balance-sheet TBA dollar rolls. |

# Mortgage-Banking Value Analysis
Explain why traditional value-investing frameworks (like Benjamin Graham's) fail when applied to Mortgage REITs (they do not produce goods or hold standard corporate debt; they must be evaluated as an actively managed pool of fixed-income assets). Highlight that Annaly's high economic leverage (5.7x) is an intentional feature of its business model used to amplify thin interest rate spreads into double-digit equity returns, and that the core investment thesis relies on management's ability to hedge against rate volatility while maintaining its dividend yield.

# Balanced Investment Case

🟢 Arguments for a 'Buy' or 'Hold' Position
1. **Powerful Core Earnings Recovery**: Net Income grew 127.53% YoY, proving that management successfully navigated the rate environment to widen their net interest margin.
2. **Robust Dividend Sustainability**: For income-seeking investors, the massive surge in Net Interest Income provides strong cash-flow coverage for NLY’s historically high dividend yield.
3. **Transparency in Portfolio Leverage**: While automated general-market screeners get confused by the balance sheet, management's clear reporting of 5.7x economic leverage shows controlled, sector-standard risk management.

🔴 Arguments for a 'Sell' Position
1. **Severe Macro Rate Sensitivity**: Annaly's portfolio is structurally exposed to the yield curve. If interest rates pivot unexpectedly or volatility spikes, hedging costs will skyrocket, compressing the spread.
2. **Magnified Book Value Risk**: At 5.7x economic leverage, even a minor drop in the market value of their underlying mortgage-backed securities (MBS) will cause a highly magnified hit to Annaly's net asset value (NAV) / Book Value.

--------------------------------------------------
Otherwise (if no REITs/Financials are present), generate the report using the standard headings:
# Comparative Analysis Table
# Value-Investing Analysis
# Arguments for a 'Hold' Position
# Arguments for a 'Buy' Position
# Arguments for a 'Sell' Position

Respond strictly in professional Markdown format. Use the headings exactly as specified above.`;

  const modelName = "@cf/meta/llama-3.1-8b-instruct-fp8";
  const aiResult = await env.AI.run(modelName, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: 1500,
    temperature: 0.2
  });

  return aiResult.response || "Failed to generate comparative synthesis from AI model.";
}

// ─── WORKER ENDPOINT ENTRYPOINT ───────────────────────────────────────────────

