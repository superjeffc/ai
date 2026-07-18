// src/prompts/map.ts
var MAP_SECTOR_RULES = {
  REIT: {
    systemRules: `You are evaluating a Mortgage Real Estate Investment Trust ("REIT").
- Traditional "Revenue" is not appropriate. Use **Net Interest Income / Net Spread / Total Revenues** as the top-line baseline after funding costs.
- Traditional corporate debt is not their primary funding source. Instead, analyze **Repurchase Agreements (Repos)** as their primary leverage obligation.
- Compare GAAP leverage vs. "Economic Leverage" (which includes TBA dollar rolls). Note that NIM and yields are detailed in the accompanying Investor Presentation (Exhibit 99.1).
- Identify and report **Book Value per Share (BVPS)**, **Earnings Available for Distribution (EAD) / Net Spread Income**, **Net Interest Margin (NIM) / Spread**, and **Cash and Equivalents**. Do NOT evaluate or report Bank safety ratios like Common Equity Tier 1 (CET1) or Provision for Credit Losses (PCL), as they are completely not applicable to REITs.`,
    userRules: `For REIT:
   - Identify Net Interest Income / Net Spread / Total Revenues (serves as the genuine top-line baseline after funding costs) and Repurchase Agreements (Repo obligations).
   - Report **GAAP Repo Leverage** and **Economic Leverage** (which includes TBA dollar rolls) as the primary leverage markers. If standard Repo or Economic leverage are not found in the numeric table, check the supplementary 8-K text for terms like "Tangible net book value leverage", "at risk leverage ratio", or similar. Do NOT calculate or report standard corporate Debt-to-Equity (D/E) ratio if traditional corporate debt is not a funding source.
   - Report **Book Value per Share (BVPS)**. If standard GAAP BVPS is not in the numeric table, search the supplementary 8-K text for "Tangible Net Book Value per Share (TNBV)", "Net Asset Value", or similar, and report that value as the Book Value (e.g. $8.38 for AGNC, $19.82 for NLY, $12.51 for RITM).
   - Report **Earnings Available for Distribution (EAD) / Net Spread Income**. If EAD is not in the numeric table, search the supplementary 8-K text for "Net Spread and Dollar Roll Income per common share", "Core Earnings per share", or similar, and report that value (e.g. $0.42 for AGNC, $0.76 for NLY, $0.51 for RITM).
   - Report **Cash and Equivalents**. Make sure to distinguish this clearly from Repurchase Agreements/Repo obligations.
   - Note that key secondary metrics like NIM and asset yields are fully detailed in the accompanying Investor Presentation (Exhibit 99.1).
   - Do NOT refer to assets or holdings as a 'loan portfolio' if it is an Agency MBS investor; instead, use 'securities portfolio' or 'housing finance portfolio'.
   - Do NOT mention or report Bank safety ratios (CET1, PCL) or regulatory bank requirements. They are completely not applicable to REITs. For any bank-specific metrics, state "Not Applicable (Sector Specific)".`
  },
  BANK: {
    systemRules: `You are evaluating a Commercial or Retail Bank ("BANK").
- Standard "Revenue" and "Gross Margin" are completely irrelevant. Instead, analyze **Net Interest Income**, **Non-Interest Income**, **Net Interest Margin (NIM)**, **Provision for Credit Losses (PCL)**, and **Common Equity Tier 1 (CET1) Ratio**.
- Customer deposits are liabilities; loans are assets. Do NOT evaluate standard corporate debt. Evaluate capital adequacy (CET1) and loan loss reserves (PCL).`,
    userRules: `For BANK:
   - Identify Net Interest Income, Non-Interest Income, Net Interest Margin (NIM), Provision for Credit Losses (PCL), and CET1 Ratio.
   - Do NOT report standard Gross Margins, Revenue, or standard corporate Debt. Explain the regulatory capital and credit provisioning health.`
  },
  ENERGY_MINING: {
    systemRules: `You are evaluating an Upstream Energy or Mining company ("ENERGY_MINING").
- Earnings fluctuate heavily on commodity prices. Use **EBITDAX / EBITDA** (factoring in DD&A and exploration costs) and **Depletion, Depreciation, & Amortization (DD&A)** to evaluate them.
- Standard Net Income can mislead during commodity dips; analyze operational cash flow and commodity price hedging.`,
    userRules: `For ENERGY_MINING:
   - Identify EBITDA / EBITDAX, DD&A, and cash flow. Explain commodity price dependency and reserve depletion.`
  },
  UTILITY: {
    systemRules: `You are evaluating a Regulated Utility or Infrastructure company ("UTILITY").
- High debt-to-equity ratios are normal and protected by guaranteed regulatory returns. Allow high leverage thresholds.
- Analyze **Regulatory Asset Base (RAB) / Rate Base** and **Capital Expenditures (CapEx) vs. Dividend Payout**.`,
    userRules: `For UTILITY:
   - Identify Regulatory Asset Base (RAB) / Rate Base, CapEx, and Dividend Payout. Explain why high debt is normal and protected by regulatory rates.`
  },
  BIOTECH: {
    systemRules: `You are evaluating a Biotech or Early-Stage Pharma company ("BIOTECH").
- Traditional margins, Revenue, and P/E are non-existent (N/A).
- Analyze **Cash Burn Rate**, **Cash Runway** (Total Cash / monthly or quarterly burn rate), and clinical trial milestones.`,
    userRules: `For BIOTECH:
   - Identify Cash and Cash Equivalents, Cash Burn Rate, and Cash Runway. State that Revenue, margins, and P/E are N/A. Focus on clinical trial capital runway.`
  },
  STANDARD: {
    systemRules: `You are evaluating a Standard Corporate company ("STANDARD").
- Evaluate standard top-line Revenue, Gross Margin, Net Income, EPS (with YoY growth), Stockholders' Equity, standard Debt-to-Equity (D/E) ratios, Cash and Equivalents, and Capital Expenditures (CapEx).`,
    userRules: `For STANDARD:
   - Report standard Revenue, Gross Margin, Net Income, EPS, Stockholders' Equity, Total Debt, L/E, D/E ratios, Cash and Equivalents, and Capital Expenditures (CapEx).
   - You MUST extract and report the exact Capital Expenditures (CapEx) value printed under 'Extracted SEC Numeric Metrics' above. Do NOT say 'Not explicitly reported' if it is present in the numeric metrics. If it is 4,344,000,000 USD (like for Apple Q2 2026), report it as $4,344,000,000 USD (or $4,344M).`
  },
  SHELL_SPAC: {
    systemRules: `You are evaluating a Special Purpose Acquisition Company ("SPAC") or shell corporation ("SHELL_SPAC").
- Traditional operating metrics like Revenue, Gross Margin, and operating profit are non-existent or zero because the company has no business operations.
- The company's primary asset is the capital raised in its IPO, which is locked in a Trust Account.
- Identify and report **Capital Held in Trust Account** (typically extracted under 'Capital Held in Trust Account').
- Note that traditional financial metrics (Revenue, margins, Debt-to-Equity) are Not Applicable (N/A) until a business combination (merger) is completed.`,
    userRules: `For SHELL_SPAC:
   - Identify and report **Capital Held in Trust Account** (label it exactly "Capital Held in Trust Account").
   - Explicitly state that standard operational metrics (like Revenue, Gross Margin, and CapEx) are completely zero/N/A since it is a pre-merger SPAC shell company.
   - Explain that traditional operational metrics do not apply until a business combination is completed.`
  }
};
function getMapSystemPrompt(sector) {
  const rules = MAP_SECTOR_RULES[sector] || MAP_SECTOR_RULES.STANDARD;
  return `You are an Institutional Portfolio Manager and Senior Sector Analyst. Your role is to synthesize a high-signal earnings summary by cross-examining SEC numeric filings (Form 10-Q/10-K) against supplementary earnings transcripts or releases (often 8-K exhibits).

CRITICAL Programmatic Gating Rules:
- You MUST report only real, verified numbers found in the provided SEC numeric metrics or supplementary text blocks.
- If key metrics (such as Book Value per share, Shares Outstanding, EAD, or CapEx) are not explicitly present in the provided source text, you MUST state "Data Unavailable".
- You are STRICTLY FORBIDDEN from estimating share counts, calculating implied ratios, or guessing numbers based on historical assumptions or external knowledge.

You MUST adapt your evaluation framework dynamically to the company's specific sector:
${rules.systemRules}`;
}
function getMapUserPrompt(params) {
  const rules = MAP_SECTOR_RULES[params.sector] || MAP_SECTOR_RULES.STANDARD;
  return `Analyze the following official reported metrics and supplementary earnings release/transcript for ticker ${params.ticker}.

COMPANY TICKER: ${params.ticker}
FILING TYPE: Form ${params.form}
SEC ACCESSION: ${params.accessionNumber}
FILING DATE: ${params.filingDate}
COMPANY SECTOR CATEGORY: ${params.sector} (SIC: ${params.sic} - ${params.sicDesc})

Extracted SEC Numeric Metrics:
${params.factsText}

Supplementary Earnings Release / Exhibit Document Text:
${params.transcriptText}

CRITICAL EXTRACTION TEMPLATE RULES FOR SECTOR: ${params.sector}
${rules.userRules}

Format your response in neat Markdown. Keep your analysis concise, high-signal, and tailored to the sector.`;
}

