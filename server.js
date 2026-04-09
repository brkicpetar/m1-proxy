const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

const TARGET_URL =
  "https://player.mediaklikk.hu/playernew/player.php?video=mtv1live";

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function extractFirstM3U8(html) {
  // Match direct .m3u8 URLs inside HTML / JS
  const regex =
    /https?:\/\/[^\s"'\\]+?\.m3u8(?:\?[^\s"'\\]*)?/gi;

  const matches = html.match(regex);
  if (matches && matches.length > 0) {
    return matches[0];
  }

  // Sometimes URLs are escaped like https:\/\/...m3u8
  const escapedRegex =
    /https?:\\\/\\\/[^\s"'\\]+?\.m3u8(?:\?[^\s"'\\]*)?/gi;

  const escapedMatches = html.match(escapedRegex);
  if (escapedMatches && escapedMatches.length > 0) {
    return escapedMatches[0].replace(/\\\//g, "/");
  }

  return null;
}

app.get("/m1", async (_req, res) => {
  try {
    const response = await axios.get(TARGET_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://player.mediaklikk.hu/",
      },
      timeout: 15000,
    });

    const html = response.data;
    const m3u8 = extractFirstM3U8(html);

    if (!m3u8) {
      return res.status(404).json({
        ok: false,
        error: "No .m3u8 found in page source",
      });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
res.type("text/plain").send(m3u8);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`M1 resolver running on port ${PORT}`);
});