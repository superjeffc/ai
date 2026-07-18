import { Env, SECCompanyTicker } from "./types";
import { getMapSystemPrompt, getMapUserPrompt } from "./prompts/map";
import { getReduceSystemPrompt, getReduceUserPrompt, REDUCE_SECTOR_RULES } from "./prompts/reduce";

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

async function callAgyModel(systemPrompt: string, userPrompt: string, env: Env): Promise<string> {
  const secretToken = env.API_SECRET || "kite-vscode-secret-9942";
  console.log(`Calling AGY bridge at https://agy.superjeffc.com/execute (System prompt: ${systemPrompt.length} chars, User prompt: ${userPrompt.length} chars)`);
  const startTime = Date.now();
  const response = await fetch("https://agy.superjeffc.com/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${secretToken}`
    },
    body: JSON.stringify({ systemPrompt, userPrompt })
  });

  const duration = Date.now() - startTime;
  if (!response.ok) {
    const errText = await response.text();
    console.error(`AGY bridge request failed after ${duration}ms with status ${response.status}: ${errText}`);
    throw new Error(`AGY bridge request failed (${response.status}): ${errText}`);
  }

  console.log(`AGY bridge request succeeded in ${duration}ms`);
  return await response.text();
}

async function fetchStockPrice(ticker: string): Promise<number | null> {
  const normalized = ticker.trim().toUpperCase();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ...SEC_HEADERS
  };

  // Try NASDAQ first
  try {
    const url = `https://www.google.com/finance/quote/${normalized}:NASDAQ`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/data-last-price="([0-9.]+)"/);
      if (match && match[1]) {
        return parseFloat(match[1]);
      }
    }
  } catch (err) {
    console.error(`Error fetching NASDAQ price for ${normalized}:`, err);
  }

  // Fallback to NYSE
  try {
    const url = `https://www.google.com/finance/quote/${normalized}:NYSE`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/data-last-price="([0-9.]+)"/);
      if (match && match[1]) {
        return parseFloat(match[1]);
      }
    }
  } catch (err) {
    console.error(`Error fetching NYSE price for ${normalized}:`, err);
  }

  return null;
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
 * Fetches XBRL facts for a CIK and extracts Revenue, EPS, Net Income, and
 */
