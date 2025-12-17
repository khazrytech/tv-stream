const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

const DATA_FILE = path.join(__dirname, "streams.json");
const NOTIFICATIONS_FILE = path.join(__dirname, "notifications.json");
const IPTV_PLAYLISTS_FILE = path.join(__dirname, "iptv-playlists.json");
const SCROLLING_TEXT_FILE = path.join(__dirname, "scrolling_text.json");
const SITE_SETTINGS_FILE = path.join(__dirname, "site_settings.json");

const DEFAULT_IPTV_PLAYLISTS = [
  {
    key: "lifestyle",
    label: "Lifestyle",
    playlistUrl: "https://iptv-org.github.io/iptv/categories/lifestyle.m3u",
    channels: [],
    count: 70,
  },
  {
    key: "movies",
    label: "Movies",
    playlistUrl: "https://iptv-org.github.io/iptv/categories/movies.m3u",
    channels: [],
    count: 265,
  },
  {
    key: "music",
    label: "Music",
    playlistUrl: "https://iptv-org.github.io/iptv/categories/music.m3u",
    channels: [],
    count: 396,
  },
  {
    key: "news",
    label: "News",
    playlistUrl: "https://iptv-org.github.io/iptv/categories/news.m3u",
    channels: [],
    count: 502,
  },
  {
    key: "outdoor",
    label: "Outdoor",
    playlistUrl: "https://iptv-org.github.io/iptv/categories/outdoor.m3u",
    channels: [],
    count: 42,
  },
  {
    key: "relax",
    label: "Relax",
    playlistUrl: "https://iptv-org.github.io/iptv/categories/relax.m3u",
    channels: [],
    count: 15,
  },
  {
    key: "religious",
    label: "Religious",
    playlistUrl: "https://iptv-org.github.io/iptv/categories/religious.m3u",
    channels: [],
    count: 310,
  },
  {
    key: "series",
    label: "Series",
    playlistUrl: "https://iptv-org.github.io/iptv/categories/series.m3u",
    channels: [],
    count: 166,
  },
  {
    key: "science",
    label: "Science",
    playlistUrl: "https://iptv-org.github.io/iptv/categories/science.m3u",
    channels: [],
    count: 23,
  },
];

// AllFootball API Configuration
const ALLFOOTBALL_API_KEY =
  "00de0605ae54e06c73e52409c4c3aae2fd6339ce67cd60999ac2404cc6249bd0";
const ALLFOOTBALL_BASE_URL = "https://api.allfootball.com";

// Live score cache (refresh every 30 seconds)
let livescoreCache = {
  data: null,
  timestamp: 0,
  ttl: 30000, // 30 seconds
};

// Fixtures cache (refresh every 60 seconds)
let fixturesCache = {
  data: null,
  timestamp: 0,
  ttl: 60000, // 60 seconds
};


// Central category configuration so both API and admin can stay in sync
const CATEGORY_CONFIG = [
  { id: "live-tv", title: "Live TV Channels" },
  { id: "local-tv", title: "Local TV" },
  { id: "international-tv", title: "International TV" },
  { id: "movies", title: "Movies" },
  { id: "series", title: "TV Series" },
  { id: "cartoons", title: "Cartoons & Kids" },
  { id: "sports", title: "Sports Channels" },
  { id: "news", title: "News Channels" },
  { id: "documentary", title: "Documentary" },
  { id: "music", title: "Music Videos" },
  { id: "gospel", title: "Gospel & Inspiration" },
  { id: "education", title: "Education & Learning" },
  { id: "radio", title: "Radio Stations" },
];

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:8080,http://localhost:5173,http://127.0.0.1:8080,https://zoological-stillness-production.up.railway.app,http://127.0.0.1:5500,http://localhost:5500,https://www.tvstream.run.place,.onrender.com,http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (like mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow Railway subdomains
      if (origin.includes(".railway.app")) {
        return callback(null, true);
      }
      // Allow local network IPs (IPv4) for mobile testing
      // Matches 192.168.x.x, 10.x.x.x, 172.16.x.x - 172.31.x.x
      if (
        origin.startsWith("http://192.168.") ||
        origin.startsWith("http://10.") ||
        (origin.startsWith("http://172.") &&
          parseInt(origin.split(".")[1]) >= 16 &&
          parseInt(origin.split(".")[1]) <= 31)
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
  }),
);

app.use((err, req, res, next) => {
  if (err?.message?.includes("CORS")) {
    return res.status(403).json({ message: err.message });
  }
  return next(err);
});
app.use(express.json());
app.use(express.static(__dirname));

// Health check endpoint for Railway
app.get("/health", (req, res) => {
  try {
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      port: PORT,
      memory: {
        used: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
        heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      },
      pid: process.pid,
    };

    res.status(200).json(healthData);
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Root endpoint serves landing.html (the updated UI)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "landing.html"));
});

function readStreams() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return { streams: [] };
  }
}

function writeStreams(data) {
  try {
    // Ensure directory exists
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing streams file:", err);
    throw new Error(
      "Kushindwa kuandika faili. Hakikisha ruhusa za kuandika zipo.",
    );
  }
}

