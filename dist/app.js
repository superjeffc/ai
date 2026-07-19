// Compute API URL dynamically based on environment
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:8787/' 
  : '/api/';

// DOM Elements
const uploadCard = document.getElementById('upload-card');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const removeFileBtn = document.getElementById('remove-file-btn');
const analyzeBtn = document.getElementById('analyze-btn');

const loadingCard = document.getElementById('loading-card');
const loadingStep = document.getElementById('loading-step');

const resultsCard = document.getElementById('results-card');
const critiqueContent = document.getElementById('critique-content');
const extractedMeta = document.getElementById('extracted-meta');
const copyBtn = document.getElementById('copy-btn');
const downloadBtn = document.getElementById('download-btn');
const newCritiqueBtn = document.getElementById('new-critique-btn');

// Stats counter DOM elements
const statsCounter = document.getElementById('stats-counter');
const counterValue = document.getElementById('counter-value');

// Turnstile widget DOM elements
const turnstileContainer = document.getElementById('turnstile-container');

// Tabs and Resume Preview DOM elements
const tabCritiqueBtn = document.getElementById('tab-critique-btn');
const tabResumeBtn = document.getElementById('tab-resume-btn');
const critiquePanel = document.getElementById('critique-panel');
const resumePanel = document.getElementById('resume-panel');
const resumePreviewContent = document.getElementById('resume-preview-content');
const downloadPdfBtn = document.getElementById('download-pdf-btn');
const downloadPdfTopBtn = document.getElementById('download-pdf-top-btn');
const jobDescInput = document.getElementById('job-desc-input');
const charCount = document.getElementById('char-count');
const charLimitWarning = document.getElementById('char-limit-warning');

let selectedFile = null;
let currentCritiqueMarkdown = "";
let loadingInterval = null;
let targetPageCount = 1;

const loadingMessages = [
  "Reading resume file...",
  "Extracting text content...",
  "Analyzing technical skills matrix...",
  "Evaluating experience and bullet metrics...",
  "Evaluating professional experience spacing...",
  "Synthesizing formatting suggestions...",
  "Checking bullet point action verb alignment...",
  "Aggregating systems engineering feedback...",
  "Optimizing page content density...",
  "Parsing technical keyword groups...",
  "Organizing credentials and headers...",
  "Structuring education and details...",
  "Reviewing margins and print layout...",
  "Identifying areas for layout improvement...",
  "Generating recruiter critique...",
  "Polishing rewritten resume suggestions...",
  "Running visual layout checks...",
  "Assembling final critique report..."
];

// Prevent default drag behaviors for the entire window to stop the browser from opening files
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  window.addEventListener(eventName, (e) => {
    e.preventDefault();
  }, false);
});

// Initialize Drag & Drop Events for the drop zone
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('border-indigo-500/70', 'bg-indigo-950/10');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-500/70', 'bg-indigo-950/10');
  }, false);
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length > 0) {
    handleFileSelect(files[0]);
  }
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelect(e.target.files[0]);
  }
});

if (jobDescInput) {
  ['input', 'keyup', 'paste', 'change'].forEach(evt => {
    jobDescInput.addEventListener(evt, () => {
      // Small delay on paste to allow value to update
      if (evt === 'paste') {
        setTimeout(updateCharCount, 0);
      } else {
        updateCharCount();
      }
    });
  });
  // Initialize on load to handle autocomplete or history restores
  updateCharCount();
}

function updateCharCount() {
  if (!jobDescInput || !charCount) return;
  const len = jobDescInput.value.length;
  charCount.textContent = len.toLocaleString();
  
  if (len >= 9500) {
    charCount.className = "font-bold text-red-400 code-font";
    if (charLimitWarning) {
      charLimitWarning.textContent = "Approaching character limit";
      charLimitWarning.classList.remove('opacity-0');
      charLimitWarning.classList.add('opacity-100');
    }
  } else if (len >= 8000) {
    charCount.className = "font-bold text-yellow-400 code-font";
    if (charLimitWarning) {
      charLimitWarning.textContent = "Approaching character limit";
      charLimitWarning.classList.remove('opacity-0');
      charLimitWarning.classList.add('opacity-100');
    }
  } else {
    charCount.className = "font-bold text-gray-400 code-font";
    if (charLimitWarning) {
      charLimitWarning.classList.remove('opacity-100');
      charLimitWarning.classList.add('opacity-0');
    }
  }
}

// Remove file click handler
removeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearSelectedFile();
});

