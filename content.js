let buttonCheckInterval = null;

function getTranscriptText() {
  const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"], ytd-transcript-renderer');
  if (!panel) return "";

  let lines = [];
  
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      
      // Ignore anything sitting inside input/search fields
      if (node.parentElement.tagName === 'INPUT' || node.parentElement.closest('#search-form, ytd-searchbox')) {
        return NodeFilter.FILTER_REJECT;
      }
      
      // FIX: Explicitly ignore the text if it is inside our custom button element
      if (node.parentElement.id === 'yt-copy-transcript-btn' || node.parentElement.closest('#yt-copy-transcript-btn')) {
        return NodeFilter.FILTER_REJECT;
      }
      
      if (node.parentElement.offsetWidth === 0 || node.parentElement.offsetHeight === 0) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    let text = currentNode.textContent.trim();
    
    // Clean up YouTube's broken non-breaking spaces (0xA0) around censored words
    text = text.replace(/\xA0_\xA0/g, '__');
    text = text.replace(/\xA0/g, ' '); 

    // 1. Matches classic timestamps (e.g., "0:00", "12:34")
    const isClassicTimestamp = /^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(text);
    
    // 2. Matches text-based timestamps (e.g., "8 seconds", "1 minute")
    const isTextTimestamp = /\d+\s+(second|minute|hour)s?/.test(text.toLowerCase());

    // 3. Filter out unwanted interface text strings
    const isUiText = [
      "search transcript", 
      "search",
      "sync to video time", 
      "copy transcript", 
      "📋 copy transcript",
      "✅ copied!",
      "transcript"
    ].includes(text.toLowerCase().trim());
    
    if (!isClassicTimestamp && !isTextTimestamp && !isUiText && text.length > 1) {
      lines.push(text);
    }
    currentNode = walker.nextNode();
  }

  // Deduplicate consecutive identical lines
  const cleanLines = lines.filter((item, pos, arr) => !pos || item !== arr[pos - 1]);

  return cleanLines.join("\n");
}

function injectCopyButton() {
  const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"], ytd-transcript-renderer');
  if (!panel) return;

  const targetHeader = panel.querySelector('#header-text, h2, #title');
  if (!targetHeader || document.getElementById('yt-copy-transcript-btn')) return;

  const copyBtn = document.createElement('button');
  copyBtn.id = 'yt-copy-transcript-btn';
  copyBtn.innerHTML = '📋 Copy Transcript';

  copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const text = getTranscriptText();
    
    if (text && text.length > 0) {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerHTML = '✅ Copied!';
        copyBtn.style.backgroundColor = '#2da44e';
        
        setTimeout(() => {
          copyBtn.innerHTML = '📋 Copy Transcript';
          copyBtn.style.backgroundColor = '#cc0000';
        }, 2000);
      }).catch(err => console.error('Clipboard error:', err));
    } else {
      alert('Transcript text could not be scraped. Try scrolling down the transcript panel slightly and clicking again.');
    }
  });

  targetHeader.after(copyBtn);
}

if (buttonCheckInterval) clearInterval(buttonCheckInterval);
buttonCheckInterval = setInterval(injectCopyButton, 1000);

const observer = new MutationObserver(() => {
  injectCopyButton();
});
observer.observe(document.body, { childList: true, subtree: true });