function readNotifications() {
  try {
    const raw = fs.readFileSync(NOTIFICATIONS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return { notifications: [] };
  }
}

function writeNotifications(data) {
  fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function readIptvPlaylists() {
  try {
    const raw = fs.readFileSync(IPTV_PLAYLISTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.categories)) {
      return { categories: [] };
    }
    return parsed;
  } catch (err) {
    return { categories: [] };
  }
}

function writeIptvPlaylists(data) {
  const dir = path.dirname(IPTV_PLAYLISTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload = {
    categories: Array.isArray(data?.categories) ? data.categories : [],
  };
  fs.writeFileSync(
    IPTV_PLAYLISTS_FILE,
    JSON.stringify(payload, null, 2),
    "utf8",
  );
}

function readScrollingText() {
  try {
    const raw = fs.readFileSync(SCROLLING_TEXT_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return { messages: [] };
  }
}

function writeScrollingText(data) {
  fs.writeFileSync(SCROLLING_TEXT_FILE, JSON.stringify(data, null, 2), "utf8");
}

function readSiteSettings() {
  try {
    const raw = fs.readFileSync(SITE_SETTINGS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return {
      about: {
        title: "About Us",
        content: "Welcome to TV Stream. The best place to watch live TV, movies, and series."
      },
      social: {
        youtube: { enabled: true, url: "https://youtube.com/@hackertrick", username: "hackertrick" },
        facebook: { enabled: true, url: "https://facebook.com/khazry.makoi", username: "khazry makoi" },
        instagram: { enabled: true, url: "https://instagram.com/makoi_tz", username: "makoi tz" }
      }
    };
  }
}

function writeSiteSettings(data) {
  fs.writeFileSync(SITE_SETTINGS_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function parseM3U(url) {
  try {
    const response = await axios.get(url);
    const text = response.data;
    const lines = text.split(/\r?\n/);
    const channels = [];
    let current = null;

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      if (line.startsWith('#EXTINF')) {
        const name = line.split(',').pop().trim();
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        current = {
          title: name,
          logo: logoMatch ? logoMatch[1] : '',
          group: groupMatch ? groupMatch[1] : '',
        };
      } else if (!line.startsWith('#') && current) {
        channels.push({
          ...current,
          url: line
        });
        current = null;
      }
    });
    return channels;
  } catch (error) {
    console.error("Error parsing M3U:", error.message);
    return [];
  }
}

function slugify(value = "") {
  return (
    value
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "category"
  );
}

function normalizeAdminChannel(channel = {}, index = 0, categoryKey = "") {
  const streamUrl = (
    channel.url ||
    channel.streamUrl ||
    channel.playlistUrl ||
    ""
  ).trim();
  if (!streamUrl) return null;
  return {
    title: (channel.title || channel.name || `Channel ${index + 1}`).trim(),
    url: streamUrl,
    logo: (channel.logo || channel.icon || "").trim(),
    group: (channel.group || channel.genre || "").trim(),
    language: (channel.language || channel.lang || "").trim(),
    categoryKey,
  };
}

function normalizePlaylistPayload(body = {}, fallbackKey) {
  const label = (body.label || body.title || "").trim();
  if (!label) {
    throw new Error("Label ya category ni lazima.");
  }
  const requestedKey = (
    body.key ||
    body.slug ||
    fallbackKey ||
    slugify(label)
  ).trim();
  const key = slugify(requestedKey);
  const playlistUrl = (
    body.playlistUrl ||
    body.url ||
    body.playlist ||
    ""
  ).trim();
  const rawChannels = Array.isArray(body.channels) ? body.channels : [];
  const channels = rawChannels
    .map((channel, index) => normalizeAdminChannel(channel, index, key))
    .filter(Boolean);

  if (!playlistUrl && !channels.length) {
    throw new Error("Weka Playlist URL au angalau channel moja ya manual.");
  }

  return {
    key,
    label,
    playlistUrl,
    channels,
    count: channels.length || Number(body.count) || 0,
  };
}

// Public API: shape tailored for TV-Stream-PRO.html
app.get("/api/streams", (req, res) => {
  const { streams } = readStreams();

  const categoryData = {};
  CATEGORY_CONFIG.forEach((catConfig) => {
    const cat = catConfig.id;
    const items = streams
      .filter((s) => s.category === cat)
      .map((s) => ({
        id: s.id,
        title: s.title,
        thumbnail: s.thumbnail,
        streamUrl: s.streamUrl,
        year: s.year,
        rating: s.rating,
      }));

    categoryData[cat] = {
      title: catConfig.title,
      items,
    };
  });

  const liveStreams = streams
    .filter((s) => s.isFeatured)
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description || "",
      streamUrl: s.streamUrl,
      quality: s.quality || "Auto",
      genre: s.genre || "",
    }));

  res.json({ liveStreams, categoryData });
});

// Public: expose category list so admin dashboard can stay in sync
app.get("/api/categories", (req, res) => {
  res.json(CATEGORY_CONFIG);
});

app.get("/api/iptv-playlists", (req, res) => {
  const data = readIptvPlaylists();
  const categories =
    Array.isArray(data.categories) && data.categories.length
      ? data.categories
      : DEFAULT_IPTV_PLAYLISTS;
  res.json({ categories });
});

// Simple auth middleware via header (optional, can be extended later)
function requireAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  const headerToken = req.headers["x-admin-token"];

  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (headerToken) {
    token = headerToken;
  }

  const expected = process.env.ADMIN_TOKEN || "techboy1234";
  console.log(`Auth Check - Token provided: '${token ? "YES" : "NO"}', Expected: '${expected}'`);

  if (token !== expected) {
    return res.status(401).json({
      message: "Hakuna ruhusa. Tafadhali ingia tena kwa admin dashboard.",
    });
  }
  next();
}

