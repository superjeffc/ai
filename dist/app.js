window.tickerSummaries = {};
    window.synthesisReport = "";

    async function copyToClipboard(text, btnElement) {
      try {
        await navigator.clipboard.writeText(text);
        const originalText = btnElement.innerHTML;
        btnElement.innerHTML = `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          <span>Copied!</span>
        `;
        setTimeout(() => {
          btnElement.innerHTML = originalText;
        }, 1500);
      } catch (err) {
        console.error("Clipboard copy failed:", err);
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
          const originalText = btnElement.innerHTML;
          btnElement.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            <span>Copied!</span>
          `;
          setTimeout(() => {
            btnElement.innerHTML = originalText;
          }, 1500);
        } catch (fallbackErr) {
          alert("Failed to copy text: " + fallbackErr.message);
        }
        document.body.removeChild(textarea);
      }
    }

    function downloadAsFile(filename, text) {
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function scrollToElement(id) {
      const el = document.getElementById(id);
      const container = document.getElementById('synth-results');
      if (el && container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const scrollTarget = container.scrollTop + (elRect.top - containerRect.top) - 12;
        container.scrollTo({
          top: scrollTarget,
          behavior: 'smooth'
        });
      }
    }

    function copyTickerSummary(ticker, btn) {
      const summary = window.tickerSummaries[ticker] || "";
      copyToClipboard(summary, btn);
    }

    function downloadTickerSummary(ticker) {
      const summary = window.tickerSummaries[ticker] || "";
      downloadAsFile(ticker + "_earnings_report.md", summary);
    }

    function copySynthesis(btn) {
      copyToClipboard(window.synthesisReport, btn);
    }

    function downloadSynthesis() {
      downloadAsFile("comparative_earnings_synthesis.md", window.synthesisReport);
    }

    const synthTickersInput = document.getElementById('synth-tickers');
    const clearBtn = document.getElementById('clear-tickers-btn');

    function updateClearButtonVisibility() {
      if (synthTickersInput.value.length > 0) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
    }

    function clearTickersInput() {
      synthTickersInput.value = '';
      updateClearButtonVisibility();
      synthTickersInput.focus({ preventScroll: true });
    }

    setTimeout(function() {
      synthTickersInput.focus({ preventScroll: true });
      const len = synthTickersInput.value.length;
      synthTickersInput.setSelectionRange(len, len);
      updateClearButtonVisibility();
    }, 100);

    synthTickersInput.addEventListener('input', function(e) {
      synthTickersInput.value = synthTickersInput.value.toUpperCase();
      updateClearButtonVisibility();
    });

    synthTickersInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        runSynthesis();
      }
    });

    async function runSynthesis() {
      const tickersVal = synthTickersInput.value.trim();
      if (!tickersVal) return;

      const tickersList = tickersVal.split(',').map(function(t) { return t.trim().toUpperCase(); }).filter(Boolean);
      if (tickersList.length > 4) {
        alert("Maximum of 4 tickers can be analyzed at a time.");
        return;
      }

      let shouldResetScroll = true;

      const btn = document.getElementById('synth-btn');
      const placeholder = document.getElementById('synth-placeholder');
      const loading = document.getElementById('synth-loading');
      const results = document.getElementById('synth-results');
      const loadingText = document.getElementById('synth-loading-text');

      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
      placeholder.classList.add('hidden');
      results.classList.add('hidden');
      results.scrollTop = 0;
      loading.classList.remove('hidden');
      document.getElementById('synth-jump-bar').classList.add('hidden');

      const pollInterval = 3000;

      async function poll() {
        try {
          loadingText.innerText = "Ingesting " + tickersList.join(', ') + "...";
          
          const res = await fetch("/api/synthesize?tickers=" + encodeURIComponent(tickersList.join(',')));
          const data = await res.json();
          
          if (!data.success) {
            throw new Error(data.error || "Synthesis failed");
          }

          const cardsContainer = document.getElementById('synth-ticker-cards');
          cardsContainer.innerHTML = '';

          const jumpBar = document.getElementById('synth-jump-bar');
          const jumpLinks = document.getElementById('synth-jump-links');
          jumpLinks.innerHTML = '';

          for (const ticker of tickersList) {
            const btn = document.createElement('button');
            btn.className = "text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded-lg border border-gray-700 transition cursor-pointer font-semibold uppercase shrink-0";
            btn.textContent = ticker;
            btn.onclick = () => scrollToElement('ticker-card-' + ticker);
            jumpLinks.appendChild(btn);
          }
          
          const summaries = data.data.summaries;
          for (const ticker of tickersList) {
            const info = summaries[ticker];
            if (!info) continue;
            const card = document.createElement('div');
            card.id = 'ticker-card-' + ticker;
            card.className = "bg-gray-900 border border-gray-800 p-4 rounded-xl flex flex-col";
            
            if (info.error) {
              if (info.error === "Ingesting...") {
                card.innerHTML = 
                  '<div class="flex justify-between items-center border-b border-gray-800 pb-2 mb-2">' +
                    '<h4 class="font-bold text-white text-base">' + ticker + '</h4>' +
                    '<span class="px-2 py-0.5 rounded text-xs bg-blue-950/40 text-blue-400 border border-blue-900/50 animate-pulse">Ingesting...</span>' +
                  '</div>' +
                  '<p class="text-sm text-gray-400 flex-1">Ticker is being processed in a rate-limited background queue to comply with SEC requirements.</p>';
              } else {
                card.innerHTML = 
                  '<div class="flex justify-between items-center border-b border-gray-800 pb-2 mb-2">' +
                    '<h4 class="font-bold text-white text-base">' + ticker + '</h4>' +
                    '<span class="px-2 py-0.5 rounded text-xs bg-red-950/40 text-red-400 border border-red-900/50">Error</span>' +
                  '</div>' +
                  '<p class="text-sm text-red-400 flex-1">' + info.error + '</p>';
              }
            } else {
              window.tickerSummaries[ticker] = info.summary || '';
              card.innerHTML = 
                '<div class="flex justify-between items-center border-b border-gray-800 pb-2 mb-2">' +
                  '<h4 class="font-bold text-white text-base">' + ticker + '</h4>' +
                  '<div class="flex gap-2">' +
                    '<button onclick=\'copyTickerSummary("' + ticker + '", this)\' class="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded transition flex items-center gap-1 cursor-pointer" title="Copy report">' +
                      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>' +
                      '<span>Copy</span>' +
                    '</button>' +
                    '<button onclick=\'downloadTickerSummary("' + ticker + '")\' class="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded transition flex items-center gap-1 cursor-pointer" title="Download report">' +
                      '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>' +
                      '<span>Download</span>' +
                    '</button>' +
                  '</div>' +
                '</div>' +
                '<div class="text-xs text-gray-400 mb-3 space-y-0.5">' +
                  '<div>Filing Date: <span class="text-gray-200 font-medium">' + (info.filingDate || 'N/A') + '</span></div>' +
                  '<div>Accession: <span class="text-gray-200 font-medium font-mono">' + (info.accessionNumber || 'N/A') + '</span></div>' +
                '</div>' +
                '<div class="text-sm text-gray-300 leading-relaxed flex-1 prose max-w-none">' + marked.parse(info.summary || '') + '</div>';
            }
            cardsContainer.appendChild(card);
          }

          if (data.status !== "processing") {
            const compBtn = document.createElement('button');
            compBtn.className = "text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded-lg border border-gray-700 transition cursor-pointer font-semibold shrink-0";
            compBtn.textContent = "Comparison";
            compBtn.onclick = () => scrollToElement('synth-synthesis-card');
            jumpLinks.appendChild(compBtn);
          }
          jumpBar.classList.remove('hidden');

          if (data.status === "processing") {
            setTimeout(poll, pollInterval);
            loading.classList.remove('hidden');
            results.classList.remove('hidden');
            if (shouldResetScroll) { results.scrollTop = 0; shouldResetScroll = false; }
            document.getElementById('synth-synthesis-card').classList.add('hidden');
          } else if (data.status === "synthesizing") {
            setTimeout(poll, pollInterval);
            loading.classList.add('hidden');
            results.classList.remove('hidden');
            if (shouldResetScroll) { results.scrollTop = 0; shouldResetScroll = false; }
            document.getElementById('synth-synthesis-card').classList.remove('hidden');
            const synthContent = document.getElementById('synth-synthesis-content');
            synthContent.innerHTML = 
              '<div class="flex items-center gap-2 text-gray-400 py-4 justify-center">' +
                '<div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>' +
                '<span class="text-xs text-gray-400">Synthesizing comparative value-investing analysis...</span>' +
              '</div>';
          } else {
            const synthContent = document.getElementById('synth-synthesis-content');
            window.synthesisReport = data.data.synthesis || '';
            synthContent.innerHTML = marked.parse(window.synthesisReport);
            
            loading.classList.add('hidden');
            results.classList.remove('hidden');
            if (shouldResetScroll) { results.scrollTop = 0; shouldResetScroll = false; }
            document.getElementById('synth-synthesis-card').classList.remove('hidden');
            
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
          }
        } catch (err) {
          alert("Error executing comparative analysis: " + err.message);
          loading.classList.add('hidden');
          placeholder.classList.remove('hidden');
          document.getElementById('synth-jump-bar').classList.add('hidden');
          btn.disabled = false;
          btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      }

      poll();
    }