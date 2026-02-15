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


// // Step 1: Inject script to hide scrollbar and get dimensions
//     const hideScrollbarScript = `
//       (function() {
//         // 1. 注入样式隐藏滚动条（保持不变）
//         const style = document.createElement('style');
//         style.id = 'screenshot-hide-scrollbar';
//         style.textContent = \`
//           * { scrollbar-width: none !important; }
//           *::-webkit-scrollbar { display: none !important; }
//           html { overflow: -moz-scrollbars-none !important; -ms-overflow-style: none !important; }
//         \`;
//         document.head.appendChild(style);
        
//         // 2. 强制重排，确保样式生效
//         document.body.offsetHeight;
        
//         const html = document.documentElement;
//         const body = document.body;

//         // --- 智能宽度计算开始 ---
        
//         // A. 获取视口宽度（屏幕可见宽度）
//         const viewportWidth = html.clientWidth;

//         // B. 获取 Body 的物理宽度（内容宽度）
//         const bodyWidth = Math.max(body.scrollWidth, body.offsetWidth);

//         // C. 获取 HTML 的物理宽度（通常等于视口，但也可能更大）
//         const htmlWidth = Math.max(html.scrollWidth, html.offsetWidth);

//         // D. 获取所有可能的最大宽度（这是最安全的做法，但可能包含视口空白）
//         const maxDocWidth = Math.max(bodyWidth, htmlWidth);

//         let finalWidth;

//         // 逻辑判断：
//         // 1. 如果最大宽度 > 视口宽度 + 误差，说明页面有横向滚动（是宽页面，如 Test 6）
//         //    为了兼容性，我们必须截取最大宽度，即使看起来像空白。
//         if (maxDocWidth > viewportWidth + 1) {
//             finalWidth = maxDocWidth; 
//         } 
//         // 2. 否则，说明页面没有横向滚动（是窄页面或普通页面，如 Test 4）
//         //    这时我们优先信任 bodyWidth，如果它小于视口，就按它截取。
//         else {
//             // 如果 body 宽度明显小于视口（且不为0），说明是固定宽度的窄网页
//             if (bodyWidth > 0 && bodyWidth < viewportWidth) {
//                 finalWidth = bodyWidth;
//             } else {
//                 // 普通网页，宽度就是视口宽度
//                 finalWidth = viewportWidth;
//             }
//         }
        
//         // --- 智能宽度计算结束 ---

//         return {
//           width: finalWidth,
//           height: Math.max(
//             body.scrollHeight,
//             body.offsetHeight,
//             html.clientHeight,
//             html.scrollHeight,
//             html.offsetHeight
//           )
//         };
//       })();
//     `;