app.get("/api/admin/iptv-playlists", requireAdmin, (req, res) => {
  const data = readIptvPlaylists();
  res.json(Array.isArray(data.categories) ? data.categories : []);
});

app.post("/api/admin/iptv-playlists", requireAdmin, (req, res) => {
  try {
    const payload = normalizePlaylistPayload(req.body || {});
    const data = readIptvPlaylists();
    const categories = Array.isArray(data.categories) ? data.categories : [];
    if (categories.some((cat) => cat.key === payload.key)) {
      return res
        .status(409)
        .json({ message: "Category yenye key hii tayari ipo." });
    }
    categories.push(payload);
    writeIptvPlaylists({ categories });
    res.status(201).json(payload);
  } catch (error) {
    console.error("Failed to save IPTV playlist", error);
    res
      .status(400)
      .json({ message: error.message || "Imeshindikana kuhifadhi category." });
  }
});

app.put("/api/admin/iptv-playlists/:key", requireAdmin, (req, res) => {
  try {
    const currentKey = slugify(req.params.key || "");
    const data = readIptvPlaylists();
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const index = categories.findIndex((cat) => cat.key === currentKey);
    if (index === -1) {
      return res.status(404).json({ message: "Category haijapatikana." });
    }
    const payload = normalizePlaylistPayload(
      { ...req.body, key: currentKey },
      currentKey,
    );
    categories[index] = { ...categories[index], ...payload };
    writeIptvPlaylists({ categories });
    res.json(categories[index]);
  } catch (error) {
    console.error("Failed to update IPTV playlist", error);
    res
      .status(400)
      .json({ message: error.message || "Imeshindikana kuhariri category." });
  }
});

app.delete("/api/admin/iptv-playlists/:key", requireAdmin, (req, res) => {
  const currentKey = slugify(req.params.key || "");
  const data = readIptvPlaylists();
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const index = categories.findIndex((cat) => cat.key === currentKey);
  if (index === -1) {
    return res.status(404).json({ message: "Category haijapatikana." });
  }
  const removed = categories.splice(index, 1)[0];
  writeIptvPlaylists({ categories });
  res.json(removed);
});

// Admin CRUD API
app.get("/api/admin/streams", requireAdmin, (req, res) => {
  console.log("Admin streams requested, sending response...");
  const { streams } = readStreams();
  console.log(`Sending ${streams ? streams.length : 0} streams`);
  res.json(streams);
});

app.post("/api/admin/streams", requireAdmin, (req, res) => {
  try {
    const { streams } = readStreams();
    const {
      title,
      streamUrl,
      category,
      thumbnail,
      year,
      rating,
      description,
      quality,
      genre,
      isFeatured,
    } = req.body || {};

    if (!title || !streamUrl || !category) {
      return res.status(400).json({
        message:
          "Tafadhali jaza Title, Stream URL, na Category. Sehemu hizi ni lazima.",
      });
    }

    const maxId = streams.reduce((max, s) => (s.id > max ? s.id : max), 0);
    const newStream = {
      id: maxId + 1,
      title,
      streamUrl,
      category,
      thumbnail:
        thumbnail ||
        "https://via.placeholder.com/300x450/667eea/ffffff?text=TV+Stream",
      year: year || "",
      rating: rating || "",
      description: description || "",
      quality: quality || "Auto",
      genre: genre || "",
      isFeatured: !!isFeatured,
    };

    streams.push(newStream);
    writeStreams({ streams });

    res.status(201).json(newStream);
  } catch (err) {
    console.error("Error saving stream:", err);
    res.status(500).json({
      message:
        err.message ||
        "Kosa la ndani la server. Tafadhali jaribu tena baadaye.",
    });
  }
});

