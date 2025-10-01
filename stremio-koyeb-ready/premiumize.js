const axios = require("axios");
async function listFolder({ apiKey, folderId }) {
  const url = "https://www.premiumize.me/api/folder/list";
  const params = { customer_id: apiKey, id: folderId };
  const { data } = await axios.get(url, { params, timeout: 10000 });
  if (!data || data.status !== "success") return [];
  return (data.content || []).filter(it => it.type === "file");
}
async function getFileLink({ apiKey, id }) {
  const url = "https://www.premiumize.me/api/item/details";
  const params = { customer_id: apiKey, id };
  const { data } = await axios.get(url, { params, timeout: 10000 });
  if (!data || data.status !== "success") return null;
  return data.location || data.stream_link || null;
}
module.exports = { listFolder, getFileLink };
