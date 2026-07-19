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

let selectedFile = null;
let currentCritiqueMarkdown = "";
let loadingInterval = null;

// Loading step messages to cycle through for user engagement
const loadingMessages = [
  "Uploading PDF to Cloudflare Worker isolate...",
  "Initializing in-memory ArrayBuffer parser...",
  "Extracting selectable text elements via unpdf...",
  "Formatting prompt with systems engineering directives...",
  "Invoking Workers AI Llama-3.1 model...",
  "Analyzing technical skill matrix groupings...",
  "Evaluating metric quantification of bullet points...",
  "Applying whitespace noise reduction filters...",
  "Compiling comprehensive critique report...",
  "Optimizing layout recommendation parameters..."
];

// Initialize Drag & Drop Events
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
}

function clearSelectedFile() {
  selectedFile = null;
  fileInput.value = '';
  fileInfo.classList.add('hidden');
  analyzeBtn.classList.add('hidden');
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

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! Status: ${response.status}`);
    }

    currentCritiqueMarkdown = data.critique;
    
    // Render Critique Markdown
    critiqueContent.innerHTML = marked.parse(currentCritiqueMarkdown);
    extractedMeta.textContent = `Processed ${formatBytes(data.extractedTextLength || 0)} of raw resume text`;

    // Transition to Results Card
    loadingCard.classList.add('hidden');
    resultsCard.classList.remove('hidden');

  } catch (err) {
    console.error("Critique failed:", err);
    alert(`Resume evaluation failed:\n${err.message || err}`);
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