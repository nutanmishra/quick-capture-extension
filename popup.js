class ScreenshotCapture {
  constructor() {
    this.settings = {
      autoDownload: false,
      highQuality: true,
      includeTimestamp: false,
    };

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
    this.updateToggleStates();
    this.setupTabs();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(["screenshotSettings"]);
      if (result.screenshotSettings) {
        this.settings = { ...this.settings, ...result.screenshotSettings };
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
      this.showStatus("Failed to load settings", "error");
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set({ screenshotSettings: this.settings });
    } catch (error) {
      console.error("Failed to save settings:", error);
      this.showStatus("Failed to save settings", "error");
    }
  }

  setupTabs() {
    const captureTab = document.getElementById("captureTab");
    const recordTab = document.getElementById("recordTab");
    const captureContent = document.getElementById("captureContent");
    const recordContent = document.getElementById("recordContent");

    captureTab.addEventListener("click", () => {
      captureTab.classList.add("active");
      recordTab.classList.remove("active");
      captureContent.style.display = "block";
      recordContent.style.display = "none";
      captureTab.setAttribute("aria-selected", "true");
      recordTab.setAttribute("aria-selected", "false");
    });

    recordTab.addEventListener("click", () => {
      recordTab.classList.add("active");
      captureTab.classList.remove("active");
      recordContent.style.display = "block";
      captureContent.style.display = "none";
      recordTab.setAttribute("aria-selected", "true");
      captureTab.setAttribute("aria-selected", "false");
    });
  }

  bindEvents() {
    // Card capture options
    document.getElementById("captureVisible").addEventListener("click", () => {
      this.captureScreenshot("visible");
    });

    document.getElementById("captureFullPage").addEventListener("click", () => {
      this.captureScreenshot("fullPage");
    });

    document
      .getElementById("captureSelection")
      .addEventListener("click", () => {
        this.captureScreenshot("selection");
      });

    // List capture options
    document.getElementById("captureDelay").addEventListener("click", () => {
      this.captureScreenshot("delay");
    });

    document.getElementById("captureScreen").addEventListener("click", () => {
      this.captureScreenshot("screen");
    });

    document.getElementById("annotateLocal").addEventListener("click", () => {
      this.captureScreenshot("annotate");
    });

    document.getElementById("extractText").addEventListener("click", () => {
      this.captureScreenshot("extractText");
    });

    // Settings toggles
    document.getElementById("autoDownload").addEventListener("click", () => {
      this.toggleSetting("autoDownload");
    });

    document.getElementById("highQuality").addEventListener("click", () => {
      this.toggleSetting("highQuality");
    });

    document
      .getElementById("includeTimestamp")
      .addEventListener("click", () => {
        this.toggleSetting("includeTimestamp");
      });
  }

  updateToggleStates() {
    Object.keys(this.settings).forEach((key) => {
      const toggle = document.getElementById(key);
      if (toggle) {
        toggle.classList.toggle("active", this.settings[key]);
        toggle.setAttribute("aria-pressed", this.settings[key]);
      }
    });
  }

  toggleSetting(setting) {
    this.settings[setting] = !this.settings[setting];
    this.updateToggleStates();
    this.saveSettings();
  }

  async captureScreenshot(type) {
    try {
      this.showLoading(true);

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab) {
        throw new Error("No active tab found");
      }

      if (!chrome.runtime) {
        throw new Error("Browser extension API not available");
      }

      const response = await chrome.runtime.sendMessage({
        action: "captureScreenshot",
        type: type,
        settings: this.settings,
        tabId: tab.id,
      });

      if (response.success) {
        this.showStatus("Screenshot captured successfully!", "success");
        if (this.settings.autoDownload && response.dataUrl) {
          this.downloadImage(response.dataUrl);
        }
      } else {
        throw new Error(response.error || "Failed to capture screenshot");
      }
    } catch (error) {
      console.error(
        `Screenshot capture (${type}) failed:`,
        error.message,
        error.stack
      );
      this.showStatus(error.message, "error"); // Display the exact error message
    } finally {
      this.showLoading(false);
    }
  }

  downloadImage(dataUrl) {
    const timestamp = this.settings.includeTimestamp
      ? `_${new Date().toISOString().replace(/[:.]/g, "-")}`
      : "";
    const filename = `screenshot${timestamp}.png`;

    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true,
    });
  }

  showLoading(show) {
    const loading = document.getElementById("loading");
    const container = document.querySelector(".container");

    if (show) {
      loading.classList.add("show");
      container.style.opacity = "0.3";
    } else {
      loading.classList.remove("show");
      container.style.opacity = "1";
    }
  }

  showStatus(message, type = "info") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status show ${type}`;

    setTimeout(() => {
      status.classList.remove("show");
    }, 5000); // Increased duration for visibility
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new ScreenshotCapture();
  const toggles = ["autoDownload", "highQuality", "includeTimestamp"];

  // Load saved states
  toggles.forEach((id) => {
    const toggle = document.getElementById(id);
    const savedState = localStorage.getItem(id);
    if (savedState !== null) {
      toggle.checked = savedState === "true";
    }

    // Save state when changed
    toggle.addEventListener("change", () => {
      localStorage.setItem(id, toggle.checked);
    });
  });
});

// document.addEventListener("DOMContentLoaded", () => {
//   const toggleButtons = document.querySelectorAll(".toggle");
//   toggleButtons.forEach((button) => {
//     button.addEventListener("click", () => {
//       // Toggle active class and aria-pressed attribute
//       const isActive = button.classList.toggle("active");
//       button.setAttribute("aria-pressed", isActive);
//     });
//   });
// });
