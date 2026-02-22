chrome.action.onClicked.addListener((tab) => {
  chrome.debugger.attach({ tabId: tab.id }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.error("Debugger attach failed:", chrome.runtime.lastError);
      return;
    }

    // Step 1: Inject script to hide scrollbars and calculate page dimensions
    const hideScrollbarScript = `
      (function() {
        // Inject style to hide scrollbars
        const style = document.createElement('style');
        style.id = 'screenshot-hide-scrollbar';
        style.textContent = \`
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
        \`;
        document.head.appendChild(style);

        // Force reflow to ensure style is applied
        document.body.offsetHeight;

        const html = document.documentElement;

        // Calculate full document size
        return {
          width: Math.max(
            document.body.scrollWidth,
            document.body.offsetWidth,
            html.clientWidth,
            html.scrollWidth,
            html.offsetWidth
          ),
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
          console.error("Script execution failed:", chrome.runtime.lastError);
          chrome.debugger.detach({ tabId: tab.id });
          return;
        }

        const dimensions = result.result.value;
        console.log("Screenshot dimensions:", dimensions);

        // Wait briefly to ensure styles take effect
        setTimeout(() => {
          // Step 2: Capture screenshot
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
              // Step 3: Restore scrollbars
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
                    console.error("Screenshot error:", chrome.runtime.lastError);
                  } else {
                    downloadImage(screenshotResult.data, tab.title);
                  }

                  chrome.debugger.detach({ tabId: tab.id });
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

  chrome.downloads.download(
    {
      url: dataUrl,
      filename: `${sanitizeFileName(title)}.png`,
      saveAs: false
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Download failed:", chrome.runtime.lastError);
      } else {
        console.log("Screenshot download started, ID:", downloadId);
      }
    }
  );
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}