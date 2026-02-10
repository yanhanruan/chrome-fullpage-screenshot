chrome.action.onClicked.addListener((tab) => {
  chrome.debugger.attach({ tabId: tab.id }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.error('Debugger attach failed:', chrome.runtime.lastError);
      return;
    }

    // Step 1: Inject script to hide scrollbar and get dimensions
    const hideScrollbarScript = `
      (function() {
        // Add style to hide scrollbar
        const style = document.createElement('style');
        style.id = 'screenshot-hide-scrollbar';
        style.textContent = `
          * {
            scrollbar-width: none !important;
          }
          *::-webkit-scrollbar {
            display: none !important;
          }
          html {
            overflow: -moz-scrollbars-none !important;
            -ms-overflow-style: none !important;
          }
        `;
        document.head.appendChild(style);
        
        // Force reflow
        document.body.offsetHeight;
        
        const html = document.documentElement;
        return {
          width: html.clientWidth,
          height: Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
          )
        };
      })();
    `;

    // Execute script to get dimensions
    chrome.debugger.sendCommand(
      { tabId: tab.id },
      "Runtime.evaluate",
      { expression: hideScrollbarScript, returnByValue: true },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error('Script execution failed:', chrome.runtime.lastError);
          chrome.debugger.detach({ tabId: tab.id });
          return;
        }

        const dimensions = result.result.value;
        console.log('Screenshot dimensions:', dimensions);

        // Wait a moment to ensure styles are applied
        setTimeout(() => {
          // Step 2: Take screenshot
          chrome.debugger.sendCommand(
            { tabId: tab.id },
            "Page.captureScreenshot",
            {
              format: "png",
              quality: 100,
              clip: {
                x: 0,
                y: 0,
                width: dimensions.width,
                height: dimensions.height,
                scale: 1
              },
              captureBeyondViewport: true
            },
            (screenshotResult) => {
              // Step 3: Restore scrollbar
              const restoreScript = `
                (function() {
                  const style = document.getElementById('screenshot-hide-scrollbar');
                  if (style) style.remove();
                })();
              `;

              chrome.debugger.sendCommand(
                { tabId: tab.id },
                "Runtime.evaluate",
                { expression: restoreScript },
                () => {
                  if (chrome.runtime.lastError) {
                    console.error('Screenshot error:', chrome.runtime.lastError);
                    chrome.debugger.detach({ tabId: tab.id });
                  } else {
                    // Download image
                    downloadImage(screenshotResult.data, tab.title);

                    // Copy to clipboard
                    copyToClipboard(tab.id, screenshotResult.data);

                    chrome.debugger.detach({ tabId: tab.id });
                  }
                }
              );
            }
          );
        }, 150);
      }
    );
  });
});

function downloadImage(base64Data, title = "screenshot") {
  const dataUrl = `data:image/png;base64,${base64Data}`;

  chrome.downloads.download({
    url: dataUrl,
    filename: `${sanitizeFileName(title)}.png`,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error("Download failed:", chrome.runtime.lastError);
    } else {
      console.log("Screenshot download started, ID:", downloadId);
    }
  });
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

// Copy to clipboard by injecting script
function copyToClipboard(tabId, base64Data) {

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: copyImageToClipboard,
    args: [base64Data]
  }).then((results) => {
    if (results && results[0] && results[0].result) {
      console.log('Clipboard operation result:', results[0].result);
    }
  }).catch((error) => {
    console.error('Script injection failed:', error);
  });
}

// This function will be injected and executed on the page
async function copyImageToClipboard(base64Data) {
  try {
    const response = await fetch('data:image/png;base64,' + base64Data);
    const blob = await response.blob();

    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob
      })
    ]);

    return { success: true, message: 'Image copied to clipboard' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}