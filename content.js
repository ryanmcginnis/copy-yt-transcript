let buttonCheckInterval = null;

function getTranscriptPanel() {
  // Query all panels in the document
  const panels = document.querySelectorAll('ytd-engagement-panel-section-list-renderer');
  
  for (const panel of panels) {
    const targetId = panel.getAttribute('target-id') || '';
    
    // Check if this is the transcript panel by target-id
    const isTranscriptPanel = targetId.toLowerCase().includes('transcript');
    
    // Also check if the panel contains the transcript renderer (either in Light DOM or Shadow DOM)
    const hasTranscriptRenderer = panel.querySelector('ytd-transcript-renderer') ||
                                  (panel.shadowRoot && panel.shadowRoot.querySelector('ytd-transcript-renderer'));
                                  
    if (isTranscriptPanel || hasTranscriptRenderer) {
      // Check if it's hidden. If it has visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN", skip it.
      const visibility = panel.getAttribute('visibility');
      if (visibility === 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN') {
        continue;
      }
      return panel;
    }
  }

  // Fallback 1: search for ytd-transcript-renderer in the global document (Light DOM)
  const transcriptRenderer = document.querySelector('ytd-transcript-renderer');
  if (transcriptRenderer) {
    return transcriptRenderer.closest('ytd-engagement-panel-section-list-renderer') || transcriptRenderer;
  }

  // Fallback 2: search inside shadow roots of all engagement panels for ytd-transcript-renderer
  for (const panel of panels) {
    if (panel.shadowRoot) {
      const tr = panel.shadowRoot.querySelector('ytd-transcript-renderer');
      if (tr) {
        return panel;
      }
    }
  }

  return null;
}

function collectRawTextNodes(element, nodes) {
  if (!element) return;

  // If the node is a text node, add it
  if (element.nodeType === Node.TEXT_NODE) {
    nodes.push(element);
    return;
  }

  // If it's an element node, perform safety checks
  if (element.nodeType === Node.ELEMENT_NODE) {
    // Avoid scraping our custom button
    if (element.id === 'yt-copy-transcript-btn' || (element.closest && element.closest('#yt-copy-transcript-btn'))) {
      return;
    }
    
    // Ignore input/search fields
    if (element.tagName === 'INPUT' || (element.closest && element.closest('#search-form, ytd-searchbox'))) {
      return;
    }

    // Ignore hidden elements
    if (element.offsetWidth === 0 && element.offsetHeight === 0) {
      return;
    }
  }

  // Traverse light DOM children
  let child = element.firstChild;
  while (child) {
    collectRawTextNodes(child, nodes);
    child = child.nextSibling;
  }

  // Traverse shadow DOM if present
  if (element.shadowRoot) {
    let shadowChild = element.shadowRoot.firstChild;
    while (shadowChild) {
      collectRawTextNodes(shadowChild, nodes);
      shadowChild = shadowChild.nextSibling;
    }
  }
}

function getTranscriptText() {
  const panel = getTranscriptPanel();
  if (!panel) return "";

  const nodes = [];
  collectRawTextNodes(panel, nodes);

  let lines = [];
  for (const node of nodes) {
    let text = node.textContent.trim();
    if (!text) continue;

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
  }

  // Deduplicate consecutive identical lines
  const cleanLines = lines.filter((item, pos, arr) => !pos || item !== arr[pos - 1]);

  return cleanLines.join("\n");
}

function injectCopyButton() {
  const panel = getTranscriptPanel();
  if (!panel) return;

  // Prevent double injection
  if (document.getElementById('yt-copy-transcript-btn')) return;
  
  const headerRenderer = panel.querySelector('ytd-engagement-panel-title-header-renderer') ||
                         (panel.shadowRoot && panel.shadowRoot.querySelector('ytd-engagement-panel-title-header-renderer'));
  
  if (headerRenderer && headerRenderer.shadowRoot && headerRenderer.shadowRoot.getElementById('yt-copy-transcript-btn')) {
    return;
  }

  console.log("[YT Transcript Copier] Found active transcript panel. Injecting button...", panel);

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

  // Try shadow root of header renderer first (which contains title and header-text)
  if (headerRenderer && headerRenderer.shadowRoot) {
    const shadowRoot = headerRenderer.shadowRoot;
    const targetHeader = shadowRoot.querySelector('#title-container') ||
                         shadowRoot.querySelector('#title') ||
                         shadowRoot.querySelector('#header-text') ||
                         shadowRoot.querySelector('h2') ||
                         shadowRoot.querySelector('.title-text');
    if (targetHeader) {
      // Inject styles into the shadow root so they apply to the button
      if (!shadowRoot.getElementById('yt-copy-transcript-btn-styles')) {
        const style = document.createElement('style');
        style.id = 'yt-copy-transcript-btn-styles';
        style.textContent = `
          #yt-copy-transcript-btn {
            background-color: #cc0000 !important;
            color: #ffffff !important;
            border: none !important;
            border-radius: 12px !important;
            padding: 6px 12px !important;
            font-size: 12px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            margin: 5px 10px !important;
            display: inline-block !important;
            z-index: 99999 !important;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          }
          #yt-copy-transcript-btn:hover {
            background-color: #990000 !important;
          }
          #yt-copy-transcript-btn.copied {
            background-color: #2da44e !important;
          }
        `;
        shadowRoot.appendChild(style);
      }
      targetHeader.after(copyBtn);
      console.log("[YT Transcript Copier] Injected button into headerRenderer's shadowRoot next to", targetHeader);
      return;
    }
  }

  // Fallback 1: light DOM of header renderer or panel
  const targetHeader = panel.querySelector('#header-text, h2, #title, #title-container');
  if (targetHeader) {
    copyBtn.setAttribute('slot', 'header');
    targetHeader.after(copyBtn);
    console.log("[YT Transcript Copier] Injected button into Light DOM next to", targetHeader);
    return;
  }

  // Fallback 2: prepend directly to the panel (with slot="header")
  copyBtn.setAttribute('slot', 'header');
  panel.prepend(copyBtn);
  console.log("[YT Transcript Copier] Prepended button directly to panel with slot='header'");
}

if (buttonCheckInterval) clearInterval(buttonCheckInterval);
buttonCheckInterval = setInterval(injectCopyButton, 1000);

const observer = new MutationObserver(() => {
  injectCopyButton();
});
observer.observe(document.body, { childList: true, subtree: true });