// Process Selected File
function handleFileSelect(file) {
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    alert("Invalid file format. Please upload a PDF document.");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("File size exceeds 5MB. Please upload a smaller PDF resume.");
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  
  fileInfo.classList.remove('hidden');
  analyzeBtn.classList.remove('hidden');
  if (turnstileContainer) turnstileContainer.classList.remove('hidden');
}

function clearSelectedFile() {
  selectedFile = null;
  fileInput.value = '';
  fileInfo.classList.add('hidden');
  analyzeBtn.classList.add('hidden');
  if (turnstileContainer) turnstileContainer.classList.add('hidden');
  if (window.turnstile) window.turnstile.reset();
  if (jobDescInput) {
    jobDescInput.value = '';
    updateCharCount();
  }

  // Reset tab states
  if (tabCritiqueBtn && tabResumeBtn && critiquePanel && resumePanel) {
    critiquePanel.classList.remove('hidden');
    resumePanel.classList.add('hidden');
    tabCritiqueBtn.className = "text-xs bg-slate-900 border border-slate-800/80 text-indigo-400 px-4 py-2.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 border-b-2 border-indigo-500";
    tabResumeBtn.className = "text-xs bg-slate-950/40 border border-slate-900/60 text-gray-400 hover:text-indigo-400 hover:bg-slate-900 px-4 py-2.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5";
  }
  if (resumePreviewContent) {
    resumePreviewContent.innerHTML = '';
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Start analysis upload process
analyzeBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  const jobDesc = jobDescInput ? jobDescInput.value.trim() : "";
  if (jobDesc.length > 10000) {
    alert("Job description is too long. The maximum limit is 10,000 characters.");
    return;
  }

  // 1. Retrieve Turnstile token
  const token = window.turnstile ? window.turnstile.getResponse() : "";
  if (!token) {
    alert("Please complete the Turnstile verification first.");
    return;
  }

  // 2. Validate token against the siteverify Worker
  try {
    const verifyResponse = await fetch("https://turnstile-siteverify-cs-resume-critique.superjeffc.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });

    if (!verifyResponse.ok) {
      throw new Error(`Verification service returned status ${verifyResponse.status}`);
    }

    const verifyData = await verifyResponse.json();
    if (!verifyData.success) {
      alert("Turnstile verification failed. Please try again.");
      if (window.turnstile) window.turnstile.reset();
      return;
    }
  } catch (err) {
    console.error("Turnstile verification error:", err);
    alert(`Verification failed: ${err.message || err}. Please try again.`);
    if (window.turnstile) window.turnstile.reset();
    return;
  }

  // Show Loading Screen
  uploadCard.classList.add('hidden');
  loadingCard.classList.remove('hidden');
  
  let stepIndex = 0;
  loadingStep.textContent = loadingMessages[0];
  
  // Cycle loading messages dynamically
  loadingInterval = setInterval(() => {
    stepIndex = (stepIndex + 1) % loadingMessages.length;
    loadingStep.textContent = loadingMessages[stepIndex];
  }, 3500);

  const formData = new FormData();
  formData.append('resume', selectedFile);
  
  if (jobDesc) {
    formData.append('jobDescription', jobDesc);
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      let errorMsg = `HTTP error! Status: ${response.status}`;
      try {
        const errText = await response.text();
        try {
          const errJson = JSON.parse(errText);
          errorMsg = errJson.error || errorMsg;
        } catch {
          if (errText && errText.trim().length < 500) {
            errorMsg = errText;
          }
        }
      } catch {}
      throw new Error(errorMsg);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new Error(`Failed to parse API response as JSON: ${parseErr.message}`);
    }

    const rawCritique = data.critique || "";
    let critiquePart = rawCritique;
    let resumeHtmlPart = "";

    // Regular expression to match "=== REWRITTEN RESUME ===" case-insensitively, allowing variation in equals count or markdown formatting.
    const delimiterRegex = /(?:#|\*|_)*\s*={3,}\s*REWRITTEN RESUME\s*={3,}\s*(?:#|\*|_)*/i;
    
    if (delimiterRegex.test(rawCritique)) {
      const parts = rawCritique.split(delimiterRegex);
      critiquePart = parts[0].trim();
      let rawHtml = parts[1].trim();
      
      // Clean up markdown code blocks if the model wrapped the HTML response
      rawHtml = rawHtml.replace(/^```(html)?/i, "").trim();
      rawHtml = rawHtml.replace(/```$/, "").trim();
      
      resumeHtmlPart = rawHtml;
    } else {
      critiquePart = rawCritique;
      resumeHtmlPart = `
        <div style="font-family: sans-serif; padding: 40px; text-align: center; color: #666;">
          <p>No rewritten resume generated. Check the Critique tab for recommendations.</p>
        </div>
      `;
    }

    currentCritiqueMarkdown = critiquePart;
    
    // Update counter if returned in response
    if (data && typeof data.count === 'number') {
      updateCounter(data.count);
    }
    targetPageCount = data.targetPageCount || 1;
    
    // Render Critique Markdown
    critiqueContent.innerHTML = marked.parse(currentCritiqueMarkdown);
    
    // Render Rewritten HTML Resume
    if (resumePreviewContent) {
      resumePreviewContent.innerHTML = resumeHtmlPart || `
        <div style="font-family: sans-serif; padding: 40px; text-align: center; color: #666;">
          <p>No rewritten resume generated. Check the Critique tab for recommendations.</p>
        </div>
      `;
      fitToPageTarget(resumePreviewContent, targetPageCount);
    }
    
    if (extractedMeta) {
      extractedMeta.textContent = `Processed ${formatBytes(data.extractedTextLength || 0)} of raw resume text`;
    }



    // Transition to Results Card
    loadingCard.classList.add('hidden');
    resultsCard.classList.remove('hidden');

  } catch (err) {
    console.error("Critique failed:", err);
    alert(`Resume evaluation failed:\n${err.message || err}`);
    if (window.turnstile) window.turnstile.reset();
    // Revert back to upload page
    loadingCard.classList.add('hidden');
    uploadCard.classList.remove('hidden');
  } finally {
    if (loadingInterval) {
      clearInterval(loadingInterval);
      loadingInterval = null;
    }
  }
});

// Instantaneous client-side font sizing refinement loop to match targeted page height
function fitToPageTarget(element, targetPages) {
  if (!element || !element.innerHTML.trim() || element.innerHTML.includes('No rewritten resume generated')) {
    return;
  }
  
  // Temporarily show resume panel if hidden to get accurate measurements
  const panelWasHidden = resumePanel && resumePanel.classList.contains('hidden');
  if (panelWasHidden) {
    resumePanel.classList.remove('hidden');
  }
  
  // Reset any previous dynamic sizing
  element.style.fontSize = "1.0em";
  
  const maxAllowedHeight = targetPages * 1050 + (targetPages - 1) * 20;
  const minRequiredHeight = (targetPages - 1) * 1123 + 750;
  
  let currentScale = 1.0;
  let height = element.scrollHeight;
  console.log(`Auto-fitting layout: current height is ${height}px. Target range: ${minRequiredHeight}px - ${maxAllowedHeight}px`);
  
  // Scale down step-by-step if too tall
  if (height > maxAllowedHeight) {
    while (element.scrollHeight > maxAllowedHeight && currentScale > 0.65) {
      currentScale -= 0.015;
      element.style.fontSize = `${currentScale}em`;
    }
    console.log(`Scaled down to ${currentScale}em. New height: ${element.scrollHeight}px`);
  }
  // Scale up step-by-step if too short (only if targetPages > 1 or it is very short)
  else if (height < minRequiredHeight) {
    const minScaleUpThreshold = targetPages === 1 ? 600 : minRequiredHeight;
    if (height < minScaleUpThreshold) {
      while (element.scrollHeight < minScaleUpThreshold && currentScale < 1.15) {
        currentScale += 0.015;
        element.style.fontSize = `${currentScale}em`;
      }
      console.log(`Scaled up to ${currentScale}em. New height: ${element.scrollHeight}px`);
    }
  }
  
  if (panelWasHidden) {
    resumePanel.classList.add('hidden');
  }
}

// Copy markdown to clipboard
copyBtn.addEventListener('click', async () => {
  if (!currentCritiqueMarkdown) return;
  try {
    await navigator.clipboard.writeText(currentCritiqueMarkdown);
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = `
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
      <span>Copied!</span>
    `;
    copyBtn.classList.add('border-green-500/50', 'text-green-400');
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.classList.remove('border-green-500/50', 'text-green-400');
    }, 2000);
  } catch (err) {
    alert("Failed to copy report to clipboard.");
  }
});