app.put("/api/admin/streams/:id", requireAdmin, (req, res) => {
  try {
    const { streams } = readStreams();
    const id = parseInt(req.params.id, 10);
    const index = streams.findIndex((s) => s.id === id);
    if (index === -1) {
      return res.status(404).json({ message: "Stream haijapatikana." });
    }

    const current = streams[index];
    const {
      title,
      streamUrl,
      category,
      thumbnail,
      year,
      rating,
      description,
      quality,
      genre,
      isFeatured,
    } = req.body || {};

    const updated = {
      ...current,
      ...(title !== undefined ? { title } : {}),
      ...(streamUrl !== undefined ? { streamUrl } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(thumbnail !== undefined ? { thumbnail } : {}),
      ...(year !== undefined ? { year } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(quality !== undefined ? { quality } : {}),
      ...(genre !== undefined ? { genre } : {}),
      ...(isFeatured !== undefined ? { isFeatured: !!isFeatured } : {}),
    };

    streams[index] = updated;
    writeStreams({ streams });

    res.json(updated);
  } catch (err) {
    console.error("Error updating stream:", err);
    res.status(500).json({
      message:
        err.message ||
        "Kosa la ndani la server. Tafadhali jaribu tena baadaye.",
    });
  }
});

app.delete("/api/admin/streams/:id", requireAdmin, (req, res) => {
  const { streams } = readStreams();
  const id = parseInt(req.params.id, 10);
  const index = streams.findIndex((s) => s.id === id);
  if (index === -1) {
    return res.status(404).json({ message: "Stream not found" });
  }

  const removed = streams.splice(index, 1)[0];
  writeStreams({ streams });

  res.json(removed);
});

// Serve main user app on root handled above

// Catch-all route for any auth requests - redirect to home
app.get("/auth*", (req, res) => {
  res.redirect("/");
});

app.get("/football-ai", (req, res) => {
  res.sendFile(path.join(__dirname, "football-ai.html"));
});

app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// Notifications API - Public (for users to fetch)
app.get("/api/notifications", (req, res) => {
  const { notifications } = readNotifications();
  // Only return unread notifications
  const unread = notifications.filter((n) => !n.read);
  res.json(unread);
});

// Notifications API - Admin (CRUD)
app.get("/api/admin/notifications", requireAdmin, (req, res) => {
  const { notifications } = readNotifications();
  res.json(notifications);
});

app.post("/api/admin/notifications", requireAdmin, (req, res) => {
  const { notifications } = readNotifications();
  const { title, message, type = "info", priority = "normal", link = "" } = req.body || {};

  if (!title || !message) {
    return res.status(400).json({ message: "title and message are required" });
  }

  const maxId = notifications.reduce((max, n) => (n.id > max ? n.id : max), 0);
  const newNotification = {
    id: maxId + 1,
    title,
    message,
    type,
    priority,
    link,
    read: false,
    createdAt: new Date().toISOString(),
  };

  notifications.push(newNotification);
  writeNotifications({ notifications });

  res.status(201).json(newNotification);
});

app.delete("/api/admin/notifications/:id", requireAdmin, (req, res) => {
  const { notifications } = readNotifications();
  const id = parseInt(req.params.id, 10);
  const index = notifications.findIndex((n) => n.id === id);
  if (index === -1) {
    return res.status(404).json({ message: "Notification not found" });
  }

  const removed = notifications.splice(index, 1)[0];
  writeNotifications({ notifications });

  res.json(removed);
});

// Mark notification as read (for users)
app.post("/api/notifications/:id/read", (req, res) => {
  const { notifications } = readNotifications();
  const id = parseInt(req.params.id, 10);
  const notification = notifications.find((n) => n.id === id);
  if (notification) {
    notification.read = true;
    writeNotifications({ notifications });
  }
  res.json({ success: true });
});

// --- NEW FEATURES ---

// 1. Scrolling Text API
app.get("/api/scrolling-text", (req, res) => {
  const { messages } = readScrollingText();
  // Filter only active messages
  const active = messages.filter(m => m.active !== false);
  res.json(active);
});

app.get("/api/admin/scrolling-text", requireAdmin, (req, res) => {
  const { messages } = readScrollingText();
  res.json(messages);
});

app.post("/api/admin/scrolling-text", requireAdmin, (req, res) => {
  const { messages } = readScrollingText();
  const { text, active = true } = req.body;
  if (!text) return res.status(400).json({ message: "Text is required" });

  const maxId = messages.reduce((max, m) => (m.id > max ? m.id : max), 0);
  const newMessage = { id: maxId + 1, text, active, createdAt: new Date() };
  messages.push(newMessage);
  writeScrollingText({ messages });
  res.status(201).json(newMessage);
});

app.delete("/api/admin/scrolling-text/:id", requireAdmin, (req, res) => {
  const { messages } = readScrollingText();
  const id = parseInt(req.params.id, 10);
  const index = messages.findIndex(m => m.id === id);
  if (index === -1) return res.status(404).json({ message: "Not found" });
  messages.splice(index, 1);
  writeScrollingText({ messages });
  res.json({ success: true });
});

app.put("/api/admin/scrolling-text/:id", requireAdmin, (req, res) => {
  const { messages } = readScrollingText();
  const id = parseInt(req.params.id, 10);
  const index = messages.findIndex(m => m.id === id);
  if (index === -1) return res.status(404).json({ message: "Not found" });

  const { text, active } = req.body;
  if (text !== undefined) messages[index].text = text;
  if (active !== undefined) messages[index].active = active;

  writeScrollingText({ messages });
  res.json(messages[index]);
});


// 2. Site Settings API (About, Socials)
app.get("/api/settings", (req, res) => {
  res.json(readSiteSettings());
});

app.post("/api/admin/settings", requireAdmin, (req, res) => {
  const current = readSiteSettings();
  const { about, social } = req.body;
  const newSettings = {
    about: about || current.about,
    social: social || current.social
  };
  writeSiteSettings(newSettings);
  res.json(newSettings);
});


// 3. IPTV Proxy (Server-side parsing)
// Cache for parsed playlists in memory to avoid fetching every time
const playlistCache = {};

app.get("/api/iptv/proxy/:key", async (req, res) => {
  const { key } = req.params;
  const { categories } = readIptvPlaylists();
  const category = categories.find(c => c.key === key);

  if (!category) return res.status(404).json({ error: "Category not found" });

  // If manual channels exist, prioritize them or combine them
  const manualChannels = category.channels || [];

  // If there is a playlist URL, fetch and parse it
  let remoteChannels = [];

  // Check cache (TTL 1 hour)
  const now = Date.now();
  if (category.playlistUrl) {
    if (playlistCache[key] && (now - playlistCache[key].timestamp < 3600000)) {
      remoteChannels = playlistCache[key].data;
    } else {
      remoteChannels = await parseM3U(category.playlistUrl);
      playlistCache[key] = {
        timestamp: now,
        data: remoteChannels
      };
    }
  }

  // Combine manual and remote channels. Manual first.
  // Assign IDs for the frontend to play
  const allChannels = [...manualChannels, ...remoteChannels].map((ch, idx) => ({
    ...ch,
    id: `${key}-${idx}`,
    // fallback logo
    logo: ch.logo || ch.icon || "https://via.placeholder.com/50x50/333/fff?text=TV"
  }));

  res.json({
    key: category.key,
    label: category.label,
    count: allChannels.length,
    channels: allChannels
  });
});

// Live Score API - Modern implementation with caching
async function fetchLiveScores() {
  try {
    // Try multiple possible API endpoints
    const endpoints = [
      `${ALLFOOTBALL_BASE_URL}/v1/livescore`,
      `${ALLFOOTBALL_BASE_URL}/livescore`,
      `${ALLFOOTBALL_BASE_URL}/api/livescore`,
      `${ALLFOOTBALL_BASE_URL}/v1/matches/live`,
      `${ALLFOOTBALL_BASE_URL}/matches/live`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          headers: {
            "X-API-Key": ALLFOOTBALL_API_KEY,
            Authorization: `Bearer ${ALLFOOTBALL_API_KEY}`,
            Accept: "application/json",
          },
          timeout: 10000,
        });

        if (response.data) {
          return {
            success: true,
            data: response.data,
            endpoint: endpoint,
          };
        }
      } catch (err) {
        // Try next endpoint
        continue;
      }
    }

    // If all endpoints fail, return error
    return {
      success: false,
      error: "Unable to fetch live scores from AllFootball API",
      message: "Please check API endpoint and key",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Failed to fetch live scores",
      details: error.response?.data || null,
    };
  }
}

