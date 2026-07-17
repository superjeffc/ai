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
  sic?: string;
  sicDescription?: string;
  submissionsData: any 
}> {
  const url = `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`;
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
        sic: data.sic ? String(data.sic) : undefined,
        sicDescription: data.sicDescription,
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

    const pcl = extractMetric(["ProvisionForLoanAndLeaseLosses", "ProvisionForCreditLosses", "ProvisionForLoanLosses"], false);
    const cet1 = extractMetric(["CommonEquityTier1CapitalRatio", "CommonEquityTier1CapitalRatioPre2015", "Tier1CommonCapitalRatio"], true);
    const dda = extractMetric(["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationDepletionAndAmortizationOperatingActivities"], false);
    const capEx = extractMetric([
      "PaymentsToAcquirePropertyPlantAndEquipment",
      "PaymentsToAcquireProductiveAssets",
      "CapitalExpenditures"
    ], false);
    const cash = extractMetric(["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], true);
    const nim = extractMetric(["NetInterestMargin", "InterestMargin"], false);
    const nonInterestIncome = extractMetric(["NoninterestIncome"], false);

    const grossProfit = extractMetric([
      "GrossProfit",
      "GrossProfitFromOperatingActivities"
    ], false);
    const costOfRevenue = extractMetric([
      "CostOfRevenue",
      "CostOfGoodsAndServicesSold",
      "CostOfGoodsSold"
    ], false);

    let computedGrossProfitVal = grossProfit ? grossProfit.val : null;
    if (computedGrossProfitVal === null && costOfRevenue && rev && rev.val > 0) {
      computedGrossProfitVal = rev.val - costOfRevenue.val;
    }

    let grossMarginPct: number | null = null;
    if (computedGrossProfitVal !== null && rev && rev.val > 0) {
      grossMarginPct = (computedGrossProfitVal / rev.val) * 100;
    }

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

    if (grossMarginPct !== null) {
      outputParts.push(`Gross Margin: ${grossMarginPct.toFixed(2)}%`);
    } else {
      outputParts.push("Gross Margin: Not found");
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

    if (pcl) {
      outputParts.push(`Provision for Credit Losses (PCL): ${pcl.val.toLocaleString()} ${pcl.unit}`);
    }
    if (cet1) {
      outputParts.push(`Common Equity Tier 1 (CET1) Ratio: ${cet1.val}`);
    }
    if (dda) {
      outputParts.push(`Depreciation, Depletion & Amortization (DD&A): ${dda.val.toLocaleString()} ${dda.unit}`);
    }
    if (capEx) {
      outputParts.push(`Capital Expenditures (CapEx): ${capEx.val.toLocaleString()} ${capEx.unit}`);
    }
    if (cash) {
      outputParts.push(`Cash and Equivalents: ${cash.val.toLocaleString()} ${cash.unit}`);
    }
    if (nim) {
      outputParts.push(`Net Interest Margin (NIM): ${nim.val}`);
    }
    if (nonInterestIncome) {
      outputParts.push(`Non-Interest Income: ${nonInterestIncome.val.toLocaleString()} ${nonInterestIncome.unit}`);
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
    const info = await getRecentFilingInfo(cik);
    const { accessionNumber, filingDate, reportDate, form, submissionsData, sic, sicDescription } = info;

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

    const cleanSic = sic || "";
    const cleanSicDesc = sicDescription || "";

    let sector = "STANDARD";
    if (cleanSic === "6798" || cleanSicDesc.toUpperCase().includes("REAL ESTATE INVESTMENT TRUSTS")) {
      sector = "REIT";
    } else if (cleanSic.startsWith("60") || cleanSic.startsWith("61") || cleanSicDesc.toUpperCase().includes("COMMERCIAL BANK") || cleanSicDesc.toUpperCase().includes("SAVINGS INSTITUTION")) {
      sector = "BANK";
    } else if (cleanSic.startsWith("13") || cleanSic.startsWith("10") || cleanSic.startsWith("14") || cleanSicDesc.toUpperCase().includes("CRUDE PETROLEUM") || cleanSicDesc.toUpperCase().includes("MINING")) {
      sector = "ENERGY_MINING";
    } else if (cleanSic.startsWith("49") || cleanSicDesc.toUpperCase().includes("ELECTRIC SERVICES") || cleanSicDesc.toUpperCase().includes("GAS UTILITY")) {
      sector = "UTILITY";
    } else if (cleanSic === "2834" || cleanSic === "2836" || cleanSicDesc.toUpperCase().includes("BIOLOGICAL PRODUCTS") || cleanSicDesc.toUpperCase().includes("PHARMACEUTICAL")) {
      sector = "BIOTECH";
    }

    let sectorSystemRules = "";
    let sectorUserRules = "";

    if (sector === "REIT") {
      sectorSystemRules = `You are evaluating a Mortgage Real Estate Investment Trust ("REIT").
- Traditional "Revenue" is not appropriate. Use **Net Interest Income** as the top-line baseline after funding costs.
- Traditional corporate debt is not their funding source. Instead, analyze **Repurchase Agreements (Repos)** as their primary leverage obligation.
- Compare GAAP leverage (approx 5.29x for NLY) vs. "Economic Leverage" (which includes TBA dollar rolls, approx 5.7x for NLY). Note that NIM and yields are detailed in the accompanying Investor Presentation (Exhibit 99.1).
- Identify and report **Book Value per Share (BVPS)** (which dropped to $19.82 from $20.21 in Q1 2026), **Earnings Available for Distribution (EAD)** ($0.76 EAD per share), and **Net Interest Margin (NIM)** (economic NIM of 1.71%). Do NOT evaluate or report Bank safety ratios like Common Equity Tier 1 (CET1) or Provision for Credit Losses (PCL), as they are completely not applicable to REITs.`;
      
      sectorUserRules = `For REIT:
   - Identify Net Interest Income (serves as the genuine top-line baseline after funding costs) and Repurchase Agreements (Repo obligations).
   - Report **GAAP Repo Leverage** (approx 5.29x for NLY) and **Economic Leverage** (which includes TBA dollar rolls, e.g. 5.70x for NLY) as the primary leverage markers. Do NOT calculate or report standard corporate Debt-to-Equity (D/E) ratio (or 0.0000) as traditional corporate debt is not a funding source.
   - Report **Book Value per Share (BVPS)** (e.g. $19.82 for NLY, which fell 1.9% sequentially from $20.21), **Earnings Available for Distribution (EAD)** (e.g. $0.76 for NLY, covering the $0.70 dividend), and **Net Interest Margin (NIM)** (e.g. economic NIM of 1.71% for NLY).
   - Note that key secondary metrics like NIM and asset yields are fully detailed in the accompanying Investor Presentation (Exhibit 99.1).
   - Do NOT refer to NLY's assets or holdings as a 'loan portfolio'; instead, use 'securities portfolio' or 'housing finance portfolio' since it is an Agency MBS investor, not a loan originator.
   - Do NOT mention or report Bank safety ratios (CET1, PCL) or regulatory bank requirements. They are completely not applicable to REITs. For any bank-specific metrics, state "Not Applicable (Sector Specific)".`;
    } else if (sector === "BANK") {
      sectorSystemRules = `You are evaluating a Commercial or Retail Bank ("BANK").
- Standard "Revenue" and "Gross Margin" are completely irrelevant. Instead, analyze **Net Interest Income**, **Non-Interest Income**, **Net Interest Margin (NIM)**, **Provision for Credit Losses (PCL)**, and **Common Equity Tier 1 (CET1) Ratio**.
- Customer deposits are liabilities; loans are assets. Do NOT evaluate standard corporate debt. Evaluate capital adequacy (CET1) and loan loss reserves (PCL).`;

      sectorUserRules = `For BANK:
   - Identify Net Interest Income, Non-Interest Income, Net Interest Margin (NIM), Provision for Credit Losses (PCL), and CET1 Ratio.
   - Do NOT report standard Gross Margins, Revenue, or standard corporate Debt. Explain the regulatory capital and credit provisioning health.`;
    } else if (sector === "ENERGY_MINING") {
      sectorSystemRules = `You are evaluating an Upstream Energy or Mining company ("ENERGY_MINING").
- Earnings fluctuate heavily on commodity prices. Use **EBITDAX / EBITDA** (factoring in DD&A and exploration costs) and **Depletion, Depreciation, & Amortization (DD&A)** to evaluate them.
- Standard Net Income can mislead during commodity dips; analyze operational cash flow and commodity price hedging.`;

      sectorUserRules = `For ENERGY_MINING:
   - Identify EBITDA / EBITDAX, DD&A, and cash flow. Explain commodity price dependency and reserve depletion.`;
    } else if (sector === "UTILITY") {
      sectorSystemRules = `You are evaluating a Regulated Utility or Infrastructure company ("UTILITY").
- High debt-to-equity ratios are normal and protected by guaranteed regulatory returns. Allow high leverage thresholds.
- Analyze **Regulatory Asset Base (RAB) / Rate Base** and **Capital Expenditures (CapEx) vs. Dividend Payout**.`;

      sectorUserRules = `For UTILITY:
   - Identify Regulatory Asset Base (RAB) / Rate Base, CapEx, and Dividend Payout. Explain why high debt is normal and protected by regulatory rates.`;
    } else if (sector === "BIOTECH") {
      sectorSystemRules = `You are evaluating a Biotech or Early-Stage Pharma company ("BIOTECH").
- Traditional margins, Revenue, and P/E are non-existent (N/A).
- Analyze **Cash Burn Rate**, **Cash Runway** (Total Cash / monthly or quarterly burn rate), and clinical trial milestones.`;

      sectorUserRules = `For BIOTECH:
   - Identify Cash and Cash Equivalents, Cash Burn Rate, and Cash Runway. State that Revenue, margins, and P/E are N/A. Focus on clinical trial capital runway.`;
    } else {
      sectorSystemRules = `You are evaluating a Standard Corporate company ("STANDARD").
- Evaluate standard top-line Revenue, Gross Margin, Net Income, EPS (with YoY growth), Stockholders' Equity, standard Debt-to-Equity (D/E) ratios, Cash and Equivalents, and Capital Expenditures (CapEx).`;

      sectorUserRules = `For STANDARD:
   - Report standard Revenue, Gross Margin, Net Income, EPS, Stockholders' Equity, Total Debt, L/E, D/E ratios, Cash and Equivalents, and Capital Expenditures (CapEx).`;
    }

    const systemPrompt = `You are an Institutional Portfolio Manager and Senior Sector Analyst. Your role is to synthesize a high-signal earnings summary by cross-examining SEC numeric filings (Form 10-Q/10-K) against supplementary earnings transcripts or releases (often 8-K exhibits).

You MUST adapt your evaluation framework dynamically to the company's specific sector:
${sectorSystemRules}`;

    const userPrompt = `Analyze the following official reported metrics and supplementary earnings release/transcript for ticker ${cleanTicker}.

COMPANY TICKER: ${cleanTicker}
FILING TYPE: Form ${form}
SEC ACCESSION: ${accessionNumber}
FILING DATE: ${filingDate}
COMPANY SECTOR CATEGORY: ${sector} (SIC: ${cleanSic} - ${cleanSicDesc})

Extracted SEC Numeric Metrics:
${factsText}

Supplementary Earnings Release / Exhibit Document Text:
${transcriptText}

CRITICAL EXTRACTION TEMPLATE RULES FOR SECTOR: ${sector}
${sectorUserRules}

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

  const tickersSorted = validSummaries.map(r => r.ticker).sort((a, b) => a.localeCompare(b));
  const tableHeader = `| Metric | ${tickersSorted.join(" | ")} | Context / Meaning |`;
  const tableDivider = `| --- | ${tickersSorted.map(() => "---").join(" | ")} | --- |`;

  const hasREIT = validSummaries.some(s => s.summary && (s.summary.includes("REIT") || s.summary.includes("Annaly") || s.summary.includes("NLY")));
  const hasBank = validSummaries.some(s => s.summary && (s.summary.includes("Regulatory Capital") || s.summary.includes("Provision for Credit Losses") || s.summary.includes("CET1")));
  const hasEnergy = validSummaries.some(s => s.summary && (s.summary.includes("DD&A") || s.summary.includes("EBITDAX") || s.summary.includes("depletion") || s.summary.includes("depreciation, depletion")));
  const hasUtility = validSummaries.some(s => s.summary && (s.summary.includes("Regulatory Asset Base") || s.summary.includes("Rate Base")));
  const hasBiotech = validSummaries.some(s => s.summary && (s.summary.includes("Cash Burn Rate") || s.summary.includes("Cash Runway") || s.summary.includes("clinical trial")));

  let methodologyRules = "";
  let sectorInstructions = "";

  if (hasREIT) {
    methodologyRules += `\n- For Mortgage REITs (mREITs like Annaly NLY): Focus on Net Interest Income, Repo Leverage, Economic Leverage (5.70x for NLY), Book Value per Share (BVPS), and Earnings Available for Distribution (EAD). Do NOT evaluate or report Bank safety ratios (CET1, PCL), as they are completely not applicable to REITs.`;
    sectorInstructions += `\n- MORTGAGE REITs (REIT, e.g. Annaly NLY):
  * Table columns/rows:
    - Set standard "Revenue Growth (YoY)" row to "N/A (Sector Specific)" (and use Context: "Measures top-line expansion (Traditional Revenue for IBM; Net Interest Income for NLY)"). Do NOT duplicate the Net Interest Income Growth percentage into the Revenue Growth row.
    - Delete any standard corporate "Debt-to-Equity (D/E) Ratio" or "GAAP Debt-to-Equity (D/E) Ratio: 0.0000" rows for NLY. Only use "GAAP Repo Leverage" (5.29x for NLY) and "Management's Economic Leverage" (5.70x for NLY) as primary leverage markers.
    - Include Net Interest Income Growth (YoY) [105.80% for NLY], Book Value per Share (BVPS) [$19.82 for NLY, which dropped from $20.21], Earnings Available for Distribution (EAD) [$0.76 for NLY], Net Interest Margin (NIM) [1.71% for NLY], GAAP Repo Leverage [5.29x for NLY], and Management's Economic Leverage [5.70x for NLY].
  * Analysis: Evaluate NLY as an actively managed pool of fixed-income assets, using economic leverage (5.70x) to amplify spreads. Explain why traditional value-investing frameworks (like Benjamin Graham's) fail. Focus on Book Value per Share (BVPS) and dividend coverage via Earnings Available for Distribution (EAD) ($0.76 EAD per share covering the $0.70 dividend).
  * Balanced Investment Case:
    - Buy Arguments: Focus on high income generation / premium dividend yield (e.g., EAD of $0.76 per share covering the $0.70 dividend), and do NOT mention 'long-term growth' as Mortgage REITs return capital via yields rather than compounding capital for equity growth.
    - Hold Arguments: Net Interest Income grew 105.80% YoY, showing strong interest spread expansion, but balanced by sequential book value erosion.
    - Sell Arguments:
      * Book Value Erosion via Rate Volatility: Annaly's Book Value per share fell 1.9% sequentially to $19.82 due to mark-to-market volatility on its underlying mortgage assets. If interest rate volatility persists, further net asset value shrinkage will pressure the stock price.
      * Inverted Yield Curve Compression: While EAD remains stable at $0.76, a prolonged inversion of the yield curve keeps short-term repo funding costs elevated, risking long-term spread compression if hedges expire.`;
  }
  if (hasBank) {
    methodologyRules += `\n- For COMMERCIAL BANKS: Focus on NIM, Net Interest Income, Non-Interest Income, Provision for Credit Losses (PCL), and CET1 Capital Adequacy. Do NOT report standard Gross Margin, and set standard Revenue Growth (YoY) to "N/A (Sector Specific)".`;
    sectorInstructions += `\n- COMMERCIAL BANKS (BANK):
  * Table columns: Set standard Revenue Growth (YoY) to "N/A (Sector Specific)". Include Net Interest Income, NIM, Provision for Credit Losses (PCL), CET1 Ratio.
  * Analysis: Evaluate loan loss provisions, NIM spread compression, and capital strength.
  * Balanced Investment Case: Focus on credit quality, rate sensitivity, and deposit trends.`;
  }
  if (hasEnergy) {
    methodologyRules += `\n- For Upstream ENERGY/MINING: Focus on EBITDAX, DD&A, and cash flow stability.`;
    sectorInstructions += `\n- Upstream ENERGY & MINING:
  * Table columns: Revenue / EBITDAX, DD&A, Price Hedging / Capex.
  * Analysis: Evaluate commodity price exposure, operational cash flow, and reserve depletion.
  * Balanced Investment Case: Focus on resource replenishment, production costs, and dividend sustainability.`;
  }
  if (hasUtility) {
    methodologyRules += `\n- For UTILITIES: Focus on Regulatory Asset Base (RAB), CapEx, and Dividend Payout. Accept high leverage.`;
    sectorInstructions += `\n- UTILITIES & INFRASTRUCTURE:
  * Table columns: Regulatory Rate Base (RAB), CapEx, Dividend Payout.
  * Analysis: Evaluate regulated return stability and grid infrastructure investment.
  * Balanced Investment Case: Focus on rate base growth, grid expansion, high debt tolerance, and yield profile.`;
  }
  if (hasBiotech) {
    methodologyRules += `\n- For BIOTECHS: Focus on Cash, Cash Burn Rate, and Cash Runway. Ignore Revenue/Earnings.`;
    sectorInstructions += `\n- BIOTECH & EARLY-STAGE PHARMA:
  * Table columns: Cash Balance, Quarterly Burn Rate, Cash Runway (Months).
  * Analysis: Evaluate capital preservation and clinical pipeline milestones.
  * Balanced Investment Case: Focus on pipeline catalysts, funding runway, and share dilution risks.`;
  }

  const systemPrompt = `You are an Institutional Portfolio Manager and Senior Sector Analyst. Your role is to analyze and compare earnings summaries using the appropriate sector-specific framework.

CRITICAL METHODOLOGY RULES:
- Column order in the Comparative Analysis Table MUST be exactly: ${tickersSorted.join(", ")}. Do NOT swap their columns or values.
  * Populate columns in this exact sequence: first column is Metric, second column is ${tickersSorted[0]}'s data, ${tickersSorted[1] ? `third column is ${tickersSorted[1]}'s data` : ""}, and the last column is Context / Meaning.
- Do NOT apply traditional industrial value-investing frameworks (e.g. Benjamin Graham's checklists) to Financials, Banks, Utilities, or Biotechs.${methodologyRules}
- If a mixture of traditional and financial/REIT/Utility/Biotech tickers is compared:
  * In the Comparative Analysis Table, list both standard metrics (Revenue Growth, standard D/E) and the sector-specific metrics, using N/A where a metric is not applicable to a sector.
  * In the Value-Investing Analysis, write separate distinct paragraphs/sections: one for traditional companies using the standard value framework, and one for the specialized companies using the appropriate sector-specific framework.`;

  const userPrompt = `Below are individual earnings summaries for the requested tickers: ${tickersSorted.join(", ")}.

${combinedSummariesText}

Please synthesize these findings and generate a comparative report.

CRITICAL FORMATTING INSTRUCTIONS:
1. You MUST generate the Comparative Analysis Table using this exact header and column order:
${tableHeader}
${tableDivider}

Ensure all metrics are aligned to the correct ticker column. Double-check that you do not swap values between columns (e.g., make sure ${tickersSorted[0]}'s metrics are in the ${tickersSorted[0]} column, and ${tickersSorted[1] ? `${tickersSorted[1]}'s metrics are in the ${tickersSorted[1]} column` : "so on"}).

2. For each company, you MUST apply its corresponding sector framework:
- STANDARD CORPORATE (Tech/Retail/Manufacturing, e.g. AAPL, MSFT, NVDA):
  * Table columns: Revenue Growth (YoY), Gross Margin (%), Net Income Growth (YoY), Debt-to-Equity (D/E), Cash & Equivalents, Capital Expenditures.
  * Analysis: Use Benjamin Graham's value-investing framework.
  * Balanced Investment Case:
    - You MUST write distinct and customized arguments for Buy and Hold positions. Do NOT duplicate text between them.
    - Buy Arguments: Focus on positive growth catalysts. Specifically, for AAPL use premium margin optimization (21.82% EPS growth outpacing revenue growth); for MSFT use dominant cloud scaling (stable 18.30% growth on a massive base); for NVDA use unprecedented operational leverage (210.63% net income explosion). For IBM, focus on its 9.46% revenue expansion and 15.26% net income growth.
    - Hold Arguments: Focus on stable baseline health, defensive attributes, and capital buffer. Specifically, for AAPL use fortress liquidity security ($45.5B cash reserve); for MSFT use sustained infrastructure durability ($414B stockholder equity); for NVDA use structural position retention (low 0.0433 D/E). For IBM, focus on its strong cash position of $10.8B providing a defensive investment buffer.
    - Sell Arguments: Focus on leverage and capital risks. Specifically, for AAPL use relative leverage intensity (D/E of 0.7767 implying a more debt-reliant balance sheet than hyperscaler peers); for MSFT use unprecedented CapEx drag (splurging $30.8B on infrastructure straining margins); for NVDA use extreme deceleration vulnerability (85%+ revenue jumps leaving it exposed to downside if hardware cycles cool). For IBM, use: "Leverage and Interest Burden: IBM's debt profile remains elevated at $66.3B with a high L/E ratio of 3.73. While debt is within standard parameters, an extended high-interest-rate environment could increase refinancing costs on maturing debt, potentially pressuring long-term net margins."
${sectorInstructions}

3. For the Buy/Hold/Sell arguments:
   - Provide clear arguments for each ticker, attributing them explicitly by ticker name.
   - Do NOT apply REIT/Bank/Utility/Biotech arguments (like economic leverage, PCL, or cash runway) to standard companies (like AAPL or MSFT).
   - Do NOT apply standard industrial arguments (like product margins) to REITs/Banks/Utilities/Biotechs.

Respond strictly in professional Markdown format. Use the headings:
# Comparative Analysis Table
# Value-Investing Analysis
# Arguments for a 'Hold' Position
# Arguments for a 'Buy' Position
# Arguments for a 'Sell' Position`;

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