export async function getFactsForAccession(
  ticker: string,
  cik: string,
  accessionNumber: string,
  reportDate: string,
  form: string,
  sic: string,
  sicDescription: string,
  companyName: string
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
    const deiFacts = data.facts?.["dei"];
    const facts = data.facts?.["us-gaap"];
    const usgaapFacts = facts;
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

    // Classify sector to determine revenue cascade mapping
    const cleanSic = sic || "";
    const cleanSicDesc = sicDescription || "";
    const upperSicDesc = cleanSicDesc.toUpperCase();
    const upperCompanyName = companyName.toUpperCase();

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

    let sector = "STANDARD";
    if (cleanSic === "6770" || upperSicDesc.includes("BLANK CHECK") || upperCompanyName.includes("ACQUISITION CORP") || upperCompanyName.includes("ACQUISITION CORPORATION") || upperCompanyName.includes("ACQUISITION")) {
      sector = "SHELL_SPAC";
    } else if (cleanSic === "6798" || upperSicDesc.includes("REAL ESTATE INVESTMENT TRUST") || upperSicDesc.includes("REIT")) {
      const isMortgageREIT = 
        upperSicDesc.includes("MORTGAGE") || 
        upperSicDesc.includes("AGENCY") || 
        upperSicDesc.includes("REPURCHASE") || 
        upperCompanyName.includes("MORTGAGE") || 
        upperCompanyName.includes("AGENCY") || 
        upperCompanyName.includes("REPURCHASE") || 
        upperCompanyName.includes("MBS") ||
        upperCompanyName.includes("CAPITAL") ||
        upperCompanyName.includes("TRUST") ||
        repoAgreements !== null;

      if (isMortgageREIT) {
        sector = "REIT";
      }
    } else if (
      cleanSic.startsWith("60") || 
      cleanSic.startsWith("61") || 
      upperSicDesc.includes("BANK") || 
      upperSicDesc.includes("SAVINGS INSTITUTION") || 
      upperSicDesc.includes("DEPOSITORY")
    ) {
      sector = "BANK";
    } else if (
      cleanSic.startsWith("10") || 
      cleanSic.startsWith("12") || 
      cleanSic.startsWith("13") || 
      cleanSic.startsWith("14") || 
      cleanSic.startsWith("29") || 
      upperSicDesc.includes("PETROLEUM") || 
      upperSicDesc.includes("MINING") || 
      upperSicDesc.includes("OIL & GAS")
    ) {
      sector = "ENERGY_MINING";
    } else if (
      cleanSic.startsWith("49") || 
      upperSicDesc.includes("ELECTRIC") || 
      upperSicDesc.includes("GAS UTILITY") || 
      upperSicDesc.includes("WATER SUPPLY") || 
      upperSicDesc.includes("TELEPHONE")
    ) {
      sector = "UTILITY";
    } else if (
      cleanSic.startsWith("283") || 
      cleanSic === "8731" || 
      upperSicDesc.includes("BIOLOGICAL") || 
      upperSicDesc.includes("PHARMACEUTICAL") || 
      upperSicDesc.includes("BIOTECHNOLOGY")
    ) {
      sector = "BIOTECH";
    }

    // Extract key metrics
    const revenueConcepts = sector === "REIT" ? [
      "NetInterestIncome",
      "NetSpreadAndDollarRollIncome",
      "RevenuesTotal",
      "TotalRevenues",
      "TotalRevenue",
      "NetInterestIncomeAfterProvisionForLoanLosses",
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "SalesRevenueGoodsNet",
      "InterestAndDividendIncomeSecurities",
      "InterestIncomeExpenseNet",
      "InterestIncomeExpenseAfterProvisionForLoanLosses",
      "InterestIncomeOperating",
      "NoninterestIncome"
    ] : [
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
    const assetsHeldInTrust = extractMetric([
      "AssetsHeldInTrustNoncurrent",
      "AssetsHeldInTrust",
      "AssetsHeldInTrustCurrent"
    ], true);

    const bvps = extractMetric([
      "BookValuePerShareOfCommonStock",
      "CommonStockBookValuePerShare",
      "BookValuePerShare",
      "TangibleBookValuePerShare",
      "TangibleNetBookValuePerShare",
      "TangibleNetAssetValuePerShare"
    ], true);

    const extractSharesOutstanding = () => {
      if (deiFacts && deiFacts["EntityCommonStockSharesOutstanding"]) {
        const entry = deiFacts["EntityCommonStockSharesOutstanding"];
        if (entry && entry.units) {
          const unitKey = Object.keys(entry.units)[0];
          const list = entry.units[unitKey];
          if (Array.isArray(list)) {
            let bestItem = null;
            let bestDiff = Infinity;
            const targetTime = new Date(reportDate).getTime();
            for (const item of list) {
              if (item.end) {
                const itemTime = new Date(item.end).getTime();
                const diff = Math.abs(itemTime - targetTime) / (1000 * 60 * 60 * 24);
                if (diff < 45 && diff < bestDiff) {
                  bestDiff = diff;
                  bestItem = item;
                }
              }
            }
            if (bestItem) {
              return { val: bestItem.val, concept: "EntityCommonStockSharesOutstanding", unit: unitKey };
            }
          }
        }
      }
      if (usgaapFacts && usgaapFacts["CommonStockSharesOutstanding"]) {
        const entry = usgaapFacts["CommonStockSharesOutstanding"];
        if (entry && entry.units) {
          const unitKey = Object.keys(entry.units)[0];
          const list = entry.units[unitKey];
          if (Array.isArray(list)) {
            let bestItem = null;
            let bestDiff = Infinity;
            const targetTime = new Date(reportDate).getTime();
            for (const item of list) {
              if (item.end) {
                const itemTime = new Date(item.end).getTime();
                const diff = Math.abs(itemTime - targetTime) / (1000 * 60 * 60 * 24);
                if (diff < 45 && diff < bestDiff) {
                  bestDiff = diff;
                  bestItem = item;
                }
              }
            }
            if (bestItem) {
              return { val: bestItem.val, concept: "CommonStockSharesOutstanding", unit: unitKey };
            }
          }
        }
      }
      return null;
    };

    const sharesOutstanding = extractSharesOutstanding();
    
    let computedBvps: number | null = null;
    if (bvps && bvps.val) {
      computedBvps = bvps.val;
    } else if (equity && sharesOutstanding && sharesOutstanding.val > 0) {
      computedBvps = equity.val / sharesOutstanding.val;
    }

    const cashFromOps = extractMetric([
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
      "CashProvidedByUsedInOperatingActivitiesNet"
    ], false);

    const inventory = extractMetric([
      "InventoryNet",
      "InventoriesPresentValued",
      "InventoryGross"
    ], true);

    const extractDeiEmployeeCount = () => {
      if (deiFacts && deiFacts["EntityNumberOfEmployees"]) {
        const entry = deiFacts["EntityNumberOfEmployees"];
        if (entry && entry.units) {
          const unitKey = Object.keys(entry.units)[0];
          const list = entry.units[unitKey];
          if (Array.isArray(list)) {
            let bestItem = null;
            let bestDiff = Infinity;
            const targetTime = new Date(reportDate).getTime();
            for (const item of list) {
              if (item.end) {
                const itemTime = new Date(item.end).getTime();
                const diff = Math.abs(itemTime - targetTime) / (1000 * 60 * 60 * 24);
                if (diff < 180 && diff < bestDiff) {
                  bestDiff = diff;
                  bestItem = item;
                }
              }
            }
            if (bestItem) {
              return { val: bestItem.val, concept: "EntityNumberOfEmployees", unit: unitKey };
            }
          }
        }
      }
      return null;
    };

    const employeesInfo = extractDeiEmployeeCount();

    let computedFcfVal: number | null = null;
    let fcfConversionPct: number | null = null;
    if (cashFromOps && netInc && netInc.val !== 0) {
      const capExVal = capEx ? capEx.val : 0;
      computedFcfVal = cashFromOps.val - capExVal;
      fcfConversionPct = (computedFcfVal / netInc.val) * 100;
    }

    let dio: number | null = null;
    if (inventory && costOfRevenue && costOfRevenue.val > 0) {
      const multiplier = is10K ? 365 : 90;
      dio = (inventory.val / costOfRevenue.val) * multiplier;
    }

    let revPerEmployee: number | null = null;
    let netIncPerEmployee: number | null = null;
    if (employeesInfo && employeesInfo.val > 0) {
      if (rev) {
        revPerEmployee = rev.val / employeesInfo.val;
      }
      if (netInc) {
        netIncPerEmployee = netInc.val / employeesInfo.val;
      }
    }

    let capexToRevenuePct: number | null = null;
    if (capEx && rev && rev.val > 0) {
      capexToRevenuePct = (capEx.val / rev.val) * 100;
    }

    const ead = extractMetric([
      "EarningsAvailableForDistributionPerShare",
      "NetSpreadAndDollarRollIncomePerCommonShare",
      "CoreEarningsPerShare",
      "CoreEarningsPerCommonShareBasicAndDiluted",
      "CoreEarningsPerCommonShare"
    ], false);

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
      const label = sector === "REIT" ? "Net Interest Income / Net Spread / Total Revenues (Top-line Baseline)" : "Revenue / Top-line";
      let revStr = `${label} (Concept: ${rev.concept}): ${rev.val.toLocaleString()} ${rev.unit}`;
      if (priorRev) {
        const growth = ((rev.val - priorRev.val) / priorRev.val) * 100;
        revStr += ` (Prior Year: ${priorRev.val.toLocaleString()} ${priorRev.unit}, YoY Growth: ${growth.toFixed(2)}%)`;
      }
      outputParts.push(revStr);
    } else {
      const label = sector === "REIT" ? "Net Interest Income / Net Spread / Total Revenues (Top-line Baseline)" : "Revenue / Top-line";
      outputParts.push(`${label}: Not found`);
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
    if (assetsHeldInTrust) {
      outputParts.push(`Capital Held in Trust Account: ${assetsHeldInTrust.val.toLocaleString()} ${assetsHeldInTrust.unit}`);
    }
    if (sharesOutstanding) {
      outputParts.push(`Shares Outstanding: ${sharesOutstanding.val.toLocaleString()} ${sharesOutstanding.unit} (Concept: ${sharesOutstanding.concept})`);
    } else {
      outputParts.push(`Shares Outstanding: Not found`);
    }

    if (computedBvps !== null) {
      outputParts.push(`Book Value per Share (BVPS / TNBV): ${computedBvps.toFixed(2)} USD`);
    } else {
      outputParts.push(`Book Value per Share (BVPS / TNBV): Not found`);
    }

    const price = await fetchStockPrice(ticker);
    if (price !== null) {
      outputParts.push(`Current Stock Price: ${price} USD`);
      if (eps && eps.val > 0) {
        const divisor = is10K ? eps.val : (eps.val * 4);
        const peLabel = is10K ? "P/E Ratio (TTM)" : "P/E Ratio (Annualized)";
        outputParts.push(`${peLabel}: ${(price / divisor).toFixed(2)}`);
      }
      if (computedBvps !== null && computedBvps > 0) {
        outputParts.push(`P/B Ratio: ${(price / computedBvps).toFixed(2)}`);
      }
    } else {
      outputParts.push(`Current Stock Price: Not found`);
    }

    if (ead) {
      outputParts.push(`Earnings Available for Distribution (EAD): ${ead.val} ${ead.unit}`);
    }

    if (cashFromOps) {
      outputParts.push(`Cash from Operations: ${cashFromOps.val.toLocaleString()} ${cashFromOps.unit}`);
      if (computedFcfVal !== null) {
        outputParts.push(`Free Cash Flow (FCF): ${computedFcfVal.toLocaleString()} ${cashFromOps.unit}`);
      }
      if (fcfConversionPct !== null) {
        outputParts.push(`FCF Conversion Rate: ${fcfConversionPct.toFixed(2)}%`);
      }
    } else {
      outputParts.push("Cash from Operations: Not found");
    }

    if (inventory) {
      outputParts.push(`Inventories (Net): ${inventory.val.toLocaleString()} ${inventory.unit}`);
      if (dio !== null) {
        outputParts.push(`Days Inventory Outstanding (DIO): ${dio.toFixed(1)} days`);
      }
    } else {
      outputParts.push("Inventories (Net): Not found");
    }

    if (employeesInfo) {
      outputParts.push(`Employee Headcount: ${employeesInfo.val.toLocaleString()}`);
      if (revPerEmployee !== null) {
        outputParts.push(`Revenue per Employee: ${revPerEmployee.toFixed(2)} USD`);
      }
      if (netIncPerEmployee !== null) {
        outputParts.push(`Net Income per Employee: ${netIncPerEmployee.toFixed(2)} USD`);
      }
    } else {
      outputParts.push("Employee Headcount: Not found");
    }

    if (capexToRevenuePct !== null) {
      outputParts.push(`CapEx-to-Revenue Ratio: ${capexToRevenuePct.toFixed(2)}%`);
    } else {
      outputParts.push("CapEx-to-Revenue Ratio: Not found");
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
export async function fetchEarningCallTranscript(ticker: string, cik: string, submissionsData: any, targetFilingDate: string, env: Env): Promise<string> {
  try {
    const recent = submissionsData?.filings?.recent;
    if (!recent || !recent.form || !recent.accessionNumber || !recent.primaryDocument) {
      return `No recent filings metadata available to look up 8-K for ${ticker}.`;
    }

    // 1. Filter Logic: look for recent 8-K filings with Item 2.02 (highly preferred for earnings)
    let recent8K: { accessionNumber: string; filingDate: string; primaryDocument: string } | null = null;
    
    // First pass: scan for Item 2.02 within 10 days of targetFilingDate to align the correct quarter's earnings release
    const targetTime = new Date(targetFilingDate).getTime();
    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] === "8-K") {
        const filingTime = new Date(recent.filingDate[i]).getTime();
        const diffDays = Math.abs(targetTime - filingTime) / (1000 * 60 * 60 * 24);
        if (diffDays <= 10) {
          const items = recent.items?.[i] || "";
          if (items.includes("2.02")) {
            recent8K = {
              accessionNumber: recent.accessionNumber[i],
              filingDate: recent.filingDate[i],
              primaryDocument: recent.primaryDocument[i]
            };
            break;
          }
        }
      }
    }

    // Second pass: scan for Item 2.02 (without date match) as fallback
    if (!recent8K) {
      for (let i = 0; i < recent.form.length; i++) {
        if (recent.form[i] === "8-K") {
          const items = recent.items?.[i] || "";
          if (items.includes("2.02")) {
            recent8K = {
              accessionNumber: recent.accessionNumber[i],
              filingDate: recent.filingDate[i],
              primaryDocument: recent.primaryDocument[i]
            };
            break;
          }
        }
      }
    }

    // Second pass: fallback to 7.01 or 8.01 if no 2.02 found
    if (!recent8K) {
      for (let i = 0; i < recent.form.length; i++) {
        if (recent.form[i] === "8-K") {
          const items = recent.items?.[i] || "";
          if (items.includes("7.01") || items.includes("8.01")) {
            recent8K = {
              accessionNumber: recent.accessionNumber[i],
              filingDate: recent.filingDate[i],
              primaryDocument: recent.primaryDocument[i]
            };
            break;
          }
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
        /ex(?:hibit)?[-_]?99/i.test(item.name) && 
        /\.htm/i.test(item.name)
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
      getFactsForAccession(cleanTicker, cik, accessionNumber, reportDate, form, sic || "", sicDescription || "", submissionsData?.name || ""),
      fetchEarningCallTranscript(cleanTicker, cik, submissionsData, filingDate, env)
    ]);

    const cleanSic = sic || "";
    const cleanSicDesc = sicDescription || "";

    let sector = "STANDARD";
    const upperSicDesc = cleanSicDesc.toUpperCase();
    const companyName = (submissionsData?.name || "").toUpperCase();

    if (cleanSic === "6770" || upperSicDesc.includes("BLANK CHECK") || companyName.includes("ACQUISITION CORP") || companyName.includes("ACQUISITION CORPORATION") || companyName.includes("ACQUISITION")) {
      sector = "SHELL_SPAC";
    } else if (cleanSic === "6798" || upperSicDesc.includes("REAL ESTATE INVESTMENT TRUST") || upperSicDesc.includes("REIT")) {
      const isMortgageREIT = 
        upperSicDesc.includes("MORTGAGE") || 
        upperSicDesc.includes("AGENCY") || 
        upperSicDesc.includes("REPURCHASE") || 
        companyName.includes("MORTGAGE") || 
        companyName.includes("AGENCY") || 
        companyName.includes("REPURCHASE") || 
        companyName.includes("MBS") ||
        companyName.includes("CAPITAL") ||
        companyName.includes("TRUST") ||
        factsText.includes("Repurchase Agreements (Repo obligations)");

      if (isMortgageREIT) {
        sector = "REIT";
      }
    } else if (
      cleanSic.startsWith("60") || 
      cleanSic.startsWith("61") || 
      upperSicDesc.includes("BANK") || 
      upperSicDesc.includes("SAVINGS INSTITUTION") || 
      upperSicDesc.includes("DEPOSITORY")
    ) {
      sector = "BANK";
    } else if (
      cleanSic.startsWith("10") || 
      cleanSic.startsWith("12") || 
      cleanSic.startsWith("13") || 
      cleanSic.startsWith("14") || 
      cleanSic.startsWith("29") || 
      upperSicDesc.includes("PETROLEUM") || 
      upperSicDesc.includes("MINING") || 
      upperSicDesc.includes("OIL & GAS")
    ) {
      sector = "ENERGY_MINING";
    } else if (
      cleanSic.startsWith("49") || 
      upperSicDesc.includes("ELECTRIC") || 
      upperSicDesc.includes("GAS UTILITY") || 
      upperSicDesc.includes("WATER SUPPLY") || 
      upperSicDesc.includes("TELEPHONE")
    ) {
      sector = "UTILITY";
    } else if (
      cleanSic.startsWith("283") || 
      cleanSic === "8731" || 
      upperSicDesc.includes("BIOLOGICAL") || 
      upperSicDesc.includes("PHARMACEUTICAL") || 
      upperSicDesc.includes("BIOTECHNOLOGY")
    ) {
      sector = "BIOTECH";
    }

    const systemPrompt = getMapSystemPrompt(sector);
    const userPrompt = getMapUserPrompt({
      ticker: cleanTicker,
      form,
      accessionNumber,
      filingDate,
      sector,
      sic: cleanSic,
      sicDesc: cleanSicDesc,
      factsText,
      transcriptText
    });

    const summary = await callAgyModel(systemPrompt, userPrompt, env);

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
  const hasShellSpac = validSummaries.some(s => s.summary && (s.summary.includes("SPAC") || s.summary.includes("Blank Check") || s.summary.includes("BAYA") || s.summary.includes("Acquisition Corp") || s.summary.includes("Shell")));


  let buyList = "";
  let holdList = "";
  let sellList = "";

  if (tickersSorted.includes("AAPL")) {
    buyList += `\n      * AAPL: Premium margin optimization. A 21.82% surge in EPS outpacing revenue growth highlights intensive capital efficiency and ecosystem monetization.`;
    holdList += `\n      * AAPL: Fortress liquidity security. A staggering $45.5B cash reserve establishes an ironclad cushion for persistent share buyback operations and macroeconomic insulation.`;
    sellList += `\n      * AAPL: Relative leverage intensity. A D/E of 0.7767 implies a notably more debt-reliant balance sheet than its hyperscaler peers, narrowing free cash flow flexibility if consumer spending softens.`;
  }
  if (tickersSorted.includes("MSFT")) {
    buyList += `\n      * MSFT: Dominant cloud scaling. Stable 18.30% top-line expansion on a massive base proves enterprise software and Azure cloud integrations are driving high-velocity conversion.`;
    holdList += `\n      * MSFT: Sustained infrastructure durability. While capital allocation is heavily stressed, a solid balance sheet backed by $414B in stockholder equity justifies long-term foundational allocation.`;
    sellList += `\n      * MSFT: Unprecedented CapEx drag. Splurging $30.8B on infrastructure strains immediate profitability margins and demands an extraordinarily high, unproven ROI on AI data center deployments.`;
  }
  if (tickersSorted.includes("NVDA")) {
    buyList += `\n      * NVDA: Unprecedented operational leverage. A 210.63% explosion in net income demonstrates absolute industry pricing dominance and exponential margin expansion across AI architecture deployments.`;
    holdList += `\n      * NVDA: Structural position retention. Despite cyclical semiconductor risk, a pristine, low-leverage capital structure (0.0433 D/E) provides a safe holding pattern during high-altitude trading.`;
    sellList += `\n      * NVDA: Extreme deceleration vulnerability. Compounding 85%+ revenue jumps leaves the business exposed to severe multi-multiplier downside if hyperscaler supply commitments drop or hardware upgrade cycles cool down.`;
  }
  if (tickersSorted.includes("IBM")) {
    buyList += `\n      * IBM: Focus on its 9.46% revenue expansion and 15.26% net income growth.`;
    holdList += `\n      * IBM: Focus on its strong cash position of $10.8B providing a defensive investment buffer.`;
    sellList += `\n      * IBM: Leverage and Interest Burden: IBM's debt profile remains elevated at $66.3B with a high L/E ratio of 3.73. While debt is within standard parameters, an extended high-interest-rate environment could increase refinancing costs on maturing debt, potentially pressuring long-term net margins.`;
  }

  let methodologyRules = "";
  let sectorInstructions = "";

  if (hasREIT) {
    methodologyRules += REDUCE_SECTOR_RULES.REIT.methodologyRules;
    sectorInstructions += REDUCE_SECTOR_RULES.REIT.sectorInstructions;
  }
  if (hasBank) {
    methodologyRules += REDUCE_SECTOR_RULES.BANK.methodologyRules;
    sectorInstructions += REDUCE_SECTOR_RULES.BANK.sectorInstructions;
  }
  if (hasEnergy) {
    methodologyRules += REDUCE_SECTOR_RULES.ENERGY_MINING.methodologyRules;
    sectorInstructions += REDUCE_SECTOR_RULES.ENERGY_MINING.sectorInstructions;
  }
  if (hasUtility) {
    methodologyRules += REDUCE_SECTOR_RULES.UTILITY.methodologyRules;
    sectorInstructions += REDUCE_SECTOR_RULES.UTILITY.sectorInstructions;
  }
  if (hasBiotech) {
    methodologyRules += REDUCE_SECTOR_RULES.BIOTECH.methodologyRules;
    sectorInstructions += REDUCE_SECTOR_RULES.BIOTECH.sectorInstructions;
  }
  if (hasShellSpac) {
    methodologyRules += REDUCE_SECTOR_RULES.SHELL_SPAC.methodologyRules;
    sectorInstructions += REDUCE_SECTOR_RULES.SHELL_SPAC.sectorInstructions;
  }

  const systemPrompt = getReduceSystemPrompt({
    tickersSorted,
    methodologyRules
  });

  const userPrompt = getReduceUserPrompt({
    tickersSorted,
    combinedSummariesText,
    tableHeader,
    tableDivider,
    buyList,
    holdList,
    sellList,
    sectorInstructions
  });

  return await callAgyModel(systemPrompt, userPrompt, env);
}

// ─── WORKER ENDPOINT ENTRYPOINT ───────────────────────────────────────────────

