const axios = require("axios");
async function searchOmdb({ omdbKey, query, type }) {
  const url = `https://www.omdbapi.com/?apikey=${omdbKey}&s=${encodeURIComponent(query)}&type=${type}`;
  const { data } = await axios.get(url, { timeout: 10000 });
  if (!data || data.Response === "False" || !data.Search) return [];
  return data.Search.map(item => ({
    id: item.imdbID,
    type,
    name: item.Title,
    year: item.Year ? parseInt(String(item.Year).slice(0,4)) : undefined,
    poster: item.Poster && item.Poster !== "N/A" ? item.Poster : undefined
  }));
}
module.exports = { searchOmdb };
