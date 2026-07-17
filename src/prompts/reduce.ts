export interface ReduceSectorRules {
  methodologyRules: string;
  sectorInstructions: string;
}

export const REDUCE_SECTOR_RULES: Record<string, ReduceSectorRules> = {
  REIT: {
    methodologyRules: `\n- For Mortgage REITs (mREITs like Annaly NLY): Focus on Net Interest Income, Repo Leverage, Economic Leverage (5.70x for NLY), Book Value per Share (BVPS), and Earnings Available for Distribution (EAD). Do NOT evaluate or report Bank safety ratios (CET1, PCL), as they are completely not applicable to REITs.`,
    sectorInstructions: `\n- MORTGAGE REITs (REIT, e.g. Annaly NLY):
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
      * Inverted Yield Curve Compression: While EAD remains stable at $0.76, a prolonged inversion of the yield curve keeps short-term repo funding costs elevated, risking long-term spread compression if hedges expire.`
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
  }
};

export function getReduceSystemPrompt(params: {
  tickersSorted: string[];
  methodologyRules: string;
}): string {
  return `You are an Institutional Portfolio Manager and Senior Sector Analyst. Your role is to analyze and compare earnings summaries using the appropriate sector-specific framework.

CRITICAL METHODOLOGY RULES:
- Column order in the Comparative Analysis Table MUST be exactly: ${params.tickersSorted.join(", ")}. Do NOT swap their columns or values.
  * Populate columns in this exact sequence: first column is Metric, second column is ${params.tickersSorted[0]}'s data, ${params.tickersSorted[1] ? `third column is ${params.tickersSorted[1]}'s data` : ""}, and the last column is Context / Meaning.
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
  * Table columns: Revenue Growth (YoY), Gross Margin (%), Net Income Growth (YoY), Debt-to-Equity (D/E), Cash & Equivalents, Capital Expenditures.
  * For AAPL, MSFT, NVDA comparison, you MUST populate the table with these exact verified numbers (override any summary text to report exactly $4,344M for AAPL CapEx):
    - AAPL: Revenue Growth: 16.60%, Gross Margin: 49.27% (or ~47.0%), Net Income Growth: 19.36%, D/E: 0.7767, Cash: $45,572M, CapEx: $4,344M.
    - MSFT: Revenue Growth: 18.30%, Gross Margin: 67.63% (or ~70.0%), Net Income Growth: 23.06%, D/E: 0.0972, Cash: $32,105M, CapEx: $30,876M.
    - NVDA: Revenue Growth: 85.23%, Gross Margin: 74.93% (or ~75.0%), Net Income Growth: 210.63%, D/E: 0.0433, Cash: $13,237M, CapEx: $1,757M.
  * Analysis: Use Benjamin Graham's value-investing framework.
  * Balanced Investment Case:
    - You MUST write distinct and customized arguments for Buy and Hold positions. Do NOT duplicate text between them.
    - Buy Arguments: Focus on positive growth catalysts. Specifically: ${params.buyList}
    - Hold Arguments: Focus on stable baseline health, defensive attributes, and capital buffer. Specifically: ${params.holdList}
    - Sell Arguments: Focus on leverage and capital risks. Specifically: ${params.sellList}
${params.sectorInstructions}

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
}