// Public Live Score API endpoint
app.get("/api/livescore", async (req, res) => {
  const now = Date.now();

  // Check cache first
  if (
    livescoreCache.data &&
    now - livescoreCache.timestamp < livescoreCache.ttl
  ) {
    return res.json({
      ...livescoreCache.data,
      cached: true,
      cacheAge: Math.floor((now - livescoreCache.timestamp) / 1000),
    });
  }

  // Fetch fresh data
  const result = await fetchLiveScores();

  // Update cache
  if (result.success) {
    livescoreCache = {
      data: result,
      timestamp: now,
    };
  }

  res.json({
    ...result,
    cached: false,
    timestamp: new Date().toISOString(),
  });
});

// Live Score by League/Competition
app.get("/api/livescore/league/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const endpoint = `${ALLFOOTBALL_BASE_URL}/v1/leagues/${leagueId}/matches/live`;

    const response = await axios.get(endpoint, {
      headers: {
        "X-API-Key": ALLFOOTBALL_API_KEY,
        Authorization: `Bearer ${ALLFOOTBALL_API_KEY}`,
        Accept: "application/json",
      },
      timeout: 10000,
    });

    res.json({
      success: true,
      leagueId,
      data: response.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch league live scores",
      details: error.response?.data || null,
    });
  }
});

// Today's Matches
app.get("/api/livescore/today", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const endpoint = `${ALLFOOTBALL_BASE_URL}/v1/matches?date=${today}`;

    const response = await axios.get(endpoint, {
      headers: {
        "X-API-Key": ALLFOOTBALL_API_KEY,
        Authorization: `Bearer ${ALLFOOTBALL_API_KEY}`,
        Accept: "application/json",
      },
      timeout: 10000,
    });

    res.json({
      success: true,
      date: today,
      data: response.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch today's matches",
      details: error.response?.data || null,
    });
  }
});

