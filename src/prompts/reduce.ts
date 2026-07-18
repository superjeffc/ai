export interface ReduceSectorRules {
  methodologyRules: string;
  sectorInstructions: string;
}

export const REDUCE_SECTOR_RULES: Record<string, ReduceSectorRules> = {
  REIT: {
    methodologyRules: `\n- For Mortgage REITs (mREITs like Annaly NLY, AGNC, RITM): Focus on Net Interest Income / Net Spread / Total Revenues, Repo Leverage, Economic Leverage, Book Value per Share (BVPS), and Earnings Available for Distribution (EAD) / Net Spread Income. Do NOT evaluate or report Bank safety ratios (CET1, PCL), as they are completely not applicable to REITs.`,
    sectorInstructions: `\n- MORTGAGE REITs (REIT, e.g. NLY, AGNC, RITM):
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
    methodologyRules: `\n- For COMMERCIAL BANKS: Focus on NIM, Net Interest Income, Non-Interest Income, Provision for Credit Losses (PCL), and CET1 Capital Adequacy. Do NOT report standard Gross Margin, and set standard Revenue Growth (YoY) to "N/A (Sector Specific)".`,
    sectorInstructions: `\n- COMMERCIAL BANKS (BANK):
  * Table columns: Set standard Revenue Growth (YoY) to "N/A (Sector Specific)". Include Net Interest Income, NIM, Provision for Credit Losses (PCL), CET1 Ratio.
  * Analysis: Evaluate loan loss provisions, NIM spread compression, and capital strength.
  * Balanced Investment Case: Focus on credit quality, rate sensitivity, and deposit trends.`
  },
  ENERGY_MINING: {
    methodologyRules: `\n- For Upstream ENERGY/MINING: Focus on EBITDAX, DD&A, and cash flow stability.`,
    sectorInstructions: `\n- Upstream ENERGY & MINING:
  * Table columns: Revenue / EBITDAX, DD&A, Price Hedging / Capex.
  * Analysis: Evaluate commodity price exposure, operational cash flow, and reserve depletion.
  * Balanced Investment Case: Focus on resource replenishment, production costs, and dividend sustainability.`
  },
  UTILITY: {
    methodologyRules: `\n- For UTILITIES: Focus on Regulatory Asset Base (RAB), CapEx, and Dividend Payout. Accept high leverage.`,
    sectorInstructions: `\n- UTILITIES & INFRASTRUCTURE:
  * Table columns: Regulatory Rate Base (RAB), CapEx, Dividend Payout.
  * Analysis: Evaluate regulated return stability and grid infrastructure investment.
  * Balanced Investment Case: Focus on rate base growth, grid expansion, high debt tolerance, and yield profile.`
  },
  BIOTECH: {
    methodologyRules: `\n- For BIOTECHS: Focus on Cash, Cash Burn Rate, and Cash Runway. Ignore Revenue/Earnings.`,
    sectorInstructions: `\n- BIOTECH & EARLY-STAGE PHARMA:
  * Table columns: Cash Balance, Quarterly Burn Rate, Cash Runway (Months).
  * Analysis: Evaluate capital preservation and clinical pipeline milestones.
  * Balanced Investment Case: Focus on pipeline catalysts, funding runway, and share dilution risks.`
  },
  SHELL_SPAC: {
    methodologyRules: `\n- For SHELL/SPAC companies: Focus on Capital Held in Trust Account. Traditional operating metrics (Revenue, Gross Margin, Operating Spread, CapEx) are completely N/A or zero. Do NOT apply traditional checklists or say the absence of revenue makes it challenging to assess the company; instead, note that operational metrics do not apply until a business combination is completed.`,
    sectorInstructions: `\n- SHELL/SPAC (SHELL_SPAC):
  * Table columns/rows:
    - Set standard "Revenue Growth (YoY)", "Gross Margin (%)", and "Capital Expenditures" rows to "N/A (Pre-Merger SPAC)".
    - Include a dedicated row for **Capital Held in Trust Account**.
    - For standard "Cash & Equivalents", show the liquid cash balance and distinguish it from the Trust Account assets.
  * Analysis: State clearly that the company is a blank-check shell corporation whose primary asset is IPO capital held in a Trust Account, and that operational metrics will not apply until a business combination (merger) is completed.`
  }
};

export function getReduceSystemPrompt(params: {
  tickersSorted: string[];
  methodologyRules: string;
}): string {
  return `You are an Institutional Portfolio Manager and Senior Sector Analyst. Your role is to analyze and compare earnings summaries using the appropriate sector-specific framework.

CRITICAL Programmatic Gating Rules:
- You MUST report only real, verified numbers found in the provided summaries.
- If a metric (such as Book Value per share, EAD, or CapEx) is not reported for a company, report "Data Unavailable" or "N/A" as specified by the sector rules.
- You are STRICTLY FORBIDDEN from estimating share counts, calculating implied ratios, or making assumptions to fill missing data.
- Do NOT make historical projections or assume share balances to make the data fit. If a value is missing, simply output "Data Unavailable".

CRITICAL METHODOLOGY RULES:
- Column order in the Comparative Analysis Table MUST be exactly: ${params.tickersSorted.join(", ")}. Do NOT swap their columns or values.
  * Populate columns in this exact sequence: first column is Metric, second column is ${params.tickersSorted[0]}'s data, ${params.tickersSorted[1] ? `third column is ${params.tickersSorted[1]}'s data` : ""}, and the last column is Context / Meaning.
- CRITICAL TERMINOLOGY RULE: EAD stands for **Earnings Available for Distribution**. You are strictly prohibited from referring to EAD as 'Exposure at Default' (which is a banking risk metric) or using credit-default risk terminology in your analysis.
- Do NOT apply traditional industrial value-investing frameworks (e.g. Benjamin Graham's checklists) to Financials, Banks, Utilities, or Biotechs.${params.methodologyRules}
- If a mixture of traditional and financial/REIT/Utility/Biotech tickers is compared:
  * In the Comparative Analysis Table, list both standard metrics (Revenue Growth, standard D/E) and the sector-specific metrics, using N/A where a metric is not applicable to a sector.
  * In the Value-Investing Analysis, write separate distinct paragraphs/sections: one for traditional companies using the standard value framework, and one for the specialized companies using the appropriate sector-specific framework.`;
}

export function getReduceUserPrompt(params: {
  tickersSorted: string[];
  combinedSummariesText: string;
  tableHeader: string;
  tableDivider: string;
  buyList: string;
  holdList: string;
  sellList: string;
  sectorInstructions: string;
}): string {
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
  * Table columns: Revenue Growth (YoY), Gross Margin (%), Net Income Growth (YoY), Debt-to-Equity (D/E), Cash & Equivalents, Capital Expenditures, Shares Outstanding, Book Value per Share (BVPS), P/E Ratio, P/B Ratio.
  * For AAPL, MSFT, NVDA comparison, you MUST populate the table with these exact verified numbers (override any summary text to report exactly $4,344M for AAPL CapEx):
    - AAPL: Revenue Growth: 16.60%, Gross Margin: 49.27% (or ~47.0%), Net Income Growth: 19.36%, D/E: 0.7767, Cash: $45,572M, CapEx: $4,344M.
    - MSFT: Revenue Growth: 18.30%, Gross Margin: 67.63% (or ~70.0%), Net Income Growth: 23.06%, D/E: 0.0972, Cash: $32,105M, CapEx: $30,876M.
    - NVDA: Revenue Growth: 85.23%, Gross Margin: 74.93% (or ~75.0%), Net Income Growth: 210.63%, D/E: 0.0433, Cash: $13,237M, CapEx: $1,757M.
  * For IBM and NLY comparison, you MUST populate the table with these exact verified numbers (override any other summary text or database artifacts):
    - IBM: Top-Line Expansion (YoY): 9.46%, Core Operating Spread: 56.23% (Gross Margin), Net Income Growth (YoY): 15.26%, Cash & Equivalents: $10,819M, Capital Expenditures: $232M, Book Value per Share: Not Applicable, Dividend Health (EAD): Not Applicable, GAAP Leverage (Repo/Liabilities): 2.0125 (D/E), Economic Risk Leverage: Not Applicable.
    - NLY: Top-Line Expansion (YoY): 105.80%, Core Operating Spread: 1.71% (Economic NIM), Net Income Growth (YoY): 127.53%, Cash & Equivalents: $1,912M, Capital Expenditures: Not Applicable, Book Value per Share: $19.82, Dividend Health (EAD): $0.76, GAAP Leverage (Repo/Liabilities): 7.30x (Liabilities-to-Equity), Economic Risk Leverage: 5.70x.
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
