chrome.action.onClicked.addListener((tab) => {
  chrome.debugger.attach({ tabId: tab.id }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.error("Debugger attach failed:", chrome.runtime.lastError);
      return;
    }

    // Step 1: 仅仅计算页面真实的完整尺寸
    const calculateDimensionsScript = `
      (function() {
        const html = document.documentElement;
        return {
          width: Math.max(document.body.scrollWidth, document.body.offsetWidth, html.clientWidth, html.scrollWidth, html.offsetWidth),
          height: Math.max(document.body.scrollHeight, document.body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight)
        };
      })();
    `;

    chrome.debugger.sendCommand(
      { tabId: tab.id },
      "Runtime.evaluate",
      { expression: calculateDimensionsScript, returnByValue: true },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error("Script execution failed:", chrome.runtime.lastError);
          chrome.debugger.detach({ tabId: tab.id });
          return;
        }

        const dimensions = result.result.value;
        const targetWidth = Math.ceil(dimensions.width);
        const targetHeight = Math.ceil(dimensions.height);

        // Step 2: 欺骗浏览器，将视口分辨率瞬间撑大到整个页面的尺寸
        chrome.debugger.sendCommand(
          { tabId: tab.id },
          "Emulation.setDeviceMetricsOverride",
          {
            width: targetWidth,
            height: targetHeight,
            deviceScaleFactor: 1, // 保持 1:1 比例，避免模糊
            mobile: false,
            fitWindow: false
          },
          () => {
            // 给浏览器一点点时间（300ms）来触发重新排版和渲染原生滚动条
            setTimeout(() => {
              
              // Step 3: 进行标准截图（此时视口已经足够大，不需要 captureBeyondViewport 了）
              chrome.debugger.sendCommand(
                { tabId: tab.id },
                "Page.captureScreenshot",
                {
                  format: "png",
                  quality: 100,
                  clip: {
                    x: 0,
                    y: 0,
                    width: targetWidth,
                    height: targetHeight,
                    scale: 1
                  }
                  // 注意：这里彻底移除了 captureBeyondViewport 参数
                },
                (screenshotResult) => {
                  
                  // Step 4: 截图完成后，立刻恢复原状，清除视口覆盖
                  chrome.debugger.sendCommand(
                    { tabId: tab.id },
                    "Emulation.clearDeviceMetricsOverride",
                    {},
                    () => {
                      if (chrome.runtime.lastError) {
                        console.error("Screenshot error:", chrome.runtime.lastError);
                      } else if (screenshotResult && screenshotResult.data) {
                        downloadImage(screenshotResult.data, tab.title);
                      }
                      
                      chrome.debugger.detach({ tabId: tab.id });
                    }
                  );
                }
              );
            }, 300);
          }
        );
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