// Football fixtures endpoint for AI predictions (with caching)
app.get("/api/football-fixtures", async (req, res) => {
  const now = Date.now();

  // Check cache first
  if (fixturesCache.data && now - fixturesCache.timestamp < fixturesCache.ttl) {
    return res.json({
      ...fixturesCache.data,
      cached: true,
      cacheAge: Math.floor((now - fixturesCache.timestamp) / 1000),
    });
  }

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  try {
    // Try football-data.org API (free tier, good for today's matches)
    const footballDataEndpoint = `https://api.football-data.org/v4/matches`;

    try {
      const response = await axios.get(footballDataEndpoint, {
        headers: {
          "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY || "demo",
        },
        params: {
          dateFrom: today,
          dateTo: tomorrow,
          status: "SCHEDULED,TIMED,IN_PLAY"
        },
        timeout: 10000,
      });

      if (response.data?.matches && response.data.matches.length > 0) {
        const matches = response.data.matches.slice(0, 20);

        const mapped = matches.map((m, idx) => {
          const home = cleanTeamName(m.homeTeam?.name || m.homeTeam?.shortName || "Home");
          const away = cleanTeamName(m.awayTeam?.name || m.awayTeam?.shortName || "Away");
          const league = m.competition?.name || "Football League";
          const matchDate = new Date(m.utcDate);
          const kickoff = matchDate.toTimeString().slice(0, 5);
          const homeForm = 0.4 + Math.random() * 0.5;
          const awayForm = 0.4 + Math.random() * 0.5;

          return {
            id: `FD-${idx}-${Date.now()}`,
            league,
            kickoff,
            venue: m.venue || `${home} Stadium`,
            home,
            away,
            status: m.status || "SCHEDULED",
            source: "Football-Data.org",
            metrics: {
              homeForm: Math.round(homeForm * 100) / 100,
              awayForm: Math.round(awayForm * 100) / 100,
              attackDelta: Math.round((homeForm - awayForm) * 0.6 * 100) / 100,
              defenseDelta: Math.round((1 - awayForm - (1 - homeForm)) * 0.4 * 100) / 100,
              importance: 0.7,
              headToHead: Math.round(((homeForm + (1 - awayForm)) / 2) * 100) / 100,
              tempo: Math.round((((homeForm + awayForm) / 2) * 0.8 + 0.2) * 100) / 100,
            },
          };
        });

        const result = {
          success: true,
          fixtures: removeDuplicateFixtures(mapped).slice(0, 6),
          source: "Football-Data.org API",
          timestamp: new Date().toISOString(),
          cached: false,
        };

        // Update cache
        fixturesCache = {
          data: result,
          timestamp: now,
          ttl: fixturesCache.ttl,
        };

        return res.json(result);
      }
    } catch (fdError) {
      console.warn("Football-Data.org API unavailable:", fdError.message);
    }

    // Fallback to API-FOOTBALL (RapidAPI)
    try {
      const apiFootballEndpoint = "https://api-football-v1.p.rapidapi.com/v3/fixtures";
      const response = await axios.get(apiFootballEndpoint, {
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY || "demo",
          "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com"
        },
        params: {
          date: today,
          status: "NS-LIVE-1H-HT-2H-ET-P",
        },
        timeout: 10000,
      });

      if (response.data?.response && response.data.response.length > 0) {
        const matches = response.data.response.slice(0, 20);

        const mapped = matches.map((m, idx) => {
          const home = cleanTeamName(m.teams?.home?.name || "Home");
          const away = cleanTeamName(m.teams?.away?.name || "Away");
          const league = m.league?.name || "Football League";
          const matchDate = new Date(m.fixture?.date);
          const kickoff = matchDate.toTimeString().slice(0, 5);
          const homeForm = 0.4 + Math.random() * 0.5;
          const awayForm = 0.4 + Math.random() * 0.5;

          return {
            id: `AF-${idx}-${Date.now()}`,
            league,
            kickoff,
            venue: m.fixture?.venue?.name || `${home} Stadium`,
            home,
            away,
            status: m.fixture?.status?.short || "NS",
            source: "API-Football",
            metrics: {
              homeForm: Math.round(homeForm * 100) / 100,
              awayForm: Math.round(awayForm * 100) / 100,
              attackDelta: Math.round((homeForm - awayForm) * 0.6 * 100) / 100,
              defenseDelta: Math.round((1 - awayForm - (1 - homeForm)) * 0.4 * 100) / 100,
              importance: 0.7,
              headToHead: Math.round(((homeForm + (1 - awayForm)) / 2) * 100) / 100,
              tempo: Math.round((((homeForm + awayForm) / 2) * 0.8 + 0.2) * 100) / 100,
            },
          };
        });

        const result = {
          success: true,
          fixtures: removeDuplicateFixtures(mapped).slice(0, 6),
          source: "API-Football (RapidAPI)",
          timestamp: new Date().toISOString(),
          cached: false,
        };

        fixturesCache = {
          data: result,
          timestamp: now,
          ttl: fixturesCache.ttl,
        };

        return res.json(result);
      }
    } catch (afError) {
      console.warn("API-Football unavailable:", afError.message);
    }

    // Last fallback: Generate sample fixtures for today
    console.warn("All APIs unavailable, generating sample TODAY's fixtures");

    const sampleFixtures = [
      { home: "Manchester City", away: "Arsenal", league: "Premier League", kickoff: "15:00" },
      { home: "Barcelona", away: "Real Madrid", league: "La Liga", kickoff: "16:30" },
      { home: "Bayern Munich", away: "Borussia Dortmund", league: "Bundesliga", kickoff: "17:00" },
      { home: "PSG", away: "Marseille", league: "Ligue 1", kickoff: "18:00" },
      { home: "Juventus", away: "Inter Milan", league: "Serie A", kickoff: "19:00" },
      { home: "Liverpool", away: "Chelsea", league: "Premier League", kickoff: "20:00" },
    ].map((fixture, idx) => {
      const homeForm = 0.4 + Math.random() * 0.5;
      const awayForm = 0.4 + Math.random() * 0.5;

      return {
        id: `SAMPLE-${idx}-${Date.now()}`,
        league: fixture.league,
        kickoff: fixture.kickoff,
        venue: `${fixture.home} Stadium`,
        home: fixture.home,
        away: fixture.away,
        status: "SCHEDULED",
        source: "Sample Data (Today)",
        metrics: {
          homeForm: Math.round(homeForm * 100) / 100,
          awayForm: Math.round(awayForm * 100) / 100,
          attackDelta: Math.round((homeForm - awayForm) * 0.6 * 100) / 100,
          defenseDelta: Math.round((1 - awayForm - (1 - homeForm)) * 0.4 * 100) / 100,
          importance: 0.7,
          headToHead: Math.round(((homeForm + (1 - awayForm)) / 2) * 100) / 100,
          tempo: Math.round((((homeForm + awayForm) / 2) * 0.8 + 0.2) * 100) / 100,
        },
      };
    });

    const result = {
      success: true,
      fixtures: sampleFixtures,
      source: `Sample Data - Today (${today})`,
      timestamp: new Date().toISOString(),
      cached: false,
    };

    fixturesCache = {
      data: result,
      timestamp: now,
      ttl: fixturesCache.ttl,
    };

    return res.json(result);

  } catch (error) {
    console.error("All fixture sources failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch today's football fixtures",
      details: error.message,
    });
  }
});