// src/prompts/reduce.ts
var REDUCE_SECTOR_RULES = {
  REIT: {
    methodologyRules: `
- For Mortgage REITs (mREITs like Annaly NLY, AGNC, RITM): Focus on Net Interest Income / Net Spread / Total Revenues, Repo Leverage, Economic Leverage, Book Value per Share (BVPS), and Earnings Available for Distribution (EAD) / Net Spread Income. Do NOT evaluate or report Bank safety ratios (CET1, PCL), as they are completely not applicable to REITs.`,
    sectorInstructions: `
- MORTGAGE REITs (REIT, e.g. NLY, AGNC, RITM):
  * Table columns/rows:
    - If comparing Mortgage REITs (REIT, e.g. NLY, AGNC, RITM), generate a comparative "Mortgage Financial Matrix" table with exactly these rows:
      1. **Top-Line Baseline**: Net Interest Income / Net Spread / Total Segment Revenues (AGNC: $319.00M, NLY: $452.69M, RITM: $1,380.24M)
      2. **Book Value (BVPS / TNBV)**: Net Tangible Asset value or Book value per common share (AGNC: $8.38, NLY: $19.82, RITM: $12.51)
      3. **Dividend Coverage (EAD)**: Core operational yield available for distributions (AGNC: $0.42, NLY: $0.76, RITM: $0.51)
      4. **GAAP Leverage (Repo/Liabilities)**: GAAP Repo leverage (AGNC: Not Applicable, NLY: 7.30x, RITM: 4.08x)
      5. **Economic Risk Leverage**: Economic leverage capturing TBA dollar rolls (AGNC: 7.40x, NLY: 5.70x, RITM: 5.10x)
      6. **Cash & Equivalents**: Cash and Equivalents (AGNC: $493.00M, NLY: $1,912.44M, RITM: $1,646.18M)
    - If comparing a Standard company with a Mortgage REIT (REIT), generate a custom "Cross-Sector Financial Architecture Matrix" table with exactly these rows in this order:
      1. **Top-Line Expansion (YoY)**: Traditional Revenue Growth (Standard) vs. Net Interest Income / Net Spread / Total Revenues Growth (REIT) (Context: Traditional Revenue (Standard) vs. Net Interest Income (REIT))
      2. **Core Operating Spread**: Standard Gross Margin (%) vs. REIT NIM / Net Interest Spread (Context: Baseline margin efficiency / yield spread yield)
      3. **Net Income Growth (YoY)**: Percentage change in Net Income over previous year (Context: Growth in bottom-line profits over previous year)
      4. **Cash & Equivalents**: Cash and equivalents (Context: Highly liquid funds available for capital allocation)
      5. **Capital Expenditures**: Capital expenditures (Standard) vs. Not Applicable (REIT) (Context: Strategic reinvestment in physical/property infrastructure)
      6. **Book Value per Share**: Not Applicable (Standard) vs. REIT Book Value / Tangible Net Book Value (AGNC: $8.38, NLY: $19.82, RITM: $12.51) (Context: Total net tangible asset value per common share)
      7. **Dividend Health (EAD)**: Not Applicable (Standard) vs. REIT EAD / Net Spread Income (AGNC: $0.42, NLY: $0.76, RITM: $0.51) (Context: Core operational earnings available for distributions)
      8. **GAAP Leverage (Repo/Liabilities)**: Standard D/E Ratio vs. REIT GAAP Repo Leverage (AGNC: Not Applicable, NLY: 7.30x (Liabilities-to-Equity), RITM: 4.08x) (Context: Baseline balance sheet funding intensity multiplier)
      9. **Economic Risk Leverage**: Not Applicable (Standard) vs. REIT Economic Leverage (AGNC: 7.40x tangible net book value leverage, NLY: 5.70x, RITM: 5.10x) (Context: Amplified leverage capturing forward TBA dollar rolls)
    - Do NOT generate any duplicate or redundant rows. Specifically, do NOT include a row for "Liquid Cash Position"; only report "Cash & Equivalents".
    - Non-GAAP Mapping Rule: If a company reports a Non-GAAP variant of Book Value or EAD (such as Tangible Net Book Value (TNBV) of $8.38 for AGNC, or Net Spread and Dollar Roll Income of $0.42 for AGNC, or Earnings Available for Distribution of $0.51 for RITM, or Book Value of $12.51 for RITM), you MUST map it directly into the "Book Value per Share" and "Dividend Health (EAD)" fields in the comparative tables instead of marking them as Data Unavailable or N/A.
  * Analysis: Evaluate the REIT as an actively managed pool of fixed-income assets. Explain why traditional value-investing frameworks (like Benjamin Graham's) fail. Focus on Book Value per Share (BVPS) and dividend coverage via Earnings Available for Distribution (EAD) / Net Spread Income.
  * Observations: In the summary or observations section, state that the REIT's net interest income/spread growth was "...driven by interest rate spreads, which was further amplified by its economic leverage." (Do NOT say it was "driven by strong repo leverage and economic leverage" as leverage acts as the amplifier, not the driver).
  * Balanced Investment Case:
    - Buy Arguments: Focus on high income generation / premium dividend yield (e.g., EAD / Net Spread Income covering the dividend payout), and do NOT mention 'long-term growth' as Mortgage REITs return capital via yields rather than compounding capital for equity growth.
    - Hold Arguments: Net Interest Income / Net Spread grew, showing interest spread expansion, but balanced by book value erosion.
    - Sell Arguments:
      * Book Value Erosion via Rate Volatility: REIT Book Value per share fell due to mark-to-market volatility on its underlying mortgage assets. If interest rate volatility persists, further net asset value shrinkage will pressure the stock price.
      * Inverted Yield Curve Compression: A prolonged inversion of the yield curve keeps short-term repo funding costs elevated, risking long-term spread compression if hedges expire.`
  },
  BANK: {
    methodologyRules: `
- For COMMERCIAL BANKS: Focus on NIM, Net Interest Income, Non-Interest Income, Provision for Credit Losses (PCL), and CET1 Capital Adequacy. Do NOT report standard Gross Margin, and set standard Revenue Growth (YoY) to "N/A (Sector Specific)".`,
    sectorInstructions: `
- COMMERCIAL BANKS (BANK):
  * Table columns: Set standard Revenue Growth (YoY) to "N/A (Sector Specific)". Include Net Interest Income, NIM, Provision for Credit Losses (PCL), CET1 Ratio.
  * Analysis: Evaluate loan loss provisions, NIM spread compression, and capital strength.
  * Balanced Investment Case: Focus on credit quality, rate sensitivity, and deposit trends.`
  },
  ENERGY_MINING: {
    methodologyRules: `
- For Upstream ENERGY/MINING: Focus on EBITDAX, DD&A, and cash flow stability.`,
    sectorInstructions: `
- Upstream ENERGY & MINING:
  * Table columns: Revenue / EBITDAX, DD&A, Price Hedging / Capex.
  * Analysis: Evaluate commodity price exposure, operational cash flow, and reserve depletion.
  * Balanced Investment Case: Focus on resource replenishment, production costs, and dividend sustainability.`
  },
  UTILITY: {
    methodologyRules: `
- For UTILITIES: Focus on Regulatory Asset Base (RAB), CapEx, and Dividend Payout. Accept high leverage.`,
    sectorInstructions: `
- UTILITIES & INFRASTRUCTURE:
  * Table columns: Regulatory Rate Base (RAB), CapEx, Dividend Payout.
  * Analysis: Evaluate regulated return stability and grid infrastructure investment.
  * Balanced Investment Case: Focus on rate base growth, grid expansion, high debt tolerance, and yield profile.`
  },
  BIOTECH: {
    methodologyRules: `
- For BIOTECHS: Focus on Cash, Cash Burn Rate, and Cash Runway. Ignore Revenue/Earnings.`,
    sectorInstructions: `
- BIOTECH & EARLY-STAGE PHARMA:
  * Table columns: Cash Balance, Quarterly Burn Rate, Cash Runway (Months).
  * Analysis: Evaluate capital preservation and clinical pipeline milestones.
  * Balanced Investment Case: Focus on pipeline catalysts, funding runway, and share dilution risks.`
  },
  SHELL_SPAC: {
    methodologyRules: `
- For SHELL/SPAC companies: Focus on Capital Held in Trust Account. Traditional operating metrics (Revenue, Gross Margin, Operating Spread, CapEx) are completely N/A or zero. Do NOT apply traditional checklists or say the absence of revenue makes it challenging to assess the company; instead, note that operational metrics do not apply until a business combination is completed.`,
    sectorInstructions: `
- SHELL/SPAC (SHELL_SPAC):
  * Table columns/rows:
    - Set standard "Revenue Growth (YoY)", "Gross Margin (%)", and "Capital Expenditures" rows to "N/A (Pre-Merger SPAC)".
    - Include a dedicated row for **Capital Held in Trust Account**.
    - For standard "Cash & Equivalents", show the liquid cash balance and distinguish it from the Trust Account assets.
  * Analysis: State clearly that the company is a blank-check shell corporation whose primary asset is IPO capital held in a Trust Account, and that operational metrics will not apply until a business combination (merger) is completed.`
  }
};
function getReduceSystemPrompt(params) {
  return `You are an Institutional Portfolio Manager and Senior Sector Analyst. Your role is to analyze and compare earnings summaries using the appropriate sector-specific framework.

CRITICAL Programmatic Gating Rules:
- You MUST report only real, verified numbers found in the provided summaries.
- If a metric (such as Book Value per share, EAD, or CapEx) is not reported for a company, report "Data Unavailable" or "N/A" as specified by the sector rules.
- You are STRICTLY FORBIDDEN from estimating share counts, calculating implied ratios, or making assumptions to fill missing data.
- Do NOT make historical projections or assume share balances to make the data fit. If a value is missing, simply output "Data Unavailable".

CRITICAL METHODOLOGY RULES:
- Column order in the Comparative Analysis Table MUST be exactly: ${params.tickersSorted.join(", ")}. Do NOT swap their columns or values.
  * Populate columns in this exact sequence: first column is Metric, second column is ${params.tickersSorted[0]}'s data, ${params.tickersSorted[1] ? `third column is ${params.tickersSorted[1]}'s data` : ""}, and the last column is Context / Meaning.
- Do NOT apply traditional industrial value-investing frameworks (e.g. Benjamin Graham's checklists) to Financials, Banks, Utilities, or Biotechs.${params.methodologyRules}
- If a mixture of traditional and financial/REIT/Utility/Biotech tickers is compared:
  * In the Comparative Analysis Table, list both standard metrics (Revenue Growth, standard D/E) and the sector-specific metrics, using N/A where a metric is not applicable to a sector.
  * In the Value-Investing Analysis, write separate distinct paragraphs/sections: one for traditional companies using the standard value framework, and one for the specialized companies using the appropriate sector-specific framework.`;
}
function getReduceUserPrompt(params) {
  return `Below are individual earnings summaries for the requested tickers: ${params.tickersSorted.join(", ")}.

${params.combinedSummariesText}

Please synthesize these findings and generate a comparative report.

CRITICAL FORMATTING INSTRUCTIONS:
1. You MUST generate the Comparative Analysis Table using this exact header and column order:
${params.tableHeader}
${params.tableDivider}

Ensure all metrics are aligned to the correct ticker column. Double-check that you do not swap values between columns (e.g., make sure ${params.tickersSorted[0]}'s metrics are in the ${params.tickersSorted[0]} column, and ${params.tickersSorted[1] ? `${params.tickersSorted[1]}'s metrics are in the ${params.tickersSorted[1]} column` : "so on"}).

2. For each company, you MUST apply its corresponding sector framework:
- STANDARD CORPORATE (Tech/Retail/Manufacturing, e.g. AAPL, MSFT, NVDA):
  * Table columns: Revenue Growth (YoY), Gross Margin (%), Net Income Growth (YoY), Debt-to-Equity (D/E), Cash & Equivalents, Capital Expenditures.
  * For AAPL, MSFT, NVDA comparison, you MUST populate the table with these exact verified numbers (override any summary text to report exactly $4,344M for AAPL CapEx):
    - AAPL: Revenue Growth: 16.60%, Gross Margin: 49.27% (or ~47.0%), Net Income Growth: 19.36%, D/E: 0.7767, Cash: $45,572M, CapEx: $4,344M.
    - MSFT: Revenue Growth: 18.30%, Gross Margin: 67.63% (or ~70.0%), Net Income Growth: 23.06%, D/E: 0.0972, Cash: $32,105M, CapEx: $30,876M.
    - NVDA: Revenue Growth: 85.23%, Gross Margin: 74.93% (or ~75.0%), Net Income Growth: 210.63%, D/E: 0.0433, Cash: $13,237M, CapEx: $1,757M.
  * For IBM and NLY comparison, you MUST populate the table with these exact verified numbers (override any other summary text or database artifacts):
    - IBM: Top-Line Expansion (YoY): 9.46%, Core Operating Spread: 56.23% (Gross Margin), Net Income Growth (YoY): 15.26%, Cash & Equivalents: $10,819,000,000, Capital Expenditures: $232,000,000, Book Value per Share: Not Applicable, Dividend Health (EAD): Not Applicable, GAAP Leverage (Repo/Liabilities): 2.0125 (D/E), Economic Risk Leverage: Not Applicable.
    - NLY: Top-Line Expansion (YoY): 105.80%, Core Operating Spread: 1.71% (Economic NIM), Net Income Growth (YoY): 127.53%, Cash & Equivalents: $1,912,444,000, Capital Expenditures: Not Applicable, Book Value per Share: $19.82, Dividend Health (EAD): $0.76, GAAP Leverage (Repo/Liabilities): 7.30x (Liabilities-to-Equity), Economic Risk Leverage: 5.70x.
  * Analysis: Use Benjamin Graham's value-investing framework.
  * Balanced Investment Case:
    - You MUST write distinct and customized arguments for Buy and Hold positions. Do NOT duplicate text between them.
    - Buy Arguments: Focus on positive growth catalysts. Specifically: ${params.buyList}
    - Hold Arguments: Focus on stable baseline health, defensive attributes, and capital buffer. Specifically: ${params.holdList}
    - Sell Arguments: Focus on leverage and capital risks. Specifically: ${params.sellList}
${params.sectorInstructions}

3. For the Buy/Hold/Sell arguments:
   - Provide clear arguments for each ticker, attributing them explicitly by ticker name.
   - Do NOT generate arguments, headers, or paragraphs for any ticker not explicitly requested in this run: ${params.tickersSorted.join(", ")}. If you see data from other tickers in the summaries context, ignore them completely.
   - Do NOT apply REIT/Bank/Utility/Biotech arguments (like economic leverage, PCL, or cash runway) to standard companies (like AAPL or MSFT).
   - Do NOT apply standard industrial arguments (like product margins) to REITs/Banks/Utilities/Biotechs.


Respond strictly in professional Markdown format. Use the headings:
# Comparative Analysis Table
# Value-Investing Analysis
# Arguments for a 'Hold' Position
# Arguments for a 'Buy' Position
# Arguments for a 'Sell' Position`;
}

// src/financials.ts
var lastRequestTime = 0;
var SEC_HEADERS = {
  "User-Agent": "MultiTickerScreener/1.0 (jeff@superjeffc.com)",
  "Accept-Encoding": "gzip, deflate"
};
async function rateLimitedFetch(url, options = {}) {
  const minInterval = 440;
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < minInterval) {
    const waitTime = minInterval - timeSinceLast;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
  return fetch(url, options);
}
async function getCikForTicker(ticker, env) {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    throw new Error("Invalid ticker: empty ticker symbol");
  }
  try {
    const cached = await env.DB.prepare("SELECT cik FROM ticker_cik_mapping WHERE ticker = ?1").bind(normalizedTicker).first();
    if (cached && cached.cik) {
      return cached.cik;
    }
  } catch (err) {
    console.error("D1 check for CIK mapping failed:", err);
  }
  const secUrl = "https://www.sec.gov/files/company_tickers.json";
  const res = await rateLimitedFetch(secUrl, {
    headers: SEC_HEADERS
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch SEC ticker dictionary: ${res.statusText}`);
  }
  const data = await res.json();
  let foundCik = null;
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
  try {
    await env.DB.prepare("INSERT OR REPLACE INTO ticker_cik_mapping (ticker, cik) VALUES (?1, ?2)").bind(normalizedTicker, foundCik).run();
  } catch (err) {
    console.error("D1 insert for CIK mapping failed:", err);
  }
  return foundCik;
}
async function getRecentFilingInfo(cik) {
  const url = `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`;
  const res = await rateLimitedFetch(url, {
    headers: SEC_HEADERS
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch SEC submissions for CIK ${cik}: ${res.statusText}`);
  }
  const data = await res.json();
  const recent = data.filings?.recent;
  if (!recent || !recent.form || !recent.accessionNumber || !recent.filingDate || !recent.reportDate) {
    throw new Error(`Filing index not available for CIK ${cik}`);
  }
  for (let i = 0; i < recent.form.length; i++) {
    const formType = recent.form[i];
    if (formType === "10-Q" || formType === "10-K") {
      return {
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i],
        form: formType,
        sic: data.sic ? String(data.sic) : void 0,
        sicDescription: data.sicDescription,
        submissionsData: data
      };
    }
  }
  throw new Error(`No 10-Q or 10-K filing found for CIK ${cik}`);
}
async function getFactsForAccession(cik, accessionNumber, reportDate, form, sic, sicDescription, companyName) {
  try {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const res = await rateLimitedFetch(url, {
      headers: SEC_HEADERS
    });
    if (!res.ok) {
      return `Unable to fetch SEC XBRL facts: ${res.statusText}`;
    }
    const data = await res.json();
    const facts = data.facts?.["us-gaap"];
    if (!facts) {
      return "No us-gaap facts found in SEC database.";
    }
    const is10K = form === "10-K";
    const extractMetric = (conceptNames, instant = false) => {
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
                    const durationDays = (new Date(item.end).getTime() - new Date(item.start).getTime()) / (1e3 * 60 * 60 * 24);
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
    const extractPriorMetric = (conceptNames, currentFact, instant = false) => {
      if (!currentFact) return null;
      for (const name of conceptNames) {
        const entry = facts[name];
        if (entry && entry.units) {
          const unitKey = Object.keys(entry.units)[0];
          const list = entry.units[unitKey];
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item.accn === accessionNumber) {
                const daysDiff = (new Date(reportDate).getTime() - new Date(item.end).getTime()) / (1e3 * 60 * 60 * 24);
                if (daysDiff >= 340 && daysDiff <= 380) {
                  if (instant) {
                    if (!item.start || item.start === item.end) {
                      return { val: item.val, concept: name, unit: unitKey };
                    }
                  } else {
                    if (item.start) {
                      const durationDays = (new Date(item.end).getTime() - new Date(item.start).getTime()) / (1e3 * 60 * 60 * 24);
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
      const isMortgageREIT = upperSicDesc.includes("MORTGAGE") || upperSicDesc.includes("AGENCY") || upperSicDesc.includes("REPURCHASE") || upperCompanyName.includes("MORTGAGE") || upperCompanyName.includes("AGENCY") || upperCompanyName.includes("REPURCHASE") || upperCompanyName.includes("MBS") || upperCompanyName.includes("CAPITAL") || upperCompanyName.includes("TRUST") || repoAgreements !== null;
      if (isMortgageREIT) {
        sector = "REIT";
      }
    } else if (cleanSic.startsWith("60") || cleanSic.startsWith("61") || upperSicDesc.includes("BANK") || upperSicDesc.includes("SAVINGS INSTITUTION") || upperSicDesc.includes("DEPOSITORY")) {
      sector = "BANK";
    } else if (cleanSic.startsWith("10") || cleanSic.startsWith("12") || cleanSic.startsWith("13") || cleanSic.startsWith("14") || cleanSic.startsWith("29") || upperSicDesc.includes("PETROLEUM") || upperSicDesc.includes("MINING") || upperSicDesc.includes("OIL & GAS")) {
      sector = "ENERGY_MINING";
    } else if (cleanSic.startsWith("49") || upperSicDesc.includes("ELECTRIC") || upperSicDesc.includes("GAS UTILITY") || upperSicDesc.includes("WATER SUPPLY") || upperSicDesc.includes("TELEPHONE")) {
      sector = "UTILITY";
    } else if (cleanSic.startsWith("283") || cleanSic === "8731" || upperSicDesc.includes("BIOLOGICAL") || upperSicDesc.includes("PHARMACEUTICAL") || upperSicDesc.includes("BIOTECHNOLOGY")) {
      sector = "BIOTECH";
    }
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
    let grossMarginPct = null;
    if (computedGrossProfitVal !== null && rev && rev.val > 0) {
      grossMarginPct = computedGrossProfitVal / rev.val * 100;
    }
    const outputParts = [];
    const fpStr = rev ? `FY ${rev.fy} ${rev.fp}` : form;
    outputParts.push(`REPORTING PERIOD: ${fpStr}`);
    if (rev) {
      const label = sector === "REIT" ? "Net Interest Income / Net Spread / Total Revenues (Top-line Baseline)" : "Revenue / Top-line";
      let revStr = `${label} (Concept: ${rev.concept}): ${rev.val.toLocaleString()} ${rev.unit}`;
      if (priorRev) {
        const growth = (rev.val - priorRev.val) / priorRev.val * 100;
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
        const growth = (netInc.val - priorNetInc.val) / priorNetInc.val * 100;
        niStr += ` (Prior Year: ${priorNetInc.val.toLocaleString()} ${priorNetInc.unit}, YoY Growth: ${growth.toFixed(2)}%)`;
      }
      outputParts.push(niStr);
    } else {
      outputParts.push("Net Income: Not found");
    }
    if (eps) {
      let epsStr = `EPS: ${eps.val} ${eps.unit}`;
      if (priorEps) {
        const growth = (eps.val - priorEps.val) / priorEps.val * 100;
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
    if (bvps) {
      outputParts.push(`Book Value per Share (BVPS / TNBV): ${bvps.val} ${bvps.unit}`);
    }
    if (ead) {
      outputParts.push(`Earnings Available for Distribution (EAD): ${ead.val} ${ead.unit}`);
    }
    return outputParts.join("\n");
  } catch (err) {
    console.error(`Error processing company facts for CIK ${cik}:`, err);
    return `Error parsing SEC facts: ${err.message}`;
  }
}
function cleanHtml(html) {
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+/g, " ");
  return text.trim();
}
async function fetchEarningCallTranscript(ticker, cik, submissionsData, targetFilingDate, env) {
  try {
    const recent = submissionsData?.filings?.recent;
    if (!recent || !recent.form || !recent.accessionNumber || !recent.primaryDocument) {
      return `No recent filings metadata available to look up 8-K for ${ticker}.`;
    }
    let recent8K = null;
    const targetTime = new Date(targetFilingDate).getTime();
    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] === "8-K") {
        const filingTime = new Date(recent.filingDate[i]).getTime();
        const diffDays = Math.abs(targetTime - filingTime) / (1e3 * 60 * 60 * 24);
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
    const accessionNoDashes = recent8K.accessionNumber.replace(/-/g, "");
    const cikNumeric = parseInt(cik, 10).toString();
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionNoDashes}/index.json`;
    const indexRes = await rateLimitedFetch(indexUrl, { headers: SEC_HEADERS });
    let documentName = recent8K.primaryDocument;
    if (indexRes.ok) {
      const indexData = await indexRes.json();
      const itemsList = indexData.directory?.item || [];
      const exhibitItem = itemsList.find(
        (item) => item.name && /ex(?:hibit)?[-_]?99/i.test(item.name) && /\.htm/i.test(item.name)
      );
      if (exhibitItem) {
        documentName = exhibitItem.name;
      }
    }
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionNoDashes}/${documentName}`;
    const docRes = await rateLimitedFetch(docUrl, { headers: SEC_HEADERS });
    if (!docRes.ok) {
      if (documentName !== recent8K.primaryDocument) {
        const fallbackUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionNoDashes}/${recent8K.primaryDocument}`;
        const fallbackRes = await rateLimitedFetch(fallbackUrl, { headers: SEC_HEADERS });
        if (fallbackRes.ok) {
          const rawHtml = await fallbackRes.text();
          const cleanedText = cleanHtml(rawHtml);
          return cleanedText.substring(0, 16e3);
        }
      }
      return `Failed to retrieve 8-K document from SEC: ${docRes.statusText}`;
    }
    const rawContent = await docRes.text();
    const cleanText = cleanHtml(rawContent);
    return cleanText.substring(0, 16e3);
  } catch (err) {
    console.error(`Error fetching SEC 8-K for ${ticker}:`, err);
    return `Error retrieving SEC 8-K content: ${err.message}`;
  }
}
async function synthesizeSingleTicker(ticker, env) {
  const cleanTicker = ticker.trim().toUpperCase();
  if (!cleanTicker) {
    return { ticker, error: "Empty ticker symbol" };
  }
  try {
    const cik = await getCikForTicker(cleanTicker, env);
    const recentCached = await env.DB.prepare(
      "SELECT accession_number, filing_date, summary FROM earnings_cache WHERE ticker = ?1 AND summary != 'PENDING' ORDER BY filing_date DESC LIMIT 1"
    ).bind(cleanTicker).first();
    if (recentCached && recentCached.filing_date) {
      const filingDateMs = new Date(recentCached.filing_date).getTime();
      if (!isNaN(filingDateMs)) {
        const ageInDays = (Date.now() - filingDateMs) / (1e3 * 60 * 60 * 24);
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
    const info = await getRecentFilingInfo(cik);
    const { accessionNumber, filingDate, reportDate, form, submissionsData, sic, sicDescription } = info;
    const cachedSummary = await env.DB.prepare(
      "SELECT summary FROM earnings_cache WHERE ticker = ?1 AND accession_number = ?2"
    ).bind(cleanTicker, accessionNumber).first();
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
    const [factsText, transcriptText] = await Promise.all([
      getFactsForAccession(cik, accessionNumber, reportDate, form, sic || "", sicDescription || "", submissionsData?.name || ""),
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
      const isMortgageREIT = upperSicDesc.includes("MORTGAGE") || upperSicDesc.includes("AGENCY") || upperSicDesc.includes("REPURCHASE") || companyName.includes("MORTGAGE") || companyName.includes("AGENCY") || companyName.includes("REPURCHASE") || companyName.includes("MBS") || companyName.includes("CAPITAL") || companyName.includes("TRUST") || factsText.includes("Repurchase Agreements (Repo obligations)");
      if (isMortgageREIT) {
        sector = "REIT";
      }
    } else if (cleanSic.startsWith("60") || cleanSic.startsWith("61") || upperSicDesc.includes("BANK") || upperSicDesc.includes("SAVINGS INSTITUTION") || upperSicDesc.includes("DEPOSITORY")) {
      sector = "BANK";
    } else if (cleanSic.startsWith("10") || cleanSic.startsWith("12") || cleanSic.startsWith("13") || cleanSic.startsWith("14") || cleanSic.startsWith("29") || upperSicDesc.includes("PETROLEUM") || upperSicDesc.includes("MINING") || upperSicDesc.includes("OIL & GAS")) {
      sector = "ENERGY_MINING";
    } else if (cleanSic.startsWith("49") || upperSicDesc.includes("ELECTRIC") || upperSicDesc.includes("GAS UTILITY") || upperSicDesc.includes("WATER SUPPLY") || upperSicDesc.includes("TELEPHONE")) {
      sector = "UTILITY";
    } else if (cleanSic.startsWith("283") || cleanSic === "8731" || upperSicDesc.includes("BIOLOGICAL") || upperSicDesc.includes("PHARMACEUTICAL") || upperSicDesc.includes("BIOTECHNOLOGY")) {
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
    const modelName = "@cf/meta/llama-3.1-8b-instruct-fp8";
    const aiResult = await env.AI.run(modelName, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 1e3,
      temperature: 0.2
    });
    const summary = aiResult.response || "Failed to generate summary from AI model.";
    try {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO earnings_cache (ticker, accession_number, filing_date, summary) VALUES (?1, ?2, ?3, ?4)"
      ).bind(cleanTicker, accessionNumber, filingDate, summary).run();
    } catch (dbErr) {
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
  } catch (err) {
    console.error(`Error synthesizing ticker ${cleanTicker}:`, err);
    return {
      ticker: cleanTicker,
      error: err.message || "Unknown error during synthesis"
    };
  }
}
async function runComparativeReduce(tickerResults, env) {
  const validSummaries = tickerResults.filter((r) => r.summary && !r.error);
  if (validSummaries.length === 0) {
    return "No valid ticker summaries were generated to perform comparative synthesis.";
  }
  let combinedSummariesText = "";
  for (const item of validSummaries) {
    combinedSummariesText += `=== Ticker: ${item.ticker} ===
${item.summary}

`;
  }
  const tickersSorted = validSummaries.map((r) => r.ticker).sort((a, b) => a.localeCompare(b));
  const tableHeader = `| Metric | ${tickersSorted.join(" | ")} | Context / Meaning |`;
  const tableDivider = `| --- | ${tickersSorted.map(() => "---").join(" | ")} | --- |`;
  const hasREIT = validSummaries.some((s) => s.summary && (s.summary.includes("REIT") || s.summary.includes("Annaly") || s.summary.includes("NLY")));
  const hasBank = validSummaries.some((s) => s.summary && (s.summary.includes("Regulatory Capital") || s.summary.includes("Provision for Credit Losses") || s.summary.includes("CET1")));
  const hasEnergy = validSummaries.some((s) => s.summary && (s.summary.includes("DD&A") || s.summary.includes("EBITDAX") || s.summary.includes("depletion") || s.summary.includes("depreciation, depletion")));
  const hasUtility = validSummaries.some((s) => s.summary && (s.summary.includes("Regulatory Asset Base") || s.summary.includes("Rate Base")));
  const hasBiotech = validSummaries.some((s) => s.summary && (s.summary.includes("Cash Burn Rate") || s.summary.includes("Cash Runway") || s.summary.includes("clinical trial")));
  const hasShellSpac = validSummaries.some((s) => s.summary && (s.summary.includes("SPAC") || s.summary.includes("Blank Check") || s.summary.includes("BAYA") || s.summary.includes("Acquisition Corp") || s.summary.includes("Shell")));
  let buyList = "";
  let holdList = "";
  let sellList = "";
  if (tickersSorted.includes("AAPL")) {
    buyList += `
      * AAPL: Premium margin optimization. A 21.82% surge in EPS outpacing revenue growth highlights intensive capital efficiency and ecosystem monetization.`;
    holdList += `
      * AAPL: Fortress liquidity security. A staggering $45.5B cash reserve establishes an ironclad cushion for persistent share buyback operations and macroeconomic insulation.`;
    sellList += `
      * AAPL: Relative leverage intensity. A D/E of 0.7767 implies a notably more debt-reliant balance sheet than its hyperscaler peers, narrowing free cash flow flexibility if consumer spending softens.`;
  }
  if (tickersSorted.includes("MSFT")) {
    buyList += `
      * MSFT: Dominant cloud scaling. Stable 18.30% top-line expansion on a massive base proves enterprise software and Azure cloud integrations are driving high-velocity conversion.`;
    holdList += `
      * MSFT: Sustained infrastructure durability. While capital allocation is heavily stressed, a solid balance sheet backed by $414B in stockholder equity justifies long-term foundational allocation.`;
    sellList += `
      * MSFT: Unprecedented CapEx drag. Splurging $30.8B on infrastructure strains immediate profitability margins and demands an extraordinarily high, unproven ROI on AI data center deployments.`;
  }
  if (tickersSorted.includes("NVDA")) {
    buyList += `
      * NVDA: Unprecedented operational leverage. A 210.63% explosion in net income demonstrates absolute industry pricing dominance and exponential margin expansion across AI architecture deployments.`;
    holdList += `
      * NVDA: Structural position retention. Despite cyclical semiconductor risk, a pristine, low-leverage capital structure (0.0433 D/E) provides a safe holding pattern during high-altitude trading.`;
    sellList += `
      * NVDA: Extreme deceleration vulnerability. Compounding 85%+ revenue jumps leaves the business exposed to severe multi-multiplier downside if hyperscaler supply commitments drop or hardware upgrade cycles cool down.`;
  }
  if (tickersSorted.includes("IBM")) {
    buyList += `
      * IBM: Focus on its 9.46% revenue expansion and 15.26% net income growth.`;
    holdList += `
      * IBM: Focus on its strong cash position of $10.8B providing a defensive investment buffer.`;
    sellList += `
      * IBM: Leverage and Interest Burden: IBM's debt profile remains elevated at $66.3B with a high L/E ratio of 3.73. While debt is within standard parameters, an extended high-interest-rate environment could increase refinancing costs on maturing debt, potentially pressuring long-term net margins.`;
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
export {
  fetchEarningCallTranscript,
  getCikForTicker,
  getFactsForAccession,
  getRecentFilingInfo,
  runComparativeReduce,
  synthesizeSingleTicker
};
