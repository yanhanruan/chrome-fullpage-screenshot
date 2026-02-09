chrome.action.onClicked.addListener((tab) => {
  chrome.debugger.attach({ tabId: tab.id }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.error('Debugger attach 失败:', chrome.runtime.lastError);
      return;
    }

    // 步骤1: 注入脚本隐藏滚动条并获取尺寸
    const hideScrollbarScript = `
      (function() {
        // 添加样式隐藏滚动条
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
        
        // 强制重排
        document.body.offsetHeight;
        
        const html = document.documentElement;
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

    // 执行脚本获取尺寸
    chrome.debugger.sendCommand(
      { tabId: tab.id },
      "Runtime.evaluate",
      { expression: hideScrollbarScript, returnByValue: true },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error('脚本执行失败:', chrome.runtime.lastError);
          chrome.debugger.detach({ tabId: tab.id });
          return;
        }

        const dimensions = result.result.value;
        console.log('截图尺寸:', dimensions);

        // 等待一下确保样式生效
        setTimeout(() => {
          // 步骤2: 截图
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
              // 步骤3: 恢复滚动条
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
                    console.error('截图错误:', chrome.runtime.lastError);
                    chrome.debugger.detach({ tabId: tab.id });
                  } else {
                    // 下载图片
                    downloadImage(screenshotResult.data, tab.title);

                    // 复制到剪贴板
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
      console.error("下载失败:", chrome.runtime.lastError);
    } else {
      console.log("截图已开始下载，ID:", downloadId);
    }
  });
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

// 通过注入脚本复制到剪贴板
function copyToClipboard(tabId, base64Data) {

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: copyImageToClipboard,
    args: [base64Data]
  }).then((results) => {
    if (results && results[0] && results[0].result) {
      console.log('剪贴板操作结果:', results[0].result);
    }
  }).catch((error) => {
    console.error('注入脚本失败:', error);
  });
}

// 这个函数会被注入到页面中执行
async function copyImageToClipboard(base64Data) {
  try {
    const response = await fetch('data:image/png;base64,' + base64Data);
    const blob = await response.blob();

    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob
      })
    ]);

    return { success: true, message: '图片已复制到剪贴板' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}