// Helper function to parse Google search results
function parseGoogleSearchResults(items) {
  const fixtures = [];

  items.forEach((item, index) => {
    try {
      const title = item.title || "";
      const snippet = item.snippet || "";
      const content = `${title} ${snippet}`.toLowerCase();

      const vsPattern = /([a-zA-Z\s]+)\s+vs?\s+([a-zA-Z\s]+)/i;
      const dashPattern = /([a-zA-Z\s]+)\s*[-–]\s*([a-zA-Z\s]+)/i;

      let homeTeam = "";
      let awayTeam = "";

      const vsMatch = content.match(vsPattern);
      const dashMatch = content.match(dashPattern);

      if (vsMatch) {
        homeTeam = vsMatch[1].trim();
        awayTeam = vsMatch[2].trim();
      } else if (dashMatch) {
        homeTeam = dashMatch[1].trim();
        awayTeam = dashMatch[2].trim();
      } else {
        return;
      }

      homeTeam = cleanTeamName(homeTeam);
      awayTeam = cleanTeamName(awayTeam);

      let league = "Football League";
      if (content.includes("premier league")) league = "Premier League";
      else if (content.includes("champions league"))
        league = "UEFA Champions League";
      else if (content.includes("la liga")) league = "La Liga";
      else if (content.includes("serie a")) league = "Serie A";
      else if (content.includes("bundesliga")) league = "Bundesliga";
      else if (content.includes("ligue 1")) league = "Ligue 1";

      const timePattern = /(\d{1,2}):(\d{2})/i;
      const timeMatch = content.match(timePattern);
      const kickoff = timeMatch
        ? timeMatch[0]
        : `${15 + Math.floor(Math.random() * 4)}:${Math.random() > 0.5 ? "00" : "30"}`;

      const homeForm = 0.4 + Math.random() * 0.5;
      const awayForm = 0.4 + Math.random() * 0.5;

      fixtures.push({
        id: `GOOGLE-${index}-${Date.now()}`,
        league: league,
        kickoff: kickoff,
        venue: `${homeTeam} Stadium`,
        home: homeTeam,
        away: awayTeam,
        source: "Google API",
        metrics: {
          homeForm: Math.round(homeForm * 100) / 100,
          awayForm: Math.round(awayForm * 100) / 100,
          attackDelta: Math.round((homeForm - awayForm) * 0.6 * 100) / 100,
          defenseDelta:
            Math.round((1 - awayForm - (1 - homeForm)) * 0.4 * 100) / 100,
          importance:
            content.includes("final") || content.includes("derby") ? 0.9 : 0.7,
          headToHead: Math.round(((homeForm + (1 - awayForm)) / 2) * 100) / 100,
          tempo:
            Math.round((((homeForm + awayForm) / 2) * 0.8 + 0.2) * 100) / 100,
        },
      });
    } catch (error) {
      console.warn("Error parsing search result:", error);
    }
  });

  return fixtures;
}

