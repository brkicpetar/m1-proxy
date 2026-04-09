const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

async function resolveM3U8(video) {
  const targetUrl = `https://player.mediaklikk.hu/playernew/player.php?video=${encodeURIComponent(video)}`;

  const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-blink-features=AutomationControlled"
  ]
});

  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  });

  let foundM3U8 = null;
  const seen = new Set();

  page.on("request", (req) => {
    const url = req.url();
    if (url.includes(".m3u8") && !foundM3U8) {
      foundM3U8 = url;
    }
    seen.add(url);
  });

  page.on("response", (res) => {
    const url = res.url();
    if (url.includes(".m3u8") && !foundM3U8) {
      foundM3U8 = url;
    }
    seen.add(url);
  });

  try {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // Give player JS time to initialize and request stream
    await page.waitForTimeout(8000);

    if (!foundM3U8) {
      // Try clicking play if a button exists
      const playSelectors = [
        "button",
        ".vjs-big-play-button",
        ".jw-display-icon-container",
        ".jw-icon-display"
      ];

      for (const selector of playSelectors) {
        try {
          const el = await page.$(selector);
          if (el) {
            await el.click({ force: true });
            await page.waitForTimeout(5000);
            if (foundM3U8) break;
          }
        } catch (_) {}
      }
    }

    if (!foundM3U8) {
      // Try scanning page HTML and inline scripts as fallback
      const html = await page.content();
      const matches = html.match(/https?:\/\/[^\s"'\\]+?\.m3u8(?:\?[^\s"'\\]*)?/gi);
      if (matches?.length) {
        foundM3U8 = matches[0];
      }
    }

    return {
      targetUrl,
      streamUrl: foundM3U8,
      requests: Array.from(seen).filter((u) =>
        u.includes("m3u8") ||
        u.includes("playlist") ||
        u.includes("stream") ||
        u.includes("manifest") ||
        u.includes("mpd")
      )
    };
  } finally {
    await browser.close();
  }
}

app.get("/resolve", async (req, res) => {
  const video = req.query.video;

  if (!video) {
    return res.status(400).json({
      ok: false,
      error: "Missing ?video= parameter"
    });
  }

  try {
    const result = await resolveM3U8(video);

    if (!result.streamUrl) {
      return res.status(404).json({
        ok: false,
        error: "No .m3u8 found after browser execution",
        sourcePage: result.targetUrl,
        hints: result.requests
      });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.redirect(result.streamUrl);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Resolver running on port ${PORT}`);
});