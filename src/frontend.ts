export function getHTMLFrontend(): string {
  return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
  '<meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">' +
  '<title>Kite - Advanced Workspace</title>' +
  '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>' +
  '<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>' +
  
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>' +
  '<script>pdfjsLib.GlobalWorkerOptions.workerSrc = \'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js\';</script>' +
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>' +

  '<style>' +
    'body { background-color: #111827; color: #f3f4f6; font-family: \'Outfit\', sans-serif; }' +
    '::-webkit-scrollbar { width: 4px; }' +
    '::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }' +
    '.prose h1 { font-size: 1.3rem; font-weight: bold; margin-bottom: 0.5rem; color: #fff; }' +
    '.prose h2 { font-size: 1.15rem; font-weight: bold; margin-bottom: 0.4rem; color: #fff; }' +
    '.prose ul { list-style-type: disc; margin-left: 1.1rem; margin-bottom: 0.5rem; color: rgba(255,255,255,0.8); }' +
    '.prose ol { list-style-type: decimal; margin-left: 1.1rem; margin-bottom: 0.5rem; color: rgba(255,255,255,0.8); }' +
    '.prose p { margin-bottom: 0.4rem; font-size: 0.95rem; }' +
    '.prose code { background-color: rgba(0,0,0,0.3); padding: 0.125rem 0.25rem; border-radius: 0.25rem; color: #60a5fa; font-family: monospace; font-size: 0.85rem; }' +
    
    '.prose table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; margin-bottom: 0.75rem; border: 1px solid #1f2937; }' +
    '.prose th { border-bottom: 2px solid #374151; background-color: #1f2937; padding: 0.5rem; text-align: left; font-weight: bold; color: #fff; font-size: 0.85rem; }' +
    '.prose td { border-bottom: 1px solid #1f2937; padding: 0.5rem; font-size: 0.85rem; color: rgba(255,255,255,0.8); }' +
    
    '@supports (padding-bottom: env(safe-area-inset-bottom)) {' +
      '.safe-bottom {' +
        'padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem);' +
      '}' +
    '}' +
  '</style>' +
  '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">' +
'</head>' +
'<body class="flex flex-col h-[100dvh] max-w-4xl mx-auto p-3 sm:p-4">' +

  '<header class="flex justify-between items-center py-2 sm:py-4 border-b border-gray-800 shrink-0">' +
    '<div class="flex items-center gap-2">' +
      '<span class="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></span>' +
      '<h1 class="text-lg sm:text-xl font-bold tracking-tight text-white">Kite Workspace</h1>' +
    '</div>' +
    '<button id="clear-mem-btn" onclick="clearMemory()" class="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-400 hover:text-red-400 bg-gray-800/30 hover:bg-red-950/20 border border-gray-800 hover:border-red-900/40 rounded-lg transition text-xs font-semibold cursor-pointer" aria-label="Clear chat memory">' +
      '<span class="btn-icon-wrapper">' +
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />' +
        '</svg>' +
      '</span>' +
      '<span class="btn-label-text hidden sm:inline">Clear Memory</span>' +
    '</button>' +
  '</header>' +

  '<nav class="flex gap-4 border-b border-gray-800 mb-4 py-2 shrink-0">' +
    '<button id="tab-chat-btn" onclick="switchTab(\'chat\')" class="text-white border-b-2 border-blue-500 pb-1 text-sm font-semibold cursor-pointer">' +
      'Chat Assistant' +
    '</button>' +
    '<button id="tab-synth-btn" onclick="switchTab(\'synth\')" class="text-gray-400 hover:text-white pb-1 text-sm font-semibold cursor-pointer">' +
      'Earnings Synthesizer' +
    '</button>' +
  '</nav>' +

  '<div id="chat-container" class="flex-1 flex flex-col overflow-hidden">' +
    '<main id="chat-window" class="flex-1 overflow-y-auto my-3 space-y-4 pr-1 relative">' +
      '<div id="welcome-message" class="flex flex-col items-start gap-1 max-w-[90%] sm:max-w-[85%] group">' +
        '<div class="bg-gray-800/40 border border-gray-800/60 p-3 sm:p-4 rounded-xl prose w-full">' +
          'Welcome to Kite. Upload a PDF/DOCX document, generate images using <code>/image [prompt]</code>, ask recipes, or swap over to the <b>Earnings Synthesizer</b> tab to perform filings cross-examination.' +
        '</div>' +
      '</div>' +
    '</main>' +

    '<footer id="chat-footer" class="pb-2 sm:pb-4 shrink-0 safe-bottom">' +
      '<div id="image-preview-container" class="hidden px-2 mb-2">' +
        '<div class="relative inline-block">' +
          '<img id="image-preview" class="h-16 w-16 object-cover rounded-lg border border-gray-700">' +
          '<button type="button" onclick="clearFile()" class="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-0.5 border border-gray-600 hover:bg-red-500 transition-colors">' +
            '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<form id="chat-form" onsubmit="sendMessage(event)" class="flex items-end gap-2 bg-gray-900 border border-gray-800 p-2 rounded-xl focus-within:border-gray-700 transition w-full box-border">' +
        '<input type="file" id="file-upload" accept="image/*,.pdf,.docx,.doc" class="hidden" onchange="handleFileSelect(event)">' +
        '<button type="button" onclick="document.getElementById(\'file-upload\').click()" class="p-2 mb-[2px] text-gray-400 hover:text-white transition shrink-0" aria-label="Upload file">' +
           '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">' +
             '<path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />' +
           '</svg>' +
        '</button>' +
        '<textarea id="user-input" rows="1" autocomplete="off" placeholder="Ask Kite or type \'/image\'..." class="flex-1 min-w-0 w-full bg-transparent pl-2 pr-1 py-1.5 mb-[2px] outline-none text-white placeholder-gray-500 text-base leading-normal resize-none h-[38px] max-h-[120px] overflow-y-auto"></textarea>' +
        '<button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white p-2 mb-[1px] rounded-lg transition shrink-0 w-9 h-9 flex items-center justify-center" aria-label="Send message">' +
          '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">' +
            '<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />' +
          '</svg>' +
        '</button>' +
      '</form>' +
    '</footer>' +
  '</div>' +

  '<div id="synth-container" class="flex-1 flex flex-col overflow-hidden hidden">' +
    '<div class="bg-gray-900 border border-gray-800 p-4 rounded-xl mb-4 shrink-0">' +
      '<h2 class="text-sm font-semibold text-gray-300 mb-2">Earnings Synthesizer (SEC Facts vs. Earning Call Transcripts)</h2>' +
      '<div class="flex gap-2">' +
        '<input type="text" id="synth-tickers" placeholder="e.g. AAPL, MSFT, NVDA, AMD" class="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:border-gray-700 text-sm">' +
        '<button onclick="runSynthesis()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0" id="synth-btn">' +
          '<span>Synthesize</span>' +
        '</button>' +
      '</div>' +
      '<p class="text-xs text-gray-500 mt-2">Analyzes up to 4 comma-separated tickers. Implements compliant SEC submissions checking, D1 caching, and concurrent cross-examination.</p>' +
    '</div>' +

    '<div id="synth-results" class="flex-1 overflow-y-auto space-y-4 pr-1 hidden">' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="synth-ticker-cards"></div>' +
      
      '<div class="bg-gray-900 border border-gray-800 p-4 rounded-xl prose max-w-none text-gray-200" id="synth-synthesis-card">' +
        '<div class="border-b border-gray-800 pb-2 mb-3 flex justify-between items-center">' +
          '<h3 class="text-base font-bold text-white">Comparative Synthesis Report</h3>' +
          '<span class="text-xs text-gray-400">Institutional Portfolio Manager View</span>' +
        '</div>' +
        '<div id="synth-synthesis-content" class="text-sm leading-relaxed"></div>' +
      '</div>' +
    '</div>' +

    '<div id="synth-loading" class="flex-1 flex flex-col items-center justify-center text-gray-400 hidden">' +
      '<div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>' +
      '<p class="text-sm font-medium" id="synth-loading-text">Fetching SEC EDGAR database...</p>' +
    '</div>' +

    '<div id="synth-placeholder" class="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm border-2 border-dashed border-gray-800 rounded-xl p-8">' +
      '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mb-2 text-gray-600">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />' +
      '</svg>' +
      '<span>No tickers analyzed yet. Enter tickers above and click Synthesize.</span>' +
    '</div>' +
  '</div>' +

  '<script>' +
    'const chatWindow = document.getElementById(\'chat-window\');' +
    'const userInput = document.getElementById(\'user-input\');' +
    'const chatForm = document.getElementById(\'chat-form\');' +
    'let currentImageBase64 = null;' +
    
    'setTimeout(function() {' +
      'userInput.focus({ preventScroll: true });' +
    '}, 100);' +

    'document.addEventListener(\'DOMContentLoaded\', loadChatHistory);' +

    'function switchTab(tab) {' +
      'const chatBtn = document.getElementById(\'tab-chat-btn\');' +
      'const synthBtn = document.getElementById(\'tab-synth-btn\');' +
      'const chatContainer = document.getElementById(\'chat-container\');' +
      'const synthContainer = document.getElementById(\'synth-container\');' +

      'if (tab === \'chat\') {' +
        'chatBtn.className = "text-white border-b-2 border-blue-500 pb-1 text-sm font-semibold cursor-pointer";' +
        'synthBtn.className = "text-gray-400 hover:text-white pb-1 text-sm font-semibold cursor-pointer";' +
        'chatContainer.classList.remove(\'hidden\');' +
        'synthContainer.classList.add(\'hidden\');' +
        'userInput.focus();' +
      '} else {' +
        'synthBtn.className = "text-white border-b-2 border-blue-500 pb-1 text-sm font-semibold cursor-pointer";' +
        'chatBtn.className = "text-gray-400 hover:text-white pb-1 text-sm font-semibold cursor-pointer";' +
        'synthContainer.classList.remove(\'hidden\');' +
        'chatContainer.classList.add(\'hidden\');' +
        'document.getElementById(\'synth-tickers\').focus();' +
      '}' +
    '}' +

    'async function runSynthesis() {' +
      'const input = document.getElementById(\'synth-tickers\');' +
      'const tickersVal = input.value.trim();' +
      'if (!tickersVal) return;' +

      'const btn = document.getElementById(\'synth-btn\');' +
      'const placeholder = document.getElementById(\'synth-placeholder\');' +
      'const loading = document.getElementById(\'synth-loading\');' +
      'const results = document.getElementById(\'synth-results\');' +
      'const loadingText = document.getElementById(\'synth-loading-text\');' +

      'btn.disabled = true;' +
      'btn.classList.add(\'opacity-50\', \'cursor-not-allowed\');' +
      'placeholder.classList.add(\'hidden\');' +
      'results.classList.add(\'hidden\');' +
      'loading.classList.remove(\'hidden\');' +

      'const tickersList = tickersVal.split(\',\').map(function(t) { return t.trim(); }).filter(Boolean);' +
      
      'try {' +
        'loadingText.innerText = "Ingesting " + tickersList.join(\', \') + "... (First compile takes ~10-15 seconds)";' +
        
        'const res = await fetch("/api/synthesize?tickers=" + encodeURIComponent(tickersList.join(\',\')));' +
        'const data = await res.json();' +
        
        'if (!data.success) {' +
          'throw new Error(data.error || "Synthesis failed");' +
        '}' +

        'const cardsContainer = document.getElementById(\'synth-ticker-cards\');' +
        'cardsContainer.innerHTML = \'\';' +
        
        'const summaries = data.data.summaries;' +
        'for (const ticker of Object.keys(summaries)) {' +
          'const info = summaries[ticker];' +
          'const card = document.createElement(\'div\');' +
          'card.className = "bg-gray-900 border border-gray-800 p-4 rounded-xl flex flex-col";' +
          
          'if (info.error) {' +
            'card.innerHTML = ' +
              '\'<div class="flex justify-between items-center border-b border-gray-800 pb-2 mb-2">\' +' +
                '\'<h4 class="font-bold text-white text-base">\' + ticker + \'</h4>\' +' +
                '\'<span class="px-2 py-0.5 rounded text-xs bg-red-950/40 text-red-400 border border-red-900/50">Error</span>\' +' +
              '\'</div>\' +' +
              '\'<p class="text-sm text-red-400 flex-1">\' + info.error + \'</p>\';' +
          '} else {' +
            'const cacheBadge = info.cached ' +
              '? \'<span class="px-2 py-0.5 rounded text-xs bg-green-950/40 text-green-400 border border-green-900/50">Cache Hit</span>\'' +
              ': \'<span class="px-2 py-0.5 rounded text-xs bg-amber-950/40 text-amber-400 border border-amber-900/50">Live Fetch</span>\';' +
            
            'card.innerHTML = ' +
              '\'<div class="flex justify-between items-center border-b border-gray-800 pb-2 mb-2">\' +' +
                '\'<h4 class="font-bold text-white text-base">\' + ticker + \'</h4>\' +' +
                '\'<div class="flex gap-2 items-center">\' +' +
                  'cacheBadge +' +
                '\'</div>\' +' +
              '\'</div>\' +' +
              '\'<div class="text-xs text-gray-400 mb-3 space-y-0.5">\' +' +
                '\'<div>Filing Date: <span class="text-gray-200 font-medium">\' + (info.filingDate || \'N/A\') + \'</span></div>\' +' +
                '\'<div>Accession: <span class="text-gray-200 font-medium font-mono">\' + (info.accessionNumber || \'N/A\') + \'</span></div>\' +' +
              '\'</div>\' +' +
              '\'<div class="text-sm text-gray-300 leading-relaxed flex-1 prose max-w-none">\' + marked.parse(info.summary || \'\') + \'</div>\';' +
          '}' +
          'cardsContainer.appendChild(card);' +
        '}' +
        
        'const synthContent = document.getElementById(\'synth-synthesis-content\');' +
        'synthContent.innerHTML = marked.parse(data.data.synthesis || \'\');' +
        
        'loading.classList.add(\'hidden\');' +
        'results.classList.remove(\'hidden\');' +
      '} catch (err) {' +
        'alert("Error executing comparative analysis: " + err.message);' +
        'loading.classList.add(\'hidden\');' +
        'placeholder.classList.remove(\'hidden\');' +
      '} finally {' +
        'btn.disabled = false;' +
        'btn.classList.remove(\'opacity-50\', \'cursor-not-allowed\');' +
      '}' +
    '}' +

    'async function handleFileSelect(event) {' +
      'const file = event.target.files[0];' +
      'if (!file) return;' +

      'const fileType = file.type;' +
      'const fileName = file.name.toLowerCase();' +

      'if (fileType.startsWith(\'image/\')) {' +
        'const reader = new FileReader();' +
        'reader.onload = function(e) {' +
          'setPreviewImage(e.target.result);' +
        '};' +
        'reader.readAsDataURL(file);' +
      '} ' +
      'else if (fileName.endsWith(\'.pdf\') || fileType === \'application/pdf\') {' +
        'try {' +
          'const arrayBuffer = await file.arrayBuffer();' +
          'const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;' +
          'let fullText = "";' +

          'for (let i = 1; i <= pdf.numPages; i++) {' +
            'const page = await pdf.getPage(i);' +
            'const textContent = await page.getTextContent();' +
            'const pageText = textContent.items.map(function(item) { return item.str; }).join(" ");' +
            'fullText += "--- Page " + i + " ---\\n" + pageText + "\\n\\n";' +
          '}' +
          
          'if (fullText.trim()) {' +
            'const docContext = "\\n\\n[Extracted Document: " + file.name + "]\\n" + fullText + "\\n";' +
            'userInput.value = userInput.value + docContext;' +
            'autoResizeTextArea();' +
            'userInput.focus();' +
          '}' +
        '} catch (err) {' +
          'alert("Failed to parse PDF text: " + err.message);' +
        '}' +
      '} ' +
      'else if (fileName.endsWith(\'.docx\') || fileName.endsWith(\'.doc\') || fileType.includes(\'wordprocessingml\')) {' +
        'try {' +
          'const arrayBuffer = await file.arrayBuffer();' +
          'const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });' +
          'const text = result.value.trim();' +
          
          'if (text) {' +
            'const docContext = "\\n\\n[Extracted Document: " + file.name + "]\\n" + text + "\\n";' +
            'userInput.value = userInput.value + docContext;' +
            'autoResizeTextArea();' +
            'userInput.focus();' +
          '}' +
        '} catch (err) {' +
          'alert("Failed to parse Word Document: " + err.message);' +
        '}' +
      '}' +

      'document.getElementById(\'file-upload\').value = \'\';' +
    '}' +

    'function setPreviewImage(base64Str) {' +
      'currentImageBase64 = base64Str;' +
      'document.getElementById(\'image-preview\').src = currentImageBase64;' +
      'document.getElementById(\'image-preview-container\').classList.remove(\'hidden\');' +
      'userInput.focus();' +
    '}' +

    'function clearFile() {' +
      'currentImageBase64 = null;' +
      'document.getElementById(\'file-upload\').value = \'\';' +
      'document.getElementById(\'image-preview-container\').classList.add(\'hidden\');' +
    '}' +

    'userInput.addEventListener(\'input\', autoResizeTextArea);' +

    'function autoResizeTextArea() {' +
      'userInput.style.height = \'auto\';' +
      'userInput.style.height = userInput.scrollHeight + \'px\';' +
    '}' +

    'userInput.addEventListener(\'keydown\', function(e) {' +
      'if (e.key === \'Enter\') {' +
        'if (!e.shiftKey) {' +
          'e.preventDefault();' +
          'chatForm.requestSubmit();' +
        '}' +
      '}' +
    '});' +

    'document.addEventListener(\'keydown\', function(e) {' +
      'if (e.key === \'/\') {' +
        'const tag = document.activeElement.tagName;' +
        'if (tag !== \'TEXTAREA\' && tag !== \'INPUT\') {' +
          'e.preventDefault(); ' +
          'userInput.focus();' +
        '}' +
      '}' +
    '});' +

    'if (window.visualViewport) {' +
      'window.visualViewport.addEventListener(\'resize\', adjustForKeyboard);' +
      'window.visualViewport.addEventListener(\'scroll\', adjustForKeyboard);' +
    '}' +

    'window.addEventListener(\'scroll\', function() {' +
      'if (document.activeElement.tagName === \'INPUT\' || document.activeElement.tagName === \'TEXTAREA\') {' +
        'window.scrollTo(0, 0);' +
      '}' +
    '});' +

    'function adjustForKeyboard() {' +
      'const vv = window.visualViewport;' +
      'document.body.style.height = vv.height + "px";' +
      'window.scrollTo(0, 0);' +
    '}' +

    'async function loadChatHistory() {' +
      'try {' +
        'const res = await fetch(\'/api/history\', { credentials: \'include\' });' +
        'const data = await res.json();' +
        
        'if (data.success && data.history && data.history.length > 0) {' +
          'const welcomeMsg = document.getElementById(\'welcome-message\');' +
          'if (welcomeMsg) welcomeMsg.remove();' +

          'data.history.forEach(function(msg) {' +
            'const sender = msg.role === \'user\' ? \'user\' : \'ai\';' +
            'let displayContent = msg.content;' +
            'let imageUrl = null;' +

            'if (Array.isArray(msg.content)) {' +
              'displayContent = msg.content.find(function(c) { return c.type === \'text\'; })?.text || "";' +
              'imageUrl = msg.content.find(function(c) { return c.type === \'image_url\'; })?.image_url?.url || null;' +
            '}' +

            'appendBubble(displayContent, sender, false, imageUrl);' +
          '});' +
        '}' +
      '} catch (err) {' +
        'console.error("Failed to load historical session elements:", err);' +
      '}' +
    '}' +

    'async function sendMessage(e) {' +
      'e.preventDefault();' +
      'const text = userInput.value.trim();' +
      'if (!text && !currentImageBase64) return;' +

      'if (\'ontouchstart\' in window || navigator.maxTouchPoints > 0) {' +
        'userInput.blur();' +
      '} else {' +
        'userInput.focus();' +
      '}' +

      'const welcomeMsg = document.getElementById(\'welcome-message\');' +
      'if (welcomeMsg) welcomeMsg.remove();' +

      'const userPromptId = appendBubble(text, \'user\', false, currentImageBase64);' +
      'const imagePayload = currentImageBase64;' +
      
      'userInput.value = \'\';' +
      'userInput.style.height = \'38px\'; ' +
      'clearFile();' +

      'chatWindow.style.paddingBottom = \'80vh\';' +

      'const promptElement = document.getElementById(userPromptId);' +
      'if (promptElement) {' +
        'const lockToTop = function() {' +
          'chatWindow.scrollTop = promptElement.offsetTop - 16;' +
        '};' +
        
        'lockToTop();' +
        'setTimeout(lockToTop, 50);' +
        'setTimeout(lockToTop, 150);' +
        'setTimeout(lockToTop, 300);' +
      '}' +

      'const loadingId = appendBubble(\'\', \'ai\', true);' +

      'try {' +
        'const requestBody = { message: text };' +
        'if (imagePayload) {' +
          'requestBody.image = imagePayload;' +
        '}' +

        'const res = await fetch(\'/api/chat\', {' +
          'method: \'POST\',' +
          'headers: { \'Content-Type\': \'application/json\' },' +
          'body: JSON.stringify(requestBody),' +
          'credentials: \'include\'' +
        '});' +

        'const wrapper = document.getElementById(loadingId);' +
        'const textBubble = wrapper.querySelector(\'.text-bubble\');' +
        'textBubble.classList.remove(\'animate-pulse\', \'text-gray-500\');' +

        'if (res.headers.get("X-Is-Image") === "true") {' +
          'const data = await res.json();' +
          'if (!data.success) throw new Error(data.error || "Image building error");' +
          'textBubble.innerHTML = \'<img src="data:image/jpeg;base64,\' + data.response + \'" class="rounded-lg max-w-full h-auto shadow-md mt-1 border border-gray-700" alt="AI Generated Image" />\';' +
          'chatWindow.style.paddingBottom = \'0px\';' +
          'return;' +
        '}' +

        'const reader = res.body.getReader();' +
        'const decoder = new TextDecoder();' +
        'let fullStreamingText = "";' +

        'while (true) {' +
          'const { value, done } = await reader.read();' +
          'if (done) break;' +

          'fullStreamingText += decoder.decode(value, { stream: true });' +
          'textBubble.innerHTML = marked.parse(fullStreamingText);' +
        '}' +

        'appendCopyButton(wrapper, fullStreamingText);' +
        'chatWindow.style.paddingBottom = \'0px\';' +

      '} catch (err) {' +
        'chatWindow.style.paddingBottom = \'0px\';' +
        'const textBubble = document.getElementById(loadingId).querySelector(\'.text-bubble\');' +
        'textBubble.className = "text-bubble bg-red-950/40 text-red-400 p-3 rounded-xl border border-red-900/50 text-sm w-full";' +
        'textBubble.innerText = "❌ Network connection error reading token stream: " + err.message;' +
      '}' +
    '}' +

    'function appendBubble(content, sender, isLoading, imageUrl) {' +
      'if (isLoading === undefined) isLoading = false;' +
      'if (imageUrl === undefined) imageUrl = null;' +
      
      'const id = \'container-\' + Math.random().toString(36).substr(2, 9);' +
      
      'const wrapper = document.createElement(\'div\');' +
      'wrapper.id = id;' +
      
      'const innerBubble = document.createElement(\'div\');' +
      'innerBubble.className = "text-bubble p-3 rounded-xl prose text-sm sm:text-base break-words w-full whitespace-pre-wrap";' +

      'if (sender === \'user\') {' +
        'wrapper.className = "flex flex-col items-end gap-1 max-w-[90%] sm:max-w-[85%] ml-auto group";' +
        'innerBubble.classList.add("bg-blue-600", "text-white", "shadow-sm");' +
        
        'if (imageUrl) {' +
          'const img = document.createElement(\'img\');' +
          'img.src = imageUrl;' +
          'img.className = "rounded-lg max-w-full h-auto max-h-64 object-cover mb-1 border border-blue-500 shadow-sm";' +
          'innerBubble.appendChild(img);' +
        '}' +
        
        'if (content) {' +
          'const textSpan = document.createElement(\'span\');' +
          'textSpan.innerText = content;' +
          'innerBubble.appendChild(textSpan);' +
        '}' +
      '} else {' +
        'wrapper.className = "flex flex-col items-start gap-1 max-w-[90%] sm:max-w-[85%] group";' +
        'innerBubble.classList.add("bg-gray-800", "text-gray-200", "border", "border-gray-700/50");' +
        
        'if (isLoading) {' +
          'innerBubble.innerText = content || "Thinking...";' +
          'innerBubble.classList.add(\'animate-pulse\', \'text-gray-500\');' +
        '} else {' +
          'innerBubble.innerHTML = marked.parse(content);' +
        '}' +
      '}' +

      'wrapper.appendChild(innerBubble);' +
      
      'if (!isLoading && content) {' +
        'appendCopyButton(wrapper, content);' +
      '}' +
      
      'chatWindow.appendChild(wrapper);' +
      'return id;' +
    '}' +

    'function appendCopyButton(targetWrapper, textToCopy) {' +
      'const btnContainer = document.createElement(\'div\');' +
      'btnContainer.className = "flex justify-end w-full opacity-60 group-hover:opacity-100 transition px-1";' +
      
      'const btn = document.createElement(\'button\');' +
      'btn.className = "flex items-center gap-1 text-xs text-gray-400 hover:text-white transition cursor-pointer py-0.5 px-1.5 rounded bg-gray-900/30 border border-gray-800/40";' +
      
      'btn.innerHTML = ' +
        '\'<svg class="w-3.5 h-3.5 copy-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3a1 1 0 011-1h10a1 1 0 011 1v12a1 1 0 01-1 1h-4M3 7h10a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z"/></svg>\' +' +
        '\'<span class="copy-text">Copy</span>\';' +
      
      'btn.onclick = async function() {' +
        'try {' +
          'await navigator.clipboard.writeText(textToCopy);' +
          
          'const icon = btn.querySelector(\'.copy-icon\');' +
          'const label = btn.querySelector(\'.copy-text\');' +
          
          'btn.classList.add(\'text-green-400\');' +
          'label.innerText = \'Copied!\';' +
          'icon.innerHTML = \'<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />\';' +
          
          'setTimeout(function() {' +
            'btn.classList.remove(\'text-green-400\');' +
            'label.innerText = \'Copy\';' +
            'icon.innerHTML = \'<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3a1 1 0 011-1h10a1 1 0 011 1v12a1 1 0 01-1 1h-4M3 7h10a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z"/>\';' +
          '}, 1800);' +
        '} catch (err) {' +
          'console.error("Clipboard failure:", err);' +
        '}' +
      '};' +
      
      'btnContainer.appendChild(btn);' +
      'targetWrapper.appendChild(btnContainer);' +
    '}' +

    'async function clearMemory() {' +
      'const btn = document.getElementById(\'clear-mem-btn\');' +
      'if (btn.classList.contains(\'text-green-400\')) return;' +

      'const iconWrapper = btn.querySelector(\'.btn-icon-wrapper\');' +
      'const labelText = btn.querySelector(\'.btn-label-text\');' +
      
      'const nativeIcon = iconWrapper.innerHTML;' +
      'const nativeLabelText = labelText.innerText;' +

      'try {' +
        'await fetch(\'/api/chat\', {' +
          'method: \'POST\',' +
          'headers: { \'Content-Type\': \'application/json\' },' +
          'body: JSON.stringify({ clearMemory: true }),' +
          'credentials: \'include\'' +
        '});' +

        'chatWindow.innerHTML = ' +
          '\'<div id="welcome-message" class="flex flex-col items-start gap-1 max-w-[90%] sm:max-w-[85%] group">\' +' +
            '\'<div class="bg-gray-800/40 border border-gray-800/60 p-3 sm:p-4 rounded-xl prose w-full">\' +' +
              '\'Welcome to Kite. Upload a PDF/DOCX document, generate images using <code>/image [prompt]</code>, ask recipes, or swap over to the <b>Earnings Synthesizer</b> tab to perform filings cross-examination.\' +' +
            '\'</div>\' +' +
          '\'</div>\';' +

        'btn.classList.remove(\'text-gray-400\', \'hover:text-red-400\');' +
        'btn.classList.add(\'text-green-400\');' +
        'labelText.innerText = \'Cleared!\';' +
        'iconWrapper.innerHTML = ' +
          '\'<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">\' +' +
            '\'<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />\' +' +
          '\'</svg>\';' +

        'setTimeout(function() {' +
          'btn.classList.remove(\'text-green-400\');' +
          'btn.classList.add(\'text-gray-400\', \'hover:text-red-400\');' +
          'labelText.innerText = nativeLabelText;' +
          'iconWrapper.innerHTML = nativeIcon;' +
        '}, 1800);' +

      '} catch (err) {' +
        'console.error("Failed to execute memory clearing:", err);' +
      '}' +
    '}' +
  '</script>' +
'</body>' +
'</html>';
}