// Helper function to clean team names
function cleanTeamName(name) {
  return (
    name
      .replace(
        /\b(fc|cf|united|city|town|rovers|wanderers|athletic|albion)\b/gi,
        "",
      )
      .replace(/[^\w\s]/g, "")
      .trim()
      .split(" ")
      .slice(0, 2)
      .join(" ")
      .trim() || "Team"
  );
}

// Helper function to remove duplicate fixtures
function removeDuplicateFixtures(fixtures) {
  const seen = new Set();
  return fixtures.filter((fixture) => {
    const key = `${fixture.home.toLowerCase()}-${fixture.away.toLowerCase()}`;
    const reverseKey = `${fixture.away.toLowerCase()}-${fixture.home.toLowerCase()}`;

    if (seen.has(key) || seen.has(reverseKey)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// The Odds API Configuration
const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

// Odds API endpoint with caching
let oddsCache = {
  data: {},
  timestamps: {}
};

app.get('/api/odds', async (req, res) => {
  try {
    const { sport = 'soccer_epl', regions = 'uk,us,eu', markets = 'h2h' } = req.query;

    // Check if API key is configured
    if (!ODDS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'The Odds API key not configured. Please add ODDS_API_KEY to .env file.'
      });
    }

    // Create cache key
    const cacheKey = `${sport}-${regions}-${markets}`;
    const now = Date.now();
    const cacheTTL = 60000; // 60 seconds

    // Check cache
    if (oddsCache.data[cacheKey] && (now - oddsCache.timestamps[cacheKey]) < cacheTTL) {
      return res.json({
        success: true,
        odds: oddsCache.data[cacheKey],
        cached: true,
        cacheAge: Math.floor((now - oddsCache.timestamps[cacheKey]) / 1000)
      });
    }

    // Fetch from The Odds API
    const endpoint = `${ODDS_API_BASE_URL}/sports/${sport}/odds`;
    const params = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      regions: regions,
      markets: markets,
      oddsFormat: 'decimal',
      dateFormat: 'iso'
    });

    const response = await axios.get(`${endpoint}?${params.toString()}`, {
      timeout: 15000
    });

    // Update cache
    oddsCache.data[cacheKey] = response.data;
    oddsCache.timestamps[cacheKey] = now;

    res.json({
      success: true,
      odds: response.data,
      cached: false,
      timestamp: new Date().toISOString(),
      remaining: response.headers['x-requests-remaining'] || 'unknown',
      used: response.headers['x-requests-used'] || 'unknown'
    });

  } catch (error) {
    console.error('Error fetching odds:', error.message);

    // More detailed error handling
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data?.message || 'Failed to fetch odds from The Odds API',
        statusCode: error.response.status
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch odds data'
    });
  }
});

// Get available sports from The Odds API
app.get('/api/odds/sports', async (req, res) => {
  try {
    if (!ODDS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'The Odds API key not configured'
      });
    }

    const endpoint = `${ODDS_API_BASE_URL}/sports`;
    const params = new URLSearchParams({
      apiKey: ODDS_API_KEY
    });

    const response = await axios.get(`${endpoint}?${params.toString()}`, {
      timeout: 10000
    });

    res.json({
      success: true,
      sports: response.data
    });

  } catch (error) {
    console.error('Error fetching sports:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch sports list'
    });
  }
});

app.post("/api/ai/predict", async (req, res) => {
  try {
    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const { homeTeam, awayTeam, metrics = {} } = req.body || {};
    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ success: false, error: "homeTeam and awayTeam are required" });
    }

    const prompt = `You are a football prediction assistant. Given teams and simple metrics, return win probabilities as integers for homeWin, draw, and awayWin that sum to ~100.\nTeams: ${homeTeam} vs ${awayTeam}\nMetrics: ${JSON.stringify(metrics)}\nRespond strictly as JSON: {"homeWin": 55, "draw": 25, "awayWin": 20}`;

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const response = await client.responses.create({
      model,
      input: prompt,
    });

    const text = response.output_text || response?.data?.[0]?.content?.[0]?.text || "";
    let prediction = null;
    try {
      prediction = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) prediction = JSON.parse(m[0]);
    }

    if (!prediction || typeof prediction.homeWin !== "number") {
      return res.status(500).json({ success: false, error: "Invalid AI response" });
    }

    res.json({ success: true, prediction });
  } catch (error) {
    console.error("AI prediction error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Boost TZ routes removed

app.listen(PORT, () => {
  console.log(`TV-Stream server running at http://localhost:${PORT}`);
  console.log("Admin dashboard: http://localhost:%s/admin.html", PORT);
  // Boost TZ removed
});
