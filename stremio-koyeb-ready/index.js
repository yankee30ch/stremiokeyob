require("dotenv").config();
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const NodeCache = require("node-cache");
const { searchOmdb } = require("./catalogs");
const { listFolder, getFileLink } = require("./premiumize");
const fs = require("fs");
const express = require("express");

const OMDB_KEY = process.env.OMDB_KEY;
const PREMIUMIZE_API_KEY = process.env.PREMIUMIZE_API_KEY || "";
const PREMIUMIZE_FOLDER_ID = process.env.PREMIUMIZE_FOLDER_ID || "";
const PORT = parseInt(process.env.PORT || "7000", 10);

const imdbMap = fs.existsSync("./imdb_map.json") ? JSON.parse(fs.readFileSync("./imdb_map.json","utf8")) : {};
const cache = new NodeCache({ stdTTL: 3600, useClones: false });

const manifest = {
  id: "org.example.premiumize.legal",
  version: "1.1.0",
  name: "Premiumize (Legal)",
  description: "IMDb posters via OMDb + YOUR licensed streams (direct URLs or Premiumize Cloud files).",
  resources: ["catalog", "meta", "stream"],
  types: ["movie","series"],
  catalogs: [
    { type: "movie", id: "search-movie", name: "Search Movies", extra: [{ name: "search", isRequired: true }] },
    { type: "series", id: "search-series", name: "Search Series", extra: [{ name: "search", isRequired: true }] }
  ],
  idPrefixes: ["tt"]
};

if (PREMIUMIZE_API_KEY && PREMIUMIZE_FOLDER_ID) {
  manifest.catalogs.push({ type: "movie", id: "pm-library", name: "My Library (PM Cloud)" });
}

const builder = new addonBuilder(manifest);

// Health endpoints
const app = express();
app.get("/health", (_, res) => res.status(200).send("ok"));
app.get("/", (_, res) => res.status(200).send("ok"));
app.listen(PORT, () => console.log("Health check on /health"));

// Catalog
builder.defineCatalogHandler(async ({ type, id, search }) => {
  try {
    if (id === "pm-library") {
      if (!PREMIUMIZE_API_KEY || !PREMIUMIZE_FOLDER_ID) return { metas: [] };
      const cacheKey = `pm-list:${PREMIUMIZE_FOLDER_ID}`;
      let files = cache.get(cacheKey);
      if (!files) {
        files = await listFolder({ apiKey: PREMIUMIZE_API_KEY, folderId: PREMIUMIZE_FOLDER_ID });
        cache.set(cacheKey, files, 300);
      }
      const metas = files.map(f => {
        const match = f.name.match(/(tt\d{7,8})/);
        const imdbId = match ? match[1] : undefined;
        return { id: imdbId || `pm:${f.id}`, type: "movie", name: f.name };
      });
      return { metas };
    }

    if (!search || !OMDB_KEY) return { metas: [] };
    const metas = await searchOmdb({ omdbKey: OMDB_KEY, query: search, type });
    return { metas };
  } catch (e) {
    console.error("Catalog error:", e.message);
    return { metas: [] };
  }
});

// Meta
builder.defineMetaHandler(async ({ id }) => {
  try {
    if (!OMDB_KEY || !id.startsWith("tt")) return { meta: {} };
    const url = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${id}&plot=short`;
    const { data } = await axios.get(url, { timeout: 10000 });
    if (!data || data.Response === "False") return { meta: {} };
    return {
      meta: {
        id: data.imdbID,
        type: data.Type,
        name: data.Title,
        year: parseInt(String(data.Year).slice(0,4)),
        poster: data.Poster && data.Poster !== "N/A" ? data.Poster : undefined,
        genres: data.Genre ? data.Genre.split(", ").filter(Boolean) : undefined,
        description: data.Plot && data.Plot !== "N/A" ? data.Plot : undefined
      }
    };
  } catch (e) {
    console.error("Meta error:", e.message);
    return { meta: {} };
  }
});

// Stream
builder.defineStreamHandler(async ({ id }) => {
  try {
    if (imdbMap[id] && imdbMap[id].url) {
      return { streams: [{ title: "Direct", url: imdbMap[id].url }] };
    }

    if (PREMIUMIZE_API_KEY && PREMIUMIZE_FOLDER_ID) {
      const files = cache.get(`pm-list:${PREMIUMIZE_FOLDER_ID}`) ||
        await listFolder({ apiKey: PREMIUMIZE_API_KEY, folderId: PREMIUMIZE_FOLDER_ID });
      cache.set(`pm-list:${PREMIUMIZE_FOLDER_ID}`, files, 300);

      const match = files.find(f => id && f.name.includes(id));
      if (match) {
        const link = await getFileLink({ apiKey: PREMIUMIZE_API_KEY, id: match.id });
        if (link) return { streams: [{ title: "Premiumize Cloud", url: link }] };
      }
    }
    return { streams: [] };
  } catch (e) {
    console.error("Stream error:", e.message);
    return { streams: [] };
  }
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 Add-on: http://localhost:${PORT}/manifest.json`);