// Download markdown report
downloadBtn.addEventListener('click', () => {
  if (!currentCritiqueMarkdown) return;
  const blob = new Blob([currentCritiqueMarkdown], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  
  // Format file name from uploaded name
  const originalName = selectedFile ? selectedFile.name.replace('.pdf', '') : 'resume';
  link.setAttribute('download', `${originalName}_critique.md`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

// Reset critique flow
newCritiqueBtn.addEventListener('click', () => {
  resultsCard.classList.add('hidden');
  clearSelectedFile();
  uploadCard.classList.remove('hidden');
});

// Tab Switching
if (tabCritiqueBtn && tabResumeBtn && critiquePanel && resumePanel) {
  tabCritiqueBtn.addEventListener('click', () => {
    critiquePanel.classList.remove('hidden');
    resumePanel.classList.add('hidden');
    tabCritiqueBtn.className = "text-xs bg-slate-900 border border-slate-800/80 text-indigo-400 px-4 py-2.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 border-b-2 border-indigo-500";
    tabResumeBtn.className = "text-xs bg-slate-950/40 border border-slate-900/60 text-gray-400 hover:text-indigo-400 hover:bg-slate-900 px-4 py-2.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5";
  });

  tabResumeBtn.addEventListener('click', () => {
    resumePanel.classList.remove('hidden');
    critiquePanel.classList.add('hidden');
    tabResumeBtn.className = "text-xs bg-slate-900 border border-slate-800/80 text-indigo-400 px-4 py-2.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 border-b-2 border-indigo-500";
    tabCritiqueBtn.className = "text-xs bg-slate-950/40 border border-slate-900/60 text-gray-400 hover:text-indigo-400 hover:bg-slate-900 px-4 py-2.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5";
  });
}

// Shared PDF generation and download trigger
function handleDownloadPdf() {
  const element = document.getElementById('resume-preview-content');
  if (!element || !resumePreviewContent.innerHTML.trim() || resumePreviewContent.innerHTML.includes('No rewritten resume generated')) {
    alert("No rewritten resume content available to download.");
    return;
  }
  
  const previewContainer = document.getElementById('resume-preview-container');
  const scrollParent = previewContainer ? previewContainer.parentElement : null;
  
  // Save original styles/scroll position
  const originalPadding = previewContainer ? previewContainer.style.padding : '';
  const originalMinHeight = previewContainer ? previewContainer.style.minHeight : '';
  const originalScrollTop = scrollParent ? scrollParent.scrollTop : 0;
  
  // Temporarily clear styling constraints and scroll to top to prevent html2canvas offsets
  if (previewContainer) {
    previewContainer.style.padding = '0px';
    previewContainer.style.minHeight = '0px';
  }
  if (scrollParent) {
    scrollParent.scrollTop = 0;
  }
  
  const originalName = selectedFile ? selectedFile.name.replace('.pdf', '') : 'resume';
  const opt = {
    margin:       [0.12, 0.15, 0.12, 0.15],
    filename:     `${originalName}_optimized.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 2, 
      useCORS: true, 
      letterRendering: true,
      scrollX: 0,
      scrollY: 0
    },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  
  const buttonsToDisable = [];
  if (downloadPdfBtn) buttonsToDisable.push(downloadPdfBtn);
  if (downloadPdfTopBtn) buttonsToDisable.push(downloadPdfTopBtn);
  
  const oldTexts = buttonsToDisable.map(btn => btn.innerHTML);
  buttonsToDisable.forEach(btn => {
    btn.disabled = true;
    btn.innerHTML = "<span>Generating PDF...</span>";
  });
  
  html2pdf().set(opt).from(element).save().then(() => {
    buttonsToDisable.forEach((btn, idx) => {
      btn.disabled = false;
      btn.innerHTML = oldTexts[idx];
    });
    
    // Restore styles and scroll position
    if (previewContainer) {
      previewContainer.style.padding = originalPadding;
      previewContainer.style.minHeight = originalMinHeight;
    }
    if (scrollParent) {
      scrollParent.scrollTop = originalScrollTop;
    }
  }).catch(err => {
    console.error("PDF generation failed:", err);
    alert("Failed to generate PDF. Please try again.");
    buttonsToDisable.forEach((btn, idx) => {
      btn.disabled = false;
      btn.innerHTML = oldTexts[idx];
    });
    
    // Restore styles and scroll position
    if (previewContainer) {
      previewContainer.style.padding = originalPadding;
      previewContainer.style.minHeight = originalMinHeight;
    }
    if (scrollParent) {
      scrollParent.scrollTop = originalScrollTop;
    }
  });
}

if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener('click', handleDownloadPdf);
}
if (downloadPdfTopBtn) {
  downloadPdfTopBtn.addEventListener('click', handleDownloadPdf);
}

// Fetch and display stats counter
async function fetchStats() {
  try {
    const response = await fetch(API_URL);
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.count === 'number') {
        updateCounter(data.count);
      }
    }
  } catch (err) {
    console.warn("Failed to fetch stats count:", err);
  }
}

function updateCounter(count) {
  if (counterValue && statsCounter) {
    counterValue.textContent = count;
    statsCounter.classList.remove('opacity-0');
  }
}

// Call on startup
fetchStats();