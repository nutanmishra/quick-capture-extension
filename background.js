class ScreenshotBackground {
  constructor() {
    this.init();
  }

  init() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "captureScreenshot") {
        this.handleScreenshotCapture(request, sender, sendResponse);
        return true; // Keep message channel open for async response
      }
    });
  }

  async handleScreenshotCapture(request, sender, sendResponse) {
    try {
      const { type, settings, tabId } = request;

      // Get tab details to check URL
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch (error) {
        throw new Error("Failed to retrieve tab information: " + error.message);
      }

      const isRestrictedUrl =
        tab.url.startsWith("chrome://") || tab.url.startsWith("about://");

      if ((type === "fullPage" || type === "selection") && isRestrictedUrl) {
        throw new Error(
          "Cannot capture screenshots on chrome:// or about:// pages"
        );
      }

      let dataUrl;

      switch (type) {
        case "visible":
          dataUrl = await this.captureVisibleTab(tabId);
          break;
        case "fullPage":
          dataUrl = await this.captureFullPage(tabId, settings);
          break;
        case "selection":
          dataUrl = await this.captureSelection(tabId, settings);
          break;
        case "delay":
          dataUrl = await this.captureDelay(tabId, settings);
          break;
        case "screen":
          dataUrl = await this.captureScreen(tabId, settings);
          break;
        case "annotate":
          dataUrl = await this.captureAnnotate(tabId, settings);
          break;
        case "extractText":
          dataUrl = await this.captureExtractText(tabId, settings);
          break;
        default:
          throw new Error("Invalid capture type");
      }

      sendResponse({
        success: true,
        dataUrl: dataUrl,
      });
    } catch (error) {
      console.error(
        `Background capture error (${request.type}):`,
        error.message,
        error.stack
      );
      sendResponse({
        success: false,
        error: error.message,
      });
    }
  }

  async captureVisibleTab(tabId) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: "png",
        quality: 100,
      });
      return dataUrl;
    } catch (error) {
      throw new Error("Failed to capture visible area: " + error.message);
    }
  }

  async captureFullPage(tabId, settings) {
    try {
      // Attach debugger to the tab
      await chrome.debugger.attach({ tabId }, "1.3");

      // Enable Page domain
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");

      // Get layout metrics for full page size
      const { contentSize } = await chrome.debugger.sendCommand(
        { tabId },
        "Page.getLayoutMetrics"
      );

      // Set device metrics to capture the full page
      await chrome.debugger.sendCommand(
        { tabId },
        "Emulation.setDeviceMetricsOverride",
        {
          width: contentSize.width,
          height: contentSize.height,
          deviceScaleFactor: settings.highQuality ? 2 : 1,
          mobile: false,
        }
      );

      // Capture screenshot
      const { data } = await chrome.debugger.sendCommand(
        { tabId },
        "Page.captureScreenshot",
        {
          format: "png",
          quality: settings.highQuality ? 100 : 80,
          captureBeyondViewport: true,
        }
      );

      // Clear device metrics override
      await chrome.debugger.sendCommand(
        { tabId },
        "Emulation.clearDeviceMetricsOverride"
      );

      // Detach debugger
      await chrome.debugger.detach({ tabId });

      return `data:image/png;base64,${data}`;
    } catch (error) {
      // Ensure debugger is detached on error
      try {
        await chrome.debugger.detach({ tabId });
      } catch (detachError) {
        console.warn("Failed to detach debugger:", detachError);
      }
      throw new Error("Failed to capture full page: " + error.message);
    }
  }

  async captureSelection(tabId, settings) {
    try {
      // Inject html2canvas
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["html2canvas.min.js"],
      });

      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: this.selectionCaptureScript,
        args: [settings],
      });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: () => window.screenshotResult,
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      } else {
        return await this.captureVisibleTab(tabId); // Fallback
      }
    } catch (error) {
      throw new Error("Failed to capture selection: " + error.message);
    }
  }

  async captureDelay(tabId, settings) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return await this.captureVisibleTab(tabId);
  }

  async captureScreen(tabId, settings) {
    throw new Error("Screen capture not implemented");
  }

  async captureAnnotate(tabId, settings) {
    throw new Error("Annotation not implemented");
  }

  async captureExtractText(tabId, settings) {
    throw new Error("Text extraction not implemented");
  }

  selectionCaptureScript(settings) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.background = "rgba(0, 0, 0, 0.3)";
      overlay.style.zIndex = "9999";
      overlay.style.cursor = "crosshair";
      document.body.appendChild(overlay);

      let startX, startY, endX, endY;
      let isSelecting = false;

      const selectionBox = document.createElement("div");
      selectionBox.style.position = "absolute";
      selectionBox.style.border = "2px dashed #3498db";
      selectionBox.style.background = "rgba(52, 152, 219, 0.2)";
      overlay.appendChild(selectionBox);

      overlay.addEventListener("mousedown", (e) => {
        isSelecting = true;
        startX = e.pageX;
        startY = e.pageY;
        selectionBox.style.left = startX + "px";
        selectionBox.style.top = startY + "px";
        selectionBox.style.width = "0px";
        selectionBox.style.height = "0px";
      });

      overlay.addEventListener("mousemove", (e) => {
        if (isSelecting) {
          endX = e.pageX;
          endY = e.pageY;
          selectionBox.style.width = Math.abs(endX - startX) + "px";
          selectionBox.style.height = Math.abs(endY - startY) + "px";
          selectionBox.style.left = Math.min(startX, endX) + "px";
          selectionBox.style.top = Math.min(startY, endY) + "px";
        }
      });

      overlay.addEventListener("mouseup", () => {
        isSelecting = false;
        if (typeof html2canvas !== "undefined") {
          const x = Math.min(startX, endX);
          const y = Math.min(startY, endY);
          const width = Math.abs(endX - startX);
          const height = Math.abs(endY - startY);

          html2canvas(document.body, {
            x: x,
            y: y,
            width: width,
            height: height,
            useCORS: true,
            scale: settings.highQuality ? 2 : 1,
          })
            .then((canvas) => {
              window.screenshotResult = canvas.toDataURL("image/png");
              document.body.removeChild(overlay);
              resolve(window.screenshotResult);
            })
            .catch((error) => {
              console.error("html2canvas error:", error);
              window.screenshotResult = null;
              document.body.removeChild(overlay);
              resolve(null);
            });
        } else {
          console.error("html2canvas not available");
          window.screenshotResult = null;
          document.body.removeChild(overlay);
          resolve(null);
        }
      });
    });
  }
}

new ScreenshotBackground();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("Screenshot Capture extension installed");
  }
});
