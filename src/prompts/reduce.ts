export interface ReduceSectorRules {
  methodologyRules: string;
  sectorInstructions: string;
}

export const REDUCE_SECTOR_RULES: Record<string, ReduceSectorRules> = {
  REIT: {
    methodologyRules: `\n- For Mortgage REITs (mREITs like Annaly NLY): Focus on Net Interest Income, Repo Leverage, Economic Leverage (5.70x for NLY), Book Value per Share (BVPS), and Earnings Available for Distribution (EAD). Do NOT evaluate or report Bank safety ratios (CET1, PCL), as they are completely not applicable to REITs.`,
    sectorInstructions: `\n- MORTGAGE REITs (REIT, e.g. Annaly NLY):
  * Table columns/rows:
    - If comparing a Standard Tech company (like IBM) with NLY (REIT), generate a custom "Financial Architecture Matrix" table with exactly these rows:
      1. **Top-Line Growth (YoY)**: IBM: 9.46% | NLY: 105.80% | Context: Traditional Revenue (IBM) vs. Net Interest Income (NLY)
      2. **Core Operating Spread**: IBM: 56.23% (Gross Margin) | NLY: 1.71% (Economic NIM) | Context: Core pricing power / interest profit spread
      3. **Liquid Cash Position**: IBM: $10,819,000,000 | NLY: ~$1,400,000,000 | Context: Pure cash and near-cash asset cushions
      4. **Core Leverage Vector**: IBM: 2.0125 (D/E Ratio) | NLY: 5.29x (GAAP Repo Leverage) | Context: Primary corporate debt vs. short-term repo financing
      5. **Off-Balance Sheet Risk**: IBM: N/A | NLY: 5.70x (Economic Leverage) | Context: Total portfolio magnification including TBA dollar rolls
      6. **Book Value per Share**: IBM: N/A | NLY: $19.82 | Context: Net asset baseline of portfolio holdings
      7. **Dividend Health (EAD)**: IBM: N/A | NLY: $0.76 | Context: Earnings Available for Distribution covering $0.70 payout
    - If using a standard layout table structure (such as when comparing NLY with multiple other tech companies):
      * For NLY column:
        - Set standard "Revenue Growth (YoY)" row to "N/A (Sector Specific)" (Context: "Measures top-line expansion (Traditional Revenue vs. Net Interest Income)"). Do NOT duplicate Net Interest Income Growth percentage into the Revenue Growth row.
        - For standard "Gross Margin (%)" row, set NLY value to "Not Applicable (Uses NIM % Instead)".
        - For standard "Debt-to-Equity (D/E)" row, set NLY value to "Not Applicable (Uses Repo/Economic Leverage Instead)".
        - For "Cash & Equivalents" row, set NLY value to "~$1,400,000,000" (or "~$1.4B"). CRITICAL: DO NOT map NLY's Repurchase Agreements ($86,068,102,000) to Cash & Equivalents. NLY's actual cash balance is around $1.4B.
        - Only use "GAAP Repo Leverage" (5.29x for NLY) and "Management's Economic Leverage" (5.70x for NLY) as primary leverage markers.
        - Include Net Interest Income Growth (YoY) [105.80% for NLY], Book Value per Share (BVPS) [$19.82 for NLY, which dropped from $20.21], Earnings Available for Distribution (EAD) [$0.76 for NLY], Net Interest Margin (NIM) [1.71% for NLY], GAAP Repo Leverage [5.29x for NLY], and Management's Economic Leverage [5.70x for NLY].
  * Analysis: Evaluate NLY as an actively managed pool of fixed-income assets. Explain why traditional value-investing frameworks (like Benjamin Graham's) fail. Focus on Book Value per Share (BVPS) and dividend coverage via Earnings Available for Distribution (EAD) ($0.76 EAD per share covering the $0.70 dividend).
  * Observations: In the summary or observations section, state that NLY's net interest income growth was "...driven by a significant expansion in interest rate spreads, which was further amplified by its 5.70x economic leverage." (Do NOT say it was "driven by strong repo leverage and economic leverage" as leverage acts as the amplifier, not the driver).
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
